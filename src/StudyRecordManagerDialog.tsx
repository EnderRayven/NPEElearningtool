import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, History, Plus, Save, Trash2, X } from 'lucide-react'
import { bankSubject } from './subjects'
import type { StudyActivity } from './studyActivity'
import {
  applyQuestionStudyRecordReplacements,
  localDateTimeTimestamp,
  localDateTimeValue,
  studyRecordTimelineForQuestion,
  type StudyRecordManagementResult,
} from './studyRecordManagement'
import type { QuestionBank, QuestionStatus } from './types'
import { useDialogFocus } from './useDialogFocus'
import { useModalScrollLock } from './useModalScrollLock'

interface Props {
  banks: QuestionBank[]
  activities: StudyActivity[]
  statuses: Record<string, QuestionStatus>
  activeBankId: string
  activeSectionId: string
  onClose: () => void
  onSave: (result: StudyRecordManagementResult, changedCount: number) => void
}

interface EditableRecord {
  id: string
  status: Exclude<QuestionStatus, 'none'>
  dateTime: string
}

interface EditableQuestionHistory {
  baselineStatus: QuestionStatus
  records: EditableRecord[]
}

function findInitialLocation(banks: QuestionBank[], activeBankId: string, activeSectionId: string) {
  const bank = banks.find(item => item.id === activeBankId) || banks[0]
  const chapter = bank?.chapters.find(item => item.sections.some(section => section.id === activeSectionId)) || bank?.chapters[0]
  const section = chapter?.sections.find(item => item.id === activeSectionId) || chapter?.sections[0]
  return { bankId: bank?.id || '', chapterId: chapter?.id || '', sectionId: section?.id || '' }
}

function isBinaryQuestion(questionType?: string) {
  return questionType === '完形填空' || questionType === '阅读理解 Part A' || questionType === '阅读理解 Part B'
}

function cloneHistories(histories: Record<string, EditableQuestionHistory>) {
  return Object.fromEntries(Object.entries(histories).map(([questionId, history]) => [questionId, {
    baselineStatus: history.baselineStatus,
    records: history.records.map(record => ({ ...record })),
  }]))
}

const pad2 = (value: number) => String(value).padStart(2, '0')

function dateTimeParts(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (match) return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  }
  const now = new Date()
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  }
}

function dateTimeFromParts(parts: ReturnType<typeof dateTimeParts>) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`
}

function RecordDateTimeEditor(props: {
  label: string
  value: string
  open: boolean
  onOpen: () => void
  onClose: () => void
  onChange: (value: string) => void
}) {
  const selected = dateTimeParts(props.value)
  const [viewMonth, setViewMonth] = useState(() => `${selected.year}-${pad2(selected.month)}`)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [panelPosition, setPanelPosition] = useState({ left: 0, top: 0 })

  useEffect(() => {
    if (props.open) setViewMonth(`${selected.year}-${pad2(selected.month)}`)
  }, [props.open, selected.year, selected.month])

  useLayoutEffect(() => {
    if (!props.open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const panelWidth = Math.min(520, window.innerWidth - 24)
    const panelHeight = 314
    const left = Math.max(12, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 12))
    const top = rect.bottom + panelHeight + 10 <= window.innerHeight
      ? rect.bottom + 7
      : Math.max(12, rect.top - panelHeight - 7)
    setPanelPosition({ left, top })
  }, [props.open])

  const [viewYear, viewMonthNumber] = viewMonth.split('-').map(Number)
  const leadingDays = (new Date(viewYear, viewMonthNumber - 1, 1).getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonthNumber, 0).getDate()
  const today = new Date()

  function changeMonth(offset: number) {
    const next = new Date(viewYear, viewMonthNumber - 1 + offset, 1)
    setViewMonth(`${next.getFullYear()}-${pad2(next.getMonth() + 1)}`)
  }

  function updatePart(part: 'hour' | 'minute' | 'second', value: number) {
    props.onChange(dateTimeFromParts({ ...selected, [part]: value }))
  }

  return <>
    <button ref={triggerRef} type="button" className={`record-manager-date-trigger${props.open ? ' open' : ''}`} aria-label={props.label} aria-expanded={props.open} onClick={props.open ? props.onClose : props.onOpen}>
      <CalendarDays size={14}/><span>{selected.year}/{pad2(selected.month)}/{pad2(selected.day)}</span><i/><Clock3 size={13}/><span>{pad2(selected.hour)}:{pad2(selected.minute)}:{pad2(selected.second)}</span>
    </button>
    {props.open && createPortal(<div className="record-manager-date-panel" role="group" aria-label={`${props.label}选择器`} style={panelPosition} onClick={event => event.stopPropagation()}>
      <div className="record-manager-calendar">
        <header>
          <button type="button" aria-label="上个月" onClick={() => changeMonth(-1)}><ChevronLeft size={15}/></button>
          <strong>{viewYear} 年 {viewMonthNumber} 月</strong>
          <button type="button" aria-label="下个月" onClick={() => changeMonth(1)}><ChevronRight size={15}/></button>
        </header>
        <div className="record-manager-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="record-manager-days">
          {Array.from({ length: leadingDays }, (_, index) => <span key={`empty-${index}`}/>)}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1
            const isSelected = selected.year === viewYear && selected.month === viewMonthNumber && selected.day === day
            const isToday = today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonthNumber && today.getDate() === day
            return <button type="button" key={day} className={`${isSelected ? 'selected' : ''}${isToday ? ' today' : ''}`} aria-label={`${viewYear} 年 ${viewMonthNumber} 月 ${day} 日`} onClick={() => props.onChange(dateTimeFromParts({ ...selected, year: viewYear, month: viewMonthNumber, day }))}>{day}</button>
          })}
        </div>
      </div>
      <div className="record-manager-time">
        <span>TIME</span>
        <strong><Clock3 size={15}/>具体时间</strong>
        <div>
          {([
            ['hour', '时', 24],
            ['minute', '分', 60],
            ['second', '秒', 60],
          ] as const).map(([part, label, count]) => <label key={part}>
            <select aria-label={label} value={selected[part]} onChange={event => updatePart(part, Number(event.target.value))}>
              {Array.from({ length: count }, (_, value) => <option key={value} value={value}>{pad2(value)}</option>)}
            </select>
            <span>{label}</span>
          </label>)}
        </div>
        <button type="button" className="record-manager-date-done" onClick={props.onClose}>完成</button>
      </div>
    </div>, document.body)}
  </>
}

export default function StudyRecordManagerDialog(props: Props) {
  const initialLocation = useMemo(() => findInitialLocation(props.banks, props.activeBankId, props.activeSectionId), [props.banks, props.activeBankId, props.activeSectionId])
  const [bankId, setBankId] = useState(initialLocation.bankId)
  const [chapterId, setChapterId] = useState(initialLocation.chapterId)
  const [sectionId, setSectionId] = useState(initialLocation.sectionId)
  const [histories, setHistories] = useState<Record<string, EditableQuestionHistory>>({})
  const [initialHistories, setInitialHistories] = useState<Record<string, EditableQuestionHistory>>({})
  const [openDateRecordId, setOpenDateRecordId] = useState('')
  const [message, setMessage] = useState('')
  const dialogRef = useDialogFocus<HTMLElement>(props.onClose)
  useModalScrollLock()

  const bank = props.banks.find(item => item.id === bankId) || props.banks[0]
  const chapter = bank?.chapters.find(item => item.id === chapterId) || bank?.chapters[0]
  const section = chapter?.sections.find(item => item.id === sectionId) || chapter?.sections[0]
  const questions = useMemo(() => [...(section?.questions || [])].sort((left, right) => left.number - right.number), [section])
  const binaryMode = questions.length > 0 && questions.every(question => isBinaryQuestion(question.type))
  const recordCount = questions.reduce((count, question) => count + (histories[question.id]?.records.length || 0), 0)

  useEffect(() => {
    const nextHistories = Object.fromEntries(questions.map(question => {
      const timeline = studyRecordTimelineForQuestion(props.activities, question.id)
      return [question.id, {
        baselineStatus: timeline.baselineStatus,
        records: timeline.records.map(record => ({
          id: record.id,
          status: record.status,
          dateTime: localDateTimeValue(record.updatedAt),
        })),
      }]
    }))
    setHistories(nextHistories)
    setInitialHistories(cloneHistories(nextHistories))
    setMessage('')
  }, [questions, props.activities])

  function selectBank(nextBankId: string) {
    const nextBank = props.banks.find(item => item.id === nextBankId)
    const nextChapter = nextBank?.chapters[0]
    setBankId(nextBankId)
    setChapterId(nextChapter?.id || '')
    setSectionId(nextChapter?.sections[0]?.id || '')
  }

  function selectChapter(nextChapterId: string) {
    const nextChapter = bank?.chapters.find(item => item.id === nextChapterId)
    setChapterId(nextChapterId)
    setSectionId(nextChapter?.sections[0]?.id || '')
  }

  function updateRecord(questionId: string, recordId: string, patch: Partial<EditableRecord>) {
    setHistories(previous => ({
      ...previous,
      [questionId]: {
        ...previous[questionId],
        records: previous[questionId].records.map(record => record.id === recordId ? { ...record, ...patch } : record),
      },
    }))
    setMessage('')
  }

  function addRecord(questionId: string) {
    setHistories(previous => {
      const history = previous[questionId]
      const latestTimestamp = history.records
        .map(record => localDateTimeTimestamp(record.dateTime))
        .filter((timestamp): timestamp is string => Boolean(timestamp))
        .map(timestamp => Date.parse(timestamp))
        .sort((left, right) => right - left)[0]
      const suggestedTime = new Date(Math.max(Date.now(), (latestTimestamp || 0) + 60_000))
      const latestStatus = history.records.at(-1)?.status
        || (history.baselineStatus !== 'none' ? history.baselineStatus : undefined)
        || 'proficient'
      return {
        ...previous,
        [questionId]: {
          ...history,
          records: [...history.records, {
            id: `new-${questionId}-${Date.now()}`,
            status: latestStatus,
            dateTime: localDateTimeValue(suggestedTime.toISOString()),
          }],
        },
      }
    })
    setMessage('')
  }

  function deleteRecord(questionId: string, recordId: string) {
    setHistories(previous => ({
      ...previous,
      [questionId]: {
        ...previous[questionId],
        records: previous[questionId].records.filter(record => record.id !== recordId),
      },
    }))
    setMessage('')
  }

  function save() {
    if (!bank || !chapter || !section) return
    try {
      const changedQuestions = questions.filter(question => JSON.stringify(histories[question.id]) !== JSON.stringify(initialHistories[question.id]))
      if (!changedQuestions.length) {
        setMessage('没有需要保存的修改')
        return
      }
      let changedRecordCount = 0
      const replacements = changedQuestions.map(question => {
        const history = histories[question.id]
        const initialHistory = initialHistories[question.id]
        changedRecordCount += Math.max(history.records.length, initialHistory.records.length)
        const records = history.records.map(record => {
          const updatedAt = localDateTimeTimestamp(record.dateTime)
          if (!updatedAt) throw new Error(`第 ${question.number} 题存在无效的日期或时间`)
          return { status: record.status, updatedAt }
        })
        if (new Set(records.map(record => record.updatedAt)).size !== records.length) {
          throw new Error(`第 ${question.number} 题存在相同的记录时间`)
        }
        return {
          questionId: question.id,
          bankId: bank.id,
          baselineStatus: history.baselineStatus,
          records,
          chapterId: chapter.id,
          sectionId: section.id,
          questionNumber: question.number,
          questionType: question.type,
          readingType: question.readingType,
          subject: bankSubject(bank),
          answerRevealed: true,
        }
      })
      const result = applyQuestionStudyRecordReplacements(props.activities, props.statuses, replacements)
      props.onSave(result, changedRecordCount)
      props.onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '学习记录保存失败')
    }
  }

  return <div className="modal-backdrop record-manager-backdrop" onClick={props.onClose}>
    <section ref={dialogRef} className="record-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="record-manager-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <header className="record-manager-header">
        <div className="record-manager-heading"><span><History size={20}/></span><div><small>STUDY HISTORY</small><h2 id="record-manager-title">学习记录管理</h2><p>按题目查看、补录和修改当前轮次的全部记录</p></div></div>
        <button className="modal-close" type="button" aria-label="关闭学习记录管理" data-dialog-initial-focus onClick={props.onClose}><X/></button>
      </header>

      <div className="record-manager-filters">
        <label><span>题库</span><select aria-label="记录题库" value={bank?.id || ''} onChange={event => selectBank(event.target.value)}>{props.banks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>章节</span><select aria-label="记录章节" value={chapter?.id || ''} onChange={event => selectChapter(event.target.value)}>{bank?.chapters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>小节</span><select aria-label="记录小节" value={section?.id || ''} onChange={event => setSectionId(event.target.value)}>{chapter?.sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>

      <div className="record-manager-summary">
        <div><History size={15}/><span>当前小节共 <strong>{questions.length}</strong> 道题、<strong>{recordCount}</strong> 条历史记录；每条记录均可修改状态和日期时间</span></div>
      </div>

      <div className="record-manager-question-list">
        {questions.map(question => {
          const history = histories[question.id] || { baselineStatus: 'none' as const, records: [] }
          const description = question.text.trim() || question.type || '图片题'
          return <section className="record-manager-question" key={question.id}>
            <header>
              <span className="record-manager-number">{String(question.number).padStart(2, '0')}</span>
              <div><strong>{description.slice(0, 72)}</strong><small>{history.records.length ? `共 ${history.records.length} 条记录` : '暂无记录'}</small></div>
              <button type="button" className="record-manager-add" aria-label={`为第 ${question.number} 题添加记录`} onClick={() => addRecord(question.id)}><Plus size={13}/>添加记录</button>
            </header>
            {history.records.length ? <div className="record-manager-history">
              {history.records.map((record, index) => {
                const recordOpenKey = `${question.id}:${record.id}`
                return <div className={`record-manager-history-row${openDateRecordId === recordOpenKey ? ' date-open' : ''}`} key={record.id}>
                <span className="record-manager-attempt">{history.baselineStatus === 'none' && index === 0 ? '首次记录' : `第 ${index + 1} 条`}</span>
                <select aria-label={`第 ${question.number} 题第 ${index + 1} 条记录状态`} value={record.status} onChange={event => updateRecord(question.id, record.id, { status: event.target.value as Exclude<QuestionStatus, 'none'> })}>
                  <option value="proficient">{binaryMode ? '正确' : '熟练'}</option>
                  {!binaryMode && <option value="vague">模糊</option>}
                  <option value="wrong">错误</option>
                </select>
                <RecordDateTimeEditor
                  label={`第 ${question.number} 题第 ${index + 1} 条记录日期时间`}
                  value={record.dateTime}
                  open={openDateRecordId === recordOpenKey}
                  onOpen={() => setOpenDateRecordId(recordOpenKey)}
                  onClose={() => setOpenDateRecordId('')}
                  onChange={dateTime => updateRecord(question.id, record.id, { dateTime })}
                />
                <button type="button" className="record-manager-delete" aria-label={`删除第 ${question.number} 题第 ${index + 1} 条记录`} title="删除这条记录" onClick={() => deleteRecord(question.id, record.id)}><Trash2 size={14}/></button>
              </div>})}
            </div> : <div className="record-manager-no-history">尚无记录，可点击“添加记录”进行补录</div>}
          </section>
        })}
        {!questions.length && <div className="record-manager-empty">当前小节没有题目</div>}
      </div>

      <footer className="record-manager-footer">
        <p>{message || '保存后会按新的日期时间重新排列记录，并自动修正后续状态与复习关系。'}</p>
        <div><button type="button" onClick={props.onClose}>取消</button><button type="button" className="record-manager-save" onClick={save}><Save size={14}/>保存记录</button></div>
      </footer>
    </section>
  </div>
}
