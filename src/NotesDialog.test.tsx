import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NotesDialog from './NotesDialog'

describe('NotesDialog', () => {
  it('crops excess handwriting space in the notes summary while retaining the saved drawing', () => {
    const question = { id: 'q-1', number: 1, type: '简答题', text: '测试题目', answer: '', analysis: '' }
    const banks = [{
      id: 'bank-1',
      name: '测试题库',
      source: 'local' as const,
      chapters: [{ id: 'chapter-1', name: '第一章', sections: [{ id: 'section-1', name: '第一节', questions: [question] }] }],
    }]
    const notes = {
      'q-1': {
        text: '',
        updatedAt: '2026-07-30T00:00:00.000Z',
        drawing: {
          version: 1 as const,
          aspectRatio: 5 / 3,
          strokes: [{ id: 'stroke-1', color: '#8f3028', size: 2, input: 'pen' as const, points: [{ x: .1, y: .1 }, { x: .3, y: .25 }] }],
        },
      },
    }
    const markup = renderToStaticMarkup(createElement(NotesDialog, {
      banks,
      notes,
      onClose: () => {},
      onOpenQuestion: () => {},
    }))
    expect(markup).toContain('aria-label="完整手写笔记"')
    expect(markup).toContain('viewBox="0 0 1000 206"')
    expect(markup).not.toContain('viewBox="0 0 1000 600"')
  })
})
