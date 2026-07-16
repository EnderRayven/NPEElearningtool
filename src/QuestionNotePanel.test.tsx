import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import QuestionNotePanel, { pathsForStroke } from './QuestionNotePanel'

describe('QuestionNotePanel', () => {
  it('uses an answer-style disclosure and marks saved content', () => {
    const markup = renderToStaticMarkup(createElement(QuestionNotePanel, {
      questionId: 'question-1',
      note: {
        text: '易错点',
        drawing: { version: 1, aspectRatio: 5 / 3, strokes: [] },
        updatedAt: '2026-07-16T08:00:00.000Z',
      },
      onChange: () => {},
    }))
    expect(markup).toContain('查看与编辑笔记')
    expect(markup).toContain('已保存')
    expect(markup).toContain('aria-expanded="false"')
  })

  it('renders handwriting as pressure-aware smooth curves', () => {
    const lightPaths = pathsForStroke({
      id: 'light',
      color: '#000000',
      size: 4,
      input: 'pen',
      points: [
        { x: .1, y: .2, pressure: .1 },
        { x: .3, y: .4, pressure: .1 },
        { x: .6, y: .3, pressure: .1 },
        { x: .8, y: .5, pressure: .1 },
      ],
    })
    const heavyPaths = pathsForStroke({
      id: 'heavy',
      color: '#000000',
      size: 4,
      input: 'pen',
      points: [
        { x: .1, y: .2, pressure: .9 },
        { x: .3, y: .4, pressure: .9 },
        { x: .6, y: .3, pressure: .9 },
        { x: .8, y: .5, pressure: .9 },
      ],
    })

    expect(lightPaths.some(path => path.d.includes(' Q '))).toBe(true)
    expect(Math.max(...heavyPaths.map(path => path.width))).toBeGreaterThan(Math.max(...lightPaths.map(path => path.width)))
  })
})
