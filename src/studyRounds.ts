import { validateStatuses } from './store'
import { mergeStudyActivities, validateStudyActivities, type StudyActivity } from './studyActivity'
import type { QuestionStatus } from './types'
import { migrateZhangyuActivities, migrateZhangyuStatuses } from './bankMigration'

const ROUNDS_KEY = 'npee:rounds:v1'
const LEGACY_STATUS_KEY = 'npee:status:v1'
const LEGACY_ACTIVITY_KEY = 'npee:activity:v1'

export interface StudyRoundData {
  statuses: Record<string, QuestionStatus>
  activities: StudyActivity[]
}

export type StudyRounds = Record<string, StudyRoundData>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyStudyRound(): StudyRoundData {
  return { statuses: {}, activities: [] }
}

function compactStatuses(value: unknown) {
  return migrateZhangyuStatuses(Object.fromEntries(Object.entries(validateStatuses(value)).filter(([, status]) => status !== 'none')))
}

function compactActivities(value: unknown) {
  return mergeStudyActivities(migrateZhangyuActivities(validateStudyActivities(value)))
}

export function validateStudyRounds(value: unknown, legacyStatuses: unknown = {}, legacyActivities: unknown = []): StudyRounds {
  const rounds: StudyRounds = {}
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      const round = Number(key)
      if (!Number.isInteger(round) || round < 1 || round > 99 || !isRecord(item)) continue
      const statuses = compactStatuses(item.statuses)
      const activities = compactActivities(item.activities)
      if (round === 1 || Object.keys(statuses).length || activities.length) rounds[String(round)] = { statuses, activities }
    }
  }
  if (!rounds['1']) {
    rounds['1'] = {
      statuses: compactStatuses(legacyStatuses),
      activities: compactActivities(legacyActivities),
    }
  }
  return rounds
}

export function getStudyRound(rounds: StudyRounds, round: number): StudyRoundData {
  return rounds[String(round)] || emptyStudyRound()
}

export function updateStudyRound(rounds: StudyRounds, round: number, statuses: Record<string, QuestionStatus>, activities: StudyActivity[]): StudyRounds {
  return { ...rounds, [String(round)]: { statuses, activities } }
}

export function saveStudyRounds(rounds: StudyRounds) {
  try { localStorage.setItem(ROUNDS_KEY, JSON.stringify(validateStudyRounds(rounds))); return true } catch { return false }
}

function readLegacyValue(key: string, fallback: unknown) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
}

function removeLegacyRoundData() {
  localStorage.removeItem(LEGACY_STATUS_KEY)
  localStorage.removeItem(LEGACY_ACTIVITY_KEY)
}

export function migrateStudyRounds(value: unknown, legacyStatuses: unknown = {}, legacyActivities: unknown = []) {
  return validateStudyRounds(value, legacyStatuses, legacyActivities)
}

export function loadStudyRounds(): StudyRounds {
  try {
    const stored = localStorage.getItem(ROUNDS_KEY)
    if (stored) {
      const migrated = validateStudyRounds(JSON.parse(stored))
      if (saveStudyRounds(migrated)) removeLegacyRoundData()
      return migrated
    }
    const migrated = migrateStudyRounds(null, readLegacyValue(LEGACY_STATUS_KEY, {}), readLegacyValue(LEGACY_ACTIVITY_KEY, []))
    if (saveStudyRounds(migrated)) removeLegacyRoundData()
    return migrated
  } catch {
    return migrateStudyRounds(null, readLegacyValue(LEGACY_STATUS_KEY, {}), readLegacyValue(LEGACY_ACTIVITY_KEY, []))
  }
}

export function countMarkedQuestions(round: StudyRoundData) {
  return Object.values(round.statuses).filter(status => status !== 'none').length
}
