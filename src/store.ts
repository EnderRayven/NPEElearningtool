import type { QuestionBank, QuestionStatus } from './types'
import { sampleBanks } from './data'

const BANKS_KEY = 'npee:banks:v1'
const STATUS_KEY = 'npee:status:v1'

export function loadBanks(): QuestionBank[] {
  try { const raw = localStorage.getItem(BANKS_KEY); return raw ? JSON.parse(raw) : sampleBanks } catch { return sampleBanks }
}
export function saveBanks(banks: QuestionBank[]) { localStorage.setItem(BANKS_KEY, JSON.stringify(banks)) }
export function loadStatuses(): Record<string, QuestionStatus> {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') } catch { return {} }
}
export function saveStatuses(statuses: Record<string, QuestionStatus>) { localStorage.setItem(STATUS_KEY, JSON.stringify(statuses)) }

export function validateBanks(value: unknown): QuestionBank[] {
  const root = value as { banks?: unknown }
  const banks = Array.isArray(value) ? value : root?.banks
  if (!Array.isArray(banks) || !banks.length) throw new Error('文件中没有题库数据')
  for (const bank of banks) {
    if (!bank || typeof bank !== 'object' || typeof bank.id !== 'string' || typeof bank.name !== 'string' || !Array.isArray(bank.chapters))
      throw new Error('题库格式不正确：缺少 id、name 或 chapters')
  }
  return banks as QuestionBank[]
}
