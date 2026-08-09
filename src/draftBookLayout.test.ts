import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAFT_BOOK_ICON_ANCHOR,
  draftBookIconAnchorFromPosition,
  draftBookIconPositionFromAnchor,
  migrateLegacyDraftBookIconAnchor,
} from './draftBookLayout'

describe('draft book icon layout', () => {
  it('keeps the icon attached to the same viewport edges when the window changes size', () => {
    const anchor = draftBookIconAnchorFromPosition({ x: 1206, y: 562 }, { width: 1280, height: 720 })

    expect(anchor).toEqual({ horizontal: 'right', vertical: 'bottom', horizontalOffset: 20, verticalOffset: 104 })
    expect(draftBookIconPositionFromAnchor(anchor, { width: 1976, height: 996 })).toEqual({ x: 1902, y: 838 })
  })

  it('migrates stale legacy coordinates to a sensible bottom-right position', () => {
    expect(migrateLegacyDraftBookIconAnchor({ x: 1267, y: 686 }, { width: 1976, height: 996 })).toEqual(DEFAULT_DRAFT_BOOK_ICON_ANCHOR)
  })

  it('preserves a legacy position that was already close to an edge', () => {
    expect(migrateLegacyDraftBookIconAnchor({ x: 1196, y: 522 }, { width: 1280, height: 720 })).toEqual({
      horizontal: 'right',
      vertical: 'bottom',
      horizontalOffset: 30,
      verticalOffset: 144,
    })
  })
})
