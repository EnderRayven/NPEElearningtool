import { describe, expect, it } from 'vitest'
import { DEFAULT_QUESTION_TAGS, sortQuestionTagsForFilter, validateQuestionTagDefinitions } from './questionTags'

describe('题目标记设置', () => {
  it('提供必做、选做和特难题的默认语义颜色', () => {
    expect(DEFAULT_QUESTION_TAGS.find(tag => tag.id === 'red')).toMatchObject({ name: '必做题', color: '#ef4444' })
  expect(DEFAULT_QUESTION_TAGS.find(tag => tag.id === 'blue')).toMatchObject({ name: '选做题', color: '#3b82f6' })
  expect(DEFAULT_QUESTION_TAGS.find(tag => tag.id === 'gray')).toMatchObject({ name: '特难题', color: '#9ca3af' })
  expect(DEFAULT_QUESTION_TAGS.find(tag => tag.id === 'black')).toMatchObject({ name: '不做', color: '#111827' })
  })

  it('只接受固定颜色槽位的合法名称和颜色', () => {
    const result = validateQuestionTagDefinitions([
      { id: 'red', name: '核心必做', color: '#ABCDEF' },
      { id: 'unknown', name: '不应出现', color: '#000000' },
      { id: 'blue', name: '  ', color: 'invalid' },
    ])
    expect(result.find(tag => tag.id === 'red')).toMatchObject({ name: '核心必做', color: '#abcdef' })
    expect(result.find(tag => tag.id === 'blue')).toMatchObject({ name: '选做题', color: '#3b82f6' })
    expect(result).toHaveLength(DEFAULT_QUESTION_TAGS.length)
  })

  it('让筛选标签沿用统一的标签顺序', () => {
    expect(sortQuestionTagsForFilter(DEFAULT_QUESTION_TAGS).slice(0, 3).map(tag => tag.id)).toEqual(['red', 'blue', 'gray'])
  })

  it('保留用户调整后的标签顺序', () => {
    const reordered = validateQuestionTagDefinitions([
      { id: 'purple', name: '紫色', color: '#a855f7' },
      { id: 'red', name: '必做题', color: '#ef4444' },
    ])
    expect(reordered.map(tag => tag.id).slice(0, 2)).toEqual(['purple', 'red'])
    expect(sortQuestionTagsForFilter(reordered).map(tag => tag.id).slice(0, 2)).toEqual(['purple', 'red'])
  })
})
