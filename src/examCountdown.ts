const DAY_MS = 24 * 60 * 60 * 1000

export interface ExamCountdown {
  cohortYear: number
  target: Date
  days: number
}

export function estimatedExamDate(year: number) {
  const first = new Date(year, 11, 1)
  const firstSaturday = 1 + (6 - first.getDay() + 7) % 7
  return new Date(year, 11, firstSaturday + 14)
}

export function getExamCountdown(now = new Date()): ExamCountdown {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let target = estimatedExamDate(today.getFullYear())
  if (today > target) target = estimatedExamDate(today.getFullYear() + 1)
  return { cohortYear: target.getFullYear() + 1, target, days: Math.max(0, Math.ceil((target.getTime() - today.getTime()) / DAY_MS)) }
}
