import type { MathModule, QuestionBank, Subject } from './types'

export const subjectLabels: Record<Subject, string> = {
  math: '数学',
  english: '英语',
  professional: '专业课',
}

export const subjectOrder: Subject[] = ['math', 'english', 'professional']

export const mathModuleLabels: Record<MathModule, string> = {
  calculus: '高数',
  linear: '线代',
  exams: '真题',
}

export const mathModuleOrder: MathModule[] = ['calculus', 'linear', 'exams']

export function bankSubject(bank: QuestionBank): Subject {
  if (bank.subject) return bank.subject
  const workspaceFolder = bank.workspaceFolder?.replaceAll('\\', '/') || ''
  if (workspaceFolder.startsWith('英语/')) return 'english'
  if (workspaceFolder.startsWith('专业课/')) return 'professional'
  if (workspaceFolder.startsWith('数学/')) return 'math'
  return bank.id.startsWith('english-') || /英语/i.test(bank.name) ? 'english' : 'math'
}

/**
 * A few 数二题库 contain both subjects. Keeping them in both modules lets
 * users reach the same source while the dedicated 高数/线代题库 stay grouped.
 */
export function bankMathModules(bank: QuestionBank): MathModule[] {
  if (bankSubject(bank) !== 'math') return []

  const workspaceFolder = bank.workspaceFolder?.replaceAll('\\', '/') || ''
  if (workspaceFolder.startsWith('数学/高数/')) return ['calculus']
  if (workspaceFolder.startsWith('数学/线代/')) return ['linear']
  if (workspaceFolder.startsWith('数学/真题/')) return ['exams']

  const name = bank.name.toLowerCase()
  const hasLinear = /线代|线性代数|linear/.test(name)
  const hasCalculus = /高数|高等数学|微积分|calculus/.test(name)
  const hasBothByChapters = bank.chapters.some(chapter => /高等数学|高数/.test(chapter.name))
    && bank.chapters.some(chapter => /线性代数|线代/.test(chapter.name))

  if (hasBothByChapters || (!hasLinear && !hasCalculus && /数二|综合/.test(name))) return ['calculus', 'linear']
  if (hasLinear) return ['linear']
  return ['calculus']
}

export function bankMathModule(bank: QuestionBank): MathModule {
  const modules = bankMathModules(bank)
  if (modules.includes('exams')) return 'exams'
  return modules[0] === 'linear' ? 'linear' : 'calculus'
}
