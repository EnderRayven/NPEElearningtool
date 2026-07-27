import { describe, expect, it } from 'vitest'
import { emptyQuestionNote, eraseHandwritingStrokes, hasQuestionNote, mergeQuestionNoteBuckets, questionNoteBucketKey, splitQuestionNotes, validateHandwritingDrawing, validateQuestionErrorRecords, validateQuestionNotes } from './questionNotes'
import type { QuestionBank } from './types'

describe('questionNotes', () => {
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

  it('filters empty or malformed notes', () => {
    expect(validateQuestionNotes({
      empty: emptyQuestionNote(),
      malformed: { text: 1, drawing: { strokes: [{ points: [{ x: 'x', y: 1 }] }] } },
      valid: { text: '保留', drawing: null },
    })).toEqual({
      valid: { text: '保留', drawing: validateHandwritingDrawing(null), updatedAt: '' },
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

  it('erases only strokes touched by the editable eraser', () => {
    const strokes = [
      { id: 'near', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .2 }] },
      { id: 'far', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .8, y: .8 }] },
    ]
    expect(eraseHandwritingStrokes(strokes, { x: .22, y: .2 }, .05).map(stroke => stroke.id)).toEqual(['far'])
  })
})
