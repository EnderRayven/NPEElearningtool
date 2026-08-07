import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, BookOpen, FileText, NotebookPen, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import type { Chapter, Question, QuestionBank, Section } from './types'
import { bankSubject, subjectLabels } from './subjects'
import ConfirmDialog from './ConfirmDialog'
import QuestionNotePanel from './QuestionNotePanel'
import { croppedCanvasHeightForDrawing, pathsForStroke } from './QuestionNotePanel'
import { DRAWING_WIDTH, hasPersonalNote, type PersonalNote, type PersonalNotebook, type PersonalNotebooks, type QuestionNote, type QuestionNotes } from './questionNotes'
import { useDialogFocus } from './useDialogFocus'
import { useModalScrollLock } from './useModalScrollLock'
import { MarkdownNotePreview } from './MarkdownNote'

type NotesFilter = 'all' | 'text' | 'handwriting'
type NavigationTarget = { kind: 'bank'; id: string } | { kind: 'personal'; id: string }
type CreationState = { kind: 'notebook' } | { kind: 'note'; notebookId: string }
type DeleteTarget =
  | { kind: 'note'; notebookId: string; noteId: string; label: string }
  | { kind: 'notebook'; notebookId: string; label: string }

interface NoteEntry {
  questionId: string
  bank?: QuestionBank
  chapter?: Chapter
  section?: Section
  question?: Question
  note: QuestionNote
}

interface NoteGroup {
  key: string
  subjectLabel: string
  bankName: string
  chapterName: string
  sectionName: string
  entries: NoteEntry[]
}

interface BankNoteGroup {
  key: string
  bankId?: string
  subjectLabel: string
  bankName: string
  entries: NoteEntry[]
  sections: NoteGroup[]
}

interface NotesDialogProps {
  banks: QuestionBank[]
  notes: QuestionNotes
  personalNotebooks: PersonalNotebooks
  onClose: () => void
  onOpenQuestion: (bankId: string, questionId: string) => void
  onEditQuestion: (bankId: string, questionId: string) => void
  onCreateNotebook: (name: string) => PersonalNotebook | null
  onCreateNote: (notebookId: string, title: string) => PersonalNote | null
  onPersonalNoteChange: (notebookId: string, note: PersonalNote) => void
  onDeletePersonalNote: (notebookId: string, noteId: string) => void
  onDeleteNotebook: (notebookId: string) => void
}

const noteHasText = (note: QuestionNote) => Boolean(note.text.trim())
const noteHasDrawing = (note: QuestionNote) => Boolean(note.drawing?.strokes.length)

function noteTypeLabel(note: QuestionNote) {
  if (noteHasText(note) && noteHasDrawing(note)) return '文字 + 手写'
  if (noteHasDrawing(note)) return '手写笔记'
  return '文字笔记'
}

function noteMatchesFilter(note: QuestionNote, filter: NotesFilter) {
  if (filter === 'text') return noteHasText(note)
  if (filter === 'handwriting') return noteHasDrawing(note)
  return true
}

function formatNoteDate(value: string) {
  if (!value) return '时间未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function questionPreview(question: Question | undefined) {
  if (!question) return '这条笔记对应的题目已不在当前题库中。'
  const text = question.text.trim()
  if (!text || text === `第 ${question.number} 题`) return `第 ${question.number} 题`
  return text
}

function buildNoteEntries(banks: QuestionBank[], notes: QuestionNotes): NoteEntry[] {
  const linkedQuestionIds = new Set<string>()
  const linkedEntries: NoteEntry[] = banks.flatMap(bank => bank.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.questions.flatMap(question => {
    const note = notes[question.id]
    if (!note || linkedQuestionIds.has(question.id)) return []
    linkedQuestionIds.add(question.id)
    return [{ questionId: question.id, bank, chapter, section, question, note }]
  }))))
  const orphanEntries: NoteEntry[] = Object.entries(notes)
    .filter(([questionId]) => !linkedQuestionIds.has(questionId))
    .map(([questionId, note]) => ({ questionId, note }))
  return [...linkedEntries, ...orphanEntries]
}

function groupNoteEntries(entries: NoteEntry[]) {
  const grouped = new Map<string, NoteGroup>()
  entries.forEach(entry => {
    const key = entry.bank && entry.chapter && entry.section
      ? `${entry.bank.id}/${entry.chapter.id}/${entry.section.id}`
      : 'orphan-notes'
    const group = grouped.get(key) || {
      key,
      subjectLabel: entry.bank ? subjectLabels[bankSubject(entry.bank)] : '其他',
      bankName: entry.bank?.name || '未归档笔记',
      chapterName: entry.chapter?.name || '题库已移除或题目已更新',
      sectionName: entry.section?.name || '这些笔记仍保存在本地，但暂时无法定位原题',
      entries: [],
    }
    group.entries.push(entry)
    grouped.set(key, group)
  })
  return [...grouped.values()]
}

function groupBankEntries(entries: NoteEntry[]) {
  const grouped = new Map<string, BankNoteGroup>()
  entries.forEach(entry => {
    const key = entry.bank?.id || 'orphan-notes'
    const group = grouped.get(key) || {
      key,
      bankId: entry.bank?.id,
      subjectLabel: entry.bank ? subjectLabels[bankSubject(entry.bank)] : '其他',
      bankName: entry.bank?.name || '未归档笔记',
      entries: [],
      sections: [],
    }
    group.entries.push(entry)
    grouped.set(key, group)
  })
  return [...grouped.values()].map(group => ({ ...group, sections: groupNoteEntries(group.entries) }))
}

function NotesDrawing({ note }: { note: QuestionNote }) {
  if (!noteHasDrawing(note)) return null
  const height = croppedCanvasHeightForDrawing(note.drawing)
  return <div className="notes-stream-drawing">
    <svg viewBox={`0 0 ${DRAWING_WIDTH} ${height}`} preserveAspectRatio="xMidYMin meet" role="img" aria-label="完整手写笔记">
      {note.drawing.strokes.flatMap(stroke => pathsForStroke(stroke).map((path, index) => <path key={`${stroke.id}-${index}`} d={path.d} fill={path.fill || 'none'} fillOpacity={path.fillOpacity} stroke={stroke.color} strokeWidth={path.width} strokeDasharray={path.dashArray} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>))}
    </svg>
  </div>
}

function NoteStreamCard({ entry, onOpenQuestion, onEditQuestion }: { entry: NoteEntry; onOpenQuestion: (bankId: string, questionId: string) => void; onEditQuestion: (bankId: string, questionId: string) => void }) {
  const canOpen = Boolean(entry.bank && entry.question)
  return <article className={canOpen ? 'notes-stream-card' : 'notes-stream-card notes-stream-card-orphan'}>
    <header>
      <div className="notes-stream-card-title"><span>{entry.question ? `第 ${entry.question.number} 题` : '未归档题目'}</span><strong>{noteTypeLabel(entry.note)}</strong><time dateTime={entry.note.updatedAt || undefined}>{formatNoteDate(entry.note.updatedAt)}</time></div>
      {canOpen && <div className="notes-stream-actions">
        <button className="notes-stream-edit" type="button" aria-label={`编辑第 ${entry.question!.number} 题笔记`} onClick={() => onEditQuestion(entry.bank!.id, entry.question!.id)}><Pencil size={14}/>编辑</button>
        <button className="notes-stream-open" type="button" onClick={() => onOpenQuestion(entry.bank!.id, entry.question!.id)}><BookOpen size={14}/>查看原题<ArrowUpRight size={14}/></button>
      </div>}
    </header>
    <p className="notes-stream-question">{questionPreview(entry.question)}</p>
    {noteHasText(entry.note) && <MarkdownNotePreview className="notes-stream-markdown" source={entry.note.text}/>}
    <NotesDrawing note={entry.note}/>
  </article>
}

function PersonalNoteCard({ notebook, note, initialOpen, onChange, onDelete }: { notebook: PersonalNotebook; note: PersonalNote; initialOpen: boolean; onChange: (note: PersonalNote) => void; onDelete: () => void }) {
  return <article className="notes-stream-card notes-personal-note-card">
    <header>
      <div className="notes-stream-card-title notes-personal-note-title">
        <input aria-label="笔记标题" value={note.title} onChange={event => onChange({ ...note, title: event.target.value, updatedAt: new Date().toISOString() })}/>
        <strong>{noteTypeLabel(note)}</strong>
        <time dateTime={note.updatedAt || undefined}>{formatNoteDate(note.updatedAt)}</time>
      </div>
      <button className="notes-stream-icon-button" type="button" aria-label={`删除笔记${note.title}`} title="删除笔记" onClick={onDelete}><Trash2 size={15}/></button>
    </header>
    {noteHasText(note) && <MarkdownNotePreview className="notes-stream-markdown" source={note.text}/>}
    <NotesDrawing note={note}/>
    <QuestionNotePanel questionId={`personal-note-${notebook.id}-${note.id}`} note={note} initialOpen={initialOpen} onChange={next => onChange({ ...note, ...next })}/>
  </article>
}

const anchorIdFor = (key: string) => `notes-stream-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`

export default function NotesDialog({ banks, notes, personalNotebooks, onClose, onOpenQuestion, onEditQuestion, onCreateNotebook, onCreateNote, onPersonalNoteChange, onDeletePersonalNote, onDeleteNotebook }: NotesDialogProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<NotesFilter>('all')
  const [activeTarget, setActiveTarget] = useState<NavigationTarget | null>(null)
  const [activeSectionKey, setActiveSectionKey] = useState('')
  const [sectionScrollRequest, setSectionScrollRequest] = useState(0)
  const [creation, setCreation] = useState<CreationState | null>(null)
  const [creationName, setCreationName] = useState('')
  const [newlyCreatedNoteId, setNewlyCreatedNoteId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const detailScrollRef = useRef<HTMLElement | null>(null)
  const navRef = useRef<HTMLElement | null>(null)
  const hasInitialisedSectionScroll = useRef(false)
  const pendingSectionScroll = useRef(false)
  const dialogRootRef = useDialogFocus<HTMLDivElement>(onClose, { initialFocusSelector: '[aria-label="关闭我的笔记"]' })

  useModalScrollLock(true, 'notes-modal-open')

  const entries = useMemo(() => buildNoteEntries(banks, notes), [banks, notes])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredEntries = useMemo(() => entries.filter(entry => {
    if (!noteMatchesFilter(entry.note, filter)) return false
    if (!normalizedQuery) return true
    const searchText = [entry.bank?.name, entry.chapter?.name, entry.section?.name, entry.question?.text, entry.note.text, noteTypeLabel(entry.note)].filter(Boolean).join(' ').toLowerCase()
    return searchText.includes(normalizedQuery)
  }), [entries, filter, normalizedQuery])
  const bankGroups = useMemo(() => groupBankEntries(filteredEntries), [filteredEntries])
  const personalNotebookViews = useMemo(() => personalNotebooks.flatMap(notebook => {
    const notebookNameMatches = !normalizedQuery || notebook.name.toLowerCase().includes(normalizedQuery)
    const filteredNotes = notebook.notes.filter(note => {
      if (!noteMatchesFilter(note, filter)) return false
      if (!normalizedQuery || notebookNameMatches) return true
      return [note.title, note.text, noteTypeLabel(note)].join(' ').toLowerCase().includes(normalizedQuery)
    })
    if (normalizedQuery && !notebookNameMatches && !filteredNotes.length) return []
    return [{ notebook, notes: filteredNotes }]
  }), [filter, normalizedQuery, personalNotebooks])

  const defaultTarget = bankGroups[0] ? { kind: 'bank' as const, id: bankGroups[0].key } : personalNotebookViews[0] ? { kind: 'personal' as const, id: personalNotebookViews[0].notebook.id } : null
  const effectiveActiveTarget = activeTarget || defaultTarget

  useEffect(() => {
    if (activeTarget?.kind === 'bank' && bankGroups.some(group => group.key === activeTarget.id)) return
    if (activeTarget?.kind === 'personal' && personalNotebookViews.some(view => view.notebook.id === activeTarget.id)) return
    setActiveTarget(defaultTarget)
  }, [activeTarget, bankGroups, defaultTarget, personalNotebookViews])

  const activeBankGroup = effectiveActiveTarget?.kind === 'bank' ? bankGroups.find(group => group.key === effectiveActiveTarget.id) || bankGroups[0] : undefined
  const activePersonalView = effectiveActiveTarget?.kind === 'personal' ? personalNotebookViews.find(view => view.notebook.id === effectiveActiveTarget.id) || personalNotebookViews[0] : undefined

  useEffect(() => {
    const firstSectionKey = activeBankGroup?.sections[0]?.key || ''
    if (!activeBankGroup?.sections.some(section => section.key === activeSectionKey)) setActiveSectionKey(firstSectionKey)
  }, [activeBankGroup, activeSectionKey])
  useEffect(() => {
    if (!activeSectionKey || !activeBankGroup?.sections.some(section => section.key === activeSectionKey)) return
    if (!hasInitialisedSectionScroll.current) {
      hasInitialisedSectionScroll.current = true
      return
    }
    if (!pendingSectionScroll.current) return
    pendingSectionScroll.current = false
    window.requestAnimationFrame(() => {
      const container = detailScrollRef.current
      const target = container?.querySelector<HTMLElement>(`#${anchorIdFor(activeSectionKey)}`)
      if (!container || !target) return
      const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top - 14
      container.scrollBy({ top: offset, behavior: 'smooth' })
    })
  }, [activeBankGroup, activeSectionKey, sectionScrollRequest])
  useEffect(() => {
    const container = detailScrollRef.current
    if (!container || !activeBankGroup) return
    let frame = 0
    const syncNavigation = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const sections = Array.from(container.querySelectorAll<HTMLElement>('.notes-stream-section'))
        if (!sections.length) return
        const containerTop = container.getBoundingClientRect().top
        const activationLine = Math.min(120, container.clientHeight * .28)
        let activeIndex = 0
        sections.forEach((section, index) => { if (section.getBoundingClientRect().top - containerTop <= activationLine) activeIndex = index })
        const nextKey = activeBankGroup.sections[activeIndex]?.key
        if (nextKey) setActiveSectionKey(currentKey => currentKey === nextKey ? currentKey : nextKey)
      })
    }
    container.addEventListener('scroll', syncNavigation, { passive: true })
    syncNavigation()
    return () => { container.removeEventListener('scroll', syncNavigation); window.cancelAnimationFrame(frame) }
  }, [activeBankGroup])
  useEffect(() => {
    const nav = navRef.current
    if (!nav || !activeSectionKey || effectiveActiveTarget?.kind !== 'bank') return
    const activeButton = Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-note-section]')).find(button => button.dataset.noteSection === activeSectionKey)
    if (!activeButton) return
    const navBounds = nav.getBoundingClientRect()
    const buttonBounds = activeButton.getBoundingClientRect()
    const visibleTop = navBounds.top + 8
    const visibleBottom = navBounds.bottom - 8
    if (buttonBounds.top < visibleTop) nav.scrollBy({ top: buttonBounds.top - visibleTop, behavior: 'smooth' })
    else if (buttonBounds.bottom > visibleBottom) nav.scrollBy({ top: buttonBounds.bottom - visibleBottom, behavior: 'smooth' })
  }, [activeBankGroup, activeSectionKey, effectiveActiveTarget])

  const textCount = entries.filter(entry => noteHasText(entry.note)).length + personalNotebooks.flatMap(notebook => notebook.notes).filter(note => noteHasText(note)).length
  const handwritingCount = entries.filter(entry => noteHasDrawing(entry.note)).length + personalNotebooks.flatMap(notebook => notebook.notes).filter(note => noteHasDrawing(note)).length
  const totalPersonalNoteCount = personalNotebooks.reduce((count, notebook) => count + notebook.notes.length, 0)

  function selectSection(bankGroup: BankNoteGroup, section: NoteGroup) {
    pendingSectionScroll.current = true
    setSectionScrollRequest(request => request + 1)
    setActiveTarget({ kind: 'bank', id: bankGroup.key })
    setActiveSectionKey(section.key)
  }
  function selectBank(bankGroup: BankNoteGroup) {
    pendingSectionScroll.current = true
    setSectionScrollRequest(request => request + 1)
    setActiveTarget({ kind: 'bank', id: bankGroup.key })
    setActiveSectionKey(bankGroup.sections[0]?.key || '')
  }
  function openCreation(kind: CreationState['kind'], notebookId = '') {
    if (kind === 'note' && !personalNotebooks.length) {
      setCreation({ kind: 'notebook' })
      setCreationName('')
      return
    }
    setCreation(kind === 'notebook' ? { kind } : { kind, notebookId: notebookId || personalNotebooks[0].id })
    setCreationName(kind === 'notebook' ? '' : '新笔记')
  }
  function submitCreation() {
    if (!creation || !creationName.trim()) return
    if (creation.kind === 'notebook') {
      const created = onCreateNotebook(creationName)
      if (!created) return
      setActiveTarget({ kind: 'personal', id: created.id })
    } else {
      const created = onCreateNote(creation.notebookId, creationName)
      if (!created) return
      setActiveTarget({ kind: 'personal', id: creation.notebookId })
      setNewlyCreatedNoteId(created.id)
    }
    setCreation(null)
    setCreationName('')
  }
  function confirmDelete() {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'note') onDeletePersonalNote(deleteTarget.notebookId, deleteTarget.noteId)
    else onDeleteNotebook(deleteTarget.notebookId)
    setDeleteTarget(null)
  }

  const activeContext = activeBankGroup
    ? { eyebrow: `${activeBankGroup.subjectLabel} · QUESTION BANK NOTES`, title: activeBankGroup.bankName, count: activeBankGroup.entries.length }
    : activePersonalView
      ? { eyebrow: 'PERSONAL NOTEBOOK · NOTE STREAM', title: activePersonalView.notebook.name, count: activePersonalView.notes.length }
      : null

  return <div ref={dialogRootRef} className="notes-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="notes-dialog" role="dialog" aria-modal="true" aria-labelledby="notes-dialog-title" onClick={event => event.stopPropagation()}>
      <header className="notes-dialog-header">
        <div className="notes-dialog-title"><span className="notes-dialog-icon"><NotebookPen/></span><div><span>STUDY NOTES</span><h2 id="notes-dialog-title">我的笔记</h2></div></div>
        {activeContext && <div className="notes-dialog-context" aria-live="polite"><span>{activeContext.eyebrow}</span><strong>{activeContext.title}</strong><small>共 {activeContext.count} 条笔记</small></div>}
        <div className="notes-dialog-actions"><button type="button" onClick={() => openCreation('notebook')}><Plus size={14}/>新建笔记本</button><button type="button" onClick={() => openCreation('note')}><Plus size={14}/>新建笔记</button></div>
      </header>
      <div className="notes-dialog-body">
        <aside className="notes-sidebar">
          <div className="notes-sidebar-summary"><div><strong>{entries.length + totalPersonalNoteCount}</strong><span>条笔记</span></div><small>{bankGroups.length} 个题库 · {personalNotebooks.length} 个笔记本</small><div className="notes-sidebar-types"><span><FileText size={12}/>文字 {textCount}</span><span><NotebookPen size={12}/>手写 {handwritingCount}</span></div></div>
          <div className="notes-sidebar-tools"><label className="notes-search"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索笔记" aria-label="搜索笔记"/></label><select value={filter} onChange={event => setFilter(event.target.value as NotesFilter)} aria-label="笔记类型筛选"><option value="all">全部笔记</option><option value="text">文字笔记</option><option value="handwriting">手写笔记</option></select></div>
          <div className="notes-nav-label"><span>NOTE NAVIGATION</span><strong>笔记导航</strong></div>
          <nav ref={navRef} className="notes-nav-groups" aria-label="笔记导航">
            <div className="notes-nav-category"><div className="notes-nav-category-heading"><span>QUESTION BANKS</span><strong>题库笔记</strong></div>
              {bankGroups.map(bankGroup => <section className={activeBankGroup?.key === bankGroup.key ? 'notes-nav-bank active' : 'notes-nav-bank'} key={bankGroup.key}>
                <button className="notes-nav-bank-heading" type="button" onClick={() => selectBank(bankGroup)}><span><small>{bankGroup.subjectLabel}</small><strong>{bankGroup.bankName}</strong></span><em>{bankGroup.entries.length}</em></button>
                <div>{bankGroup.sections.map(section => <button className={section.key === activeSectionKey && activeBankGroup?.key === bankGroup.key ? 'notes-nav-section active' : 'notes-nav-section'} data-note-section={section.key} type="button" key={section.key} onClick={() => selectSection(bankGroup, section)}><span><strong>{section.chapterName}</strong><small>{section.sectionName}</small></span><em>{section.entries.length}</em></button>)}</div>
              </section>)}
              {!bankGroups.length && <div className="notes-sidebar-empty compact"><BookOpen size={20}/><span>{entries.length ? '没有匹配的题库笔记' : '还没有题库笔记'}</span></div>}
            </div>
            <div className="notes-nav-category notes-nav-personal-category"><div className="notes-nav-category-heading"><span>PERSONAL NOTES</span><strong>我的笔记</strong><button className="notes-nav-icon-button" type="button" aria-label="新建笔记本" title="新建笔记本" onClick={() => openCreation('notebook')}><Plus size={14}/></button></div>
              {personalNotebookViews.map(view => <section className={activePersonalView?.notebook.id === view.notebook.id ? 'notes-nav-bank notes-nav-personal active' : 'notes-nav-bank notes-nav-personal'} key={view.notebook.id}>
                <button className="notes-nav-bank-heading" type="button" onClick={() => setActiveTarget({ kind: 'personal', id: view.notebook.id })}><span><small>NOTEBOOK</small><strong>{view.notebook.name}</strong></span><em>{view.notes.length}</em></button>
                {activePersonalView?.notebook.id === view.notebook.id && <div className="notes-nav-personal-note-list">{view.notes.map(note => <button type="button" key={note.id} onClick={() => { setActiveTarget({ kind: 'personal', id: view.notebook.id }); setNewlyCreatedNoteId(note.id) }}><span>{note.title}</span><em>{hasPersonalNote(note) ? noteTypeLabel(note) : '空白'}</em></button>)}</div>}
              </section>)}
              {!personalNotebookViews.length && <div className="notes-sidebar-empty compact"><NotebookPen size={20}/><span>{personalNotebooks.length ? '没有匹配的个人笔记' : '还没有笔记本'}</span><button type="button" onClick={() => openCreation('notebook')}>新建笔记本</button></div>}
            </div>
          </nav>
        </aside>
        <main ref={detailScrollRef} className="notes-detail-scroll">
          {activeBankGroup
            ? <div className="notes-stream"><div className="notes-stream-sections">{activeBankGroup.sections.map(section => <section className="notes-stream-section" id={anchorIdFor(section.key)} key={section.key}><header><div><span>{section.chapterName}</span><strong>{section.sectionName}</strong></div><em>{section.entries.length} 条</em></header><div className="notes-stream-list">{section.entries.map(entry => <NoteStreamCard key={entry.questionId} entry={entry} onOpenQuestion={onOpenQuestion} onEditQuestion={onEditQuestion}/>)}</div></section>)}</div></div>
            : activePersonalView
              ? <div className="notes-stream"><div className="notes-personal-heading"><div><span>PERSONAL NOTEBOOK</span><h3>{activePersonalView.notebook.name}</h3><p>独立笔记不会绑定题库，文字与手写内容会自动保存。</p></div><div className="notes-personal-heading-actions"><button type="button" onClick={() => openCreation('note', activePersonalView.notebook.id)}><Plus size={14}/>新建笔记</button><button className="notes-stream-icon-button" type="button" aria-label="删除笔记本" title="删除笔记本" onClick={() => setDeleteTarget({ kind: 'notebook', notebookId: activePersonalView.notebook.id, label: activePersonalView.notebook.name })}><Trash2 size={15}/></button></div></div><div className="notes-stream-list notes-personal-note-list">{activePersonalView.notes.length ? activePersonalView.notes.map(note => <PersonalNoteCard key={note.id} notebook={activePersonalView.notebook} note={note} initialOpen={newlyCreatedNoteId === note.id} onChange={next => onPersonalNoteChange(activePersonalView.notebook.id, next)} onDelete={() => setDeleteTarget({ kind: 'note', notebookId: activePersonalView.notebook.id, noteId: note.id, label: note.title || '未命名笔记' })}/>) : <div className="notes-detail-placeholder"><NotebookPen size={34}/><strong>这个笔记本还是空的</strong><p>新建一条笔记，记录公式、思路或手写内容。</p><button type="button" onClick={() => openCreation('note', activePersonalView.notebook.id)}><Plus size={14}/>新建笔记</button></div>}</div></div>
              : <div className="notes-detail-placeholder"><NotebookPen size={34}/><strong>开始整理你的笔记</strong><p>可以把笔记放进题库，也可以新建独立笔记本。</p><div><button type="button" onClick={() => openCreation('notebook')}><Plus size={14}/>新建笔记本</button><button type="button" onClick={() => openCreation('note')}><Plus size={14}/>新建笔记</button></div></div>}
        </main>
      </div>
    </section>
    <button className="dashboard-question-dialog-close" type="button" aria-label="关闭我的笔记" data-dialog-initial-focus onClick={onClose}><X size={19}/></button>
    {creation && <div className="notes-create-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setCreation(null) }}><section className="notes-create-dialog" role="dialog" aria-modal="true" aria-labelledby="notes-create-title" onClick={event => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭" onClick={() => setCreation(null)}><X size={17}/></button><span className="modal-icon"><NotebookPen size={20}/></span><h2 id="notes-create-title">{creation.kind === 'notebook' ? '新建笔记本' : '新建笔记'}</h2><p>{creation.kind === 'notebook' ? '笔记本用于整理不绑定题库的独立笔记。' : `将在“${personalNotebooks.find(notebook => notebook.id === creation.notebookId)?.name || '我的笔记'}”中创建。`}</p>{creation.kind === 'note' && <label>所属笔记本<select value={creation.notebookId} onChange={event => setCreation({ kind: 'note', notebookId: event.target.value })}>{personalNotebooks.map(notebook => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}</select></label>}<label>{creation.kind === 'notebook' ? '笔记本名称' : '笔记标题'}<input autoFocus value={creationName} onChange={event => setCreationName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submitCreation() }} placeholder={creation.kind === 'notebook' ? '例如：数学公式整理' : '例如：待复习的重点'}/></label><button className="primary-button" type="button" disabled={!creationName.trim()} onClick={submitCreation}>{creation.kind === 'notebook' ? '创建笔记本' : '创建笔记'}</button></section></div>}
    {deleteTarget && <ConfirmDialog title={deleteTarget.kind === 'note' ? '删除这条笔记？' : '删除这个笔记本？'} description={deleteTarget.kind === 'note' ? `“${deleteTarget.label}”及其中的文字和手写内容将被删除。` : `“${deleteTarget.label}”及其中的全部笔记将被删除。`} confirmLabel="确认删除" onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)}/>}
  </div>
}
