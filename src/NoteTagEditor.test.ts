import { describe, expect, it } from 'vitest'
import { noteTagsAfterDraft } from './NoteTagEditor'

describe('noteTagsAfterDraft', () => {
  it('preserves previously committed tags when another tag is added', () => {
    const first = noteTagsAfterDraft([], '第一')
    const second = noteTagsAfterDraft(first, '第二')

    expect(second).toEqual(['第一', '第二'])
  })

  it('splits separators and removes duplicates in one submission', () => {
    expect(noteTagsAfterDraft(['第一'], '第一, 第二，第三、第二')).toEqual([
      '第一',
      '第二',
      '第三',
    ])
  })
})
