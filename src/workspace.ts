import type { QuestionBank, QuestionStatus } from './types'
import type { StudyActivity } from './studyActivity'
import { migrateStudyRounds, validateStudyRounds, type StudyRounds } from './studyRounds'
import { DEFAULT_USER_SETTINGS, validateUserSettings, type UserSettings } from './userSettings'
import { mergeQuestionNoteBuckets, parseQuestionNoteBucketKey, questionNoteBucketsForKeys, splitQuestionNotes, validatePersonalNotebooks, validateQuestionErrorRecords, validateQuestionNotes, type PersonalNotebooks, type QuestionErrorRecords, type QuestionNoteBucket, type QuestionNotes } from './questionNotes'

const DB_NAME = 'npee-workspace'
const STORE_NAME = 'handles'
const CACHE_STORE_NAME = 'cache'
const DB_VERSION = 2
const HANDLE_KEY = 'data-root'
const WORKSPACE_CACHE_KEY = 'workspace'
export const WORKSPACE_MANIFEST = '题库数据.json'
export const WORKSPACE_USER_DATA = '用户数据.json'
export const WORKSPACE_NOTES_FOLDER = '用户笔记'
export const BUILTIN_ENGLISH_VERSION = 7

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}
type DirectoryPickerWindow = Window & {
  showDirectoryPicker(options: { id: string; mode: 'readwrite' }): Promise<FileSystemDirectoryHandle>
}

export interface WorkspaceImageFile {
  file: File
  fileHandle?: FileSystemFileHandle
  relativePath: string
  bankFolder: string
}

export interface WorkspaceManifest {
  version: number
  builtinEnglishVersion?: number
  updatedAt: string
  banks: QuestionBank[]
  /** 清单只保存题库结构、重命名和目录映射。 */
  statuses?: Record<string, QuestionStatus>
  folders?: Record<string, string>
  /** 题库删除墓碑，避免多设备合并时被旧清单复活。 */
  deletedBankIds?: Record<string, string>
}

export interface WorkspaceUserData {
  version: number
  updatedAt: string
  rounds?: StudyRounds
  statuses?: Record<string, QuestionStatus>
  activities?: StudyActivity[]
  settings?: UserSettings
  notes?: QuestionNotes
  personalNotebooks?: PersonalNotebooks
  errorRecords?: QuestionErrorRecords
}

export interface DefaultWorkspaceIndex {
  name: string
  manifest: WorkspaceManifest | null
  userData: WorkspaceUserData | null
  notes?: QuestionNotes
  bankFolders?: string[]
  images: Array<{ name: string; relativePath: string; bankFolder: string; url: string }>
}

export interface WorkspaceCacheImage {
  name: string
  relativePath: string
  bankFolder: string
  bankId?: string
  url?: string
}

export interface WorkspaceCache {
  version: 1
  source: 'default' | 'directory'
  updatedAt: string
  manifest: WorkspaceManifest | null
  userData: WorkspaceUserData | null
  notes: QuestionNotes
  images: WorkspaceCacheImage[]
}

const MATH_MODULE_FOLDERS = new Set(['高数', '线代', '真题'])
const GROUPING_FOLDERS = new Set(['数学', '英语', '专业课'])
const workspaceWriteQueues = new WeakMap<FileSystemDirectoryHandle, Map<string, Promise<void>>>()

export interface WorkspaceLayout {
  parent: FileSystemDirectoryHandle
  bankRoot: FileSystemDirectoryHandle
  userRoot: FileSystemDirectoryHandle
}

function queueWorkspaceWrite(handle: FileSystemDirectoryHandle, key: string, write: () => Promise<void>) {
  const queues = workspaceWriteQueues.get(handle) || new Map<string, Promise<void>>()
  if (!workspaceWriteQueues.has(handle)) workspaceWriteQueues.set(handle, queues)
  const previous = queues.get(key) || Promise.resolve()
  const next = previous.catch(() => {}).then(write)
  queues.set(key, next)
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key)
  }).catch(() => {})
  return next
}

function normalizeWorkspacePath(value: string) {
  return value.replaceAll('\\', '/').replace(/^\/|\/$/g, '')
}

/** The browser selects the single `数据/` directory containing both data roots. */
export async function resolveWorkspaceLayout(handle: FileSystemDirectoryHandle, createUserRoot = false): Promise<WorkspaceLayout> {
  try {
    const bankRoot = await handle.getDirectoryHandle('默认题库', { create: createUserRoot })
    const userRoot = await handle.getDirectoryHandle('用户数据', { create: createUserRoot })
    return { parent: handle, bankRoot, userRoot }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      throw new Error('请选择“数据”文件夹，该文件夹必须同时包含“默认题库”和“用户数据”')
    }
    throw error
  }
}

export function workspaceBankName(folder: string) {
  const normalized = normalizeWorkspacePath(folder)
  return normalized.split('/').at(-1) || normalized
}

export function workspaceBankFoldersFromDirectoryPaths(directoryPaths: string[]) {
  const folders = new Set<string>()
  for (const rawPath of directoryPaths) {
    const parts = normalizeWorkspacePath(rawPath).split('/').filter(Boolean)
    if (!parts.length) continue
    if (parts[0] === '数学') {
      if (MATH_MODULE_FOLDERS.has(parts[1] || '') && parts[2]) folders.add(parts.slice(0, 3).join('/'))
      else if (parts[1] && !MATH_MODULE_FOLDERS.has(parts[1])) folders.add(parts.slice(0, 2).join('/'))
      continue
    }
    if (GROUPING_FOLDERS.has(parts[0])) {
      if (parts[1]) folders.add(parts.slice(0, 2).join('/'))
      continue
    }
    folders.add(parts[0])
  }
  return [...folders].sort()
}

export async function readDefaultWorkspace(): Promise<DefaultWorkspaceIndex> {
  const response = await fetch('/api/default-workspace/index')
  if (!response.ok) throw new Error('无法自动连接默认题库')
  return response.json() as Promise<DefaultWorkspaceIndex>
}

export function createWorkspaceManifest(banks: QuestionBank[], folders: Record<string, string> = {}, deletedBankIds: Record<string, string> = {}): WorkspaceManifest {
  return {
    version: 2,
    builtinEnglishVersion: BUILTIN_ENGLISH_VERSION,
    updatedAt: new Date().toISOString(),
    banks,
    folders,
    ...(Object.keys(deletedBankIds).length ? { deletedBankIds } : {}),
  }
}

export function createWorkspaceUserData(rounds: StudyRounds, settings: UserSettings = DEFAULT_USER_SETTINGS, notes: QuestionNotes = {}, errorRecords: QuestionErrorRecords = {}, personalNotebooks: PersonalNotebooks = []): WorkspaceUserData {
  return { version: 5, updatedAt: new Date().toISOString(), rounds: validateStudyRounds(rounds), settings: validateUserSettings(settings), notes: validateQuestionNotes(notes), personalNotebooks: validatePersonalNotebooks(personalNotebooks), errorRecords: validateQuestionErrorRecords(errorRecords) }
}

export function createWorkspaceMetadata(rounds: StudyRounds, settings: UserSettings = DEFAULT_USER_SETTINGS, errorRecords: QuestionErrorRecords = {}, personalNotebooks: PersonalNotebooks = []): WorkspaceUserData {
  const { notes: _notes, ...metadata } = createWorkspaceUserData(rounds, settings, {}, errorRecords, personalNotebooks)
  return metadata
}

export function resolveWorkspaceUserData(userData: WorkspaceUserData | null | undefined, manifestStatuses: unknown, fallbackRounds: StudyRounds, fallbackSettings: UserSettings, fallbackNotes: QuestionNotes = {}, fallbackErrorRecords: QuestionErrorRecords = {}, fallbackPersonalNotebooks: PersonalNotebooks = []) {
  const settings = userData?.settings ? validateUserSettings({ ...fallbackSettings, ...userData.settings }) : fallbackSettings
  const rounds = userData || manifestStatuses
    ? migrateStudyRounds(userData?.rounds, userData?.statuses || manifestStatuses, userData?.activities)
    : fallbackRounds
  const notes = { ...validateQuestionNotes(fallbackNotes), ...validateQuestionNotes(userData?.notes) }
  const personalNotebooks = userData?.personalNotebooks === undefined ? validatePersonalNotebooks(fallbackPersonalNotebooks) : validatePersonalNotebooks(userData.personalNotebooks)
  const errorRecords = { ...validateQuestionErrorRecords(fallbackErrorRecords), ...validateQuestionErrorRecords(userData?.errorRecords) }
  return { rounds, settings, notes, personalNotebooks, errorRecords }
}

export async function writeDefaultWorkspaceManifest(banks: QuestionBank[], folders: Record<string, string> = {}, deletedBankIds: Record<string, string> = {}) {
  const manifest = createWorkspaceManifest(banks, folders, deletedBankIds)
  const response = await fetch('/api/default-workspace/manifest', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manifest, null, 2) })
  if (!response.ok) throw new Error('默认题库数据写入失败')
}

export function defaultWorkspaceFileUrl(relativePath: string, version?: string | number) {
  const suffix = version === undefined ? '' : `&v=${encodeURIComponent(String(version))}`
  return `/api/default-workspace/file?path=${encodeURIComponent(relativePath)}${suffix}`
}

export async function writeDefaultWorkspaceImage(file: File, relativePath: string) {
  const response = await fetch(`/api/default-workspace/image?path=${encodeURIComponent(relativePath)}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) throw new Error('默认题库图片写入失败')
}

export async function deleteDefaultWorkspaceImage(relativePath: string) {
  const response = await fetch(`/api/default-workspace/delete-image?path=${encodeURIComponent(relativePath)}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw new Error('默认题库图片删除失败')
}

export async function deleteDefaultWorkspaceImageByName(bankFolder: string, fileName: string) {
  const query = new URLSearchParams({ bankFolder, fileName })
  const response = await fetch(`/api/default-workspace/delete-image?${query.toString()}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 404) {
    if (response.status === 409) throw new Error('本地题库中存在同名图片，无法确定删除目标')
    throw new Error('默认题库图片删除失败')
  }
}

export async function replaceDefaultWorkspaceImage(file: File, bankFolder: string, fileName: string) {
  const query = new URLSearchParams({ bankFolder, fileName })
  const response = await fetch(`/api/default-workspace/replace-image?${query.toString()}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) {
    if (response.status === 409) throw new Error('本地题库中存在同名图片，无法确定替换目标')
    if (response.status === 404) throw new Error('找不到原图片文件，请先检查题库图片目录')
    throw new Error('默认题库原图片替换失败')
  }
  return await response.json() as { relativePath: string; modified: number }
}

export async function addDefaultWorkspaceImage(file: File, bankFolder: string, anchorFileName: string, fileName: string) {
  const query = new URLSearchParams({ bankFolder, anchorFileName, fileName })
  const response = await fetch(`/api/default-workspace/add-image?${query.toString()}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) throw new Error(response.status === 409 ? '本地题库中存在同名图片，无法添加' : '默认题库新增图片失败')
  return await response.json() as { relativePath: string; modified: number }
}

export async function writeDefaultWorkspaceUserData(rounds: StudyRounds, settings: UserSettings = DEFAULT_USER_SETTINGS, notes: QuestionNotes = {}, errorRecords: QuestionErrorRecords = {}, personalNotebooks: PersonalNotebooks = []) {
  const userData = createWorkspaceMetadata(rounds, settings, errorRecords, personalNotebooks)
  const response = await fetch('/api/default-workspace/user-data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userData, null, 2) })
  if (!response.ok) throw new Error('用户数据写入失败')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function workspaceNoteSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function decodeWorkspaceNoteSegment(value: string) {
  try { return decodeURIComponent(value) } catch { return value }
}

function parseWorkspaceNoteBucket(value: unknown, fallbackBankId = '', fallbackChapterId = ''): QuestionNoteBucket | null {
  if (!isRecord(value)) return null
  const bankId = typeof value.bankId === 'string' ? value.bankId : fallbackBankId
  const chapterId = typeof value.chapterId === 'string' ? value.chapterId : fallbackChapterId
  if (!bankId || !chapterId) return null
  return { bankId, chapterId, notes: validateQuestionNotes(value.notes) }
}

async function readWorkspaceNoteBucketsFromRoot(root: FileSystemDirectoryHandle): Promise<QuestionNotes> {
  try {
    const notesDirectory = await root.getDirectoryHandle(WORKSPACE_NOTES_FOLDER)
    const buckets: QuestionNoteBucket[] = []
    for await (const [bankSegment, bankEntry] of notesDirectory.entries()) {
      if (bankEntry.kind !== 'directory') continue
      const bankDirectory = bankEntry as FileSystemDirectoryHandle
      for await (const [fileName, fileEntry] of bankDirectory.entries()) {
        if (fileEntry.kind !== 'file' || !fileName.endsWith('.json')) continue
        try {
          const file = await (fileEntry as FileSystemFileHandle).getFile()
          const parsed = parseWorkspaceNoteBucket(JSON.parse(await file.text()), decodeWorkspaceNoteSegment(bankSegment), decodeWorkspaceNoteSegment(fileName.slice(0, -5)))
          if (parsed) buckets.push(parsed)
        } catch {}
      }
    }
    return mergeQuestionNoteBuckets(buckets)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return {}
    throw error
  }
}

export async function readWorkspaceNoteBuckets(handle: FileSystemDirectoryHandle): Promise<QuestionNotes> {
  const layout = await resolveWorkspaceLayout(handle)
  return readWorkspaceNoteBucketsFromRoot(layout.userRoot)
}

export async function writeWorkspaceNoteBucket(handle: FileSystemDirectoryHandle, bucket: QuestionNoteBucket) {
  const layout = await resolveWorkspaceLayout(handle, true)
  const key = `${WORKSPACE_NOTES_FOLDER}/${workspaceNoteSegment(bucket.bankId)}/${workspaceNoteSegment(bucket.chapterId)}.json`
  await queueWorkspaceWrite(handle, key, async () => {
    const notesDirectory = await layout.userRoot.getDirectoryHandle(WORKSPACE_NOTES_FOLDER, { create: true })
    const bankDirectory = await notesDirectory.getDirectoryHandle(workspaceNoteSegment(bucket.bankId), { create: true })
    const fileHandle = await bankDirectory.getFileHandle(`${workspaceNoteSegment(bucket.chapterId)}.json`, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify({ version: 1, bankId: bucket.bankId, chapterId: bucket.chapterId, updatedAt: new Date().toISOString(), notes: validateQuestionNotes(bucket.notes) }, null, 2))
    await writable.close()
  })
}

export async function writeWorkspaceNoteBuckets(handle: FileSystemDirectoryHandle, notes: QuestionNotes, banks: QuestionBank[], bucketKeys?: Iterable<string>) {
  const keys = bucketKeys ? [...bucketKeys] : undefined
  const buckets = keys ? questionNoteBucketsForKeys(notes, banks, keys) : splitQuestionNotes(notes, banks)
  const selected = keys
    ? keys.map(key => buckets.get(key) || { ...parseQuestionNoteBucketKey(key), notes: {} })
    : [...buckets.values()]
  await Promise.all(selected.map(bucket => writeWorkspaceNoteBucket(handle, bucket)))
}

export async function writeDefaultWorkspaceNoteBucket(bucket: QuestionNoteBucket) {
  const response = await fetch('/api/default-workspace/note-bucket', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...bucket, notes: validateQuestionNotes(bucket.notes) }) })
  if (!response.ok) throw new Error('章节笔记保存失败')
}

export async function writeDefaultWorkspaceNoteBuckets(notes: QuestionNotes, banks: QuestionBank[], bucketKeys?: Iterable<string>) {
  const keys = bucketKeys ? [...bucketKeys] : undefined
  const buckets = keys ? questionNoteBucketsForKeys(notes, banks, keys) : splitQuestionNotes(notes, banks)
  const selected = keys
    ? keys.map(key => buckets.get(key) || { ...parseQuestionNoteBucketKey(key), notes: {} })
    : [...buckets.values()]
  await Promise.all(selected.map(writeDefaultWorkspaceNoteBucket))
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
      if (!request.result.objectStoreNames.contains(CACHE_STORE_NAME)) request.result.createObjectStore(CACHE_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法保存题库文件夹授权'))
  })
}

export async function saveWorkspaceCache(cache: WorkspaceCache) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite')
    transaction.objectStore(CACHE_STORE_NAME).put(cache, WORKSPACE_CACHE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  database.close()
}

export async function loadWorkspaceCache(source?: WorkspaceCache['source']): Promise<WorkspaceCache | null> {
  const database = await openDatabase()
  const cache = await new Promise<WorkspaceCache | null>((resolve, reject) => {
    const request = database.transaction(CACHE_STORE_NAME, 'readonly').objectStore(CACHE_STORE_NAME).get(WORKSPACE_CACHE_KEY)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
  database.close()
  if (!cache || cache.version !== 1 || (source && cache.source !== source) || !cache.manifest) return null
  return cache
}

export async function clearWorkspaceCache() {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite')
    transaction.objectStore(CACHE_STORE_NAME).delete(WORKSPACE_CACHE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  database.close()
}

export async function saveWorkspaceHandle(handle: FileSystemDirectoryHandle) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function loadWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  const database = await openDatabase()
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(HANDLE_KEY)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return handle
}

export async function clearWorkspaceHandle() {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(HANDLE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
  await clearWorkspaceCache().catch(() => {})
}

export function isMissingWorkspaceError(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

export async function hasWorkspacePermission(handle: FileSystemDirectoryHandle, request = false) {
  const writableHandle = handle as WritableDirectoryHandle
  const options = { mode: 'readwrite' } as const
  if (await writableHandle.queryPermission(options) === 'granted') return true
  return request && await writableHandle.requestPermission(options) === 'granted'
}

export async function chooseWorkspace() {
  if (!('showDirectoryPicker' in window)) throw new Error('当前浏览器不支持文件夹实时同步，请使用最新版 Chrome 或 Edge')
  const handle = await (window as DirectoryPickerWindow).showDirectoryPicker({ id: 'npee-question-bank-workspace', mode: 'readwrite' })
  await saveWorkspaceHandle(handle)
  await clearWorkspaceCache().catch(() => {})
  return handle
}

export async function writeWorkspaceManifest(handle: FileSystemDirectoryHandle, banks: QuestionBank[], folders: Record<string, string> = {}, deletedBankIds: Record<string, string> = {}) {
  const layout = await resolveWorkspaceLayout(handle, true)
  await queueWorkspaceWrite(handle, WORKSPACE_MANIFEST, async () => {
    const fileHandle = await layout.bankRoot.getFileHandle(WORKSPACE_MANIFEST, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(createWorkspaceManifest(banks, folders, deletedBankIds), null, 2))
    await writable.close()
  })
}

export async function writeWorkspaceUserData(handle: FileSystemDirectoryHandle, rounds: StudyRounds, settings: UserSettings = DEFAULT_USER_SETTINGS, notes: QuestionNotes = {}, errorRecords: QuestionErrorRecords = {}, personalNotebooks: PersonalNotebooks = []) {
  const layout = await resolveWorkspaceLayout(handle, true)
  await queueWorkspaceWrite(handle, WORKSPACE_USER_DATA, async () => {
    const fileHandle = await layout.userRoot.getFileHandle(WORKSPACE_USER_DATA, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(createWorkspaceMetadata(rounds, settings, errorRecords, personalNotebooks), null, 2))
    await writable.close()
  })
}

export async function writeWorkspaceImage(handle: FileSystemDirectoryHandle, file: File, relativePath: string) {
  const layout = await resolveWorkspaceLayout(handle, true)
  const parts = normalizeWorkspacePath(relativePath).split('/').filter(Boolean)
  if (!parts.length || parts.some(part => part === '.' || part === '..')) throw new Error('题库图片路径无效')
  await queueWorkspaceWrite(handle, `image:${parts.join('/')}`, async () => {
    const fileName = parts.pop()!
    let directory = layout.bankRoot
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true })
    const fileHandle = await directory.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()
  })
}

export async function readWorkspaceManifest(handle: FileSystemDirectoryHandle): Promise<WorkspaceManifest | null> {
  const layout = await resolveWorkspaceLayout(handle)
  try {
    const file = await (await layout.bankRoot.getFileHandle(WORKSPACE_MANIFEST)).getFile()
    return JSON.parse(await file.text()) as WorkspaceManifest
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

async function readWorkspaceUserDataFromRoot(root: FileSystemDirectoryHandle): Promise<WorkspaceUserData | null> {
  try {
    const file = await (await root.getFileHandle(WORKSPACE_USER_DATA)).getFile()
    return JSON.parse(await file.text()) as WorkspaceUserData
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null
    throw error
  }
}

export async function readWorkspaceUserData(handle: FileSystemDirectoryHandle): Promise<WorkspaceUserData | null> {
  const layout = await resolveWorkspaceLayout(handle)
  return readWorkspaceUserDataFromRoot(layout.userRoot)
}

export function resolveWorkspaceImagePath(relativePath: string, bankFolders: string[] = []) {
  const normalized = relativePath.replaceAll('\\', '/')
  const knownFolder = [...bankFolders]
    .map(folder => folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find(folder => normalized.startsWith(`${folder}/`))
  if (knownFolder) return { bankFolder: knownFolder, relativePath: normalized.slice(knownFolder.length + 1) }
  const separator = normalized.indexOf('/')
  return separator < 0
    ? { bankFolder: '', relativePath: normalized }
    : { bankFolder: normalized.slice(0, separator), relativePath: normalized.slice(separator + 1) }
}

async function collectImages(directory: FileSystemDirectoryHandle, prefix: string, bankFolders: string[], output: WorkspaceImageFile[]) {
  for await (const [name, handle] of directory.entries()) {
    if (name.startsWith('.')) continue
    const relativePath = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') await collectImages(handle, relativePath, bankFolders, output)
    else if (/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name)) {
      const resolved = resolveWorkspaceImagePath(relativePath, bankFolders)
      output.push({ file: await handle.getFile(), fileHandle: handle as FileSystemFileHandle, ...resolved })
    }
  }
}

async function collectDirectoryPaths(directory: FileSystemDirectoryHandle, prefix: string, output: string[]) {
  for await (const [name, handle] of directory.entries()) {
    if (name.startsWith('.') || name === WORKSPACE_MANIFEST || name === WORKSPACE_USER_DATA || name === WORKSPACE_NOTES_FOLDER || handle.kind !== 'directory') continue
    const relativePath = prefix ? `${prefix}/${name}` : name
    output.push(relativePath)
    await collectDirectoryPaths(handle, relativePath, output)
  }
}

export async function scanWorkspaceBankFolders(handle: FileSystemDirectoryHandle) {
  const layout = await resolveWorkspaceLayout(handle)
  const directoryPaths: string[] = []
  await collectDirectoryPaths(layout.bankRoot, '', directoryPaths)
  return workspaceBankFoldersFromDirectoryPaths(directoryPaths)
}

export async function scanWorkspaceImages(handle: FileSystemDirectoryHandle, bankFolders: string[] = []) {
  const layout = await resolveWorkspaceLayout(handle)
  const output: WorkspaceImageFile[] = []
  for await (const [name, child] of layout.bankRoot.entries()) {
    if (name.startsWith('.') || name === WORKSPACE_MANIFEST || name === WORKSPACE_USER_DATA || name === WORKSPACE_NOTES_FOLDER) continue
    if (child.kind === 'directory') await collectImages(child, name, bankFolders, output)
    else if (/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name)) output.push({ file: await child.getFile(), fileHandle: child as FileSystemFileHandle, relativePath: name, bankFolder: '' })
  }
  return output
}

export function safeFolderName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || '未命名题库'
}

export async function createBankFolder(handle: FileSystemDirectoryHandle, name: string) {
  const layout = await resolveWorkspaceLayout(handle, true)
  const folderPath = name.split('/').map(safeFolderName).filter(Boolean).join('/')
  let parent = layout.bankRoot
  for (const folderName of folderPath.split('/')) parent = await parent.getDirectoryHandle(folderName, { create: true })
  return folderPath
}

export async function removeBankFolder(handle: FileSystemDirectoryHandle, folderName: string) {
  const layout = await resolveWorkspaceLayout(handle, true)
  await layout.bankRoot.removeEntry(folderName, { recursive: true })
}

export async function deleteWorkspaceImage(handle: FileSystemDirectoryHandle, relativePath: string) {
  const normalized = normalizeWorkspacePath(relativePath)
  const segments = normalized.split('/').filter(Boolean)
  if (!segments.length) return
  try {
    const layout = await resolveWorkspaceLayout(handle, true)
    let parent = layout.bankRoot
    for (const segment of segments.slice(0, -1)) parent = await parent.getDirectoryHandle(segment)
    await parent.removeEntry(segments.at(-1)!)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
  }
}
