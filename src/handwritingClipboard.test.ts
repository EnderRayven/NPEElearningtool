import { describe, expect, it } from 'vitest'
import { copyHandwritingStrokes, readHandwritingStrokes } from './handwritingClipboard'

describe('handwritingClipboard', () => {
  it('keeps a copied shape as one shape object', async () => {
    copyHandwritingStrokes([{
      color: '#8f3028',
      size: 2,
      input: 'mouse',
      shape: 'rectangle',
      shapeLineStyle: 'dashed',
      shapeFill: true,
      shapeFillColor: '#3474a7',
      shapeFillOpacity: .42,
      points: [{ x: .1, y: .2 }, { x: .5, y: .6 }],
    }], 'normalized')

    expect(await readHandwritingStrokes()).toEqual({
      space: 'normalized',
      strokes: [{
        color: '#8f3028',
        size: 2,
        input: 'mouse',
        shape: 'rectangle',
        shapeLineStyle: 'dashed',
        shapeFill: true,
        shapeFillColor: '#3474a7',
        shapeFillOpacity: .42,
        points: [{ x: .1, y: .2 }, { x: .5, y: .6 }],
      }],
    })
  })
})
