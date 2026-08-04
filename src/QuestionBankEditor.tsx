import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardPaste, Crop, FileImage, FileText, RotateCw, Save, Square, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { getAssetBlobs, getAssetRevision, subscribeAssetChanges, type ImageKind } from './assets'
import { orderedQuestionEntriesForBank } from './bankManagement'
import { questionImageSources, questionWithImageSources, type QuestionImageSource } from './questionImages'
import type { Question, QuestionBank, Section } from './types'
import { useDialogFocus } from './useDialogFocus'
import { useModalScrollLock } from './useModalScrollLock'

GlobalWorkerOptions.workerSrc = pdfWorker

export interface QuestionImageChange {
  kind: ImageKind
  key: string
  file: File
  index: number
  source?: QuestionImageSource
}

export interface QuestionImageDelete {
  kind: ImageKind
  index: number
  source: QuestionImageSource
}

export interface QuestionBankEditorSave {
  bankId: string
  questionId: string
  question: Question
  imageChanges: QuestionImageChange[]
  imageDeletes: QuestionImageDelete[]
}

interface Props {
  banks: QuestionBank[]
  activeBankId: string
  activeQuestionId?: string
  onClose: () => void
  onSave: (payload: QuestionBankEditorSave) => Promise<Question | void> | Question | void
}

interface CropSelection { x: number; y: number; width: number; height: number }
type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
interface CropInteraction { mode: 'draw' | 'move' | 'resize'; start: { x: number; y: number }; selection: CropSelection; handle?: CropHandle }
type EditorTool = 'crop' | 'fill'
type PendingEditorAction = { type: 'close' } | { type: 'question'; questionId: string }
interface PendingImage { key: string; file: File; url: string; index: number; source?: QuestionImageSource }
type ImageSource = QuestionImageSource

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const MIN_CROP_ZOOM = 1
const MAX_CROP_ZOOM = 6
const CROP_ZOOM_STEP = 0.25

function cloneQuestion(question: Question): Question {
  return {
    ...question,
    options: question.options ? [...question.options] : undefined,
    imageUrls: question.imageUrls ? [...question.imageUrls] : undefined,
    answerImageUrls: question.answerImageUrls ? [...question.answerImageUrls] : undefined,
    imageKeys: question.imageKeys ? [...question.imageKeys] : undefined,
    answerImageKeys: question.answerImageKeys ? [...question.answerImageKeys] : undefined,
  }
}

function replaceImageSource(question: Question, kind: ImageKind, index: number, key: string): Question {
  const sources = questionImageSources(question, kind)
  const nextSources = index < sources.length ? sources.map((source, sourceIndex) => sourceIndex === index ? { key } : source) : [...sources, { key }]
  return questionWithImageSources(question, kind, nextSources)
}

function extensionFor(type: string) {
  if (type.includes('jpeg')) return 'jpg'
  if (type.includes('webp')) return 'webp'
  return 'png'
}

function imageSourceIdentity(source: QuestionImageSource) {
  return source.key ? `key:${source.key}` : `url:${source.url || ''}`
}

function ImageSourcePreview({ sources: imageSources, pending, alt, onSelect, onDelete }: { sources: ImageSource[]; pending: PendingImage[]; alt: string; onSelect?: (index: number) => void; onDelete?: (index: number) => void }) {
  const [sources, setSources] = useState<Array<string | null>>(() => imageSources.map((source, index) => pending.find(item => item.index === index)?.url || source.url || null))
  const assetRevision = useSyncExternalStore(subscribeAssetChanges, getAssetRevision, getAssetRevision)
  const sourceSignature = imageSources.map(source => `${source.key || ''}:${source.url || ''}`).join('\u0000')
  const pendingSignature = pending.map(item => `${item.index}:${item.url}`).join('\u0000')

  useEffect(() => {
    let disposed = false
    let objectUrls: string[] = []
    const directSources = imageSources.map((source, index) => pending.find(item => item.index === index)?.url || source.url || null)
    setSources(directSources)
    const keyEntries = imageSources.map((source, index) => ({ source, index })).filter(item => Boolean(item.source.key)) as Array<{ source: ImageSource & { key: string }; index: number }>
    if (!keyEntries.length) return () => { disposed = true }
    Promise.all(keyEntries.map(({ source }) => getAssetBlobs([source.key])))
      .then(results => {
        if (disposed) return
        const resolved = [...directSources]
        results.forEach((blobs, resultIndex) => {
          const blob = blobs[0]
          if (!blob) return
          const objectUrl = URL.createObjectURL(blob)
          objectUrls.push(objectUrl)
          resolved[keyEntries[resultIndex].index] = objectUrl
        })
        setSources(resolved)
      })
      .catch(() => {})
    return () => { disposed = true; objectUrls.forEach(URL.revokeObjectURL) }
  }, [assetRevision, pendingSignature, sourceSignature])

  if (!imageSources.length) return <div className="editor-image-empty">暂无图片</div>
  return <div className="editor-image-stack">{imageSources.map((_, index) => {
    const source = sources[index]
    const content = source ? <img src={source} alt={`${alt}${imageSources.length > 1 ? ` ${index + 1}` : ''}`} draggable={false}/> : <span className="editor-image-missing">第 {index + 1} 张图片暂不可用</span>
    const preview = onSelect ? <button type="button" className="editor-image-thumb" onClick={() => onSelect(index)} title={`编辑第 ${index + 1} 张${alt}`}>{content}</button> : <div className="editor-image-thumb editor-image-thumb-static">{content}</div>
    return <div className="editor-image-thumb-wrap" key={`${source || 'missing'}-${index}`}>{preview}{onDelete && <button type="button" className="editor-image-delete" onClick={event => { event.stopPropagation(); onDelete(index) }} aria-label={`删除第 ${index + 1} 张${alt}`} title={`删除第 ${index + 1} 张${alt}`}><Trash2 size={13}/></button>}</div>
  })}</div>
}

function imageChangeKey(bankId: string, questionId: string, kind: ImageKind) {
  return `editor/${bankId}/${questionId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
}

export default function QuestionBankEditor({ banks, activeBankId, activeQuestionId, onClose, onSave }: Props) {
  useModalScrollLock()
  const [selectedBankId, setSelectedBankId] = useState(activeBankId)
  const selectedBank = banks.find(bank => bank.id === selectedBankId) || banks[0]
  const entries = useMemo(() => selectedBank ? orderedQuestionEntriesForBank(selectedBank) : [], [selectedBank])
  const [selectedQuestionId, setSelectedQuestionId] = useState(activeQuestionId || entries[0]?.question.id || '')
  const selectedEntry = entries.find(entry => entry.question.id === selectedQuestionId) || entries[0]
  const selectedQuestion = selectedEntry?.question
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Question | null>(() => selectedQuestion ? cloneQuestion(selectedQuestion) : null)
  const [savedQuestion, setSavedQuestion] = useState<Question | null>(() => selectedQuestion ? cloneQuestion(selectedQuestion) : null)
  const [targetKind, setTargetKind] = useState<ImageKind>('question')
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [pdfPageNumber, setPdfPageNumber] = useState(1)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [pdfRendering, setPdfRendering] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [cropSelection, setCropSelection] = useState<CropSelection>({ x: 0, y: 0, width: 1, height: 1 })
  const [fillSelection, setFillSelection] = useState<CropSelection | null>(null)
  const [editorTool, setEditorTool] = useState<EditorTool>('crop')
  const [fillColor, setFillColor] = useState('#ffffff')
  const [pendingImages, setPendingImages] = useState<Partial<Record<ImageKind, PendingImage[]>>>({})
  const [imageDeletes, setImageDeletes] = useState<QuestionImageDelete[]>([])
  const [editingImageIndex, setEditingImageIndex] = useState(0)
  const [imageApplyMode, setImageApplyMode] = useState<'replace' | 'append'>('replace')
  const [questionNavCollapsed, setQuestionNavCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingEditorAction, setPendingEditorAction] = useState<PendingEditorAction | null>(null)
  const [message, setMessage] = useState('')
  const [cropInteraction, setCropInteraction] = useState<CropInteraction | null>(null)
  const [cropZoom, setCropZoom] = useState(MIN_CROP_ZOOM)
  const [cropSurfaceSize, setCropSurfaceSize] = useState({ width: 0, height: 0 })
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(() => new Set(selectedEntry ? [selectedEntry.chapterId] : entries[0] ? [entries[0].chapterId] : []))
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => new Set(selectedEntry ? [selectedEntry.sectionId] : entries[0] ? [entries[0].sectionId] : []))
  const sourceImageRef = useRef<HTMLImageElement>(null)
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const cropAreaRef = useRef<HTMLDivElement>(null)
  const cropSurfaceRef = useRef<HTMLDivElement>(null)
  const sourceUrlRef = useRef('')
  const fullSelection: CropSelection = { x: 0, y: 0, width: 1, height: 1 }

  function activeSelection() {
    return editorTool === 'fill' ? fillSelection : cropSelection
  }

  function updateActiveSelection(selection: CropSelection) {
    if (editorTool === 'fill') setFillSelection(selection)
    else setCropSelection(selection)
  }

  function resetActiveSelection() {
    if (editorTool === 'fill') setFillSelection(null)
    else setCropSelection(fullSelection)
  }

  function updateCropSurfaceSize() {
    const area = cropAreaRef.current
    const image = sourceImageRef.current
    const canvas = pdfCanvasRef.current
    if (!area) return
    const sourceWidth = pdfUrl ? Number.parseFloat(canvas?.style.width || '0') : image?.naturalWidth || 0
    const sourceHeight = pdfUrl ? Number.parseFloat(canvas?.style.height || '0') : image?.naturalHeight || 0
    if (!sourceWidth || !sourceHeight) return
    const fitScale = Math.min(1, area.clientWidth / sourceWidth, 510 / sourceHeight)
    const width = Math.max(1, Math.floor(sourceWidth * fitScale))
    const height = Math.max(1, Math.floor(sourceHeight * fitScale))
    setCropSurfaceSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
  }

  function resetEditorSelections() {
    setCropSelection(fullSelection)
    setFillSelection(null)
    setEditorTool('crop')
    setCropZoom(MIN_CROP_ZOOM)
    window.requestAnimationFrame(() => cropAreaRef.current?.scrollTo({ left: 0, top: 0 }))
  }

  function selectEditorTool(tool: EditorTool) {
    setEditorTool(tool)
    if (tool === 'crop') setFillSelection(null)
  }

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return entries
    return entries.filter(entry => `${entry.question.number} ${entry.question.text} ${entry.sectionName} ${entry.chapterName}`.toLowerCase().includes(query))
  }, [entries, search])

  useEffect(() => {
    if (!selectedBank) return
    const nextQuestionId = entries.some(entry => entry.question.id === selectedQuestionId)
      ? selectedQuestionId
      : entries[0]?.question.id || ''
    setSelectedQuestionId(nextQuestionId)
  }, [selectedBank, entries, selectedQuestionId])

  useEffect(() => {
    if (!selectedEntry) return
    setExpandedChapterIds(previous => previous.has(selectedEntry.chapterId) ? previous : new Set(previous).add(selectedEntry.chapterId))
    setExpandedSectionIds(previous => previous.has(selectedEntry.sectionId) ? previous : new Set(previous).add(selectedEntry.sectionId))
  }, [selectedEntry?.chapterId, selectedEntry?.sectionId])

  useEffect(() => {
    setDraft(selectedQuestion ? cloneQuestion(selectedQuestion) : null)
    setSavedQuestion(selectedQuestion ? cloneQuestion(selectedQuestion) : null)
    setPendingImages({})
    setImageDeletes([])
    setEditingImageIndex(0)
    setImageApplyMode('replace')
    resetEditorSelections()
    setSourceFile(null)
    setPdfUrl(current => { if (current) URL.revokeObjectURL(current); return '' })
    setSourceUrl(current => { if (current) URL.revokeObjectURL(current); return '' })
    setMessage('')
  }, [selectedQuestion?.id])

  useEffect(() => {
    sourceUrlRef.current = sourceUrl
    return () => { if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current) }
  }, [sourceUrl])

  useEffect(() => {
    if (!pdfUrl) {
      setPdfDocument(null)
      setPdfPageCount(0)
      setPdfPageNumber(1)
      setPdfRendering(false)
      setPdfError('')
      return
    }
    let disposed = false
    setPdfDocument(null)
    setPdfPageCount(0)
    setPdfPageNumber(1)
    setPdfRendering(true)
    setPdfError('')
    const loadingTask = getDocument({ url: pdfUrl })
    loadingTask.promise.then(documentProxy => {
      if (disposed) return
      setPdfDocument(documentProxy)
      setPdfPageCount(documentProxy.numPages)
      setPdfRendering(false)
    }).catch(error => {
      if (disposed) return
      setPdfRendering(false)
      setPdfError(error instanceof Error ? error.message : 'PDF 加载失败')
    })
    return () => { disposed = true; void loadingTask.destroy() }
  }, [pdfUrl])

  useEffect(() => {
    if (!pdfDocument || !pdfCanvasRef.current) return
    let disposed = false
    setPdfRendering(true)
    setPdfError('')
    pdfDocument.getPage(pdfPageNumber).then(page => {
      if (disposed || !pdfCanvasRef.current) return
      const canvas = pdfCanvasRef.current
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法创建 PDF 画布')
      const baseViewport = page.getViewport({ scale: 1 })
      const availableWidth = Math.max(320, cropAreaRef.current?.parentElement?.clientWidth || 680)
      const displayScale = Math.min(1.6, availableWidth / baseViewport.width, 480 / baseViewport.height)
      const viewport = page.getViewport({ scale: displayScale })
      const deviceScale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(viewport.width * deviceScale))
      canvas.height = Math.max(1, Math.floor(viewport.height * deviceScale))
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      context.clearRect(0, 0, canvas.width, canvas.height)
      return page.render({ canvas, canvasContext: context, viewport, transform: deviceScale === 1 ? undefined : [deviceScale, 0, 0, deviceScale, 0, 0] }).promise
    }).then(() => {
      if (disposed) return
      resetEditorSelections()
      setPdfRendering(false)
    }).catch(error => {
      if (disposed) return
      setPdfRendering(false)
      setPdfError(error instanceof Error ? error.message : 'PDF 页面渲染失败')
    })
    return () => { disposed = true }
  }, [pdfDocument, pdfPageNumber])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 2600)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    const area = cropAreaRef.current
    if (!area) {
      setCropSurfaceSize({ width: 0, height: 0 })
      return
    }
    const frame = window.requestAnimationFrame(updateCropSurfaceSize)
    const observer = new ResizeObserver(updateCropSurfaceSize)
    observer.observe(area)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [sourceUrl, pdfUrl, pdfPageNumber, pdfRendering])

  function setSource(file: File) {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setSourceUrl('')
      setSourceFile(null)
      setPdfUrl(current => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(file) })
      resetEditorSelections()
      setMessage('PDF 已载入。切换到目标页后，可直接在页面上框选并裁剪。')
      return
    }
    if (!file.type.startsWith('image/')) { setMessage('请选择 PNG、JPG、WEBP 图片或 PDF 文件'); return }
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl('') }
    setSourceFile(file)
    setSourceUrl(URL.createObjectURL(file))
    resetEditorSelections()
    setMessage('已载入图片，可拖动框选需要保留的区域。')
  }

  async function pasteClipboardImage() {
    try {
      if (!navigator.clipboard?.read) throw new Error('当前浏览器不支持读取剪贴板图片')
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find(value => value.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        setSource(new File([blob], `clipboard-${Date.now()}.${extensionFor(type)}`, { type }))
        return
      }
      throw new Error('剪贴板中没有图片，请先在 PDF 预览中复制截图')
    } catch (error) { setMessage(error instanceof Error ? error.message : '读取剪贴板失败') }
  }

  function loadExistingImage(kind: ImageKind, index = 0) {
    if (!draft) return
    const sources = questionImageSources(draft, kind)
    if (!sources.length) { setMessage('该位置还没有图片'); return }
    const source = sources[index]
    if (!source) { setMessage('找不到这张图片，请重新导入原图'); return }
    setTargetKind(kind)
    setEditingImageIndex(index)
    setImageApplyMode('replace')
    resetEditorSelections()
    setPdfUrl(current => { if (current) URL.revokeObjectURL(current); return '' })
    if (source.url) {
      setSourceFile(null)
      setSourceUrl(source.url)
      setCropSelection({ x: 0, y: 0, width: 1, height: 1 })
      setMessage('已载入现有图片。裁剪后保存即可替换。')
      return
    }
    getAssetBlobs([source.key!]).then(blobs => {
      if (!blobs[0]) { setMessage('找不到这张图片，请重新导入原图'); return }
      const blob = blobs[0]
      setSourceFile(new File([blob], `${kind}-${Date.now()}.png`, { type: blob.type || 'image/png' }))
      setSourceUrl(URL.createObjectURL(blob))
      setCropSelection({ x: 0, y: 0, width: 1, height: 1 })
      setMessage('已载入现有图片。裁剪后保存即可替换。')
    }).catch(() => setMessage('读取现有图片失败'))
  }

  function prepareImageAddition(kind: ImageKind) {
    if (!draft) return
    setTargetKind(kind)
    setImageApplyMode('append')
    setEditingImageIndex(questionImageSources(draft, kind).length)
    resetEditorSelections()
    setPdfUrl(current => { if (current) URL.revokeObjectURL(current); return '' })
    setSourceFile(null)
    setSourceUrl('')
    setMessage(`请导入图片、PDF 或粘贴截图，完成后将添加到${kind === 'question' ? '题目图片' : '解析图片'}末尾`)
  }

  function selectTargetKind(kind: ImageKind) {
    if (!draft) return
    const count = questionImageSources(draft, kind).length
    setTargetKind(kind)
    setEditingImageIndex(previous => count ? Math.min(previous, count - 1) : 0)
    if (!count) setImageApplyMode('append')
  }

  async function rotateSource() {
    const image = sourceImageRef.current
    if (!image || !image.naturalWidth || !image.naturalHeight) return
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalHeight
    canvas.height = image.naturalWidth
    const context = canvas.getContext('2d')
    if (!context) return
    context.translate(canvas.width, 0)
    context.rotate(Math.PI / 2)
    context.drawImage(image, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) { setMessage('旋转图片失败'); return }
    setSource(new File([blob], `rotated-${Date.now()}.png`, { type: 'image/png' }))
  }

  function pointerPosition(event: React.PointerEvent) {
    const target = pdfUrl ? pdfCanvasRef.current : sourceImageRef.current
    if (!target) return null
    const rect = target.getBoundingClientRect()
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) }
  }

  function startCropInteraction(event: React.PointerEvent, mode: CropInteraction['mode'], handle?: CropHandle) {
    const point = pointerPosition(event)
    if (!point) return
    cropSurfaceRef.current?.setPointerCapture(event.pointerId)
    setCropInteraction({ mode, handle, start: point, selection: activeSelection() || fullSelection })
    if (mode === 'draw') updateActiveSelection({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  function beginCrop(event: React.PointerEvent) {
    if (!sourceUrl && !pdfUrl) return
    const target = event.target as HTMLElement
    const handle = target.dataset.cropHandle as CropHandle | undefined
    if (handle) {
      startCropInteraction(event, 'resize', handle)
      return
    }
    const selection = activeSelection()
    const customSelection = Boolean(selection && (selection.width < 0.98 || selection.height < 0.98))
    if (customSelection && target.closest(`[data-selection-kind="${editorTool}"]`)) {
      startCropInteraction(event, 'move')
      return
    }
    startCropInteraction(event, 'draw')
  }

  function moveCrop(event: React.PointerEvent) {
    if (!cropInteraction) return
    const point = pointerPosition(event)
    if (!point) return
    if (cropInteraction.mode === 'draw') {
      updateActiveSelection({ x: Math.min(cropInteraction.start.x, point.x), y: Math.min(cropInteraction.start.y, point.y), width: Math.abs(point.x - cropInteraction.start.x), height: Math.abs(point.y - cropInteraction.start.y) })
      return
    }
    if (cropInteraction.mode === 'move') {
      const { selection, start } = cropInteraction
      updateActiveSelection({ x: clamp(selection.x + point.x - start.x, 0, 1 - selection.width), y: clamp(selection.y + point.y - start.y, 0, 1 - selection.height), width: selection.width, height: selection.height })
      return
    }
    if (!cropInteraction.handle) return
    const { selection, handle } = cropInteraction
    const minSize = 0.02
    let left = selection.x
    let top = selection.y
    let right = selection.x + selection.width
    let bottom = selection.y + selection.height
    if (handle.includes('w')) left = clamp(point.x, 0, right - minSize)
    if (handle.includes('e')) right = clamp(point.x, left + minSize, 1)
    if (handle.includes('n')) top = clamp(point.y, 0, bottom - minSize)
    if (handle.includes('s')) bottom = clamp(point.y, top + minSize, 1)
    updateActiveSelection({ x: left, y: top, width: right - left, height: bottom - top })
  }

  function finishCrop() {
    setCropInteraction(null)
    if (editorTool === 'fill') {
      setFillSelection(previous => previous && previous.width >= 0.02 && previous.height >= 0.02 ? previous : null)
    } else {
      setCropSelection(previous => previous.width < 0.02 || previous.height < 0.02 ? fullSelection : previous)
    }
  }

  function changeCropZoom(nextZoom: number) {
    const zoom = clamp(nextZoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM)
    if (zoom === cropZoom) return
    const area = cropAreaRef.current
    const selection = activeSelection() || fullSelection
    const focusX = cropSurfaceSize.width * (selection.x + selection.width / 2)
    const focusY = cropSurfaceSize.height * (selection.y + selection.height / 2)
    setCropZoom(zoom)
    if (!area) return
    window.requestAnimationFrame(() => {
      area.scrollTo({
        left: Math.max(0, focusX * zoom - area.clientWidth / 2),
        top: Math.max(0, focusY * zoom - area.clientHeight / 2),
        behavior: 'auto',
      })
    })
  }

  async function applyCrop() {
    const image = sourceImageRef.current
    const pdfCanvas = pdfCanvasRef.current
    const isPdfSource = Boolean(pdfUrl)
    if ((!image || !sourceUrl) && (!pdfCanvas || !isPdfSource) || !draft || !selectedBank) { setMessage('请先导入图片或 PDF'); return }
    const sourceWidth = isPdfSource ? pdfCanvas?.width || 0 : image?.naturalWidth || 0
    const sourceHeight = isPdfSource ? pdfCanvas?.height || 0 : image?.naturalHeight || 0
    if (!sourceWidth || !sourceHeight) { setMessage(isPdfSource ? 'PDF 页面还没有加载完成' : '图片还没有加载完成'); return }
    const selection = cropSelection.width > 0.02 && cropSelection.height > 0.02 ? cropSelection : fullSelection
    const activeFillSelection = editorTool === 'fill' ? fillSelection : null
    if (editorTool === 'fill' && !activeFillSelection) { setMessage('请先拖动框选要填充的矩形区域'); return }
    const sx = Math.round(selection.x * sourceWidth)
    const sy = Math.round(selection.y * sourceHeight)
    const sw = Math.max(1, Math.round(selection.width * sourceWidth))
    const sh = Math.max(1, Math.round(selection.height * sourceHeight))
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#fff'
    context.fillRect(0, 0, sw, sh)
    context.drawImage((isPdfSource ? pdfCanvas : image) as CanvasImageSource, sx, sy, sw, sh, 0, 0, sw, sh)
    if (activeFillSelection) {
      const fillLeft = Math.max(sx, Math.round(activeFillSelection.x * sourceWidth))
      const fillTop = Math.max(sy, Math.round(activeFillSelection.y * sourceHeight))
      const fillRight = Math.min(sx + sw, Math.round((activeFillSelection.x + activeFillSelection.width) * sourceWidth))
      const fillBottom = Math.min(sy + sh, Math.round((activeFillSelection.y + activeFillSelection.height) * sourceHeight))
      if (fillRight <= fillLeft || fillBottom <= fillTop) { setMessage('矩形没有落在当前裁剪区域内，请重新调整'); return }
      context.fillStyle = fillColor
      context.fillRect(fillLeft - sx, fillTop - sy, fillRight - fillLeft, fillBottom - fillTop)
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) { setMessage('裁剪图片失败'); return }
    const file = new File([blob], `${targetKind}-${draft.number}-${Date.now()}.png`, { type: 'image/png' })
    const sourceCount = questionImageSources(draft, targetKind).length
    if (imageApplyMode === 'replace' && !sourceCount) { setMessage(`当前没有可替换的${targetKind === 'question' ? '题目图' : '解析图'}，请切换为“添加新图”`); return }
    const imageIndex = imageApplyMode === 'append' ? sourceCount : clamp(editingImageIndex, 0, sourceCount - 1)
    const previousPending = pendingImages[targetKind]?.find(item => item.index === imageIndex)
    const originalSource = imageApplyMode === 'replace' ? previousPending?.source || questionImageSources(draft, targetKind)[imageIndex] : undefined
    const pending = { key: imageChangeKey(selectedBank.id, draft.id, targetKind), file, url: URL.createObjectURL(file), index: imageIndex, source: originalSource }
    setPendingImages(previous => {
      const old = previous[targetKind]?.find(item => item.index === imageIndex)
      if (old) URL.revokeObjectURL(old.url)
      return { ...previous, [targetKind]: [...(previous[targetKind] || []).filter(item => item.index !== imageIndex), pending] }
    })
    setDraft(previous => previous ? replaceImageSource(previous, targetKind, imageIndex, pending.key) : previous)
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl('')
    }
    setSourceFile(file)
    setSourceUrl(URL.createObjectURL(file))
    setCropSelection(fullSelection)
    setFillSelection(null)
    setEditorTool('crop')
    const imageActionLabel = imageApplyMode === 'append' ? `添加${targetKind === 'question' ? '题目图片' : '解析图片'}` : `替换${targetKind === 'question' ? '题目图片' : '解析图片'}第 ${imageIndex + 1} 张`
    setMessage(`${activeFillSelection ? '矩形填充已应用，' : ''}预览已刷新，将${imageActionLabel}；点击右上角保存写入本地文件`)
  }

  function deleteImage(kind: ImageKind, index: number) {
    if (!draft) return
    const sources = questionImageSources(draft, kind)
    const source = sources[index]
    const pending = pendingImages[kind]?.find(item => item.index === index)
    const persistedSource = pending?.source || (!pending ? source : undefined)
    const nextSources = sources.filter((_, sourceIndex) => sourceIndex !== index)
    if (persistedSource) {
      setImageDeletes(previous => previous.some(item => item.kind === kind && imageSourceIdentity(item.source) === imageSourceIdentity(persistedSource))
        ? previous
        : [...previous, { kind, index, source: persistedSource }])
    }
    if (pending) URL.revokeObjectURL(pending.url)
    setPendingImages(previous => {
      const next = { ...previous }
      const items = next[kind] || []
      const remaining = items
        .filter(item => item.index !== index)
        .map(item => item.index > index ? { ...item, index: item.index - 1 } : item)
      if (remaining.length) next[kind] = remaining
      else delete next[kind]
      return next
    })
    setDraft(previous => previous ? questionWithImageSources(previous, kind, nextSources) : previous)
    setEditingImageIndex(previous => Math.max(0, Math.min(previous, nextSources.length - 1)))
    if (!nextSources.length) setImageApplyMode('append')
    setMessage(`已删除第 ${index + 1} 张${kind === 'question' ? '题目图' : '解析图'}，保存后同步到本地文件`)
  }

  function clearImages(kind: ImageKind) {
    if (!draft) return
    const sources = questionImageSources(draft, kind)
    const pending = pendingImages[kind] || []
    const persistedSources = sources.flatMap((source, index) => {
      const replacement = pending.find(item => item.index === index)?.source
      return replacement || (!pending.some(item => item.index === index) ? source : null) ? [replacement || source] : []
    })
    if (persistedSources.length) {
      setImageDeletes(previous => {
        const next = [...previous]
        persistedSources.forEach(source => {
          if (!next.some(item => item.kind === kind && imageSourceIdentity(item.source) === imageSourceIdentity(source))) next.push({ kind, index: 0, source })
        })
        return next
      })
    }
    pending.forEach(item => URL.revokeObjectURL(item.url))
    setPendingImages(previous => { const next = { ...previous }; delete next[kind]; return next })
    setDraft(previous => previous ? {
      ...previous,
      imageKeys: kind === 'question' ? [] : previous.imageKeys,
      answerImageKeys: kind === 'answer' ? [] : previous.answerImageKeys,
      imageUrls: kind === 'question' ? undefined : previous.imageUrls,
      answerImageUrls: kind === 'answer' ? undefined : previous.answerImageUrls,
      imageUrl: kind === 'question' ? undefined : previous.imageUrl,
      answerImageUrl: kind === 'answer' ? undefined : previous.answerImageUrl,
    } : previous)
    setTargetKind(kind)
    setEditingImageIndex(0)
    setImageApplyMode('append')
    setMessage(`已清除${kind === 'question' ? '题目图' : '解析图'}，保存后生效`)
  }

  function updateDraft<K extends keyof Question>(key: K, value: Question[K]) {
    setDraft(previous => previous ? { ...previous, [key]: value } : previous)
  }

  function toggleEditorChapter(id: string) {
    setExpandedChapterIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleEditorSection(id: string) {
    setExpandedSectionIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function entriesForSection(section: Section) {
    return visibleEntries.filter(entry => entry.sectionId === section.id)
  }

  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !savedQuestion) return false
    return JSON.stringify(draft) !== JSON.stringify(savedQuestion)
      || imageDeletes.length > 0
      || Object.values(pendingImages).some(items => Boolean(items?.length))
  }, [draft, savedQuestion, imageDeletes, pendingImages])

  const currentEntryIndex = Math.max(0, entries.findIndex(entry => entry.question.id === draft?.id))

  function requestQuestionChange(questionId: string) {
    if (busy || !draft || questionId === draft.id) return
    if (hasUnsavedChanges) {
      setPendingEditorAction({ type: 'question', questionId })
      return
    }
    setSelectedQuestionId(questionId)
  }

  function navigateQuestion(offset: -1 | 1) {
    const nextEntry = entries[currentEntryIndex + offset]
    if (nextEntry) requestQuestionChange(nextEntry.question.id)
  }

  function requestClose() {
    if (busy) return
    if (hasUnsavedChanges) {
      setPendingEditorAction({ type: 'close' })
      return
    }
    onClose()
  }

  function discardPendingAction() {
    const action = pendingEditorAction
    Object.values(pendingImages).flatMap(items => items || []).forEach(item => URL.revokeObjectURL(item.url))
    setPendingEditorAction(null)
    if (action?.type === 'question') setSelectedQuestionId(action.questionId)
    else onClose()
  }

  async function save(afterSaveAction?: PendingEditorAction | null) {
    if (!selectedBank || !draft) return
    setBusy(true)
    try {
      const imageChanges = (['question', 'answer'] as ImageKind[]).flatMap(kind => (pendingImages[kind] || []).map(item => ({ kind, key: item.key, file: item.file, index: item.index, source: item.source })))
      const persistedQuestion = await onSave({ bankId: selectedBank.id, questionId: draft.id, question: draft, imageChanges, imageDeletes })
      const savedDraft = cloneQuestion(persistedQuestion || draft)
      setDraft(savedDraft)
      setSavedQuestion(savedDraft)
      setMessage('题目已保存')
      Object.values(pendingImages).flatMap(items => items || []).forEach(item => URL.revokeObjectURL(item.url))
      setPendingImages({})
      setImageDeletes([])
      const action = afterSaveAction || pendingEditorAction
      setPendingEditorAction(null)
      if (action?.type === 'question') setSelectedQuestionId(action.questionId)
      else if (action?.type === 'close') onClose()
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败') }
    finally { setBusy(false) }
  }
  const dialogRef = useDialogFocus<HTMLElement>(requestClose, { initialFocusSelector: '[aria-label="关闭"]' })
  const exitPromptRef = useDialogFocus<HTMLDivElement>(() => {
    if (!busy) setPendingEditorAction(null)
  }, {
    active: Boolean(pendingEditorAction),
    closeOnEscape: !busy,
    initialFocusSelector: '.editor-exit-continue',
  })

  if (!selectedBank || !draft) {
    return <div className="modal-backdrop"><section ref={dialogRef} className="editor-dialog empty-editor" role="dialog" aria-modal="true" aria-labelledby="empty-editor-title" tabIndex={-1}><button className="modal-close" data-dialog-initial-focus onClick={onClose} aria-label="关闭"><X/></button><BookOpen size={30}/><h2 id="empty-editor-title">还没有可编辑的题目</h2><p>请先导入题库或图片。</p></section></div>
  }

  const targetLabel = targetKind === 'question' ? '题目图片' : '解析图片'
  const targetImageCount = questionImageSources(draft, targetKind).length
  const currentTargetNumber = targetImageCount ? clamp(editingImageIndex, 0, targetImageCount - 1) + 1 : 0
  const cropApplyLabel = imageApplyMode === 'replace'
    ? `替换${targetLabel}${currentTargetNumber ? `第 ${currentTargetNumber} 张` : ''}`
    : `添加${targetLabel}`
  const cropActionLabel = editorTool === 'fill' ? `矩形填充并${cropApplyLabel}` : cropApplyLabel

  function renderSelection(kind: EditorTool, selection: CropSelection | null) {
    if (!selection) return null
    const isFill = kind === 'fill'
    return <span className={`editor-crop-selection editor-crop-selection-${kind}`} data-selection-kind={kind} style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%`, pointerEvents: editorTool === kind ? 'auto' : 'none', backgroundColor: isFill ? fillColor : undefined, backgroundImage: isFill ? 'none' : undefined, borderColor: isFill ? fillColor : undefined, opacity: isFill ? 1 : undefined }}>{(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as CropHandle[]).map(handle => <i key={handle} className={`editor-crop-handle editor-crop-handle-${handle}`} data-crop-handle={handle} style={isFill ? { backgroundColor: fillColor, borderColor: fillColor } : undefined} aria-hidden="true" />)}</span>
  }

  function renderToolControls() {
    return <div className="editor-crop-tool-controls"><button type="button" className={editorTool === 'crop' ? 'active' : ''} onClick={() => selectEditorTool('crop')}><Crop size={13}/>裁剪</button><button type="button" className={editorTool === 'fill' ? 'active' : ''} onClick={() => selectEditorTool('fill')}><Square size={13}/>矩形填充</button>{editorTool === 'fill' && <label className="editor-fill-color"><span>填充色</span><input type="color" value={fillColor} onChange={event => setFillColor(event.target.value)} aria-label="矩形填充颜色"/></label>}</div>
  }

  function renderZoomControls() {
    const zoomPercent = Math.round(cropZoom * 100)
    return <div className="editor-crop-zoom-controls" role="group" aria-label="裁剪预览缩放">
      <button type="button" onClick={() => changeCropZoom(cropZoom - CROP_ZOOM_STEP)} disabled={cropZoom <= MIN_CROP_ZOOM} aria-label="缩小裁剪预览" title="缩小预览"><ZoomOut size={13}/></button>
      <input type="range" min={MIN_CROP_ZOOM} max={MAX_CROP_ZOOM} step={CROP_ZOOM_STEP} value={cropZoom} onChange={event => changeCropZoom(Number(event.target.value))} aria-label={`裁剪预览缩放 ${zoomPercent}%`}/>
      <button type="button" onClick={() => changeCropZoom(cropZoom + CROP_ZOOM_STEP)} disabled={cropZoom >= MAX_CROP_ZOOM} aria-label="放大裁剪预览" title="放大预览"><ZoomIn size={13}/></button>
      <button type="button" className="editor-crop-zoom-value" onClick={() => changeCropZoom(MIN_CROP_ZOOM)} disabled={cropZoom === MIN_CROP_ZOOM} title="恢复 100%">{zoomPercent}%</button>
    </div>
  }

  function renderCropViewport(isPdf: boolean) {
    const zoomShellStyle = cropSurfaceSize.width && cropSurfaceSize.height
      ? { width: `${cropSurfaceSize.width * cropZoom}px`, height: `${cropSurfaceSize.height * cropZoom}px` }
      : undefined
    const surfaceStyle = {
      width: cropSurfaceSize.width ? `${cropSurfaceSize.width}px` : undefined,
      height: cropSurfaceSize.height ? `${cropSurfaceSize.height}px` : undefined,
      transform: `scale(${cropZoom})`,
      '--crop-zoom': cropZoom,
    } as React.CSSProperties
    return <div className={isPdf ? 'editor-crop-area editor-pdf-crop-area' : 'editor-crop-area'} ref={cropAreaRef}>
      <div className="editor-crop-zoom-shell" style={zoomShellStyle}>
        <div className="editor-crop-surface" ref={cropSurfaceRef} style={surfaceStyle} onPointerDown={beginCrop} onPointerMove={moveCrop} onPointerUp={finishCrop} onPointerCancel={finishCrop}>
          {isPdf ? <canvas ref={pdfCanvasRef} aria-label={`PDF 第 ${pdfPageNumber} 页`}/> : <img ref={sourceImageRef} src={sourceUrl} alt="待裁剪图片" draggable={false} onLoad={updateCropSurfaceSize}/>}
          {renderSelection('crop', cropSelection)}
          {renderSelection('fill', fillSelection)}
        </div>
      </div>
    </div>
  }

  return <div className="modal-backdrop editor-backdrop" onClick={requestClose}>
    <section ref={dialogRef} className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="question-editor-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <div className="editor-header">
        <div className="editor-heading"><span><Crop/></span><div><h2 id="question-editor-title">题库题目编辑器</h2><p>编辑文字，截取图片，快速新增或替换题图和解析图</p></div></div>
        <div className="editor-target-bar">
          <label><span>题库</span><select value={selectedBank.id} onChange={event => setSelectedBankId(event.target.value)}>{banks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label>
          <label className="editor-search"><span>定位题目</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索题号、题干或章节"/></label>
          <span className="editor-count">共 {entries.length} 题</span>
        </div>
        <div className="editor-question-switcher" aria-label="题目切换"><button type="button" onClick={() => navigateQuestion(-1)} disabled={busy || currentEntryIndex <= 0} title="上一题"><ChevronUp size={14}/><span>上一题</span></button><span className="editor-question-position">{currentEntryIndex + 1} / {entries.length}</span><button type="button" onClick={() => navigateQuestion(1)} disabled={busy || currentEntryIndex >= entries.length - 1} title="下一题"><ChevronDown size={14}/><span>下一题</span></button></div>
        <div className="editor-actions">{hasUnsavedChanges && <span className="editor-unsaved-label">未保存预览</span>}<button className="editor-save-button" onClick={() => void save()} disabled={busy}><Save size={15}/>{busy ? '保存中…' : '保存题目'}</button><button className="modal-close" onClick={requestClose} aria-label="关闭"><X/></button></div>
      </div>

      <div className={questionNavCollapsed ? 'editor-body editor-nav-collapsed' : 'editor-body'}>
        <aside className={questionNavCollapsed ? 'editor-question-list editor-question-list-collapsed' : 'editor-question-list'}>
          <div className="editor-list-title"><strong>题目导航</strong><small>章节 → 小节 → 题目</small><button className="editor-nav-collapse-toggle" type="button" onClick={() => setQuestionNavCollapsed(previous => !previous)} aria-label={questionNavCollapsed ? '展开题目导航' : '折叠题目导航'} title={questionNavCollapsed ? '展开题目导航' : '折叠题目导航'}>{questionNavCollapsed ? <ChevronRight size={15}/> : <ChevronLeft size={15}/>}</button></div>
          <div className="editor-list-scroll"><div className="editor-chapter-tree">{selectedBank.chapters.map(chapter => {
            const chapterEntries = chapter.sections.flatMap(entriesForSection)
            if (!chapterEntries.length) return null
            const chapterOpen = expandedChapterIds.has(chapter.id)
            return <section className="editor-chapter-node" key={chapter.id}>
              <button className="editor-chapter-toggle" aria-expanded={chapterOpen} onClick={() => toggleEditorChapter(chapter.id)}>{chapterOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<span>{chapter.name}</span><em>{chapterEntries.length}</em></button>
              {chapterOpen && <div className="editor-section-tree">{chapter.sections.map(section => {
                const sectionEntries = entriesForSection(section)
                if (!sectionEntries.length) return null
                const sectionOpen = expandedSectionIds.has(section.id)
                return <section className="editor-section-node" key={section.id}>
                  <button className="editor-section-toggle" aria-expanded={sectionOpen} onClick={() => toggleEditorSection(section.id)}>{sectionOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<span>{section.name}</span><small>{sectionEntries.length}</small></button>
                  {sectionOpen && <div className="editor-question-grid">{sectionEntries.map(entry => <button key={entry.question.id} className={entry.question.id === draft.id ? 'selected' : ''} title={entry.question.text || `第 ${entry.question.number} 题`} onClick={() => requestQuestionChange(entry.question.id)}>{entry.question.number}</button>)}</div>}
                </section>
              })}</div>}
            </section>
          })}{!visibleEntries.length && <p className="editor-list-empty">没有匹配的题目</p>}</div></div>
        </aside>

        <div className="editor-workspace">
          <div className="editor-source-panel">
            <div className="editor-panel-title"><div><span>SOURCE TOOL</span><h3>导入与截取</h3></div><div className="editor-source-actions"><label className="editor-file-button"><Upload size={14}/>导入图片 / PDF<input type="file" accept="image/*,.pdf,application/pdf" onChange={event => { const file = event.target.files?.[0]; if (file) setSource(file); event.currentTarget.value = '' }}/></label><button onClick={() => void pasteClipboardImage()}><ClipboardPaste size={14}/>粘贴截图</button></div></div>
            <div className="editor-target-switch" role="group" aria-label="图片编辑目标和方式">
              <div className="editor-target-group"><span className="editor-target-label">目标</span><div className="editor-target-segments"><button type="button" className={targetKind === 'question' ? 'active' : ''} onClick={() => selectTargetKind('question')}>题目图片</button><button type="button" className={targetKind === 'answer' ? 'active' : ''} onClick={() => selectTargetKind('answer')}>解析图片</button></div></div>
              <div className="editor-target-group editor-mode-group"><span className="editor-target-label">方式</span><div className="editor-target-segments"><button type="button" className={imageApplyMode === 'replace' ? 'active' : ''} onClick={() => setImageApplyMode('replace')} disabled={!targetImageCount}>替换当前图{currentTargetNumber ? ` · 第 ${currentTargetNumber} 张` : ''}</button><button type="button" className={imageApplyMode === 'append' ? 'active' : ''} onClick={() => setImageApplyMode('append')}>添加新图</button></div></div>
            </div>
            {pdfUrl && <div className="editor-pdf-source"><div className="editor-pdf-toolbar"><FileText size={15}/><strong>PDF 页面选择</strong><button type="button" onClick={() => setPdfPageNumber(previous => Math.max(1, previous - 1))} disabled={pdfRendering || pdfPageNumber <= 1}><ChevronLeft size={14}/></button><label>第 <input type="number" min={1} max={pdfPageCount || 1} value={pdfPageNumber} onChange={event => setPdfPageNumber(clamp(Number(event.target.value) || 1, 1, pdfPageCount || 1))}/> / {pdfPageCount || '—'} 页</label><button type="button" onClick={() => setPdfPageNumber(previous => Math.min(pdfPageCount || previous, previous + 1))} disabled={pdfRendering || !pdfPageCount || pdfPageNumber >= pdfPageCount}><ChevronRight size={14}/></button><a href={pdfUrl} target="_blank" rel="noreferrer">新窗口打开</a></div>{pdfError ? <p className="editor-pdf-error">{pdfError}</p> : <div className="editor-pdf-crop-stage"><div className="editor-crop-toolbar"><span>{pdfRendering ? '正在渲染当前页…' : editorTool === 'fill' ? '拖动框选要填充的区域，框选后仍可调整' : `框选后将${cropApplyLabel}，选区可继续调整`}</span>{renderToolControls()}{renderZoomControls()}<button type="button" onClick={resetActiveSelection} disabled={pdfRendering}>{editorTool === 'fill' ? '清除矩形' : '全页'}</button></div>{renderCropViewport(true)}<button className="editor-apply-crop" onClick={() => void applyCrop()} disabled={pdfRendering || !pdfDocument || (editorTool === 'fill' && !fillSelection)}><Check size={15}/>{cropActionLabel}</button></div>}<p>先切换到目标页，再放大预览并框选需要的区域；矩形填充会绘制进最终图片。</p></div>}
            {!pdfUrl && sourceUrl && <div className="editor-crop-stage"><div className="editor-crop-toolbar"><span>{editorTool === 'fill' ? '拖动框选要填充的区域，框选后仍可调整' : `框选后将${cropApplyLabel}，选区可继续调整`}</span>{renderToolControls()}{renderZoomControls()}<button onClick={() => void rotateSource()} disabled={!sourceUrl}><RotateCw size={14}/>旋转 90°</button><button type="button" onClick={resetActiveSelection}>{editorTool === 'fill' ? '清除矩形' : '全图'}</button></div>{renderCropViewport(false)}<button className="editor-apply-crop" onClick={() => void applyCrop()} disabled={editorTool === 'fill' && !fillSelection}><Check size={15}/>{cropActionLabel}</button></div>}
            {!pdfUrl && !sourceUrl && <div className="editor-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) setSource(file) }}><FileImage size={27}/><strong>把图片拖到这里</strong><span>也可以导入 PDF 后复制截图，或直接粘贴剪贴板图片</span></div>}
            {message && <p className="editor-message">{message}</p>}
          </div>

          <div className="editor-form-panel">
            <div className="editor-panel-title"><div><span>QUESTION CONTENT</span><h3>题目内容</h3></div><span className="editor-location">{selectedEntry.chapterName} · {selectedEntry.sectionName}</span></div>
            <div className="editor-image-grid"><EditorImageSlot kind="question" draft={draft} pending={pendingImages.question || []} onLoad={index => loadExistingImage('question', index)} onAdd={() => prepareImageAddition('question')} onDelete={index => deleteImage('question', index)} onClear={() => clearImages('question')}/><EditorImageSlot kind="answer" draft={draft} pending={pendingImages.answer || []} onLoad={index => loadExistingImage('answer', index)} onAdd={() => prepareImageAddition('answer')} onDelete={index => deleteImage('answer', index)} onClear={() => clearImages('answer')}/></div>
            <div className="editor-form-grid"><label><span>题号</span><input type="number" value={draft.number} onChange={event => updateDraft('number', Number(event.target.value) || 0)}/></label><label><span>题型</span><input value={draft.type || ''} onChange={event => updateDraft('type', event.target.value)}/></label><label className="editor-wide"><span>考点</span><input value={draft.keyPoint || ''} onChange={event => updateDraft('keyPoint', event.target.value)} placeholder="可选"/></label><label className="editor-wide"><span>题干</span><textarea rows={4} value={draft.text} onChange={event => updateDraft('text', event.target.value)} placeholder="输入题目文字；图片题可留空"/></label><label className="editor-wide"><span>选项（每行一项）</span><textarea rows={4} value={(draft.options || []).join('\n')} onChange={event => updateDraft('options', event.target.value.split('\n').map(item => item.trim()).filter(Boolean))} placeholder="A. …\nB. …"/></label><label className="editor-wide"><span>答案</span><textarea rows={3} value={draft.answer} onChange={event => updateDraft('answer', event.target.value)}/></label><label className="editor-wide"><span>文字解析</span><textarea rows={5} value={draft.analysis} onChange={event => updateDraft('analysis', event.target.value)} placeholder="可与解析图片同时使用"/></label></div>
          </div>
        </div>
      </div>
      {pendingEditorAction && <div className="editor-exit-prompt-backdrop" onClick={event => event.stopPropagation()}>
        <div ref={exitPromptRef} className="editor-exit-prompt" role="alertdialog" aria-modal="true" aria-labelledby="editor-exit-title" tabIndex={-1}>
          <div className="editor-exit-icon"><Save size={17}/></div>
          <h3 id="editor-exit-title">{pendingEditorAction.type === 'question' ? '切换题目前需要保存吗？' : '有未保存的修改'}</h3>
          <p>{pendingEditorAction.type === 'question' ? '当前题目的文字或图片已经修改，切换后将离开当前题目。是否先保存？' : '当前题目的文字或图片已经修改，退出前是否保存？'}</p>
          <div className="editor-exit-actions">
            <button className="editor-exit-save" onClick={() => void save(pendingEditorAction)} disabled={busy}>{busy ? '保存中…' : pendingEditorAction.type === 'question' ? '保存并切换' : '保存并退出'}</button>
            <button className="editor-exit-discard" onClick={discardPendingAction} disabled={busy}>{pendingEditorAction.type === 'question' ? '放弃修改并切换' : '放弃修改'}</button>
            <button className="editor-exit-continue" onClick={() => setPendingEditorAction(null)} disabled={busy}>继续编辑</button>
          </div>
        </div>
      </div>}
    </section>
  </div>
}

function EditorImageSlot({ kind, draft, pending, onLoad, onAdd, onDelete, onClear }: { kind: ImageKind; draft: Question; pending: PendingImage[]; onLoad: (index: number) => void; onAdd: () => void; onDelete: (index: number) => void; onClear: () => void }) {
  const sources = questionImageSources(draft, kind)
  const label = kind === 'question' ? '题目图片' : '解析图片'
  const hasImages = Boolean(sources.length)
  const pendingIndexes = new Set(pending.map(item => item.index))
  return <div className="editor-image-slot"><div className="editor-image-slot-heading"><strong>{label}</strong><small>{hasImages ? `${sources.length} 张 · 点击图片编辑，悬停删除单张` : '暂无图片'}</small></div><div className="editor-image-preview"><ImageSourcePreview sources={sources} pending={pending} alt={`${label}预览`} onSelect={index => { if (!pendingIndexes.has(index)) onLoad(index) }} onDelete={onDelete}/></div><div className="editor-image-slot-actions"><button onClick={onAdd}><Upload size={13}/>添加图片</button><button onClick={() => onLoad(0)} disabled={!hasImages}><Crop size={13}/>编辑第1张</button><button className="editor-danger-button" onClick={onClear} disabled={!hasImages && !pending.length}><Trash2 size={13}/>清空全部</button></div></div>
}
