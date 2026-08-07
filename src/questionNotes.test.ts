import { describe, expect, it } from 'vitest'
import { emptyQuestionNote, eraseHandwritingStrokes, hasPersonalNote, hasQuestionNote, mergeQuestionNoteBuckets, preferredQuestionNoteDisplayMode, questionNoteBucketKey, splitQuestionNotes, validateHandwritingDrawing, validatePersonalNotebooks, validateQuestionErrorRecords, validateQuestionNotes } from './questionNotes'
import type { QuestionBank } from './types'

describe('questionNotes', () => {
  it('chooses the contentful note editor and prefers handwriting when both exist', () => {
    const empty = emptyQuestionNote()
    expect(preferredQuestionNoteDisplayMode(empty)).toBe('handwriting')
    expect(preferredQuestionNoteDisplayMode({ ...empty, text: 'Markdown' })).toBe('text')
    expect(preferredQuestionNoteDisplayMode({ ...empty, drawing: { ...empty.drawing, strokes: [{ id: 's', color: '#000000', size: 2, input: 'pen', points: [{ x: .2, y: .3 }] }] } })).toBe('handwriting')
    expect(preferredQuestionNoteDisplayMode({ ...empty, text: 'Markdown', drawing: { ...empty.drawing, strokes: [{ id: 's', color: '#000000', size: 2, input: 'pen', points: [{ x: .2, y: .3 }] }] } })).toBe('handwriting')
  })

  it('partitions legacy notes by bank chapter', () => {
    const banks: QuestionBank[] = [{ id: 'bank-a', name: '题库', source: 'local', chapters: [{ id: 'chapter-1', name: '第一章', sections: [{ id: 'section-1', name: '小节', questions: [{ id: 'q1', number: 1, text: '题目', answer: 'A', analysis: '' }] }] }] }]
    const notes = { q1: { ...emptyQuestionNote(), text: '章节笔记' }, unknown: { ...emptyQuestionNote(), text: '未匹配笔记' } }
    const buckets = splitQuestionNotes(notes, banks)
    expect(buckets.get(questionNoteBucketKey('bank-a', 'chapter-1'))?.notes.q1.text).toBe('章节笔记')
    expect(mergeQuestionNoteBuckets([...buckets.values()])).toEqual(notes)
  })

  it('validates text and editable vector strokes', () => {
    const notes = validateQuestionNotes({
      q1: {
        text: '矩阵秩的关键步骤',
        updatedAt: '2026-07-16T08:00:00.000Z',
        drawing: {
          version: 7,
          aspectRatio: 2,
          strokes: [{ id: 's1', color: '#AABBCC', size: 4, input: 'pen', points: [{ x: -.2, y: .5, pressure: 2 }, { x: .8, y: 1.5 }] }],
        },
      },
    })
    expect(notes.q1.text).toBe('矩阵秩的关键步骤')
    expect(notes.q1.drawing).toEqual({
      version: 1,
      aspectRatio: 2,
      strokes: [{ id: 's1', color: '#aabbcc', size: 4, input: 'pen', points: [{ x: 0, y: .5, pressure: 1 }, { x: .8, y: 1.5 }] }],
    })
  })

  it('preserves supported shape metadata and discards unknown shapes', () => {
    const drawing = validateHandwritingDrawing({
      strokes: [
        { id: 'shape', color: '#8f3028', size: 2, input: 'mouse', shape: 'rectangle', shapeLineStyle: 'dotted', shapeFill: true, shapeFillColor: '#3474A7', shapeFillOpacity: 1.5, points: [{ x: .1, y: .2 }, { x: .5, y: .6 }] },
        { id: 'unknown', color: '#8f3028', size: 2, input: 'mouse', shape: 'star', points: [{ x: .2, y: .3 }] },
      ],
    })
    expect(drawing.strokes[0]).toMatchObject({
      shape: 'rectangle',
      shapeLineStyle: 'dotted',
      shapeFill: true,
      shapeFillColor: '#3474a7',
      shapeFillOpacity: 1,
    })
    expect(drawing.strokes[1].shape).toBeUndefined()
  })

  it('repairs shapes saved by the former edge-per-stroke format', () => {
    const segment = (id: string, from: [number, number], to: [number, number]) => ({
      id,
      color: '#8f3028',
      size: 2,
      input: 'mouse',
      points: [
        { x: from[0], y: from[1], pressure: .5 },
        { x: to[0], y: to[1], pressure: .5 },
      ],
    })
    const drawing = validateHandwritingDrawing({
      strokes: [
        segment('top', [.1, .2], [.5, .2]),
        segment('right', [.5, .2], [.5, .6]),
        segment('bottom', [.5, .6], [.1, .6]),
        segment('left', [.1, .6], [.1, .2]),
      ],
    })

    expect(drawing.strokes).toHaveLength(1)
    expect(drawing.strokes[0]).toMatchObject({ id: 'top', shape: 'rectangle' })
    expect(drawing.strokes[0].points).toHaveLength(5)
  })

  it('filters empty or malformed notes', () => {
    expect(validateQuestionNotes({
      empty: emptyQuestionNote(),
      malformed: { text: 1, drawing: { strokes: [{ points: [{ x: 'x', y: 1 }] }] } },
      valid: { text: '保留', drawing: null },
    })).toEqual({
      valid: { text: '保留', drawing: validateHandwritingDrawing(null), updatedAt: '' },
    })
  })

  it('keeps an empty drawing when its expanded canvas space is intentional', () => {
    const expanded = {
      ...emptyQuestionNote(),
      drawing: { ...emptyQuestionNote().drawing, aspectRatio: 1 },
    }

    expect(hasQuestionNote(expanded)).toBe(true)
    expect(validateQuestionNotes({ expanded })).toEqual({
      expanded: { ...expanded, updatedAt: '' },
    })
  })

  it('validates saved English error records', () => {
    expect(validateQuestionErrorRecords({
      q1: { wrongOption: ' b ', updatedAt: '2026-07-25T08:00:00.000Z' },
      empty: { wrongOption: '   ', updatedAt: 'ignored' },
      malformed: 'not a record',
    })).toEqual({
      q1: { wrongOption: 'B', updatedAt: '2026-07-25T08:00:00.000Z' },
    })
  })

  it('detects text and handwriting content', () => {
    expect(hasQuestionNote(undefined)).toBe(false)
    expect(hasQuestionNote(emptyQuestionNote())).toBe(false)
    expect(hasQuestionNote({ ...emptyQuestionNote(), text: '笔记' })).toBe(true)
    expect(hasQuestionNote({ ...emptyQuestionNote(), drawing: { version: 1, aspectRatio: 1.5, strokes: [{ id: 's', color: '#000000', size: 2, input: 'pen', points: [{ x: .2, y: .3 }] }] } })).toBe(true)
  })

  it('validates independent notebooks while retaining an empty titled note', () => {
    const notebooks = validatePersonalNotebooks([{
      id: 'notebook-1',
      name: '公式整理',
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
      notes: [{ id: 'note-1', title: '待补充', text: '', drawing: emptyQuestionNote().drawing, updatedAt: '' }],
    }])
    expect(notebooks).toHaveLength(1)
    expect(notebooks[0].notes[0].title).toBe('待补充')
    expect(hasPersonalNote(notebooks[0].notes[0])).toBe(true)
  })

  it('erases only strokes touched by the editable eraser', () => {
    const strokes = [
      { id: 'near', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .2 }] },
      { id: 'far', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .8, y: .8 }] },
    ]
    expect(eraseHandwritingStrokes(strokes, { x: .22, y: .2 }, .05).map(stroke => stroke.id)).toEqual(['far'])
  })

  it('erases a whole shape when the eraser touches the middle of an edge', () => {
    const strokes = [
      { id: 'line', color: '#000000', size: 2, input: 'mouse' as const, shape: 'line' as const, points: [{ x: .1, y: .2 }, { x: .9, y: .2 }] },
      { id: 'far', color: '#000000', size: 2, input: 'mouse' as const, points: [{ x: .8, y: .8 }] },
    ]
    expect(eraseHandwritingStrokes(strokes, { x: .5, y: .21 }, .02).map(stroke => stroke.id)).toEqual(['far'])
  })
})
