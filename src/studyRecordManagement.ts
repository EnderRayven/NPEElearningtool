import { localDateKey, type QuestionReviewEvent, type StudyActivity } from './studyActivity'
import type { QuestionStatus, ReadingQuestionType, Subject } from './types'

export interface StudyRecordEdit {
  date: string
  questionId: string
  bankId: string
  status: QuestionStatus
  updatedAt?: string
  chapterId?: string
  sectionId?: string
  questionNumber?: number
  questionType?: string
  readingType?: ReadingQuestionType
  subject?: Subject
  answerRevealed?: boolean
}

export interface StudyRecordManagementResult {
  activities: StudyActivity[]
  statuses: Record<string, QuestionStatus>
}

export interface EditableStudyRecord {
  id: string
  status: Exclude<QuestionStatus, 'none'>
  updatedAt: string
}

export interface QuestionStudyRecordTimeline {
  baselineStatus: QuestionStatus
  records: EditableStudyRecord[]
}

export interface QuestionStudyRecordReplacement {
  questionId: string
  bankId: string
  baselineStatus: QuestionStatus
  records: Array<Pick<EditableStudyRecord, 'status' | 'updatedAt'>>
  chapterId?: string
  sectionId?: string
  questionNumber?: number
  questionType?: string
  readingType?: ReadingQuestionType
  subject?: Subject
  answerRevealed?: boolean
}

function isMarked(status: QuestionStatus): status is Exclude<QuestionStatus, 'none'> {
  return status !== 'none'
}

function activitySort(left: StudyActivity, right: StudyActivity) {
  return left.date.localeCompare(right.date) || left.updatedAt.localeCompare(right.updatedAt)
}

function validTimestampForDate(date: string, timestamp?: string) {
  if (!timestamp) return false
  const parsed = new Date(timestamp)
  return !Number.isNaN(parsed.getTime()) && localDateKey(parsed) === date
}

function normalizedReviews(
  reviews: QuestionReviewEvent[],
  previousStatus: QuestionStatus,
) {
  let currentStatus = previousStatus
  return [...reviews]
    .sort((left, right) => left.reviewedAt.localeCompare(right.reviewedAt))
    .map(review => {
      const normalized = { ...review, previousStatus: currentStatus }
      currentStatus = normalized.status
      return normalized
    })
}

export function studyRecordTimelineForQuestion(
  activities: StudyActivity[],
  questionId: string,
): QuestionStudyRecordTimeline {
  const questionActivities = activities
    .filter(activity => activity.questionId === questionId)
    .sort(activitySort)
  const firstActivity = questionActivities[0]
  const baselineStatus = firstActivity?.initialStatus && firstActivity.initialStatus !== 'none'
    ? firstActivity.initialStatus
    : 'none'
  const records: EditableStudyRecord[] = []
  let initialMarkAdded = baselineStatus !== 'none'

  questionActivities.forEach((activity, activityIndex) => {
    const reviews = [...(activity.reviews || [])].sort((left, right) => left.reviewedAt.localeCompare(right.reviewedAt))
    if (!reviews.length || !initialMarkAdded) {
      const status = reviews[0]?.previousStatus || activity.status
      if (isMarked(status)) {
        records.push({
          id: `${activity.date}:mark:${activityIndex}`,
          status,
          updatedAt: activity.firstUpdatedAt || activity.updatedAt,
        })
        initialMarkAdded = true
      }
    }
    reviews.forEach((review, reviewIndex) => records.push({
      id: `${activity.date}:review:${activityIndex}:${reviewIndex}`,
      status: review.status,
      updatedAt: review.reviewedAt,
    }))
  })

  return {
    baselineStatus,
    records: records.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)),
  }
}

export function applyQuestionStudyRecordReplacements(
  activities: StudyActivity[],
  statuses: Record<string, QuestionStatus>,
  replacements: QuestionStudyRecordReplacement[],
): StudyRecordManagementResult {
  const replacementByQuestion = new Map(replacements.map(replacement => [replacement.questionId, replacement]))
  const retainedActivities = activities.filter(activity => !replacementByQuestion.has(activity.questionId))
  const rebuiltActivities: StudyActivity[] = []
  const nextStatuses = { ...statuses }

  for (const replacement of replacements) {
    const previousActivities = activities.filter(activity => activity.questionId === replacement.questionId)
    const previousByDate = new Map(previousActivities.map(activity => [activity.date, activity]))
    const records = replacement.records
      .map(record => {
        const parsed = new Date(record.updatedAt)
        if (Number.isNaN(parsed.getTime())) throw new Error('记录日期和时间无效')
        return { ...record, date: localDateKey(parsed) }
      })
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    const recordsByDate = new Map<string, typeof records>()
    records.forEach(record => recordsByDate.set(record.date, [...(recordsByDate.get(record.date) || []), record]))

    let previousStatus: QuestionStatus = replacement.baselineStatus
    let firstRecord = true
    for (const [date, dateRecords] of recordsByDate) {
      const previousActivity = previousByDate.get(date)
      const initialRecord = firstRecord && previousStatus === 'none' ? dateRecords[0] : undefined
      const reviewRecords = initialRecord ? dateRecords.slice(1) : dateRecords
      let statusBeforeReview: QuestionStatus = initialRecord?.status || previousStatus
      const reviews = reviewRecords.map(record => {
        const review: QuestionReviewEvent = {
          previousStatus: statusBeforeReview,
          status: record.status,
          reviewedAt: record.updatedAt,
        }
        statusBeforeReview = record.status
        return review
      })
      const finalStatus = reviews.at(-1)?.status || initialRecord?.status || previousStatus
      if (!isMarked(finalStatus)) continue
      const firstUpdatedAt = initialRecord?.updatedAt || dateRecords[0].updatedAt
      const updatedAt = dateRecords.at(-1)!.updatedAt
      const changeCount = (initialRecord ? 1 : 0)
        + reviews.filter(review => review.previousStatus !== review.status).length
      rebuiltActivities.push({
        ...previousActivity,
        questionId: replacement.questionId,
        bankId: replacement.bankId,
        chapterId: replacement.chapterId,
        sectionId: replacement.sectionId,
        questionNumber: replacement.questionNumber,
        questionType: replacement.questionType,
        readingType: replacement.readingType,
        subject: replacement.subject,
        source: previousActivity?.source || 'study',
        answerRevealed: replacement.answerRevealed ?? previousActivity?.answerRevealed ?? true,
        schemaVersion: 2,
        date,
        initialStatus: previousStatus,
        firstUpdatedAt,
        updatedAt,
        status: finalStatus,
        changeCount,
        ...(reviews.length ? { reviews } : { reviews: undefined }),
      })
      previousStatus = finalStatus
      firstRecord = false
    }

    if (!records.length && isMarked(replacement.baselineStatus) && previousActivities.length) {
      const previousActivity = [...previousActivities].sort(activitySort)[0]
      rebuiltActivities.push({
        ...previousActivity,
        schemaVersion: 2,
        status: replacement.baselineStatus,
        initialStatus: 'none',
        changeCount: 1,
        reviews: undefined,
      })
    }

    if (isMarked(previousStatus)) nextStatuses[replacement.questionId] = previousStatus
    else delete nextStatuses[replacement.questionId]
  }

  return {
    activities: [...retainedActivities, ...rebuiltActivities].sort(activitySort),
    statuses: nextStatuses,
  }
}

function normalizeQuestionHistory(activities: StudyActivity[]) {
  let currentStatus: QuestionStatus = 'none'
  return [...activities].sort(activitySort).map(activity => {
    const statusBeforeDay: QuestionStatus = currentStatus !== 'none'
      ? currentStatus
      : activity.initialStatus && activity.initialStatus !== 'none'
        ? activity.initialStatus
        : 'none'
    let reviews = normalizedReviews(activity.reviews || [], statusBeforeDay)

    if (isMarked(activity.status) && statusBeforeDay !== 'none' && !reviews.length) {
      reviews = [{ previousStatus: statusBeforeDay, status: activity.status, reviewedAt: activity.updatedAt }]
    }

    const finalReview = reviews.at(-1)
    const finalStatus: QuestionStatus = activity.status === 'none' ? 'none' : finalReview?.status || activity.status
    currentStatus = finalStatus
    const changeCount = reviews.length
      ? reviews.filter(review => review.previousStatus !== review.status).length
      : finalStatus === statusBeforeDay ? 0 : 1

    return {
      ...activity,
      schemaVersion: 2 as const,
      initialStatus: statusBeforeDay,
      status: finalStatus,
      changeCount,
      ...(reviews.length ? { reviews } : { reviews: undefined }),
    }
  })
}

function updateExistingReview(
  activity: StudyActivity,
  status: Exclude<QuestionStatus, 'none'>,
  updatedAt: string,
) {
  if (!activity.reviews?.length) return undefined
  const ordered = [...activity.reviews].sort((left, right) => left.reviewedAt.localeCompare(right.reviewedAt))
  return ordered.map((review, index) => index === ordered.length - 1
    ? { ...review, status, reviewedAt: updatedAt }
    : review)
}

export function applyStudyRecordEdits(
  activities: StudyActivity[],
  statuses: Record<string, QuestionStatus>,
  edits: StudyRecordEdit[],
): StudyRecordManagementResult {
  const editsByKey = new Map(edits.map(edit => [`${edit.date}\u0000${edit.questionId}`, edit]))
  const existingByKey = new Map(activities.map(activity => [`${activity.date}\u0000${activity.questionId}`, activity]))
  const affectedQuestionIds = new Set(edits.map(edit => edit.questionId))
  const nextActivities = activities.filter(activity => !editsByKey.has(`${activity.date}\u0000${activity.questionId}`))

  for (const edit of editsByKey.values()) {
    if (!isMarked(edit.status)) continue
    if (!validTimestampForDate(edit.date, edit.updatedAt)) throw new Error('记录时间必须位于所选日期内')
    const key = `${edit.date}\u0000${edit.questionId}`
    const existing = existingByKey.get(key)
    const updatedAt = edit.updatedAt as string
    const reviews = existing ? updateExistingReview(existing, edit.status, updatedAt) : undefined
    nextActivities.push({
      ...existing,
      questionId: edit.questionId,
      bankId: edit.bankId,
      status: edit.status,
      chapterId: edit.chapterId,
      sectionId: edit.sectionId,
      questionNumber: edit.questionNumber,
      questionType: edit.questionType,
      readingType: edit.readingType,
      subject: edit.subject,
      source: existing?.source || 'study',
      answerRevealed: edit.answerRevealed ?? existing?.answerRevealed ?? true,
      schemaVersion: 2,
      date: edit.date,
      initialStatus: existing?.initialStatus || 'none',
      firstUpdatedAt: existing?.firstUpdatedAt || updatedAt,
      updatedAt,
      changeCount: existing?.changeCount ?? 1,
      ...(reviews ? { reviews } : {}),
    })
  }

  const normalizedActivities = nextActivities.filter(activity => !affectedQuestionIds.has(activity.questionId))
  for (const questionId of affectedQuestionIds) {
    normalizedActivities.push(...normalizeQuestionHistory(nextActivities.filter(activity => activity.questionId === questionId)))
  }
  normalizedActivities.sort(activitySort)

  const nextStatuses = { ...statuses }
  for (const questionId of affectedQuestionIds) {
    const latest = normalizedActivities.filter(activity => activity.questionId === questionId).sort(activitySort).at(-1)
    if (!latest || latest.status === 'none') delete nextStatuses[questionId]
    else nextStatuses[questionId] = latest.status
  }

  return { activities: normalizedActivities, statuses: nextStatuses }
}

export function localTimeValue(timestamp?: string) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join(':')
}

export function localDateTimeValue(timestamp?: string) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = localDateKey(date)
  const localTime = [date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join(':')
  return `${localDate}T${localTime}`
}

export function localDateTimeTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null
  const parsed = new Date(value.length === 16 ? `${value}:00` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function localRecordTimestamp(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null
  const parsed = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`)
  if (Number.isNaN(parsed.getTime()) || localDateKey(parsed) !== date) return null
  return parsed.toISOString()
}

export function suggestSequentialRecordTimes(
  activities: StudyActivity[],
  date: string,
  count: number,
  intervalMinutes = 1,
) {
  const timestamps = activities
    .filter(activity => activity.date === date && !Number.isNaN(Date.parse(activity.updatedAt)))
    .map(activity => new Date(activity.updatedAt).getTime())
  const start = timestamps.length
    ? Math.max(...timestamps) + intervalMinutes * 60_000
    : new Date(`${date}T09:00:00`).getTime()
  return Array.from({ length: count }, (_, index) => {
    const next = new Date(start + index * intervalMinutes * 60_000)
    if (localDateKey(next) !== date) return ''
    return localTimeValue(next.toISOString())
  })
}
