import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import QuestionNotePanel, { autoExtendedCanvasHeight, canvasHeightForDrawing, canvasHeightForMovingSelection, canvasHeightForStrokes, clampSpaceAdjustment, createShapeStrokes, croppedCanvasHeightForDrawing, handwritingPointFromClientDelta, handwritingToolForShortcut, historyActionForShortcut, insertSpaceIntoStrokes, lineSnapAxisForPoints, pathsForStroke, selectionHandlePointsForBounds, shouldResetCanvasForDrawingChange, snapLineEndPoint, updateSelectedStrokeSize } from './QuestionNotePanel'

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

  it('keeps the canvas tall enough for extended handwriting', () => {
    expect(canvasHeightForDrawing({
      version: 1,
      aspectRatio: 5 / 3,
      strokes: [{ id: 'lower', color: '#8f3028', size: 2, input: 'pen', points: [{ x: .2, y: 1.4 }] }],
    })).toBeGreaterThan(600 * 1.4)
  })

  it('extends the canvas in fixed steps when content approaches the bottom', () => {
    expect(autoExtendedCanvasHeight(600, 520)).toBe(600)
    expect(autoExtendedCanvasHeight(600, 540)).toBe(900)
    expect(autoExtendedCanvasHeight(600, 1250)).toBe(1500)
  })

  it('extends the canvas from the moved selection bottom only while moving downward', () => {
    expect(canvasHeightForMovingSelection(600, .8, .1)).toBe(900)
    expect(canvasHeightForMovingSelection(600, .8, -.05)).toBe(600)
    expect(canvasHeightForMovingSelection(600, .4, .05)).toBe(600)
  })

  it('keeps pointer movement stable when canvas layout changes during a stroke', () => {
    const next = handwritingPointFromClientDelta(
      { x: .4, y: .8, pressure: .4 },
      { x: 500, y: 500 },
      { x: 520, y: 510 },
      1000,
    )

    expect(next.x).toBeCloseTo(.42)
    expect(next.y).toBeCloseTo(.8 + 10 / 600)
    expect(next.pressure).toBe(.4)
  })

  it('shrinks to the remaining strokes without going below the default height', () => {
    expect(canvasHeightForStrokes([])).toBe(600)
    expect(canvasHeightForStrokes([{ id: 'upper', color: '#000000', size: 2, input: 'pen', points: [{ x: .2, y: .4 }] }])).toBe(600)
    expect(canvasHeightForStrokes([{ id: 'lower', color: '#000000', size: 2, input: 'pen', points: [{ x: .2, y: 1.4 }] }])).toBeGreaterThan(600 * 1.4)
  })

  it('provides a safely cropped display height without changing the stored canvas', () => {
    const drawing = {
      version: 1 as const,
      aspectRatio: 5 / 3,
      strokes: [{ id: 'upper', color: '#8f3028', size: 2, input: 'pen' as const, points: [{ x: .2, y: .1 }, { x: .4, y: .25 }] }],
    }
    expect(croppedCanvasHeightForDrawing(drawing)).toBe(206)
    expect(canvasHeightForDrawing(drawing)).toBe(600)
  })

  it('crops from the lowest point across every stroke instead of the last-created stroke', () => {
    const drawing = {
      version: 1 as const,
      aspectRatio: 5 / 3,
      strokes: [
        { id: 'lower-earlier', color: '#8f3028', size: 2, input: 'pen' as const, points: [{ x: .2, y: .72 }, { x: .4, y: .8 }] },
        { id: 'upper-latest', color: '#8f3028', size: 2, input: 'pen' as const, points: [{ x: .5, y: .1 }, { x: .6, y: .16 }] },
      ],
    }
    expect(croppedCanvasHeightForDrawing(drawing)).toBe(536)
  })

  it('inserts space by moving only strokes below the insertion line', () => {
    const strokes = [
      { id: 'above', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .2 }] },
      { id: 'below', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .8 }] },
    ]
    const result = insertSpaceIntoStrokes(strokes, .5, .25)
    expect(result[0].points[0].y).toBe(.2)
    expect(result[1].points[0].y).toBe(1.05)
  })

  it('allows inserting space when the canvas still has room below the strokes', () => {
    const strokes = [
      { id: 'above', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .2 }] },
      { id: 'below', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .8 }] },
    ]
    const amount = clampSpaceAdjustment(strokes, .5, .4, 1200)
    expect(amount).toBe(.4)
    expect(insertSpaceIntoStrokes(strokes, .5, amount)[1].points[0].y).toBeCloseTo(1.2)
  })

  it('removes space by moving strokes below the line upward without clipping them', () => {
    const strokes = [
      { id: 'above', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .2 }] },
      { id: 'below', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .8 }] },
    ]
    const amount = clampSpaceAdjustment(strokes, .5, -1.5, 1200)
    const result = insertSpaceIntoStrokes(strokes, .5, amount)
    expect(amount).toBe(-.8)
    expect(result[0].points[0].y).toBe(.2)
    expect(result[1].points[0].y).toBe(0)
  })

  it('does not shrink the default canvas below its base height', () => {
    expect(clampSpaceAdjustment([], .5, -1, 600)).toBe(0)
  })

  it('maps note history shortcuts to undo and redo', () => {
    expect(historyActionForShortcut('z', true, false, false)).toBe('undo')
    expect(historyActionForShortcut('Z', false, false, false)).toBe(null)
    expect(historyActionForShortcut('z', true, true, false)).toBe('redo')
    expect(historyActionForShortcut('y', true, false, false)).toBe('redo')
    expect(historyActionForShortcut('z', true, false, true)).toBe(null)
  })

  it('maps one non-repeating number keypress to one handwriting tool change', () => {
    expect(handwritingToolForShortcut('1')).toBe('eraser')
    expect(handwritingToolForShortcut('5')).toBe('shape')
    expect(handwritingToolForShortcut('2', { repeat: true })).toBeNull()
    expect(handwritingToolForShortcut('3', { ctrlKey: true })).toBeNull()
    expect(handwritingToolForShortcut('6')).toBeNull()
  })

  it('does not reset a newly started stroke when the previous drawing update arrives late', () => {
    expect(shouldResetCanvasForDrawingChange(17)).toBe(false)
    expect(shouldResetCanvasForDrawingChange(null)).toBe(true)
  })

  it('updates only lasso-selected stroke sizes', () => {
    const strokes = [
      { id: 'selected', color: '#000000', size: 2, input: 'pen' as const, points: [{ x: .2, y: .2 }] },
      { id: 'other', color: '#8f3028', size: 5, input: 'mouse' as const, points: [{ x: .6, y: .6 }] },
    ]
    const result = updateSelectedStrokeSize(strokes, ['selected'], 9)
    expect(result.map(stroke => stroke.size)).toEqual([9, 5])
    expect(strokes.map(stroke => stroke.size)).toEqual([2, 5])
  })

  it('places adjustment handles on selection corners and polygon edges', () => {
    const handles = selectionHandlePointsForBounds({ minX: .2, minY: .3, maxX: .8, maxY: .9 })

    expect(handles.map(handle => handle.handle)).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])
    expect(handles.find(handle => handle.handle === 'n')).toMatchObject({ x: .5, y: .3 })
    expect(handles.find(handle => handle.handle === 'e')).toMatchObject({ x: .8, y: .6 })
    expect(handles.find(handle => handle.handle === 's')).toMatchObject({ x: .5, y: .9 })
    expect(handles.find(handle => handle.handle === 'w')).toMatchObject({ x: .2, y: .6 })
  })

  it('creates each shape as one editable handwriting object', () => {
    const style = { color: '#8f3028', size: 3, input: 'mouse' as const }
    const start = { x: .1, y: .2 }
    const end = { x: .5, y: .6 }

    expect(createShapeStrokes('line', start, end, style)).toHaveLength(1)
    expect(createShapeStrokes('arrow', start, end, style)).toHaveLength(1)
    expect(createShapeStrokes('rectangle', start, end, style)).toHaveLength(1)
    expect(createShapeStrokes('triangle', start, end, style)).toHaveLength(1)
    expect(createShapeStrokes('ellipse', start, end, style)[0].points).toHaveLength(65)
    expect(createShapeStrokes('rectangle', start, end, style)[0]).toMatchObject({
      color: style.color,
      size: style.size,
      shape: 'rectangle',
    })
  })

  it('renders shapes as straight, uniform ink matching the main freehand weight', () => {
    const [shape] = createShapeStrokes('rectangle', { x: .1, y: .2 }, { x: .5, y: .6 }, {
      color: '#8f3028',
      size: 2,
      input: 'mouse',
      lineStyle: 'dashed',
      fill: true,
      fillColor: '#3474a7',
      fillOpacity: .42,
    })
    const freehand = {
      id: 'freehand',
      color: '#8f3028',
      size: 2,
      input: 'mouse' as const,
      points: [
        { x: .1, y: .2 },
        { x: .101, y: .201 },
        { x: .102, y: .202 },
        { x: .103, y: .203 },
        { x: .104, y: .204 },
        { x: .105, y: .205 },
        { x: .106, y: .206 },
      ],
    }
    const shapePaths = pathsForStroke(shape)
    const freehandPaths = pathsForStroke(freehand)

    expect(shapePaths).toHaveLength(1)
    expect(shapePaths[0].d).toContain(' L ')
    expect(shapePaths[0].d).not.toContain(' Q ')
    expect(shapePaths[0].width).toBe(Math.max(...freehandPaths.map(path => path.width)))
    expect(shapePaths[0]).toMatchObject({
      dashArray: '16 11',
      fill: '#3474a7',
      fillOpacity: .42,
    })
  })

  it('does not fill open line and arrow shapes', () => {
    const [line] = createShapeStrokes('line', { x: .1, y: .2 }, { x: .5, y: .6 }, {
      color: '#3474a7',
      size: 2,
      input: 'mouse',
      fill: true,
    })
    expect(line.shapeFill).toBeUndefined()
    expect(pathsForStroke(line)[0].fill).toBeUndefined()
  })

  it('recognizes horizontal and vertical line snap candidates in canvas space', () => {
    expect(lineSnapAxisForPoints({ x: .1, y: .2 }, { x: .7, y: .205 })).toBe('horizontal')
    expect(lineSnapAxisForPoints({ x: .3, y: .1 }, { x: .305, y: .8 })).toBe('vertical')
    expect(lineSnapAxisForPoints({ x: .1, y: .1 }, { x: .6, y: .6 })).toBeNull()
  })

  it('snaps only the aligned coordinate and preserves pointer data', () => {
    const start = { x: .2, y: .3, pressure: .4 }
    const end = { x: .7, y: .34, pressure: .6 }

    expect(snapLineEndPoint(start, end, 'horizontal')).toEqual({ x: .7, y: .3, pressure: .6 })
    expect(snapLineEndPoint(start, end, 'vertical')).toEqual({ x: .2, y: .34, pressure: .6 })
  })

  it('keeps generated shape points inside the dragged bounds', () => {
    const strokes = createShapeStrokes('ellipse', { x: .8, y: .9 }, { x: .2, y: .3 }, {
      color: '#3474a7',
      size: 2,
      input: 'pen',
    })
    const points = strokes.flatMap(stroke => stroke.points)
    expect(Math.min(...points.map(point => point.x))).toBeCloseTo(.2)
    expect(Math.max(...points.map(point => point.x))).toBeCloseTo(.8)
    expect(Math.min(...points.map(point => point.y))).toBeCloseTo(.3)
    expect(Math.max(...points.map(point => point.y))).toBeCloseTo(.9)
  })
})
