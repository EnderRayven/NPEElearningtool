import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, Tag, X } from 'lucide-react'
import { sortQuestionTagsForFilter, type QuestionTagDefinition } from './questionTags'

interface Props {
  tags: QuestionTagDefinition[]
  selectedTagIds?: string[]
  onChange: (tagIds: string[]) => void
  compact?: boolean
}

export default function QuestionTagPicker({ tags, selectedTagIds = [], onChange, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = new Set(selectedTagIds)
  const orderedTags = sortQuestionTagsForFilter(tags)
  const selectedTags = orderedTags.filter(tag => selected.has(tag.id))

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function toggleTag(tagId: string) {
    const next = new Set(selected)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    onChange(orderedTags.filter(tag => next.has(tag.id)).map(tag => tag.id))
  }

  return <div ref={rootRef} className={compact ? 'question-tag-picker compact' : 'question-tag-picker'}>
    <div className="question-tag-badges" aria-label={selectedTags.length ? `已添加标签：${selectedTags.map(tag => tag.name).join('、')}` : '尚未添加标签'}>
      {selectedTags.map(tag => <span className="question-tag-chip" key={tag.id} style={{ '--question-tag-color': tag.color } as CSSProperties}><i/>{tag.name}</span>)}
    </div>
    <button type="button" className={selectedTags.length ? 'question-tag-trigger has-tags' : 'question-tag-trigger'} aria-label={selectedTags.length ? '修改题目标记' : '添加题目标记'} aria-expanded={open} title={selectedTags.length ? '修改题目标记' : '添加题目标记'} onClick={() => setOpen(value => !value)}><Tag size={compact ? 13 : 15}/></button>
    {open && <div className="question-tag-menu" role="menu" aria-label="题目标记">
      <div className="question-tag-menu-heading"><strong>题目标记</strong><small>可同时选择多个</small></div>
      {orderedTags.map(tag => <button key={tag.id} type="button" role="menuitemcheckbox" aria-checked={selected.has(tag.id)} className={selected.has(tag.id) ? 'question-tag-option selected' : 'question-tag-option'} onClick={() => toggleTag(tag.id)}><i style={{ backgroundColor: tag.color }}/><span>{tag.name}</span>{selected.has(tag.id) && <Check size={14}/>}</button>)}
      {selectedTags.length > 0 && <button type="button" className="question-tag-clear" onClick={() => onChange([])}><X size={13}/>清除本题标签</button>}
    </div>}
  </div>
}
