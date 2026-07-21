import { describe, expect, it } from 'vitest'
import type { QuestionBank } from './types'
import { bankMathModule, bankMathModules, bankSubject } from './subjects'

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

describe('bankMathModules', () => {
  it('按题库名称识别高数与线代', () => {
    expect(bankMathModules(bank({ name: '880高数' }))).toEqual(['calculus'])
    expect(bankMathModules(bank({ name: '880线代' }))).toEqual(['linear'])
    expect(bankMathModule(bank({ name: '880线代' }))).toBe('linear')
  })

  it('让同时包含两科的数二题库在两个模块中可见', () => {
    expect(bankMathModules(bank({
      name: '27版1000题数二基础篇',
      chapters: [{ id: 'calculus', name: '高等数学', sections: [] }, { id: 'linear', name: '线性代数', sections: [] }],
    }))).toEqual(['calculus', 'linear'])
  })

  it('优先根据分层工作区目录识别数学板块', () => {
    expect(bankMathModules(bank({ name: '新题库', workspaceFolder: '数学/线代/新题库' }))).toEqual(['linear'])
    expect(bankMathModules(bank({ name: '新题库', workspaceFolder: '数学/真题/新题库' }))).toEqual(['exams'])
    expect(bankMathModule(bank({ name: '新题库', workspaceFolder: '数学/真题/新题库' }))).toBe('exams')
  })

  it('非数学题库不进入数学模块', () => {
    expect(bankMathModules(bank({ subject: 'english', name: '英语一真题' }))).toEqual([])
  })
})
