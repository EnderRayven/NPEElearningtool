import { migrateZhangyuQuestionNotes } from './bankMigration'

export interface HandwritingPoint {
  x: number
  y: number
  pressure?: number
}

export interface HandwritingStroke {
  id: string
  color: string
  size: number
  input: 'pen' | 'touch' | 'mouse'
  points: HandwritingPoint[]
}

export interface HandwritingDrawing {
  version: 1
  aspectRatio: number
  strokes: HandwritingStroke[]
}

export interface QuestionNote {
  text: string
  drawing: HandwritingDrawing
  updatedAt: string
}

export type QuestionNotes = Record<string, QuestionNote>

export interface QuestionErrorRecord {
  wrongOption: string
  updatedAt: string
}

export type QuestionErrorRecords = Record<string, QuestionErrorRecord>

const DB_NAME = 'npee-question-notes'
const STORE_NAME = 'notes'
const ERROR_RECORDS_STORE_NAME = 'error-records'
const NOTES_KEY = 'all'
const ERROR_RECORDS_KEY = 'all'
const FALLBACK_KEY = 'npee:question-notes:v1'
const ERROR_RECORDS_FALLBACK_KEY = 'npee:question-error-records:v1'
const DEFAULT_ASPECT_RATIO = 5 / 3
export const DRAWING_WIDTH = 1000
export const DRAWING_BASE_HEIGHT = 600
export const MAX_DRAWING_HEIGHT_MULTIPLIER = 32
export const MAX_DRAWING_HEIGHT = DRAWING_BASE_HEIGHT * MAX_DRAWING_HEIGHT_MULTIPLIER
export const MIN_DRAWING_ASPECT_RATIO = DRAWING_WIDTH / MAX_DRAWING_HEIGHT
const MAX_TEXT_LENGTH = 100_000
const MAX_STROKES = 2_000
const MAX_POINTS_PER_STROKE = 20_000

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finiteNumber = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

export function emptyHandwritingDrawing(): HandwritingDrawing {
  return { version: 1, aspectRatio: DEFAULT_ASPECT_RATIO, strokes: [] }
}

export function emptyQuestionNote(): QuestionNote {
  return { text: '', drawing: emptyHandwritingDrawing(), updatedAt: '' }
}

function validatePoint(value: unknown): HandwritingPoint | null {
  if (!isRecord(value)) return null
  const x = finiteNumber(value.x, Number.NaN)
  const y = finiteNumber(value.y, Number.NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const pressure = value.pressure === undefined ? undefined : clamp(finiteNumber(value.pressure, .5), 0, 1)
  return { x: clamp(x, 0, 1), y: clamp(y, 0, MAX_DRAWING_HEIGHT_MULTIPLIER), ...(pressure === undefined ? {} : { pressure }) }
}

function validateStroke(value: unknown, index: number): HandwritingStroke | null {
  if (!isRecord(value) || !Array.isArray(value.points)) return null
  if (value.input !== 'pen' && value.input !== 'touch' && value.input !== 'mouse') return null
  const points = value.points.slice(0, MAX_POINTS_PER_STROKE).map(validatePoint).filter((point): point is HandwritingPoint => Boolean(point))
  if (!points.length) return null
  const color = typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color.toLowerCase() : '#8f3028'
  const size = clamp(finiteNumber(value.size, 2), 1, 18)
  const id = typeof value.id === 'string' && value.id ? value.id : `stroke-${index}`
  return { id, color, size, input: value.input, points }
}

export function validateHandwritingDrawing(value: unknown): HandwritingDrawing {
  if (!isRecord(value)) return emptyHandwritingDrawing()
  const strokes = Array.isArray(value.strokes)
    ? value.strokes.slice(0, MAX_STROKES).map(validateStroke).filter((stroke): stroke is HandwritingStroke => Boolean(stroke))
    : []
  return {
    version: 1,
    aspectRatio: clamp(finiteNumber(value.aspectRatio, DEFAULT_ASPECT_RATIO), MIN_DRAWING_ASPECT_RATIO, 3),
    strokes,
  }
}

export function validateQuestionNotes(value: unknown): QuestionNotes {
  if (!isRecord(value)) return {}
  const notes: QuestionNotes = {}
  for (const [questionId, rawNote] of Object.entries(value)) {
    if (!questionId || !isRecord(rawNote)) continue
    const text = typeof rawNote.text === 'string' ? rawNote.text.slice(0, MAX_TEXT_LENGTH) : ''
    const drawing = validateHandwritingDrawing(rawNote.drawing)
    if (!text.trim() && !drawing.strokes.length) continue
    notes[questionId] = {
      text,
      drawing,
      updatedAt: typeof rawNote.updatedAt === 'string' ? rawNote.updatedAt : '',
    }
  }
  return migrateZhangyuQuestionNotes(notes)
}

export function validateQuestionErrorRecords(value: unknown): QuestionErrorRecords {
  if (!isRecord(value)) return {}
  const records: QuestionErrorRecords = {}
  for (const [questionId, rawRecord] of Object.entries(value)) {
    if (!questionId || !isRecord(rawRecord)) continue
    const wrongOption = typeof rawRecord.wrongOption === 'string' ? rawRecord.wrongOption.trim().toUpperCase() : ''
    if (!/^[A-Z]$/.test(wrongOption)) continue
    records[questionId] = {
      wrongOption,
      updatedAt: typeof rawRecord.updatedAt === 'string' ? rawRecord.updatedAt : '',
    }
  }
  return records
}

export function hasQuestionNote(note: QuestionNote | undefined) {
  return Boolean(note && (note.text.trim() || note.drawing.strokes.length))
}

export function eraseHandwritingStrokes(strokes: HandwritingStroke[], point: HandwritingPoint, radius: number) {
  return strokes.filter(stroke => !stroke.points.some(strokePoint => Math.hypot(strokePoint.x - point.x, strokePoint.y - point.y) <= radius))
}

function readFallbackNotes() {
  try {
    return validateQuestionNotes(JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{}'))
  } catch {
    return {}
  }
}

function readFallbackErrorRecords() {
  try {
    return validateQuestionErrorRecords(JSON.parse(localStorage.getItem(ERROR_RECORDS_FALLBACK_KEY) || '{}'))
  } catch {
    return {}
  }
}

function writeFallbackNotes(notes: QuestionNotes) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(validateQuestionNotes(notes)))
  } catch {
    throw new Error('笔记保存失败，请导出完整备份后检查浏览器存储空间')
  }
}

function writeFallbackErrorRecords(records: QuestionErrorRecords) {
  try {
    localStorage.setItem(ERROR_RECORDS_FALLBACK_KEY, JSON.stringify(validateQuestionErrorRecords(records)))
  } catch {
    throw new Error('错误记录保存失败，请导出完整备份后检查浏览器存储空间')
  }
}

function openNotesDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
      if (!request.result.objectStoreNames.contains(ERROR_RECORDS_STORE_NAME)) request.result.createObjectStore(ERROR_RECORDS_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开笔记存储'))
  })
}

export async function loadQuestionNotes(): Promise<QuestionNotes> {
  if (typeof indexedDB === 'undefined') return readFallbackNotes()
  try {
    const database = await openNotesDatabase()
    const notes = await new Promise<QuestionNotes>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(NOTES_KEY)
      request.onsuccess = () => resolve(validateQuestionNotes(request.result))
      request.onerror = () => reject(request.error)
    })
    database.close()
    return notes
  } catch {
    return readFallbackNotes()
  }
}

export async function saveQuestionNotes(notes: QuestionNotes) {
  const validated = validateQuestionNotes(notes)
  if (typeof indexedDB === 'undefined') {
    writeFallbackNotes(validated)
    return
  }
  try {
    const database = await openNotesDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(validated, NOTES_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  } catch {
    writeFallbackNotes(validated)
  }
}

export async function loadQuestionErrorRecords(): Promise<QuestionErrorRecords> {
  if (typeof indexedDB === 'undefined') return readFallbackErrorRecords()
  try {
    const database = await openNotesDatabase()
    const records = await new Promise<QuestionErrorRecords>((resolve, reject) => {
      const request = database.transaction(ERROR_RECORDS_STORE_NAME, 'readonly').objectStore(ERROR_RECORDS_STORE_NAME).get(ERROR_RECORDS_KEY)
      request.onsuccess = () => resolve(validateQuestionErrorRecords(request.result))
      request.onerror = () => reject(request.error)
    })
    database.close()
    return records
  } catch {
    return readFallbackErrorRecords()
  }
}

export async function saveQuestionErrorRecords(records: QuestionErrorRecords) {
  const validated = validateQuestionErrorRecords(records)
  if (typeof indexedDB === 'undefined') {
    writeFallbackErrorRecords(validated)
    return
  }
  try {
    const database = await openNotesDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ERROR_RECORDS_STORE_NAME, 'readwrite')
      transaction.objectStore(ERROR_RECORDS_STORE_NAME).put(validated, ERROR_RECORDS_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  } catch {
    writeFallbackErrorRecords(validated)
  }
}
