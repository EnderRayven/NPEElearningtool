export interface QuestionTagDefinition {
  id: string
  name: string
  color: string
}

export const DEFAULT_QUESTION_TAGS: QuestionTagDefinition[] = [
  { id: 'red', name: '必做题', color: '#ef4444' },
  { id: 'blue', name: '选做题', color: '#3b82f6' },
  { id: 'gray', name: '特难题', color: '#9ca3af' },
  { id: 'black', name: '不做', color: '#111827' },
  { id: 'orange', name: '橙色', color: '#f59e0b' },
  { id: 'yellow', name: '黄色', color: '#facc15' },
  { id: 'green', name: '绿色', color: '#22c55e' },
  { id: 'purple', name: '紫色', color: '#a855f7' },
]

export function sortQuestionTagsForFilter(tags: QuestionTagDefinition[]) {
  return [...tags]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateQuestionTagDefinitions(value: unknown): QuestionTagDefinition[] {
  const candidates = Array.isArray(value) ? value.filter(isRecord) : []
  const defaultsById = new Map(DEFAULT_QUESTION_TAGS.map(tag => [tag.id, tag]))
  const orderedIds = [...new Set(candidates.map(item => typeof item.id === 'string' ? item.id : '').filter(id => defaultsById.has(id)))]
  DEFAULT_QUESTION_TAGS.forEach(tag => { if (!orderedIds.includes(tag.id)) orderedIds.push(tag.id) })
  return orderedIds.map(id => {
    const defaultTag = defaultsById.get(id)!
    const candidate = candidates.find(item => item.id === id)
    const name = typeof candidate?.name === 'string' && candidate.name.trim() ? candidate.name.trim().slice(0, 30) : defaultTag.name
    const color = typeof candidate?.color === 'string' && /^#[0-9a-f]{6}$/i.test(candidate.color) ? candidate.color.toLowerCase() : defaultTag.color
    return { ...defaultTag, name, color }
  })
}
