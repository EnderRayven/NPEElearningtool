import { describe, expect, it } from 'vitest'
import { createEmptyAdvancedQuestionFilter, matchesAdvancedQuestionFilter, questionTypeFilterValue, UNASSIGNED_QUESTION_TYPE } from './questionFilters'
import type { Question } from './types'

const question: Question = { id: 'q-1', number: 1, type: '选择题', text: '题目', answer: 'A', analysis: '解析', tagIds: ['red'], imageKeys: ['question.png'], answerImageKeys: ['answer.png'] }

describe('高级题目筛选', () => {
  it('支持组合标签和题型', () => {
    expect(matchesAdvancedQuestionFilter(question, { ...createEmptyAdvancedQuestionFilter(), tagIds: ['red'], typeValues: ['选择题'] })).toBe(true)
    expect(matchesAdvancedQuestionFilter(question, { ...createEmptyAdvancedQuestionFilter(), tagIds: ['blue'] })).toBe(false)
  })

  it('支持未添加标签和未指定题型', () => {
    const untagged: Question = { ...question, type: undefined, tagIds: undefined }
    expect(questionTypeFilterValue(untagged)).toBe(UNASSIGNED_QUESTION_TYPE)
    expect(matchesAdvancedQuestionFilter(untagged, { ...createEmptyAdvancedQuestionFilter(), onlyUntagged: true })).toBe(true)
    expect(matchesAdvancedQuestionFilter(question, { ...createEmptyAdvancedQuestionFilter(), onlyUntagged: true })).toBe(false)
  })

  it('要求熟练度和标签同时满足', () => {
    const combined = { ...createEmptyAdvancedQuestionFilter(), statusValues: ['proficient'], tagIds: ['red'] }
    expect(matchesAdvancedQuestionFilter(question, combined, 'proficient')).toBe(true)
    expect(matchesAdvancedQuestionFilter(question, combined, 'wrong')).toBe(false)
    expect(matchesAdvancedQuestionFilter({ ...question, tagIds: ['blue'] }, combined, 'proficient')).toBe(false)
  })
})
