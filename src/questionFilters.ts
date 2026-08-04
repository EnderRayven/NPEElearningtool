import type { Question } from './types'
import { isImageQuestionType } from './questionPresentation'

export const UNASSIGNED_QUESTION_TYPE = '__unassigned__'
export const IMAGE_QUESTION_TYPE = '__image__'

export interface AdvancedQuestionFilter {
  statusValues: string[]
  tagIds: string[]
  typeValues: string[]
  onlyUntagged: boolean
}

export function createEmptyAdvancedQuestionFilter(): AdvancedQuestionFilter {
  return { statusValues: [], tagIds: [], typeValues: [], onlyUntagged: false }
}

export function questionTypeFilterValue(question: Question) {
  if (isImageQuestionType(question.type)) return IMAGE_QUESTION_TYPE
  return question.type?.trim() || UNASSIGNED_QUESTION_TYPE
}

export function questionTypeFilterLabel(value: string) {
  return value === UNASSIGNED_QUESTION_TYPE ? '未指定题型' : value
}

export function advancedQuestionFilterCount(filter: AdvancedQuestionFilter) {
  return filter.statusValues.length + filter.tagIds.length + filter.typeValues.length + Number(filter.onlyUntagged)
}

export function matchesAdvancedQuestionFilter(question: Question, filter: AdvancedQuestionFilter, statusValue?: string) {
  if (filter.statusValues.length && !filter.statusValues.includes(statusValue || '')) return false
  if (filter.tagIds.length && !filter.tagIds.some(tagId => question.tagIds?.includes(tagId))) return false
  if (filter.typeValues.length && !filter.typeValues.includes(questionTypeFilterValue(question))) return false
  if (filter.onlyUntagged && question.tagIds?.length) return false
  return true
}
