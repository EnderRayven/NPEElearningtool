import type { Question, Section } from './types'

export type EnglishSectionGroupKey = 'section-i' | 'section-ii' | 'section-iii'

export interface EnglishSectionGroup {
  key: EnglishSectionGroupKey
  label: string
  sections: Section[]
}

export type EnglishTopicKey = 'cloze' | 'reading' | 'new-type' | 'translation' | 'writing'

export interface EnglishTopicGroup<T> {
  key: EnglishTopicKey
  label: string
  entries: T[]
}

export const englishTopicMeta: Array<{ key: EnglishTopicKey; label: string }> = [
  { key: 'cloze', label: '完形填空' },
  { key: 'reading', label: '阅读理解' },
  { key: 'new-type', label: '新题型' },
  { key: 'translation', label: '翻译' },
  { key: 'writing', label: '作文' },
]

const groupMeta: Array<{ key: EnglishSectionGroupKey; label: string }> = [
  { key: 'section-i', label: 'Section I 完形填空' },
  { key: 'section-ii', label: 'Section II 阅读理解' },
  { key: 'section-iii', label: 'Section III 写作' },
]

function sectionGroupKey(section: Section): EnglishSectionGroupKey {
  const name = section.name
  const types = new Set(section.questions.map(question => question.type))
  if (/^Section I\b/i.test(name) || types.has('完形填空')) return 'section-i'
  if (/写作|应用文|短文写作/i.test(name) || types.has('写作') || types.has('应用文写作') || types.has('短文写作')) return 'section-iii'
  return 'section-ii'
}

export function groupEnglishSections(sections: Section[]): EnglishSectionGroup[] {
  return groupMeta.map(meta => ({
    ...meta,
    sections: sections.filter(section => sectionGroupKey(section) === meta.key),
  })).filter(group => group.sections.length)
}

export function englishSectionLabel(section: Section, groupKey: EnglishSectionGroupKey) {
  if (groupKey === 'section-i') return section.name.replace(/^Section I\s*/i, '') || section.name
  return section.name
}

export function englishTopicForQuestion(question: Pick<Question, 'type'>, sectionName = ''): EnglishTopicKey | undefined {
  if (question.type === '完形填空' || /Section I|Use of English|完形填空/i.test(sectionName)) return 'cloze'
  if (question.type === '阅读理解 Part A' || /Part A\s*[·.]?\s*Text|阅读理解/i.test(sectionName)) return 'reading'
  if (question.type === '阅读理解 Part B' || /选句填空|小标题|段落排序|观点匹配|新题型/i.test(sectionName)) return 'new-type'
  if (question.type === '英译汉' || /英译汉|翻译/i.test(sectionName)) return 'translation'
  if (question.type === '写作' || question.type === '应用文写作' || question.type === '短文写作' || /写作|应用文|短文写作/i.test(sectionName)) return 'writing'
  return undefined
}

export function groupEnglishTopicEntries<T extends { question: Pick<Question, 'type'>; sectionName?: string }>(entries: T[]): EnglishTopicGroup<T>[] {
  return englishTopicMeta.map(meta => ({
    ...meta,
    entries: entries.filter(entry => englishTopicForQuestion(entry.question, entry.sectionName) === meta.key),
  })).filter(group => group.entries.length)
}
