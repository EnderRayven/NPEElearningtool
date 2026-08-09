import { useRef, useState } from 'react'
import { Tag, X } from 'lucide-react'
import { MAX_NOTE_TAG_LENGTH, normalizeNoteTags } from './questionNotes'

interface NoteTagChipsProps {
  tags?: string[]
  className?: string
  onRemove?: (tag: string) => void
}

export function NoteTagChips({ tags = [], className = '', onRemove }: NoteTagChipsProps) {
  const selectedTags = normalizeNoteTags(tags)
  if (!selectedTags.length) return null
  return <div className={`note-tag-chips ${className}`.trim()} aria-label={`笔记标签：${selectedTags.join('、')}`}>
    {selectedTags.map(tag => <span className="note-tag-chip" key={tag}>
      <span>{tag}</span>
      {onRemove && <button type="button" aria-label={`删除标签 ${tag}`} title={`删除标签 ${tag}`} onClick={() => onRemove(tag)}><X size={12}/></button>}
    </span>)}
  </div>
}

interface NoteTagEditorProps {
  tags?: string[]
  onChange: (tags: string[]) => void
  className?: string
}

export function noteTagsAfterDraft(currentTags: string[], value: string) {
  const incoming = value.split(/[,，、]/).map(item => item.trim()).filter(Boolean)
  return normalizeNoteTags([...normalizeNoteTags(currentTags), ...incoming])
}

export default function NoteTagEditor({ tags = [], onChange, className = '' }: NoteTagEditorProps) {
  const [draft, setDraft] = useState('')
  const selectedTags = normalizeNoteTags(tags)
  const tagSignature = selectedTags.join('\u0000')
  const lastPropTagSignatureRef = useRef(tagSignature)
  const committedTagsRef = useRef(selectedTags)

  // Keep rapid local submissions from being overwritten by a rerender carrying
  // the previous props while the parent is still persisting the latest value.
  if (tagSignature !== lastPropTagSignatureRef.current) {
    lastPropTagSignatureRef.current = tagSignature
    committedTagsRef.current = selectedTags
  }

  function addDraft(value: string) {
    const nextTags = noteTagsAfterDraft(committedTagsRef.current, value)
    if (nextTags.length === committedTagsRef.current.length) {
      setDraft('')
      return
    }
    committedTagsRef.current = nextTags
    onChange(nextTags)
    setDraft('')
  }

  function removeTag(tag: string) {
    const nextTags = committedTagsRef.current.filter(item => item !== tag)
    committedTagsRef.current = nextTags
    onChange(nextTags)
  }

  return <div className={`note-tag-editor ${className}`.trim()} aria-label="笔记标签编辑">
    <div className="note-tag-input-shell">
      <span className="note-tag-leading-icon" aria-hidden="true"><Tag size={14}/></span>
      <NoteTagChips tags={selectedTags} onRemove={removeTag}/>
      <input
        aria-label="添加笔记标签"
        value={draft}
        maxLength={MAX_NOTE_TAG_LENGTH}
        placeholder={selectedTags.length ? '继续添加，按回车确认' : '添加标签，按回车确认'}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          const currentValue = event.currentTarget.value
          if (event.key === 'Enter' || event.key === ',' || event.key === '，' || event.key === '、') {
            event.preventDefault()
            addDraft(currentValue)
          } else if (event.key === 'Backspace' && !currentValue && committedTagsRef.current.length) {
            removeTag(committedTagsRef.current[committedTagsRef.current.length - 1])
          }
        }}
        onBlur={event => addDraft(event.currentTarget.value)}
      />
    </div>
  </div>
}
