import { describe, expect, it } from 'vitest'
import { navigationScrollTop, shouldScrollSectionChangeToTop } from './navigationScroll'

describe('navigationScrollTop', () => {
  it('places a normal current chapter near the top of the navigation area', () => {
    expect(navigationScrollTop({
      containerHeight: 560,
      scrollHeight: 1400,
      chapterTop: 410,
      sectionTop: 465,
      sectionHeight: 40,
    })).toBe(400)
  })

  it('places a deep section in the upper part of the viewport when the chapter is taller than the viewport', () => {
    expect(navigationScrollTop({
      containerHeight: 500,
      scrollHeight: 1600,
      chapterTop: 200,
      sectionTop: 760,
      sectionHeight: 40,
    })).toBe(620)
  })

  it('clamps positioning at the beginning and end of the navigation list', () => {
    expect(navigationScrollTop({
      containerHeight: 500,
      scrollHeight: 1200,
      chapterTop: 4,
      sectionTop: 50,
      sectionHeight: 36,
    })).toBe(0)
    expect(navigationScrollTop({
      containerHeight: 500,
      scrollHeight: 1200,
      chapterTop: 1150,
      sectionTop: 1180,
      sectionHeight: 36,
    })).toBe(700)
  })

  it('keeps a visible target steady when the current scroll position is supplied', () => {
    expect(navigationScrollTop({
      containerHeight: 500,
      scrollHeight: 1600,
      currentScrollTop: 420,
      chapterTop: 520,
      sectionTop: 560,
      sectionHeight: 36,
    })).toBe(420)
  })

  it('moves only enough to reveal a target above or below the viewport', () => {
    expect(navigationScrollTop({
      containerHeight: 500,
      scrollHeight: 1600,
      currentScrollTop: 420,
      chapterTop: 240,
      sectionTop: 260,
      sectionHeight: 36,
    })).toBe(250)
    expect(navigationScrollTop({
      containerHeight: 500,
      scrollHeight: 1600,
      currentScrollTop: 420,
      chapterTop: 850,
      sectionTop: 940,
      sectionHeight: 36,
    })).toBe(490)
  })
})

describe('shouldScrollSectionChangeToTop', () => {
  it('returns to the top only when switching to a different English section', () => {
    expect(shouldScrollSectionChangeToTop('english', 'text-1', 'text-2')).toBe(true)
    expect(shouldScrollSectionChangeToTop('english', 'text-1', 'text-1')).toBe(false)
    expect(shouldScrollSectionChangeToTop('math', 'section-1', 'section-2')).toBe(false)
    expect(shouldScrollSectionChangeToTop('english', 'text-1', '')).toBe(false)
  })
})
