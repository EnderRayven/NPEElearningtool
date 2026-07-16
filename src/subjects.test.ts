import { describe, expect, it } from 'vitest'
import type { QuestionBank } from './types'
import { bankSubject } from './subjects'

const bank = (overrides: Partial<QuestionBank>): QuestionBank => ({
  id: 'local-bank',
  name: '自建题库',
  source: 'local',
  chapters: [],
  ...overrides,
})

describe('bankSubject', () => {
  it('keeps legacy math and English inference', () => {
    expect(bankSubject(bank({}))).toBe('math')
    expect(bankSubject(bank({ name: '英语真题' }))).toBe('english')
  })

  it('uses an explicit professional subject', () => {
    expect(bankSubject(bank({ subject: 'professional' }))).toBe('professional')
  })
})
