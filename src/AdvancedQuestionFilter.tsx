import { Check, Filter, RotateCcw, Tag } from 'lucide-react'
import type { QuestionTagDefinition } from './questionTags'
import { sortQuestionTagsForFilter } from './questionTags'
import { advancedQuestionFilterCount, type AdvancedQuestionFilter } from './questionFilters'

interface Props {
  filter: AdvancedQuestionFilter
  tags: QuestionTagDefinition[]
  statusOptions: Array<{ value: string; label: string }>
  typeOptions: Array<{ value: string; label: string }>
  onChange: (filter: AdvancedQuestionFilter) => void
  onClear: () => void
}

export default function AdvancedQuestionFilter({ filter, tags, statusOptions, typeOptions, onChange, onClear }: Props) {
  const activeCount = advancedQuestionFilterCount(filter)
  const orderedTags = sortQuestionTagsForFilter(tags)

  function toggleStatus(statusValue: string) {
    const statusValues = filter.statusValues.includes(statusValue)
      ? filter.statusValues.filter(value => value !== statusValue)
      : [...filter.statusValues, statusValue]
    onChange({ ...filter, statusValues })
  }

  function toggleTag(tagId: string) {
    const tagIds = filter.tagIds.includes(tagId) ? filter.tagIds.filter(value => value !== tagId) : [...filter.tagIds, tagId]
    onChange({ ...filter, tagIds, onlyUntagged: false })
  }

  function toggleType(typeValue: string) {
    const typeValues = filter.typeValues.includes(typeValue) ? filter.typeValues.filter(value => value !== typeValue) : [...filter.typeValues, typeValue]
    onChange({ ...filter, typeValues })
  }

  return <section id="question-filter-panel" className="advanced-filter-panel" aria-label="题目筛选">
    <div className="advanced-filter-heading"><div><strong><Filter size={15}/>题目筛选</strong><small>熟练度和标签可以同时组合，筛选条件之间按“且”匹配</small></div><button type="button" className="advanced-filter-clear" disabled={!activeCount} onClick={onClear}><RotateCcw size={13}/>清除条件</button></div>
    <div className="advanced-filter-grid">
      <div className="advanced-filter-group advanced-filter-tags-group"><span className="advanced-filter-label"><Tag size={13}/>标签</span><div className="advanced-filter-options tag-options">{orderedTags.map(tag => <button key={tag.id} type="button" className={filter.tagIds.includes(tag.id) ? 'advanced-filter-tag selected' : 'advanced-filter-tag'} aria-pressed={filter.tagIds.includes(tag.id)} onClick={() => toggleTag(tag.id)}><i style={{ backgroundColor: tag.color }}/>{tag.name}</button>)}<button type="button" className={filter.onlyUntagged ? 'advanced-filter-tag selected untagged' : 'advanced-filter-tag untagged'} aria-pressed={filter.onlyUntagged} onClick={() => onChange({ ...filter, tagIds: [], onlyUntagged: !filter.onlyUntagged })}>未添加标签</button></div></div>
      <div className="advanced-filter-group"><span className="advanced-filter-label"><Check size={13}/>熟练度</span><div className="advanced-filter-options status-options"><button type="button" className={!filter.statusValues.length ? 'advanced-filter-choice selected' : 'advanced-filter-choice'} aria-pressed={!filter.statusValues.length} onClick={() => onChange({ ...filter, statusValues: [] })}>全部</button>{statusOptions.map(option => <button key={option.value} type="button" className={filter.statusValues.includes(option.value) ? 'advanced-filter-choice selected' : 'advanced-filter-choice'} aria-pressed={filter.statusValues.includes(option.value)} onClick={() => toggleStatus(option.value)}>{option.label}</button>)}</div></div>
      <div className="advanced-filter-group"><span className="advanced-filter-label"><Check size={13}/>题型</span><div className="advanced-filter-options type-options">{typeOptions.length ? typeOptions.map(option => <button key={option.value} type="button" className={filter.typeValues.includes(option.value) ? 'advanced-filter-choice selected' : 'advanced-filter-choice'} aria-pressed={filter.typeValues.includes(option.value)} onClick={() => toggleType(option.value)}>{option.label}</button>) : <small className="advanced-filter-empty">当前范围没有可筛选的普通题型</small>}</div></div>
    </div>
  </section>
}
