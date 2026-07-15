import { describe, expect, it } from 'vitest'
import { migrateZhangyuBankId, migrateZhangyuReference, RETIRED_ZHANGYU_COMBINED_BANK_ID, ZHANGYU_CALCULUS_BANK_ID, ZHANGYU_LINEAR_BANK_ID } from './bankMigration'

describe('张宇合并题库迁移', () => {
  it('将高数和线代题目映射到各自独立题库', () => {
    expect(migrateZhangyuReference(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-01-1-01`)).toBe(`${ZHANGYU_CALCULUS_BANK_ID}-01-1-01`)
    expect(migrateZhangyuReference(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-1-01`)).toBe(`${ZHANGYU_LINEAR_BANK_ID}-01-1-01`)
  })

  it('根据小节位置选择独立题库', () => {
    expect(migrateZhangyuBankId(RETIRED_ZHANGYU_COMBINED_BANK_ID, `${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-01-section-2`)).toBe(ZHANGYU_CALCULUS_BANK_ID)
    expect(migrateZhangyuBankId(RETIRED_ZHANGYU_COMBINED_BANK_ID, `${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-02-section-2`)).toBe(ZHANGYU_LINEAR_BANK_ID)
  })
})
