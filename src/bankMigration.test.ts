import { describe, expect, it } from 'vitest'
import { migrateZhangyuActivities, migrateZhangyuBankId, migrateZhangyuReference, migrateZhangyuStatuses, removeRetiredBanks, RETIRED_1000_BASIC_BANK_ID, RETIRED_1000_INTENSIVE_BANK_ID, MATH_1000A_CALCULUS_BANK_ID, MATH_1000A_LINEAR_BANK_ID, MATH_1000B_CALCULUS_BANK_ID, MATH_1000B_LINEAR_BANK_ID, RETIRED_ZHANGYU_COMBINED_BANK_ID, ZHANGYU_CALCULUS_BANK_ID, ZHANGYU_LINEAR_BANK_ID } from './bankMigration'

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

describe('数二1000综合题库拆分迁移', () => {
  it('将基础和强化题目分别迁移到稳定的高数/线代题库', () => {
    expect(migrateZhangyuReference(`${RETIRED_1000_BASIC_BANK_ID}-01-1-01`)).toBe(`${MATH_1000A_CALCULUS_BANK_ID}-01-1-01`)
    expect(migrateZhangyuReference(`${RETIRED_1000_BASIC_BANK_ID}-02-1-01`)).toBe(`${MATH_1000A_LINEAR_BANK_ID}-02-1-01`)
    expect(migrateZhangyuReference(`${RETIRED_1000_INTENSIVE_BANK_ID}-01-1-01`)).toBe(`${MATH_1000B_CALCULUS_BANK_ID}-01-1-01`)
    expect(migrateZhangyuReference(`${RETIRED_1000_INTENSIVE_BANK_ID}-02-1-01`)).toBe(`${MATH_1000B_LINEAR_BANK_ID}-02-1-01`)
  })

  it('也能迁移同步过程生成的临时题库 ID', () => {
    expect(migrateZhangyuReference('default-1784510566897-15-01-1-01')).toBe(`${MATH_1000A_CALCULUS_BANK_ID}-01-1-01`)
    expect(migrateZhangyuReference('default-1784510566897-16-02-1-01')).toBe(`${MATH_1000B_LINEAR_BANK_ID}-02-1-01`)
    expect(migrateZhangyuBankId('default-1784510566897-15', 'default-1784510566897-15-chapter-01-section-2')).toBe(MATH_1000A_CALCULUS_BANK_ID)
    expect(migrateZhangyuBankId('default-1784510566897-16', 'default-1784510566897-16-chapter-02-section-2')).toBe(MATH_1000B_LINEAR_BANK_ID)
  })

  it('迁移旧版按科目拆分的题目标识', () => {
    expect(migrateZhangyuReference(`${RETIRED_1000_BASIC_BANK_ID}-calculus-01-2-01`)).toBe(`${MATH_1000A_CALCULUS_BANK_ID}-01-2-01`)
    expect(migrateZhangyuReference(`${RETIRED_1000_BASIC_BANK_ID}-linear-02-1-01`)).toBe(`${MATH_1000A_LINEAR_BANK_ID}-02-1-01`)
    expect(migrateZhangyuReference(`${RETIRED_1000_INTENSIVE_BANK_ID}-calculus-01-2-01`)).toBe(`${MATH_1000B_CALCULUS_BANK_ID}-01-2-01`)
    expect(migrateZhangyuReference(`${RETIRED_1000_INTENSIVE_BANK_ID}-linear-02-1-01`)).toBe(`${MATH_1000B_LINEAR_BANK_ID}-02-1-01`)
    expect(migrateZhangyuBankId(RETIRED_1000_BASIC_BANK_ID, `${RETIRED_1000_BASIC_BANK_ID}-linear-02-1-01`)).toBe(MATH_1000A_LINEAR_BANK_ID)
    expect(migrateZhangyuStatuses({ [`${RETIRED_1000_BASIC_BANK_ID}-calculus-01-2-01`]: 'wrong' })).toEqual({ [`${MATH_1000A_CALCULUS_BANK_ID}-01-2-01`]: 'wrong' })
  })
})
