import { useEffect, useMemo, useState } from 'react'
import { FileImage, FileText, X } from 'lucide-react'
import AssetGallery from './AssetGallery'
import { getAssetFiles } from './assets'
import { safeFolderName } from './workspace'
import type { Question, QuestionBank, QuestionStatus } from './types'

export interface ExportJob {
  title: string
  subtitle: string
  questions: Question[]
  perPage: 1 | 2
  statuses: Record<string, QuestionStatus>
  scope: ExportScope
  questionContext: Record<string, ExportQuestionContext>
}

export type ExportScope = 'bank' | 'chapter' | 'section'
export interface ExportQuestionContext { chapterName: string; sectionName: string }
export interface ExportQuestionEntry extends ExportQuestionContext {
  question: Question
  chapterId: string
  sectionId: string
}

interface Props {
  banks: QuestionBank[]
  statuses: Record<string, QuestionStatus>
  defaultBankId: string
  defaultSectionId: string
  onClose: () => void
  onPdf: (job: ExportJob) => void
  onNotice: (message: string) => void
}

interface WritableFileHandle { createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }
interface DirectoryHandle {
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<DirectoryHandle>
  getFileHandle(name: string, options: { create: boolean }): Promise<WritableFileHandle>
}
type ExportStatusFilter = QuestionStatus | 'all' | 'review'

const statusOptions: Array<{ value: ExportStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' }, { value: 'review', label: '错题和模糊' }, { value: 'none', label: '未标记' }, { value: 'proficient', label: '熟练' }, { value: 'vague', label: '模糊' }, { value: 'wrong', label: '错题' }
]
const exportStatusLabels: Record<QuestionStatus, string> = { none: '未标记', proficient: '熟练', vague: '模糊', wrong: '错题' }
export const exportScopeOptions: Array<{ value: ExportScope; label: string; description: string }> = [
  { value: 'bank', label: '整库', description: '整个题库' },
  { value: 'chapter', label: '整章', description: '当前章节' },
  { value: 'section', label: '整节', description: '当前小节' },
]

export function splitPages(questions: Question[], perPage: number) {
  return Array.from({ length: Math.ceil(questions.length / perPage) }, (_, index) => questions.slice(index * perPage, (index + 1) * perPage))
}

export function filterQuestionsForExport(questions: Question[], status: ExportStatusFilter, statuses: Record<string, QuestionStatus>) {
  return questions.filter(question => {
    const questionStatus = statuses[question.id] || 'none'
    return status === 'all' || (status === 'review' ? questionStatus === 'wrong' || questionStatus === 'vague' : questionStatus === status)
  })
}

export function exportEntriesForScope(bank: QuestionBank | undefined, scope: ExportScope, chapterId: string, sectionId: string): ExportQuestionEntry[] {
  if (!bank) return []
  const chapters = scope === 'bank'
    ? bank.chapters
    : bank.chapters.filter(chapter => chapter.id === chapterId)
  return chapters.flatMap(chapter => {
    const sections = scope === 'section'
      ? chapter.sections.filter(section => section.id === sectionId)
      : chapter.sections
    return sections.flatMap(section => section.questions.map(question => ({
      question,
      chapterId: chapter.id,
      chapterName: chapter.name,
      sectionId: section.id,
      sectionName: section.name,
    })))
  })
}

function safeName(value: string) { return value.replace(/[\\/:*?"<>|]/g, '-').trim() || '题库导出' }
export function dateFolderName(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
export function originalAssetName(key: string) {
  const name = decodeURIComponent(key.replaceAll('\\', '/').split('/').pop() || '题目图片')
  return safeName(name.replace(/^\d+-(?=Q-)/i, ''))
}
export function imageExportFolderName(bankName: string, chapterName: string, sectionName: string, date = new Date()) {
  return safeFolderName([dateFolderName(date), bankName || '题库', chapterName || '章节', sectionName || '小节'].join('-'))
}
export function imageExportRootFolderName(bankName: string, scope: ExportScope, chapterName = '', date = new Date()) {
  const scopeName = scope === 'bank' ? '整库' : chapterName || '整章'
  return safeFolderName([dateFolderName(date), bankName || '题库', scopeName].join('-'))
}
function fileNameFromUrl(url: string, questionNumber: number) {
  try {
    const parsed = new URL(url, window.location.href)
    const path = parsed.searchParams.get('path') || parsed.pathname
    const sourceName = decodeURIComponent(path.replaceAll('\\', '/').split('/').pop() || '')
    if (sourceName && /\.[a-z0-9]+$/i.test(sourceName)) return safeName(sourceName)
  } catch { /* Use a stable fallback below. */ }
  return `Q-${String(questionNumber).padStart(2, '0')}.1.png`
}

function nextFrame() { return new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
function rejectAfter(ms: number, message: string) { return new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)) }

export async function waitForExportContent(container: HTMLElement, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (container.querySelector('[data-export-asset-state="loading"]')) {
    if (Date.now() >= deadline) throw new Error('题目图片加载超时，请检查题库图片后重试')
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  if (container.querySelector('[data-export-asset-state="error"]')) throw new Error('题目图片读取失败，请重新连接题库文件夹后重试')

  const images = Array.from(container.querySelectorAll('img'))
  const loadImages = Promise.all(images.map(async image => {
    if (!image.complete) await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => reject(new Error(`图片加载失败：${image.alt || '题目图片'}`)), { once: true })
    })
    if (!image.naturalWidth) throw new Error(`图片加载失败：${image.alt || '题目图片'}`)
    if (image.decode) await image.decode().catch(() => { throw new Error(`图片解码失败：${image.alt || '题目图片'}`) })
  }))
  await Promise.race([loadImages, rejectAfter(Math.max(1, deadline - Date.now()), '题目图片加载超时，请检查题库图片后重试')])
  if (document.fonts?.ready) await Promise.race([document.fonts.ready, rejectAfter(Math.max(1, deadline - Date.now()), '页面字体加载超时，请重试')])
  await nextFrame()
  await nextFrame()
}

export function ExportPage({ questions, statuses = {}, questionContext = {}, pageNumber, showType = true }: { questions: Question[]; statuses?: Record<string, QuestionStatus>; questionContext?: Record<string, ExportQuestionContext>; pageNumber: number; showType?: boolean }) {
  return <article className={`export-page${questions.length > 1 ? ' export-page-two-up' : ''}`}>
    {questions.map(question => {
      const text = (question.type === '图片题' || question.imageUrl || question.imageKeys?.length) && question.text === `第 ${question.number} 题` ? '' : question.text
      const questionStatus = statuses[question.id] || 'none'
      const context = questionContext[question.id]
      return <section className="export-question" key={question.id}>
        <div className="export-question-title"><strong>{String(question.number).padStart(2, '0')}</strong>{context && <span className="export-question-context">{context.chapterName} · {context.sectionName}</span>}<span className={`export-mastery ${questionStatus}`}>{exportStatusLabels[questionStatus]}</span>{showType && question.type && <span>{question.type}</span>}</div>
        {text && <p>{text}</p>}
        <AssetGallery keys={question.imageKeys} urls={question.imageUrl ? [question.imageUrl] : []} alt="题目配图" trackExportLoading/>
        {question.options?.map(option => <p className="export-option" key={option}>{option}</p>)}
      </section>
    })}
    <footer>第 {pageNumber} 页</footer>
  </article>
}

export default function ExportDialog({ banks, statuses, defaultBankId, defaultSectionId, onClose, onPdf, onNotice }: Props) {
  const [bankId, setBankId] = useState(defaultBankId)
  const initialBank = banks.find(bank => bank.id === defaultBankId) || banks[0]
  const initialChapter = initialBank?.chapters.find(chapter => chapter.sections.some(section => section.id === defaultSectionId)) || initialBank?.chapters[0]
  const [chapterId, setChapterId] = useState(initialChapter?.id || '')
  const [sectionId, setSectionId] = useState(defaultSectionId || initialChapter?.sections[0]?.id || '')
  const [scope, setScope] = useState<ExportScope>('section')
  const [status, setStatus] = useState<ExportStatusFilter>('all')
  const [perPage, setPerPage] = useState<1 | 2>(2)
  const [exporting, setExporting] = useState(false)

  const bank = banks.find(item => item.id === bankId) || banks[0]
  const chapter = bank?.chapters.find(item => item.id === chapterId) || bank?.chapters[0]
  const section = chapter?.sections.find(item => item.id === sectionId) || chapter?.sections[0]

  useEffect(() => {
    if (!bank) return
    if (!bank.chapters.some(item => item.id === chapterId)) { setChapterId(bank.chapters[0]?.id || ''); setSectionId(bank.chapters[0]?.sections[0]?.id || '') }
  }, [bankId, bank, chapterId])
  useEffect(() => { if (chapter && !chapter.sections.some(item => item.id === sectionId)) setSectionId(chapter.sections[0]?.id || '') }, [chapter, sectionId])

  const exportEntries = useMemo(() => exportEntriesForScope(bank, scope, chapter?.id || '', section?.id || ''), [bank, scope, chapter, section])
  const sourceQuestions = useMemo(() => exportEntries.map(entry => entry.question), [exportEntries])
  const questions = useMemo(() => filterQuestionsForExport(sourceQuestions, status, statuses), [sourceQuestions, status, statuses])
  const pages = useMemo(() => splitPages(questions, perPage), [questions, perPage])
  const counts = sourceQuestions.reduce((result, question) => { result[statuses[question.id] || 'none']++; return result }, { none: 0, proficient: 0, vague: 0, wrong: 0 })
  const questionContext = useMemo(() => Object.fromEntries(exportEntries.map(entry => [entry.question.id, { chapterName: entry.chapterName, sectionName: entry.sectionName }])), [exportEntries])
  const scopeLabel = exportScopeOptions.find(option => option.value === scope)?.label || '整节'
  const job: ExportJob = {
    title: bank?.name || '题库导出',
    subtitle: scope === 'bank' ? `${bank?.name || ''} · 整个题库` : scope === 'chapter' ? `${bank?.name || ''} · ${chapter?.name || ''}（整章）` : `${chapter?.name || ''} · ${section?.name || ''}`,
    questions,
    perPage,
    statuses,
    scope,
    questionContext: scope === 'section' ? {} : questionContext,
  }

  async function exportImages() {
    if (!questions.length) { onNotice('当前条件下没有可导出的题目'); return }
    const picker = (window as Window & { showDirectoryPicker?: (options?: { id?: string; mode?: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker
    if (!picker) { onNotice('当前浏览器不支持复制到文件夹，请使用最新版 Chrome 或 Edge'); return }
    let directory: DirectoryHandle
    try { directory = await picker.call(window, { id: 'npee-question-image-export', mode: 'readwrite' }) } catch (error) {
      if ((error as DOMException).name === 'AbortError') return
      onNotice(error instanceof Error ? error.message : '无法打开目标文件夹'); return
    }
    setExporting(true)
    try {
      const folderName = scope === 'section'
        ? imageExportFolderName(bank?.name || '', chapter?.name || '', section?.name || '')
        : imageExportRootFolderName(bank?.name || '', scope, chapter?.name || '')
      const rootDirectory = await directory.getDirectoryHandle(folderName, { create: true })
      const writtenNamesByFolder = new Map<string, Set<string>>()
      let skippedQuestions = 0
      for (const entry of exportEntries.filter(item => questions.some(question => question.id === item.question.id))) {
        const question = entry.question
        let targetDirectory = rootDirectory
        let folderKey = ''
        if (scope === 'chapter') {
          targetDirectory = await rootDirectory.getDirectoryHandle(safeFolderName(entry.sectionName || '小节'), { create: true })
          folderKey = entry.sectionName
        } else if (scope === 'bank') {
          const chapterDirectory = await rootDirectory.getDirectoryHandle(safeFolderName(entry.chapterName || '章节'), { create: true })
          targetDirectory = await chapterDirectory.getDirectoryHandle(safeFolderName(entry.sectionName || '小节'), { create: true })
          folderKey = `${entry.chapterName}/${entry.sectionName}`
        }
        const writtenNames = writtenNamesByFolder.get(folderKey) || new Set<string>()
        writtenNamesByFolder.set(folderKey, writtenNames)
        const assets = await getAssetFiles(question.imageKeys || [])
        const sources: Array<{ name: string; blob: Blob }> = assets.map(asset => ({ name: originalAssetName(asset.key), blob: asset.blob }))
        if (!sources.length && question.imageUrl) {
          const response = await fetch(question.imageUrl)
          if (!response.ok) throw new Error(`第 ${question.number} 题图片读取失败`)
          sources.push({ name: fileNameFromUrl(question.imageUrl, question.number), blob: await response.blob() })
        }
        if (!sources.length) { skippedQuestions++; continue }
        for (const source of sources) {
          let filename = source.name
          if (writtenNames.has(filename)) {
            const prefix = String(question.number).padStart(2, '0')
            filename = `${prefix}-${source.name}`
            let duplicate = 2
            while (writtenNames.has(filename)) filename = `${prefix}-${duplicate++}-${source.name}`
          }
          writtenNames.add(filename)
          const file = await targetDirectory.getFileHandle(filename, { create: true })
          const writable = await file.createWritable(); await writable.write(source.blob); await writable.close()
        }
      }
      const writtenCount = Array.from(writtenNamesByFolder.values()).reduce((total, names) => total + names.size, 0)
      onNotice(`已复制 ${writtenCount} 张原图到 ${folderName}${skippedQuestions ? `，跳过 ${skippedQuestions} 道无图片题目` : ''}`); onClose()
    } catch (error) { onNotice(error instanceof Error ? error.message : '题目图片复制失败') } finally { setExporting(false) }
  }

  return <div className="modal-backdrop export-backdrop" onClick={onClose}>
    <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={event => event.stopPropagation()}>
      <button className="modal-close" aria-label="关闭" onClick={onClose}><X/></button>
      <h2 id="export-title">导出题目</h2><p>选择范围、状态和页面布局</p>
      <div className="export-scope" role="tablist" aria-label="导出范围">
        {exportScopeOptions.map(option => <button key={option.value} role="tab" aria-selected={scope === option.value} className={scope === option.value ? 'active' : ''} onClick={() => setScope(option.value)}><strong>{option.label}</strong><small>{option.description}</small></button>)}
      </div>
      <div className="export-form-grid">
        <label>题库<select value={bank?.id || ''} onChange={event => setBankId(event.target.value)}>{banks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>章<select disabled={scope === 'bank'} value={chapter?.id || ''} onChange={event => { setChapterId(event.target.value); const next = bank?.chapters.find(item => item.id === event.target.value); setSectionId(next?.sections[0]?.id || '') }}>{bank?.chapters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="full">节<select disabled={scope !== 'section'} value={section?.id || ''} onChange={event => setSectionId(event.target.value)}>{chapter?.sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <div className="export-stats"><div><span>{scopeLabel}题目</span><strong>{sourceQuestions.length}</strong></div><div className="green-stat"><span>熟练</span><strong>{counts.proficient}</strong></div><div className="yellow-stat"><span>模糊</span><strong>{counts.vague}</strong></div><div className="red-stat"><span>错题</span><strong>{counts.wrong}</strong></div></div>
      <div className="export-options">
        <label>状态<select value={status} onChange={event => setStatus(event.target.value as ExportStatusFilter)}>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>布局<select value={perPage} onChange={event => setPerPage(Number(event.target.value) as 1 | 2)}><option value="1">每页 1 题</option><option value="2">每页 2 题</option></select></label>
      </div>
      <div className="export-progress"><span>符合条件</span><strong>{questions.length} 题 / {pages.length} 页</strong></div>
      <div className="export-actions"><button disabled={!questions.length || exporting} onClick={() => onPdf(job)}><FileText/>导出 PDF</button><button disabled={!questions.length || exporting} onClick={exportImages}><FileImage/>{exporting ? '正在复制…' : '复制原图到文件夹'}</button></div>
      {!questions.length && <p className="export-empty">暂无符合条件的题目</p>}
    </section>
  </div>
}
