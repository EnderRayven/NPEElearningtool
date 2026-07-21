import { describe, expect, it } from 'vitest'
import type { QuestionBank } from './types'
import { createWorkspaceManifest, createWorkspaceUserData, resolveWorkspaceImagePath, resolveWorkspaceUserData, workspaceBankFoldersFromDirectoryPaths } from './workspace'

const bank: QuestionBank = {
  id: 'bank-1',
  name: '题库',
  source: 'local',
  chapters: [],
}

describe('workspace data separation', () => {
  it('keeps project data free of user statuses', () => {
    const manifest = createWorkspaceManifest([bank], { 'bank-1': '题库' })
    expect(manifest.banks).toEqual([bank])
    expect(manifest.version).toBe(2)
    expect(manifest.folders).toEqual({ 'bank-1': '题库' })
    expect(manifest).not.toHaveProperty('statuses')
  })

  it('migrates legacy workspace statuses into round one', () => {
    const resolved = resolveWorkspaceUserData({
      version: 2,
      updatedAt: '2026-07-15T00:00:00.000Z',
      statuses: { 'question-1': 'wrong' },
      activities: [],
      settings: { examDate: '2026-12-19', activeRound: 1, roundCount: 5 },
    }, undefined, { '1': { statuses: {}, activities: [] } }, { activeRound: 1, roundCount: 5 })
    expect(resolved.rounds['1'].statuses).toEqual({ 'question-1': 'wrong' })
    expect(resolved.settings.examDate).toBe('2026-12-19')
  })

  it('keeps notes outside study rounds and preserves browser notes for legacy files', () => {
    const fallbackNotes = {
      'question-1': {
        text: '跨轮次保留',
        drawing: { version: 1 as const, aspectRatio: 1.5, strokes: [] },
        updatedAt: '2026-07-16T08:00:00.000Z',
      },
    }
    const resolved = resolveWorkspaceUserData(
      { version: 3, updatedAt: '2026-07-15T00:00:00.000Z', rounds: { '1': { statuses: {}, activities: [] } } },
      undefined,
      { '1': { statuses: {}, activities: [] } },
      { activeRound: 1, roundCount: 5 },
      fallbackNotes,
    )
    expect(resolved.notes).toEqual(fallbackNotes)
    expect(resolved.rounds['1']).not.toHaveProperty('notes')
  })

  it('writes isolated study rounds only to user data', () => {
    const activities = [{ date: '2026-07-14', questionId: 'question-1', bankId: 'bank-1', status: 'wrong' as const, updatedAt: '2026-07-14T02:00:00.000Z' }]
    const userData = createWorkspaceUserData(
      { '1': { statuses: { 'question-1': 'wrong' }, activities } },
      { examDate: '2026-12-19', activeRound: 1, roundCount: 5 },
      { 'question-1': { text: '复盘笔记', drawing: { version: 1, aspectRatio: 1.5, strokes: [] }, updatedAt: '2026-07-16T08:00:00.000Z' } },
    )
    expect(userData.version).toBe(4)
    expect(userData.rounds?.['1'].statuses).toEqual({ 'question-1': 'wrong' })
    expect(userData.rounds?.['1'].activities).toEqual(activities)
    expect(userData.settings).toEqual({ examDate: '2026-12-19', activeRound: 1, roundCount: 5 })
    expect(userData.notes?.['question-1'].text).toBe('复盘笔记')
    expect(userData).not.toHaveProperty('statuses')
    expect(userData).not.toHaveProperty('activities')
    expect(userData).not.toHaveProperty('banks')
    expect(userData).not.toHaveProperty('folders')
  })

  it('recognizes a bank stored below a grouping folder', () => {
    expect(resolveWorkspaceImagePath(
      '英语/英语一真题/2024年考研英语一真题/资源/analysis.webp',
      ['英语/英语一真题/2024年考研英语一真题'],
    )).toEqual({
      bankFolder: '英语/英语一真题/2024年考研英语一真题',
      relativePath: '资源/analysis.webp',
    })
  })

  it('recognizes math modules and direct English/professional banks from folders', () => {
    expect(workspaceBankFoldersFromDirectoryPaths([
      '数学', '数学/高数', '数学/高数/27数二1000A-高数', '数学/高数/27数二1000A-高数/01 章节',
      '数学/线代', '数学/真题', '英语', '英语/英语一真题', '英语/英语一真题/2024年真题',
      '专业课', '专业课/机械原理-基础过关450题', '专业课/机械原理-基础过关450题/01 章节',
    ])).toEqual([
      '专业课/机械原理-基础过关450题',
      '数学/高数/27数二1000A-高数',
      '英语/英语一真题',
    ])
  })
})
