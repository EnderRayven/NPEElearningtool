import type { QuestionStatus } from './types'
import { localDateKey, updateStudyActivity, type QuestionReviewEvent, type StudyActivity, type StudyActivityUpdate } from './studyActivity'

export interface QuestionReviewMark {
  date: string
  markedAt: string
  status: QuestionStatus
}

export interface QuestionReviewEntry extends QuestionReviewMark {
  attempt: number
  daysAfterFirst: number
  daysAfterPrevious: number
}

export interface QuestionReviewTimeline {
  initialMark: QuestionReviewMark | null
  reviews: QuestionReviewEntry[]
}

function utcDay(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function daysBetween(left: string, right: string) {
  return Math.round((utcDay(right) - utcDay(left)) / 86_400_000)
}

function reviewEvents(activities: StudyActivity[], questionId: string) {
  return activities
    .filter(item => item.questionId === questionId)
    .flatMap(item => (item.reviews || []).map(review => ({ ...review, date: localDateKey(new Date(review.reviewedAt)) })))
    .sort((left, right) => left.reviewedAt.localeCompare(right.reviewedAt))
}

export function buildQuestionReviewTimeline(activities: StudyActivity[], questionId: string): QuestionReviewTimeline {
  const questionActivities = activities
    .filter(item => item.questionId === questionId)
    .sort((left, right) => left.date.localeCompare(right.date) || left.updatedAt.localeCompare(right.updatedAt))
  const explicitReviews = reviewEvents(activities, questionId)
  const records = questionActivities.filter(item => item.status !== 'none')
  if (!records.length && !explicitReviews.length) return { initialMark: null, reviews: [] }

  const firstRecord = records[0] || questionActivities.find(item => item.reviews?.length)
  if (!firstRecord) return { initialMark: null, reviews: [] }
  const hasLegacyBaseline = Boolean(firstRecord.initialStatus && firstRecord.initialStatus !== 'none')
  const firstExplicit = explicitReviews[0]
  const initialStatus = hasLegacyBaseline
    ? firstRecord.initialStatus as QuestionStatus
    : firstExplicit?.date === firstRecord.date ? firstExplicit.previousStatus : firstRecord.status
  const initialMark: QuestionReviewMark = {
    date: firstRecord.date,
    markedAt: hasLegacyBaseline ? '' : firstRecord.firstUpdatedAt || firstRecord.updatedAt,
    status: initialStatus,
  }

  const inferredRecords = (hasLegacyBaseline ? records : records.slice(1))
    .filter(item => !firstExplicit || item.date < firstExplicit.date)
    .map(item => ({ date: item.date, markedAt: item.firstUpdatedAt || item.updatedAt, status: item.status }))
  const reviewMarks: QuestionReviewMark[] = [
    ...inferredRecords,
    ...explicitReviews.map(item => ({ date: item.date, markedAt: item.reviewedAt, status: item.status })),
  ].sort((left, right) => left.markedAt.localeCompare(right.markedAt))

  return {
    initialMark,
    reviews: reviewMarks.map((item, index) => ({
      ...item,
      attempt: index + 1,
      daysAfterFirst: daysBetween(initialMark.date, item.date),
      daysAfterPrevious: daysBetween(index ? reviewMarks[index - 1].date : initialMark.date, item.date),
    })),
  }
}

export function updateQuestionReview(
  activities: StudyActivity[],
  entry: Omit<StudyActivityUpdate, 'status'>,
  selectedStatus: QuestionStatus,
  now = new Date(),
) {
  const today = localDateKey(now)
  const reviewedAt = now.toISOString()
  const latestActivity = [...activities]
    .filter(item => item.questionId === entry.questionId)
    .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt))[0]
  const currentStatus = latestActivity?.status ?? entry.previousStatus ?? 'none'
  const allReviews = activities
    .flatMap(item => (item.reviews || []).map(review => ({ activity: item, review })))
    .filter(item => item.activity.questionId === entry.questionId)
    .sort((left, right) => right.review.reviewedAt.localeCompare(left.review.reviewedAt))
  const latestReview = allReviews[0]
  const latestIsToday = latestReview && localDateKey(new Date(latestReview.review.reviewedAt)) === today

  if (latestIsToday) {
    const nextStatus = selectedStatus === 'none' ? latestReview.review.previousStatus : selectedStatus
    return {
      status: nextStatus,
      activities: activities.map(item => item === latestReview.activity ? {
        ...item,
        status: nextStatus,
        updatedAt: reviewedAt,
        reviews: selectedStatus === 'none'
          ? (item.reviews || []).filter(review => review !== latestReview.review)
          : (item.reviews || []).map(review => review === latestReview.review ? { ...review, status: selectedStatus, reviewedAt } : review),
      } : item),
    }
  }

  if (selectedStatus === 'none') return { status: currentStatus, activities }
  const baseActivities = updateStudyActivity(activities, { ...entry, status: selectedStatus, previousStatus: currentStatus }, now)
  const event: QuestionReviewEvent = { status: selectedStatus, previousStatus: currentStatus, reviewedAt }
  return {
    status: selectedStatus,
    activities: baseActivities.map(item => item.questionId === entry.questionId && item.date === today
      ? { ...item, reviews: [...(item.reviews || []), event] }
      : item),
  }
}
