import { describe, expect, it } from 'vitest'
import { migrateZhangyuActivities, migrateZhangyuBankId, migrateZhangyuReference, migrateZhangyuStatuses, removeRetiredBanks, RETIRED_ZHANGYU_COMBINED_BANK_ID, ZHANGYU_CALCULUS_BANK_ID, ZHANGYU_LINEAR_BANK_ID } from './bankMigration'

describe('张宇合并题库迁移', () => {
  it('将高数和线代题目映射到各自独立题库', () => {
    expect(migrateZhangyuReference(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-01-1-01`)).toBe(`${ZHANGYU_CALCULUS_BANK_ID}-01-1-01`)
    expect(migrateZhangyuReference(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-1-01`)).toBe(`${ZHANGYU_LINEAR_BANK_ID}-01-1-01`)
  })

  it('根据小节位置选择独立题库', () => {
    expect(migrateZhangyuBankId(RETIRED_ZHANGYU_COMBINED_BANK_ID, `${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-01-section-2`)).toBe(ZHANGYU_CALCULUS_BANK_ID)
    expect(migrateZhangyuBankId(RETIRED_ZHANGYU_COMBINED_BANK_ID, `${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-02-section-2`)).toBe(ZHANGYU_LINEAR_BANK_ID)
  })

  it('所有加载入口都能过滤旧合并题库', () => {
    expect(removeRetiredBanks([{ id: RETIRED_ZHANGYU_COMBINED_BANK_ID }, { id: ZHANGYU_CALCULUS_BANK_ID }])).toEqual([{ id: ZHANGYU_CALCULUS_BANK_ID }])
  })

  it('迁移用户数据文件中的旧题号标记', () => {
    expect(migrateZhangyuStatuses({ [`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-1-01`]: 'wrong' })).toEqual({ [`${ZHANGYU_LINEAR_BANK_ID}-01-1-01`]: 'wrong' })
    expect(migrateZhangyuActivities([{ bankId: RETIRED_ZHANGYU_COMBINED_BANK_ID, questionId: `${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-1-01` }])).toEqual([{ bankId: ZHANGYU_LINEAR_BANK_ID, questionId: `${ZHANGYU_LINEAR_BANK_ID}-01-1-01`, chapterId: undefined, sectionId: undefined }])
  })
})
