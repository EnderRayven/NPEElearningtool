export const RETIRED_ZHANGYU_COMBINED_BANK_ID = 'default-1783931377861-24'
export const ZHANGYU_CALCULUS_BANK_ID = 'workspace-1783942778439-28'
export const ZHANGYU_LINEAR_BANK_ID = 'workspace-1783942778439-29'
export const RETIRED_1000_BASIC_BANK_ID = 'default-1783931377861-25'
export const RETIRED_1000_INTENSIVE_BANK_ID = 'default-1783931377861-26'
export const MATH_1000A_CALCULUS_BANK_ID = 'default-math-1000a-calculus'
export const MATH_1000A_LINEAR_BANK_ID = 'default-math-1000a-linear'
export const MATH_1000B_CALCULUS_BANK_ID = 'default-math-1000b-calculus'
export const MATH_1000B_LINEAR_BANK_ID = 'default-math-1000b-linear'

const split1000BankMap = {
  [RETIRED_1000_BASIC_BANK_ID]: { calculus: MATH_1000A_CALCULUS_BANK_ID, linear: MATH_1000A_LINEAR_BANK_ID },
  [RETIRED_1000_INTENSIVE_BANK_ID]: { calculus: MATH_1000B_CALCULUS_BANK_ID, linear: MATH_1000B_LINEAR_BANK_ID },
} as const

const generated1000BankPattern = /^default-\d+-(15|16)$/

function split1000Target(bankId: string) {
  if (bankId === RETIRED_1000_BASIC_BANK_ID || (generated1000BankPattern.test(bankId) && /-15$/.test(bankId))) return split1000BankMap[RETIRED_1000_BASIC_BANK_ID]
  if (bankId === RETIRED_1000_INTENSIVE_BANK_ID || (generated1000BankPattern.test(bankId) && /-16$/.test(bankId))) return split1000BankMap[RETIRED_1000_INTENSIVE_BANK_ID]
  return undefined
}

function retired1000IdForReference(value = '') {
  if (value.startsWith(`${RETIRED_1000_BASIC_BANK_ID}-`) || value === RETIRED_1000_BASIC_BANK_ID) return RETIRED_1000_BASIC_BANK_ID
  if (value.startsWith(`${RETIRED_1000_INTENSIVE_BANK_ID}-`) || value === RETIRED_1000_INTENSIVE_BANK_ID) return RETIRED_1000_INTENSIVE_BANK_ID
  const match = value.match(/^(default-\d+-(15|16))(?:-|$)/)
  if (!match) return undefined
  return match[2] === '15' ? RETIRED_1000_BASIC_BANK_ID : RETIRED_1000_INTENSIVE_BANK_ID
}

function source1000IdForReference(value = '') {
  if (value.startsWith(`${RETIRED_1000_BASIC_BANK_ID}-`) || value === RETIRED_1000_BASIC_BANK_ID) return RETIRED_1000_BASIC_BANK_ID
  if (value.startsWith(`${RETIRED_1000_INTENSIVE_BANK_ID}-`) || value === RETIRED_1000_INTENSIVE_BANK_ID) return RETIRED_1000_INTENSIVE_BANK_ID
  return value.match(/^(default-\d+-(?:15|16))(?:-|$)/)?.[1]
}

export function removeRetiredBanks<T extends { id: string }>(banks: T[]) {
  return banks.filter(bank => bank.id !== RETIRED_ZHANGYU_COMBINED_BANK_ID && !split1000Target(bank.id))
}

export function isRetiredBankId(bankId: string) {
  return bankId === RETIRED_ZHANGYU_COMBINED_BANK_ID || Boolean(split1000Target(bankId))
}

function isLinearReference(value = '') {
  return value.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-`)
    || value.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-02`)
}

function isLinear1000Reference(value = '') {
  if (!retired1000IdForReference(value)) return false
  return /^(?:default-1783931377861-(?:25|26)|default-\d+-(?:15|16))-(?:02-|chapter-02)/.test(value)
    || /^(?:default-1783931377861-(?:25|26)|default-\d+-(?:15|16))-linear(?:-|$)/.test(value)
}

function migrate1000Reference(value = '') {
  const retiredId = retired1000IdForReference(value)
  const sourceId = source1000IdForReference(value)
  const targets = retiredId ? split1000BankMap[retiredId] : undefined
  if (!retiredId || !sourceId || !targets) return value
  const subjectMatch = value.match(/^(default-1783931377861-(?:25|26)|default-\d+-(?:15|16))-(calculus|linear)(?=-|$)/)
  if (subjectMatch) return value.replace(subjectMatch[0], subjectMatch[2] === 'linear' ? targets.linear : targets.calculus)
  if (value.startsWith(`${sourceId}-chapter-01`)) return value.replace(`${sourceId}-chapter-01`, `${targets.calculus}-chapter-01`)
  if (value.startsWith(`${sourceId}-chapter-02`)) return value.replace(`${sourceId}-chapter-02`, `${targets.linear}-chapter-02`)
  if (value.startsWith(`${sourceId}-01-`)) return value.replace(`${sourceId}-01-`, `${targets.calculus}-01-`)
  if (value.startsWith(`${sourceId}-02-`)) return value.replace(`${sourceId}-02-`, `${targets.linear}-02-`)
  return value
}

function migrate1000BankId(bankId: string, ...references: Array<string | undefined>) {
  const retiredId = split1000Target(bankId) ? retired1000IdForReference(bankId) : undefined
  const targets = retiredId ? split1000BankMap[retiredId] : undefined
  if (!targets) return bankId
  return references.some(reference => isLinear1000Reference(reference)) ? targets.linear : targets.calculus
}

export function migrateZhangyuReference(value = '') {
  let migrated = value
  if (migrated.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-01`)) migrated = migrated.replace(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-01`, `${ZHANGYU_CALCULUS_BANK_ID}-chapter-01`)
  else if (migrated.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-02`)) migrated = migrated.replace(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-chapter-02`, `${ZHANGYU_LINEAR_BANK_ID}-chapter-01`)
  else if (migrated.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-01-`)) migrated = migrated.replace(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-01-`, `${ZHANGYU_CALCULUS_BANK_ID}-01-`)
  else if (migrated.startsWith(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-`)) migrated = migrated.replace(`${RETIRED_ZHANGYU_COMBINED_BANK_ID}-02-`, `${ZHANGYU_LINEAR_BANK_ID}-01-`)
  return migrate1000Reference(migrated)
}

export function migrateZhangyuBankId(bankId: string, ...references: Array<string | undefined>) {
  if (bankId === RETIRED_ZHANGYU_COMBINED_BANK_ID)
    return references.some(reference => isLinearReference(reference)) ? ZHANGYU_LINEAR_BANK_ID : ZHANGYU_CALCULUS_BANK_ID
  return migrate1000BankId(bankId, ...references)
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

export function migrateZhangyuQuestionNotes<T>(notes: Record<string, T>) {
  const migrated = { ...notes }
  Object.entries(notes).forEach(([questionId, note]) => {
    const nextId = migrateZhangyuReference(questionId)
    if (nextId !== questionId) {
      if (!(nextId in notes)) migrated[nextId] = note
      delete migrated[questionId]
    }
  })
  return migrated
}
