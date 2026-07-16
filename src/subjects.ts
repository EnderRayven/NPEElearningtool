import type { QuestionBank, Subject } from './types'

export const subjectLabels: Record<Subject, string> = {
  math: '数学',
  english: '英语',
  professional: '专业课',
}

export const subjectOrder: Subject[] = ['math', 'english', 'professional']

export function bankSubject(bank: QuestionBank): Subject {
  if (bank.subject) return bank.subject
  return bank.id.startsWith('english-') || /英语/i.test(bank.name) ? 'english' : 'math'
}
