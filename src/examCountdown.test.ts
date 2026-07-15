import { describe, expect, it } from 'vitest'
import { estimatedExamDate, formatExamDateValue, getExamCountdown, parseExamDateValue } from './examCountdown'

describe('考研倒计时', () => {
  it('默认使用十二月第三个周六作为预计初试日', () => {
    expect(estimatedExamDate(2026)).toEqual(new Date(2026, 11, 19))
  })

  it('显示当前周期并在考试后切换到下一周期', () => {
    expect(getExamCountdown(new Date(2026, 6, 15))).toMatchObject({ cohortYear: 2027, days: 157 })
    expect(getExamCountdown(new Date(2026, 11, 20)).cohortYear).toBe(2028)
  })

  it('支持手动考试日期并严格校验日期值', () => {
    const customTarget = new Date(2026, 9, 1)
    expect(getExamCountdown(new Date(2026, 6, 15), customTarget)).toMatchObject({ cohortYear: 2027, days: 78 })
    expect(formatExamDateValue(customTarget)).toBe('2026-10-01')
    expect(parseExamDateValue('2026-02-29')).toBeNull()
    expect(parseExamDateValue('2026-10-01')).toEqual(customTarget)
  })
})
