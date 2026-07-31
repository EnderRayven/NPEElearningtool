import { describe, expect, it } from 'vitest'
import { applyQuestionStudyRecordReplacements, applyStudyRecordEdits, localRecordTimestamp, studyRecordTimelineForQuestion, suggestSequentialRecordTimes } from './studyRecordManagement'
import type { StudyActivity } from './studyActivity'

describe('study record management', () => {
  it('lists every mark and review for a question across dates', () => {
    const activities: StudyActivity[] = [
      { date: '2026-07-29', questionId: 'q1', bankId: 'bank', status: 'wrong', initialStatus: 'none', firstUpdatedAt: '2026-07-29T10:00:00.000Z', updatedAt: '2026-07-29T10:00:00.000Z' },
      { date: '2026-07-30', questionId: 'q1', bankId: 'bank', status: 'proficient', initialStatus: 'wrong', firstUpdatedAt: '2026-07-30T11:00:00.000Z', updatedAt: '2026-07-30T11:05:00.000Z', reviews: [
        { previousStatus: 'wrong', status: 'vague', reviewedAt: '2026-07-30T11:00:00.000Z' },
        { previousStatus: 'vague', status: 'proficient', reviewedAt: '2026-07-30T11:05:00.000Z' },
      ] },
    ]

    expect(studyRecordTimelineForQuestion(activities, 'q1')).toMatchObject({
      baselineStatus: 'none',
      records: [
        { status: 'wrong', updatedAt: '2026-07-29T10:00:00.000Z' },
        { status: 'vague', updatedAt: '2026-07-30T11:00:00.000Z' },
        { status: 'proficient', updatedAt: '2026-07-30T11:05:00.000Z' },
      ],
    })
  })

  it('moves records across dates and rebuilds the review chain', () => {
    const original: StudyActivity[] = [
      { date: '2026-07-29', questionId: 'q1', bankId: 'bank', status: 'wrong', initialStatus: 'none', updatedAt: '2026-07-29T10:00:00.000Z' },
      { date: '2026-07-30', questionId: 'q1', bankId: 'bank', status: 'proficient', initialStatus: 'wrong', updatedAt: '2026-07-30T11:00:00.000Z', reviews: [
        { previousStatus: 'wrong', status: 'proficient', reviewedAt: '2026-07-30T11:00:00.000Z' },
      ] },
    ]
    const result = applyQuestionStudyRecordReplacements(original, { q1: 'proficient' }, [{
      questionId: 'q1',
      bankId: 'bank',
      baselineStatus: 'none',
      records: [
        { status: 'wrong', updatedAt: '2026-07-29T10:00:00.000Z' },
        { status: 'vague', updatedAt: '2026-07-29T12:00:00.000Z' },
        { status: 'proficient', updatedAt: '2026-07-31T11:00:00.000Z' },
      ],
    }])

    expect(result.activities).toHaveLength(2)
    expect(result.activities[0].reviews).toEqual([
      { previousStatus: 'wrong', status: 'vague', reviewedAt: '2026-07-29T12:00:00.000Z' },
    ])
    expect(result.activities[1].reviews).toEqual([
      { previousStatus: 'vague', status: 'proficient', reviewedAt: '2026-07-31T11:00:00.000Z' },
    ])
    expect(result.statuses.q1).toBe('proficient')
  })

  it('backfills several questions and updates current statuses', () => {
    const date = '2026-07-30'
    const times = suggestSequentialRecordTimes([
      { date, questionId: 'old', bankId: 'bank', status: 'wrong', updatedAt: new Date(2026, 6, 30, 21, 49, 36).toISOString() },
    ], date, 3)
    expect(times).toEqual(['21:50:36', '21:51:36', '21:52:36'])

    const result = applyStudyRecordEdits([], {}, [
      { date, questionId: 'q1', bankId: 'bank', status: 'proficient', updatedAt: localRecordTimestamp(date, times[0])!, questionNumber: 1 },
      { date, questionId: 'q2', bankId: 'bank', status: 'wrong', updatedAt: localRecordTimestamp(date, times[1])!, questionNumber: 2 },
      { date, questionId: 'q3', bankId: 'bank', status: 'proficient', updatedAt: localRecordTimestamp(date, times[2])!, questionNumber: 3 },
    ])

    expect(result.activities).toHaveLength(3)
    expect(result.activities.map(activity => activity.initialStatus)).toEqual(['none', 'none', 'none'])
    expect(result.statuses).toEqual({ q1: 'proficient', q2: 'wrong', q3: 'proficient' })
  })

  it('relinks later review history after inserting a historical record', () => {
    const activities: StudyActivity[] = [{
      date: '2026-07-31',
      questionId: 'q1',
      bankId: 'bank',
      status: 'proficient',
      initialStatus: 'wrong',
      updatedAt: new Date(2026, 6, 31, 10).toISOString(),
      reviews: [{ previousStatus: 'wrong', status: 'proficient', reviewedAt: new Date(2026, 6, 31, 10).toISOString() }],
    }]

    const result = applyStudyRecordEdits(activities, { q1: 'proficient' }, [{
      date: '2026-07-30',
      questionId: 'q1',
      bankId: 'bank',
      status: 'vague',
      updatedAt: new Date(2026, 6, 30, 20).toISOString(),
    }])

    expect(result.activities[0]).toMatchObject({ date: '2026-07-30', initialStatus: 'none', status: 'vague' })
    expect(result.activities[1].reviews?.[0]).toMatchObject({ previousStatus: 'vague', status: 'proficient' })
    expect(result.statuses.q1).toBe('proficient')
  })

  it('edits an existing record without dropping its review event', () => {
    const reviewedAt = new Date(2026, 6, 30, 20).toISOString()
    const changedAt = new Date(2026, 6, 30, 21).toISOString()
    const activities: StudyActivity[] = [{
      date: '2026-07-30',
      questionId: 'q1',
      bankId: 'bank',
      status: 'proficient',
      initialStatus: 'wrong',
      updatedAt: reviewedAt,
      reviews: [{ previousStatus: 'wrong', status: 'proficient', reviewedAt }],
    }]

    const result = applyStudyRecordEdits(activities, { q1: 'proficient' }, [{
      date: '2026-07-30',
      questionId: 'q1',
      bankId: 'bank',
      status: 'vague',
      updatedAt: changedAt,
    }])

    expect(result.activities[0]).toMatchObject({ status: 'vague', updatedAt: changedAt })
    expect(result.activities[0].reviews).toEqual([{ previousStatus: 'wrong', status: 'vague', reviewedAt: changedAt }])
    expect(result.statuses.q1).toBe('vague')
  })

  it('deleting the latest daily record restores the previous status', () => {
    const activities: StudyActivity[] = [
      { date: '2026-07-29', questionId: 'q1', bankId: 'bank', status: 'wrong', updatedAt: new Date(2026, 6, 29, 20).toISOString() },
      { date: '2026-07-30', questionId: 'q1', bankId: 'bank', status: 'proficient', initialStatus: 'wrong', updatedAt: new Date(2026, 6, 30, 20).toISOString() },
    ]

    const result = applyStudyRecordEdits(activities, { q1: 'proficient' }, [{
      date: '2026-07-30',
      questionId: 'q1',
      bankId: 'bank',
      status: 'none',
    }])

    expect(result.activities).toHaveLength(1)
    expect(result.statuses.q1).toBe('wrong')
  })
})
