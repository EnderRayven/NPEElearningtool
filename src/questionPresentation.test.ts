import { describe, expect, it } from 'vitest'
import { isImageQuestionType } from './questionPresentation'

describe('isImageQuestionType', () => {
  it('识别图片类题型', () => {
    expect(isImageQuestionType('图片题')).toBe(true)
    expect(isImageQuestionType('图像选择题')).toBe(true)
    expect(isImageQuestionType('截图题')).toBe(true)
  })

  it('保留普通题型标签', () => {
    expect(isImageQuestionType('选择题')).toBe(false)
    expect(isImageQuestionType(undefined)).toBe(false)
  })
})
