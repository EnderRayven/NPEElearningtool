export const RETIRED_ZHANGYU_COMBINED_BANK_ID = 'default-1783931377861-24'
export const ZHANGYU_CALCULUS_BANK_ID = 'workspace-1783942778439-28'
export const ZHANGYU_LINEAR_BANK_ID = 'workspace-1783942778439-29'

export function removeRetiredBanks<T extends { id: string }>(banks: T[]) {
  return banks.filter(bank => bank.id !== RETIRED_ZHANGYU_COMBINED_BANK_ID)
}

function isLinearReference(value = '') {
  return value.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-`)
    || value.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-02`)
}

export function migrateZhangyuReference(value = '') {
  if (value.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-01`)) return value.replace(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-01`, `${ZHANGYU_CALCULUS_BANK_ID}-chapter-01`)
  if (value.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-02`)) return value.replace(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-02`, `${ZHANGYU_LINEAR_BANK_ID}-chapter-01`)
  if (value.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-01-`)) return value.replace(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-01-`, `${ZHANGYU_CALCULUS_BANK_ID}-01-`)
  if (value.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-`)) return value.replace(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-`, `${ZHANGYU_LINEAR_BANK_ID}-01-`)
  return value
}

export function migrateZhangyuBankId(bankId: string, ...references: Array<string | undefined>) {
  if (bankId !== RETIRED_ZHANGYU_COMBINED_BANK_ID) return bankId
  return references.some(reference => isLinearReference(reference)) ? ZHANGYU_LINEAR_BANK_ID : ZHANGYU_CALCULUS_BANK_ID
}

export function migrateZhangyuStatuses<T>(statuses: Record<string, T>) {
  const migrated = { ...statuses }
  Object.entries(statuses).forEach(([questionId, status]) => {
    const nextId = migrateZhangyuReference(questionId)
    if (nextId !== questionId) {
      if (!(nextId in statuses)) migrated[nextId] = status
      delete migrated[questionId]
    }
  })
  return migrated
}

export function migrateZhangyuActivities<T extends { bankId: string; questionId: string; chapterId?: string; sectionId?: string }>(activities: T[]): T[] {
  return activities.map(activity => ({
    ...activity,
    bankId: migrateZhangyuBankId(activity.bankId, activity.chapterId, activity.sectionId, activity.questionId),
    chapterId: activity.chapterId ? migrateZhangyuReference(activity.chapterId) : undefined,
    sectionId: activity.sectionId ? migrateZhangyuReference(activity.sectionId) : undefined,
    questionId: migrateZhangyuReference(activity.questionId),
  }))
}
