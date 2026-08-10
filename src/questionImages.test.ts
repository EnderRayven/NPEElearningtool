import { describe, expect, it } from 'vitest'
import { isStructuredWorkspaceImageKey } from './questionImages'

describe('question image source keys', () => {
  it('recognizes structured workspace assets', () => {
    expect(isStructuredWorkspaceImageKey('default-bank-10-1-06/question/1-Q-10-1-06.1.png')).toBe(true)
    expect(isStructuredWorkspaceImageKey('default-bank-10-2-02/answer/2-A-10-2-02.2.webp')).toBe(true)
  })

  it('does not treat editor assets as replaceable structured files', () => {
    expect(isStructuredWorkspaceImageKey('editor/default-bank/question-10-1-06/question/1786329605056-7htztx.png')).toBe(false)
    expect(isStructuredWorkspaceImageKey('editor/default-bank/question-10-1-06/answer/1786329631352-gialla.png')).toBe(false)
  })
})
