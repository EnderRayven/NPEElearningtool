import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, BookOpen, ChevronDown, ChevronRight, CircleHelp, Filter, FolderSync, Lock, Maximize2, Menu, Minimize2, NotebookPen, Pencil, Plus, RotateCcw, Search, Settings as SettingsIcon, Timer, Unlock, Wrench, X } from 'lucide-react'
import type { MathModule, Question, QuestionBank, QuestionStatus, ReadingQuestionType, Section, Subject } from './types'
import { loadNavigation, renameBank, renameChapter, saveNavigation, validateBanks } from './store'
import { deleteAssets, getAssetFiles, putAssets } from './assets'
import AssetGallery from './AssetGallery'
import ExportDialog, { ExportPage, waitForExportContent, type ExportJob, type ExportMode } from './ExportDialog'
import SettingsDialog from './SettingsDialog'
import StudyRecordManagerDialog from './StudyRecordManagerDialog'
import { assetKeysForBank, clearQuestionStatuses, orderedQuestionEntriesForBank, questionIdsForBank, removeBank, resetBankData } from './bankManagement'
import { builtInBanks, defaultBankIds, englishBanks, initializeDefaultBanks, loadDefaultBanks } from './data'
import { mergeImageEntries } from './imageImport'
import { addDefaultWorkspaceImage, BUILTIN_ENGLISH_VERSION, chooseWorkspace, clearWorkspaceHandle, createBankFolder, createWorkspaceManifest, createWorkspaceMetadata, defaultWorkspaceFileUrl, deleteDefaultWorkspaceImage, deleteDefaultWorkspaceImageByName, hasWorkspacePermission, isMissingWorkspaceError, loadWorkspaceCache, loadWorkspaceHandle, readDefaultWorkspace, readWorkspaceManifest, readWorkspaceNoteBuckets, readWorkspaceUserData, removeBankFolder, replaceDefaultWorkspaceImage, resolveWorkspaceUserData, safeFolderName, saveWorkspaceCache, scanWorkspaceBankFolders, scanWorkspaceImages, type WorkspaceCache, type WorkspaceCacheImage, workspaceBankName, writeDefaultWorkspaceImage, writeDefaultWorkspaceManifest, writeDefaultWorkspaceNoteBuckets, writeDefaultWorkspaceUserData, writeWorkspaceImage, writeWorkspaceManifest, writeWorkspaceNoteBuckets, writeWorkspaceUserData } from './workspace'
import { formatPassageParagraphs } from './passageFormatting'
import { isImageAnswerPlaceholder, isImageQuestionType } from './questionPresentation'
import AdvancedQuestionFilter from './AdvancedQuestionFilter'
import QuestionTagPicker from './QuestionTagPicker'
import { DEFAULT_QUESTION_TAGS, validateQuestionTagDefinitions, type QuestionTagDefinition } from './questionTags'
import { advancedQuestionFilterCount, createEmptyAdvancedQuestionFilter, questionTypeFilterLabel, questionTypeFilterValue, matchesAdvancedQuestionFilter, type AdvancedQuestionFilter as AdvancedQuestionFilterState, IMAGE_QUESTION_TYPE, UNASSIGNED_QUESTION_TYPE } from './questionFilters'
import { sortBanksForDisplay } from './bankSorting'
import { updateStudyActivity } from './studyActivity'
import { buildQuestionReviewTimeline, deleteQuestionReview, resetQuestionReview, updateQuestionReview } from './questionReview'
import { calculateLearningStats, calculateQuestionStats, formatRate } from './learningStats'
import { resolveEnglishTopicNavigation, resolveNavigation, resolveProfileBankId, type SavedNavigation } from './navigationRestore'
import { removeRetiredBanks } from './bankMigration'
import { formatExamDateValue, getExamCountdown, parseExamDateValue } from './examCountdown'
import { DEFAULT_USER_SETTINGS, loadUserSettings, saveUserSettings, validateUserSettings } from './userSettings'
import { countMarkedQuestions, emptyStudyRound, getStudyRound, loadStudyRounds, migrateStudyRounds, saveStudyRounds, updateStudyRound } from './studyRounds'
import QuestionNotePanel from './QuestionNotePanel'
import type { QuestionBankEditorSave } from './QuestionBankEditor'
import { hasQuestionNote, loadPersonalNotebooks, loadQuestionErrorRecords, loadQuestionNotes, questionNoteBucketKey, savePersonalNotebooks, saveQuestionErrorRecords, saveQuestionNoteBuckets, splitQuestionNotes, validatePersonalNotebooks, validateQuestionErrorRecords, validateQuestionNotes, type PersonalNote, type PersonalNotebook, type PersonalNotebooks, type QuestionErrorRecords, type QuestionNote, type QuestionNotes } from './questionNotes'
import { appVersion, githubRepositoryUrl } from './appMeta'
import { bankMathModule, bankMathModules, bankSubject, mathModuleLabels, mathModuleOrder, subjectLabels } from './subjects'
import { englishSectionLabel, groupEnglishSections, groupEnglishTopicEntries, type EnglishSectionGroupKey, type EnglishTopicKey } from './englishNavigation'
import { questionImageSources, questionWithImageSources, type QuestionImageSource } from './questionImages'
import { isScreenWakeLockSupported, requestScreenWakeLock, type ScreenWakeLockSentinel } from './screenWakeLock'
import { navigationScrollTop, shouldScrollSectionChangeToTop } from './navigationScroll'
import { scheduleDeferredPreloads } from './deferredPreload'
import { useModalScrollLock } from './useModalScrollLock'
import { resolveMarkdownShortcutSettings, type MarkdownShortcutSettings } from './shortcutSettings'
import { cloudSyncAssetKey, cloudSyncAssetPath, cloudSyncImagePath, cloudSyncImagePrefix, cloudSyncManifestPath, cloudSyncUserDataPath, completeOneDriveSignIn, createCloudSyncFiles, hasOneDriveSession, isOneDriveWebAuthConfigured, loadCloudSyncSettings, loadLastSuccessfulSyncAt, resetLastSuccessfulSyncAt, saveCloudSyncSettings, signOutOneDrive, startOneDriveSignIn, syncCloudFiles, type CloudSyncFile, type CloudSyncSettings, type CloudSyncState } from './cloudSync'
import UpdateDialog from './UpdateDialog'

type DeferredModules = {
  SettingsPanel?: (typeof import('./SettingsPanel'))['default']
  TimerDialog?: (typeof import('./TimerDialog'))['default']
  NotesDialog?: (typeof import('./NotesDialog'))['default']
  QuestionBankEditor?: (typeof import('./QuestionBankEditor'))['default']
  LearningDashboard?: (typeof import('./LearningDashboard'))['default']
  DashboardQuestionDialog?: (typeof import('./DashboardQuestionDialog'))['default']
  QuestionZoomDialog?: (typeof import('./QuestionZoomDialog'))['default']
}

let settingsPanelImport: ReturnType<typeof importSettingsPanel> | undefined
let timerDialogImport: ReturnType<typeof importTimerDialog> | undefined
let notesDialogImport: ReturnType<typeof importNotesDialog> | undefined
let questionBankEditorImport: ReturnType<typeof importQuestionBankEditor> | undefined
let learningDashboardImport: ReturnType<typeof importLearningDashboard> | undefined
let dashboardQuestionDialogImport: ReturnType<typeof importDashboardQuestionDialog> | undefined
let questionZoomDialogImport: ReturnType<typeof importQuestionZoomDialog> | undefined

function importSettingsPanel() { return import('./SettingsPanel') }
function importTimerDialog() { return import('./TimerDialog') }
function importNotesDialog() { return import('./NotesDialog') }
function importQuestionBankEditor() { return import('./QuestionBankEditor') }
function importLearningDashboard() { return import('./LearningDashboard') }
function importDashboardQuestionDialog() { return import('./DashboardQuestionDialog') }
function importQuestionZoomDialog() { return import('./QuestionZoomDialog') }
function loadSettingsPanel() {
  settingsPanelImport ||= importSettingsPanel().catch(error => {
    settingsPanelImport = undefined
    throw error
  })
  return settingsPanelImport
}
function loadTimerDialog() {
  timerDialogImport ||= importTimerDialog().catch(error => {
    timerDialogImport = undefined
    throw error
  })
  return timerDialogImport
}
function loadNotesDialog() {
  notesDialogImport ||= importNotesDialog().catch(error => {
    notesDialogImport = undefined
    throw error
  })
  return notesDialogImport
}
function loadQuestionBankEditor() {
  questionBankEditorImport ||= importQuestionBankEditor().catch(error => {
    questionBankEditorImport = undefined
    throw error
  })
  return questionBankEditorImport
}
function loadLearningDashboard() {
  learningDashboardImport ||= importLearningDashboard().catch(error => {
    learningDashboardImport = undefined
    throw error
  })
  return learningDashboardImport
}
function loadDashboardQuestionDialog() {
  dashboardQuestionDialogImport ||= importDashboardQuestionDialog().catch(error => {
    dashboardQuestionDialogImport = undefined
    throw error
  })
  return dashboardQuestionDialogImport
}
function loadQuestionZoomDialog() {
  questionZoomDialogImport ||= importQuestionZoomDialog().catch(error => {
    questionZoomDialogImport = undefined
    throw error
  })
  return questionZoomDialogImport
}

function DeferredInterfaceFallback() {
  return <div className="modal-backdrop"><div className="modal-card" role="status">正在载入界面…</div></div>
}

const statusMeta: Record<QuestionStatus, { label: string; icon: string }> = {
  none: { label: '未标记', icon: '○' }, proficient: { label: '熟练', icon: '✓' }, vague: { label: '模糊', icon: '?' }, wrong: { label: '错误', icon: '×' }
}
const binaryStatusMeta: Record<QuestionStatus, { label: string; icon: string }> = {
  none: { label: '未标记', icon: '○' }, proficient: { label: '正确', icon: '✓' }, vague: { label: '未标记', icon: '○' }, wrong: { label: '错误', icon: '×' }
}
const readingTypeMeta: Array<{ value: ReadingQuestionType; label: string }> = [
  { value: 'detail', label: '细节题' },
  { value: 'example', label: '例证题' },
  { value: 'main-idea', label: '主旨题' },
  { value: 'attitude', label: '态度题' },
  { value: 'inference', label: '推断题' },
  { value: 'vocabulary', label: '词汇题' },
]
const isReadingTypeQuestion = (item?: Question) => item?.type === '阅读理解 Part A'
const isBinaryMasteryQuestion = (item?: Question) => item?.type === '完形填空' || item?.type === '阅读理解 Part A' || item?.type === '阅读理解 Part B'
const isEnglishObjectiveQuestion = (item?: Question) => Boolean(item && (
  item.type === '完形填空'
  || item.type === '阅读理解 Part A'
  || item.type === '阅读理解 Part B'
  || item.type === '选择题'
  || (item.options?.length && !/翻译|写作/.test(item.type || ''))
))

function editorImageRelativePath(bankId: string, questionId: string, kind: 'question' | 'answer', index: number) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `.editor-images/${safeFolderName(bankId)}/${safeFolderName(questionId)}/${kind}-${index + 1}-${suffix}.png`
}

function defaultWorkspaceSourceFileName(source?: QuestionImageSource) {
  if (!source) return ''
  if (source.key) return source.key.split('/').at(-1)?.replace(/^\d+-/, '') || ''
  if (!source.url) return ''
  try {
    return new URL(source.url, window.location.origin).searchParams.get('path')?.split('/').at(-1) || ''
  } catch { return '' }
}

function defaultWorkspaceSourcePath(source?: QuestionImageSource) {
  if (!source?.url) return ''
  try { return new URL(source.url, window.location.origin).searchParams.get('path') || '' } catch { return '' }
}

function structuredWorkspaceFileName(questionId: string, kind: 'question' | 'answer', order: number) {
  const match = questionId.match(/-(\d{2})-(\d+)-(\d{2,})$/)
  if (!match) return ''
  return `${kind === 'question' ? 'Q' : 'A'}-${match[1]}-${match[2]}-${match[3]}.${order}.png`
}
const questionOptionKey = (option: string, index: number) => option.trim().match(/^([A-Z])(?:[.、)）:]|\s|$)/)?.[1] || String.fromCharCode(65 + index)
const effectiveQuestionStatus = (item: Question | undefined, status: QuestionStatus, binaryMode = isBinaryMasteryQuestion(item)): QuestionStatus => binaryMode && status === 'vague' ? 'none' : status
const questionStatusMeta = (item: Question | undefined, status: QuestionStatus, binaryMode = isBinaryMasteryQuestion(item)) => binaryMode ? binaryStatusMeta[status] : statusMeta[status]
const masteryChoices = (item?: Question, binaryMode = isBinaryMasteryQuestion(item)): QuestionStatus[] => binaryMode ? ['proficient', 'wrong'] : ['proficient', 'vague', 'wrong']

function noteBucketKeyForQuestion(banks: QuestionBank[], questionId: string) {
  for (const bank of banks) {
    for (const chapter of bank.chapters) {
      if (chapter.sections.some(section => section.questions.some(question => question.id === questionId))) return questionNoteBucketKey(bank.id, chapter.id)
    }
  }
  return questionNoteBucketKey('__unassigned__', '__unassigned__')
}

function navigationProgress(questions: Question[], statuses: Record<string, QuestionStatus>, binaryMode: boolean) {
  const marked = questions.reduce((count, question) => count + (effectiveQuestionStatus(question, statuses[question.id] || 'none', binaryMode) === 'none' ? 0 : 1), 0)
  return { marked, total: questions.length, label: questions.length ? `${marked}/${questions.length}` : '—' }
}

type BankQuestionEntry = ReturnType<typeof orderedQuestionEntriesForBank>[number]
type EnglishTopicSectionGroup = { section: Section; entries: BankQuestionEntry[] }
type SidebarSectionGroup = { key: EnglishSectionGroupKey | 'all'; label: string; sections: Section[] }
type MathExamNavigationMode = 'paper' | 'keyPoint'
type EnglishNavigationMode = 'paper' | 'topic'
type QuestionNavigationMode = 'mastery' | 'tags'
type MathExamCatalogTopic = { key: string; aliases: string[] }
type MathExamCatalogSection = { key: string; label: string; topics: MathExamCatalogTopic[] }
type MathExamCatalogModule = { key: string; label: string; sections: MathExamCatalogSection[] }
type MathExamKeyPointGroup = { key: string; moduleKey: string; sectionKey: string; entries: BankQuestionEntry[] }
type MathExamYearNavigationGroup = { year: string; entries: BankQuestionEntry[] }

const mathExamKeyPointCatalog: MathExamCatalogModule[] = [
  {
    key: 'calculus', label: '高等数学', sections: [
      { key: 'calculus-limits', topics: [
        { key: '1.1 数列敛散性的判定', aliases: ['1.4 数列极限的计算'] },
        { key: '1.2 函数极限的计算', aliases: ['1.2 极限的定义及性质', '1.3 函数极限的计算'] },
        { key: '1.3 计算极限中的参数', aliases: ['1.5 确定极限中的参数'] },
        { key: '1.4 无穷小量的比较', aliases: ['1.6 无穷小量及其阶的比较'] },
        { key: '1.5 函数的连续性', aliases: ['1.7 函数连续性及间断点类型'] },
      ], label: '一、函数、极限、连续' } as MathExamCatalogSection,
      { key: 'calculus-derivatives', topics: [
        { key: '2.1 导数与微分的概念', aliases: ['2.1 导数与微分的概念'] },
        { key: '2.2 导数与微分的计算', aliases: ['2.2 导数与微分的计算'] },
        { key: '2.3 导数的几何意义', aliases: ['2.3 导数的几何意义及相关变化率'] },
        { key: '2.4 函数的单调性、极值与最值', aliases: ['2.4 函数的单调性、极值与最值'] },
        { key: '2.5 曲线的凹凸性、拐点及渐近线', aliases: ['2.5 曲线的凹凸性、拐点及渐近线'] },
        { key: '2.6 方程根的存在性与个数', aliases: ['2.6 方程根的存在性与个数'] },
        { key: '2.7 不等式的证明', aliases: ['2.7 不等式的证明'] },
        { key: '2.8 微分中值定理', aliases: ['2.8 微分中值定理'] },
        { key: '2.9 泰勒公式', aliases: [] },
      ], label: '二、一元函数微分学' } as MathExamCatalogSection,
      { key: 'calculus-integrals', topics: [
        { key: '3.1 不定积分的计算', aliases: ['3.3 不定积分的计算'] },
        { key: '3.2 定积分的概念、性质及几何意义', aliases: ['3.2 定积分的概念、性质及几何意义'] },
        { key: '3.3 定积分的计算', aliases: ['3.4 定积分计算'] },
        { key: '3.4 变限积分', aliases: ['3.5 变限积分'] },
        { key: '3.5 反常积分的计算与敛散性', aliases: ['3.6 反常积分的计算'] },
        { key: '3.6 定积分的应用', aliases: ['3.7 定积分的应用'] },
      ], label: '三、一元函数积分学' } as MathExamCatalogSection,
      { key: 'calculus-multivariable-derivatives', topics: [
        { key: '4.1 偏导数的概念与计算', aliases: ['4.1 偏导数的概念和计算'] },
        { key: '4.2 全微分的概念与计算', aliases: ['4.2 全微分的概念和计算'] },
        { key: '4.3 多元函数微分学的几何应用', aliases: [] },
        { key: '4.4 方向导数和梯度', aliases: [] },
        { key: '4.5 多元函数的极值问题', aliases: ['4.3 多元函数极值、最值问题'] },
      ], label: '四、多元函数微分学' } as MathExamCatalogSection,
      { key: 'calculus-multivariable-integrals', topics: [
        { key: '5.1 重积分的概念与性质', aliases: ['5.1 二重积分的概念和性质'] },
        { key: '5.2 交换积分次序与坐标系之间的转换', aliases: [] },
        { key: '5.3 重积分的计算', aliases: ['5.2 二重积分的计算'] },
        { key: '5.4 重积分的应用', aliases: ['5.3 二重积分的应用'] },
        { key: '5.5 第一类曲线积分', aliases: [] },
        { key: '5.6 第二类曲线积分', aliases: [] },
        { key: '5.7 第一类曲面积分', aliases: [] },
        { key: '5.8 第二类曲面积分', aliases: [] },
        { key: '5.9 散度和旋度', aliases: [] },
      ], label: '五、多元函数积分学' } as MathExamCatalogSection,
      { key: 'calculus-ode', topics: [
        { key: '7.1 线性微分方程的解的结构', aliases: ['6.1 一阶常微分方程'] },
        { key: '7.2 可分离变量的微分方程与齐次方程', aliases: [] },
        { key: '7.3 一阶非齐次线性微分方程', aliases: [] },
        { key: '7.4 常系数齐次线性微分方程', aliases: ['6.3 高阶线性微分方程'] },
        { key: '7.5 常系数非齐次线性微分方程', aliases: [] },
        { key: '7.6 其他方程', aliases: ['6.2 可降阶微分方程'] },
        { key: '7.7 微分方程的应用', aliases: ['6.4 微分方程的应用'] },
      ], label: '七、常微分方程' } as MathExamCatalogSection,
    ],
  },
  {
    key: 'linear', label: '线性代数', sections: [
      { key: 'linear-determinants', topics: [{ key: '1.1 数字型行列式的计算', aliases: ['1.1 数字型行列式'] }, { key: '1.2 抽象型行列式的计算', aliases: [] }], label: '一、行列式' } as MathExamCatalogSection,
      { key: 'linear-matrices', topics: [{ key: '2.1 矩阵的运算与变换', aliases: ['2.2 矩阵运算和变换'] }, { key: '2.2 伴随矩阵与可逆矩阵', aliases: ['2.1 伴随矩阵和逆矩阵'] }, { key: '2.3 矩阵的秩', aliases: ['2.3 矩阵的秩'] }], label: '二、矩阵' } as MathExamCatalogSection,
      { key: 'linear-vectors', topics: [{ key: '3.1 向量组的线性相关性', aliases: ['3.1 向量组的线性相关性'] }, { key: '3.2 向量组之间的线性表示', aliases: ['3.2 向量组之间的线性表示'] }, { key: '3.3 向量内积与向量正交', aliases: [] }, { key: '3.4 向量空间', aliases: [] }], label: '三、向量' } as MathExamCatalogSection,
      { key: 'linear-equations', topics: [{ key: '4.1 线性方程组求解', aliases: ['4.1 线性方程组求解'] }], label: '四、线性方程组' } as MathExamCatalogSection,
      { key: 'linear-eigenvalues', topics: [{ key: '5.1 特征值与特征向量', aliases: ['5.1 特征值与特征向量'] }, { key: '5.2 矩阵的相似与相似对角化', aliases: ['5.2 矩阵的相似和相似对角化'] }], label: '五、矩阵的特征值与特征向量' } as MathExamCatalogSection,
      { key: 'linear-quadratic', topics: [{ key: '6.1 二次型相关计算', aliases: ['6.1 二次型相关计算'] }], label: '六、二次型' } as MathExamCatalogSection,
    ],
  },
]
const mathExamKeyPointDisplayMap = new Map(mathExamKeyPointCatalog.flatMap(module => module.sections.flatMap(section => section.topics.flatMap(topic => [topic.key, ...topic.aliases].map(alias => [alias, topic.key] as const)))))
const mathExamKeyPointLabel = (key?: string) => key ? mathExamKeyPointDisplayMap.get(key.trim()) || key : ''

function groupMathExamQuestions(entries: BankQuestionEntry[]): MathExamKeyPointGroup[] {
  const entriesByKey = new Map<string, BankQuestionEntry[]>()
  entries.forEach(entry => {
    const key = entry.question.keyPoint?.trim() || '未标注考点'
    const group = entriesByKey.get(key) || []
    group.push(entry)
    entriesByKey.set(key, group)
  })
  const usedKeys = new Set<string>()
  const groups: MathExamKeyPointGroup[] = []
  mathExamKeyPointCatalog.forEach(module => module.sections.forEach(section => section.topics.forEach(topic => {
    const aliases = new Set([topic.key, ...topic.aliases])
    const groupedEntries = Array.from(aliases).flatMap(alias => entriesByKey.get(alias) || [])
    if (!groupedEntries.length) return
    const orderedEntries = Array.from(new Map(groupedEntries.map(entry => [entry.question.id, entry])).values())
      .sort((left, right) => left.chapterIndex - right.chapterIndex || left.question.number - right.question.number)
    orderedEntries.forEach(entry => usedKeys.add(entry.question.keyPoint?.trim() || '未标注考点'))
    groups.push({ key: topic.key, moduleKey: module.key, sectionKey: section.key, entries: orderedEntries })
  })))
  entriesByKey.forEach((groupedEntries, key) => {
    if (usedKeys.has(key)) return
    const orderedEntries = [...groupedEntries].sort((left, right) => left.chapterIndex - right.chapterIndex || left.question.number - right.question.number)
    groups.push({ key, moduleKey: 'other', sectionKey: 'other', entries: orderedEntries })
  })
  return groups
}

const protectedBankIds = new Set<string>(defaultBankIds)
const emptyWorkspaceBank: QuestionBank = { id: '__empty-workspace__', name: '', description: '', subject: 'math', source: 'local', chapters: [] }
const GitHubMark = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.22c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.58-.29-5.29-1.29-5.29-5.68 0-1.25.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.96 10.96 0 0 1 5.75 0C17.03 5.02 18 5.33 18 5.33c.63 1.58.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.09 0 4.41-2.72 5.38-5.31 5.67.42.36.79 1.07.79 2.16v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>

export default function App() {
  const [banks, setBanks] = useState<QuestionBank[]>([])
  const [mathModule, setMathModule] = useState<MathModule>('calculus')
  const [userSettings, setUserSettings] = useState(loadUserSettings)
  const [studyRounds, setStudyRounds] = useState(loadStudyRounds)
  const initialRound = getStudyRound(studyRounds, userSettings.activeRound)
  const [statuses, setStatuses] = useState(() => initialRound.statuses)
  const [activities, setActivities] = useState(() => initialRound.activities)
  const [questionNotes, setQuestionNotes] = useState<QuestionNotes>({})
  const [personalNotebooks, setPersonalNotebooks] = useState<PersonalNotebooks>([])
  const [questionErrorRecords, setQuestionErrorRecords] = useState<QuestionErrorRecords>({})
  const [notesReady, setNotesReady] = useState(false)
  const [errorRecordsReady, setErrorRecordsReady] = useState(false)
  const [bankId, setBankId] = useState(banks[0]?.id || '')
  const [sectionId, setSectionId] = useState(banks[0]?.chapters[0]?.sections[0]?.id || '')
  const [mathExamNavigationMode, setMathExamNavigationMode] = useState<MathExamNavigationMode>('paper')
  const [questionNavigationMode, setQuestionNavigationMode] = useState<QuestionNavigationMode>('mastery')
  const [mathExamKeyPoint, setMathExamKeyPoint] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answerOpen, setAnswerOpen] = useState(false)
  const [answerLocked, setAnswerLocked] = useState(false)
  const [questionNoteOpen, setQuestionNoteOpen] = useState(false)
  const [questionNoteLocked, setQuestionNoteLocked] = useState(false)
  const [expandedPassageAnswers, setExpandedPassageAnswers] = useState<Set<string>>(() => new Set())
  const [expandedPassageAnalyses, setExpandedPassageAnalyses] = useState<Set<string>>(() => new Set())
  const [expandedChapterIds, setExpandedChapterIds] = useState<Set<string>>(() => new Set(banks[0]?.chapters[0] ? [banks[0].chapters[0].id] : []))
  const [query, setQuery] = useState('')
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedQuestionFilterState>(createEmptyAdvancedQuestionFilter)
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false)
  const [englishNavigationMode, setEnglishNavigationMode] = useState<EnglishNavigationMode>('paper')
  const [englishTopic, setEnglishTopic] = useState<EnglishTopicKey>('cloze')
  const [sidebar, setSidebar] = useState(false)
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const [activePage, setActivePage] = useState<'study' | 'profile'>('study')
  const [profileBankId, setProfileBankId] = useState('')
  const [view, setView] = useState<'section' | 'wrong'>('section')
  const [toast, setToast] = useState('')
  const [printMode, setPrintMode] = useState(false)
  const [printJob, setPrintJob] = useState<ExportJob | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportMode, setExportMode] = useState<ExportMode>('questions')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [newBankOpen, setNewBankOpen] = useState(false)
  const [newBankName, setNewBankName] = useState('')
  const [newBankSubject, setNewBankSubject] = useState<Subject>('math')
  const [newBankMathModule, setNewBankMathModule] = useState<MathModule>('calculus')
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [studyRecordManagerOpen, setStudyRecordManagerOpen] = useState(false)
  const [toolboxOpen, setToolboxOpen] = useState(false)
  const [timerView, setTimerView] = useState<'closed' | 'large' | 'mini'>('closed')
  const [notesOpen, setNotesOpen] = useState(false)
  const [deferredModules, setDeferredModules] = useState<DeferredModules>({})
  const [noteQuestionPreview, setNoteQuestionPreview] = useState<{ bankId: string; questionId: string } | null>(null)
  const [noteQuestionEditor, setNoteQuestionEditor] = useState<{ bankId: string; questionId: string } | null>(null)
  const [questionZoomTarget, setQuestionZoomTarget] = useState<{ question: Question; imageSource: QuestionImageSource } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [countdownNow, setCountdownNow] = useState(() => new Date())
  const [renameTarget, setRenameTarget] = useState<{ kind: 'bank' | 'chapter'; id: string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [navigationReady, setNavigationReady] = useState(false)
  const [workspaceHandle, setWorkspaceHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [workspaceState, setWorkspaceState] = useState<'none' | 'available' | 'syncing' | 'connected' | 'error'>('none')
  const [workspaceFolders, setWorkspaceFolders] = useState<Record<string, string>>({})
  const [defaultWorkspaceConnected, setDefaultWorkspaceConnected] = useState(false)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [cloudSyncSettings, setCloudSyncSettings] = useState(loadCloudSyncSettings)
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncState>(() => hasOneDriveSession() ? 'connected' : 'idle')
  const [cloudSyncMessage, setCloudSyncMessage] = useState('')
  const [oneDriveSignedIn, setOneDriveSignedIn] = useState(hasOneDriveSession)
  const [cloudSyncLastSuccessfulAt, setCloudSyncLastSuccessfulAt] = useState(() => loadLastSuccessfulSyncAt(cloudSyncSettings))
  const cloudSyncInFlight = useRef(false)
  useModalScrollLock(newBankOpen || Boolean(renameTarget) || Boolean(questionZoomTarget))
  const screenWakeLockSupported = isScreenWakeLockSupported()
  const questionTags = userSettings.questionTags?.length ? userSettings.questionTags : DEFAULT_QUESTION_TAGS
  const questionTagById = useMemo(() => new Map(questionTags.map(tag => [tag.id, tag])), [questionTags])
  const notesLoaded = useRef(false)
  const dirtyLocalNoteBuckets = useRef(new Set<string>())
  const dirtyWorkspaceNoteBuckets = useRef(new Set<string>())
  const personalNotebooksDirty = useRef(false)
  const workspaceImages = useRef<WorkspaceCacheImage[]>([])
  const workspaceManifestSnapshot = useRef('')
  const workspaceUserDataSnapshot = useRef('')
  const workspaceNotesSnapshot = useRef('')
  const workspaceBootstrapStarted = useRef(false)
  const studyPositions = useRef<Partial<Record<Subject, SavedNavigation>>>({})
  const mathStudyPositions = useRef<Partial<Record<MathModule, SavedNavigation>>>({})
  const bankStudyPositions = useRef<Record<string, SavedNavigation>>({})
  const englishPaperPositions = useRef<Record<string, SavedNavigation>>({})
  const englishTopicPositions = useRef<Record<string, SavedNavigation>>({})
  const reviewReturnPosition = useRef<SavedNavigation | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const imageImportRef = useRef<HTMLInputElement>(null)
  const printSheetRef = useRef<HTMLElement>(null)
  const questionCardRef = useRef<HTMLElement>(null)
  const studyContentTopRef = useRef<HTMLDivElement>(null)
  const chapterScrollRef = useRef<HTMLDivElement>(null)
  const sectionScrollToTopPending = useRef(false)
  const displayedQuestionId = useRef('')
  const toolboxRef = useRef<HTMLDivElement>(null)
  const filterToolsRef = useRef<HTMLDivElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarCloseButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarWasOpen = useRef(false)

  function manifestSnapshot(nextBanks: QuestionBank[], folders: Record<string, string>) {
    return JSON.stringify({ banks: nextBanks, folders })
  }

  function userDataSnapshot(rounds: ReturnType<typeof currentStudyRounds>, settings: typeof userSettings, errorRecords: QuestionErrorRecords, notebooks: PersonalNotebooks) {
    return JSON.stringify({ rounds, settings, errorRecords, notebooks })
  }

  function notesSnapshot(nextBanks: QuestionBank[], notes: QuestionNotes) {
    return JSON.stringify({ banks: nextBanks, notes })
  }

  function setWorkspaceStateBaseline(nextBanks: QuestionBank[], folders: Record<string, string>, rounds: ReturnType<typeof currentStudyRounds>, settings: typeof userSettings, notes: QuestionNotes, errorRecords: QuestionErrorRecords, notebooks: PersonalNotebooks) {
    workspaceManifestSnapshot.current = manifestSnapshot(nextBanks, folders)
    workspaceUserDataSnapshot.current = userDataSnapshot(rounds, settings, errorRecords, notebooks)
    workspaceNotesSnapshot.current = notesSnapshot(nextBanks, notes)
  }

  function workspaceCachePayload(source: WorkspaceCache['source'], nextBanks: QuestionBank[], folders: Record<string, string>, rounds: ReturnType<typeof currentStudyRounds>, settings: typeof userSettings, notes: QuestionNotes, errorRecords: QuestionErrorRecords, notebooks: PersonalNotebooks): WorkspaceCache {
    return {
      version: 1,
      source,
      updatedAt: new Date().toISOString(),
      manifest: createWorkspaceManifest(nextBanks, folders),
      userData: createWorkspaceMetadata(rounds, settings, errorRecords, notebooks),
      notes: structuredClone(notes),
      images: structuredClone(workspaceImages.current),
    }
  }

  async function persistWorkspaceCache(source: WorkspaceCache['source'], nextBanks: QuestionBank[], folders: Record<string, string>, rounds: ReturnType<typeof currentStudyRounds>, settings: typeof userSettings, notes: QuestionNotes, errorRecords: QuestionErrorRecords, notebooks: PersonalNotebooks) {
    await saveWorkspaceCache(workspaceCachePayload(source, nextBanks, folders, rounds, settings, notes, errorRecords, notebooks))
  }

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const syncLayout = () => setCompactLayout(media.matches)
    media.addEventListener('change', syncLayout)
    syncLayout()
    return () => media.removeEventListener('change', syncLayout)
  }, [])
  useEffect(() => {
    if (!compactLayout) {
      sidebarWasOpen.current = false
      return
    }
    if (sidebar) {
      sidebarWasOpen.current = true
      const frame = window.requestAnimationFrame(() => sidebarCloseButtonRef.current?.focus({ preventScroll: true }))
      return () => window.cancelAnimationFrame(frame)
    }
    if (!sidebarWasOpen.current) return
    sidebarWasOpen.current = false
    const frame = window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [compactLayout, sidebar])
  useEffect(() => {
    if (!compactLayout || !sidebar) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setSidebar(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [compactLayout, sidebar])
  useEffect(() => {
    const rounds = updateStudyRound(studyRounds, userSettings.activeRound, statuses, activities)
    if (!saveStudyRounds(rounds)) setToast('学习轮次保存失败，请先导出备份后检查浏览器存储空间')
  }, [studyRounds, userSettings.activeRound, statuses, activities])
  useEffect(() => { if (!saveUserSettings(userSettings)) setToast('用户设置保存失败，请检查浏览器存储空间') }, [userSettings])
  useEffect(() => {
    let cancelled = false
    Promise.all([loadQuestionNotes(banks), loadPersonalNotebooks(), loadQuestionErrorRecords()]).then(([savedNotes, savedPersonalNotebooks, savedErrorRecords]) => {
      if (cancelled || notesLoaded.current) return
      notesLoaded.current = true
      setQuestionNotes(savedNotes)
      setPersonalNotebooks(savedPersonalNotebooks)
      setQuestionErrorRecords(savedErrorRecords)
      setNotesReady(true)
      setErrorRecordsReady(true)
    }).catch(() => setToast('笔记和错误记录读取失败，请检查浏览器存储空间'))
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!notesReady) return
    const timer = window.setTimeout(() => {
      const bucketKeys = new Set(dirtyLocalNoteBuckets.current)
      if (!bucketKeys.size) return
      dirtyLocalNoteBuckets.current.clear()
      saveQuestionNoteBuckets(questionNotes, banks, bucketKeys).catch(() => {
        bucketKeys.forEach(key => dirtyLocalNoteBuckets.current.add(key))
        setToast('笔记保存失败，请先导出完整备份')
      })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [banks, questionNotes, notesReady])
  useEffect(() => {
    if (!notesReady || !personalNotebooksDirty.current) return
    const timer = window.setTimeout(() => {
      personalNotebooksDirty.current = false
      savePersonalNotebooks(personalNotebooks).catch(() => {
        personalNotebooksDirty.current = true
        setToast('个人笔记保存失败，请先导出完整备份')
      })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [personalNotebooks, notesReady])
  useEffect(() => {
    if (!errorRecordsReady) return
    const timer = window.setTimeout(() => {
      saveQuestionErrorRecords(questionErrorRecords).catch(() => setToast('错误记录保存失败，请先导出完整备份'))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [questionErrorRecords, errorRecordsReady])
  useEffect(() => { const timer = window.setInterval(() => setCountdownNow(new Date()), 60 * 60 * 1000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement === document.documentElement)
    document.addEventListener('fullscreenchange', syncFullscreenState)
    syncFullscreenState()
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState)
  }, [])
  useEffect(() => {
    let cancelled = false
    let sentinel: ScreenWakeLockSentinel | null = null

    const release = async () => {
      const current = sentinel
      sentinel = null
      if (current && !current.released) await current.release().catch(() => {})
    }
    const request = async () => {
      if (cancelled || !userSettings.keepScreenAwake || document.visibilityState !== 'visible') return
      if (!isScreenWakeLockSupported()) {
        setToast('当前浏览器不支持屏幕常亮')
        return
      }
      if (sentinel && !sentinel.released) return
      try {
        const next = await requestScreenWakeLock()
        if (cancelled || !userSettings.keepScreenAwake || document.visibilityState !== 'visible') {
          await next.release().catch(() => {})
          return
        }
        sentinel = next
        next.addEventListener('release', () => {
          if (sentinel !== next) return
          sentinel = null
          if (!cancelled && userSettings.keepScreenAwake && document.visibilityState === 'visible') void request()
        })
      } catch {
        if (!cancelled) setToast('屏幕常亮开启失败，请确认当前页面使用 HTTPS 或 localhost')
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void request()
      else void release()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    if (userSettings.keepScreenAwake) void request()
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void release()
    }
  }, [userSettings.keepScreenAwake])
  useEffect(() => {
    if (!toolboxOpen) return
    const closeOnOutside = (event: PointerEvent) => { if (!toolboxRef.current?.contains(event.target as Node)) setToolboxOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setToolboxOpen(false) }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [toolboxOpen])
  useEffect(() => {
    if (!advancedFilterOpen) return
    const closeOnOutside = (event: PointerEvent) => { if (!filterToolsRef.current?.contains(event.target as Node)) setAdvancedFilterOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAdvancedFilterOpen(false) }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape) }
  }, [advancedFilterOpen])
  useEffect(() => {
    if (workspaceBootstrapStarted.current) return
    workspaceBootstrapStarted.current = true
    loadWorkspaceHandle().then(async handle => {
      if (!handle) {
        await loadDefaultWorkspace()
        return
      }
      setWorkspaceHandle(handle)
      if (await hasWorkspacePermission(handle)) {
        if (await restoreWorkspaceCache(handle)) return
        await loadWorkspace(handle)
      }
      else setWorkspaceState('available')
    }).catch(async error => {
      if (isMissingWorkspaceError(error)) {
        await clearWorkspaceHandle().catch(() => {})
        setWorkspaceHandle(null); setWorkspaceState('none')
      } else setWorkspaceState('error')
    })
  }, [])
  useEffect(() => {
    let cancelled = false
    completeOneDriveSignIn(cloudSyncSettings).then(completed => {
      if (cancelled || !completed) return
      setOneDriveSignedIn(true)
      setCloudSyncState('connected')
      setCloudSyncMessage('OneDrive 已登录，可以开始同步')
    }).catch(error => {
      if (cancelled) return
      setCloudSyncState('error')
      setCloudSyncMessage(error instanceof Error ? error.message : 'OneDrive 登录失败')
    })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (workspaceState !== 'connected' || !workspaceReady) return
    const snapshot = manifestSnapshot(banks, workspaceFolders)
    if (snapshot === workspaceManifestSnapshot.current) return
    const timer = window.setTimeout(() => {
      const save = defaultWorkspaceConnected
        ? writeDefaultWorkspaceManifest(banks, workspaceFolders)
        : workspaceHandle ? writeWorkspaceManifest(workspaceHandle, banks, workspaceFolders) : Promise.resolve()
      save.then(() => {
        workspaceManifestSnapshot.current = snapshot
        void persistWorkspaceCache(defaultWorkspaceConnected ? 'default' : 'directory', banks, workspaceFolders, currentStudyRounds(), userSettings, questionNotes, questionErrorRecords, personalNotebooks).catch(() => {})
      }).catch(() => setWorkspaceState('error'))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [banks, workspaceFolders, workspaceHandle, workspaceState, defaultWorkspaceConnected, workspaceReady])
  useEffect(() => {
    if (workspaceState !== 'connected' || !workspaceReady) return
    const rounds = updateStudyRound(studyRounds, userSettings.activeRound, statuses, activities)
    const snapshot = userDataSnapshot(rounds, userSettings, questionErrorRecords, personalNotebooks)
    if (snapshot === workspaceUserDataSnapshot.current) return
    const timer = window.setTimeout(() => {
      const save = defaultWorkspaceConnected
        ? writeDefaultWorkspaceUserData(rounds, userSettings, {}, questionErrorRecords, personalNotebooks)
        : workspaceHandle ? writeWorkspaceUserData(workspaceHandle, rounds, userSettings, {}, questionErrorRecords, personalNotebooks) : Promise.resolve()
      save.then(() => {
        workspaceUserDataSnapshot.current = snapshot
        void persistWorkspaceCache(defaultWorkspaceConnected ? 'default' : 'directory', banks, workspaceFolders, rounds, userSettings, questionNotes, questionErrorRecords, personalNotebooks).catch(() => {})
      }).catch(() => setWorkspaceState('error'))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [studyRounds, statuses, activities, userSettings, questionErrorRecords, personalNotebooks, workspaceHandle, workspaceState, defaultWorkspaceConnected, workspaceReady])
  useEffect(() => {
    if (workspaceState !== 'connected' || !workspaceReady) return
    const bucketKeys = new Set(dirtyWorkspaceNoteBuckets.current)
    if (!bucketKeys.size) return
    const snapshot = notesSnapshot(banks, questionNotes)
    if (snapshot === workspaceNotesSnapshot.current) return
    const timer = window.setTimeout(() => {
      dirtyWorkspaceNoteBuckets.current.clear()
      const save = defaultWorkspaceConnected
        ? writeDefaultWorkspaceNoteBuckets(questionNotes, banks, bucketKeys)
        : workspaceHandle ? writeWorkspaceNoteBuckets(workspaceHandle, questionNotes, banks, bucketKeys) : Promise.resolve()
      save.then(() => {
        workspaceNotesSnapshot.current = snapshot
        void persistWorkspaceCache(defaultWorkspaceConnected ? 'default' : 'directory', banks, workspaceFolders, currentStudyRounds(), userSettings, questionNotes, questionErrorRecords, personalNotebooks).catch(() => {})
      }).catch(() => {
        bucketKeys.forEach(key => dirtyWorkspaceNoteBuckets.current.add(key))
        setWorkspaceState('error')
      })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [banks, questionNotes, workspaceHandle, workspaceState, defaultWorkspaceConnected, workspaceReady])
  useEffect(() => {
    setAdvancedFilter(createEmptyAdvancedQuestionFilter())
    setAdvancedFilterOpen(false)
  }, [bankId, sectionId, view])
  useEffect(() => {
    restoreSavedNavigation(banks, statuses)
    setNavigationReady(true)
  }, [])
  useEffect(() => {
    if (!navigationReady) return
    let cancelled = false
    const store = (module: Partial<DeferredModules>) => {
      if (!cancelled) setDeferredModules(current => ({ ...current, ...module }))
    }
    const cancelPreloads = scheduleDeferredPreloads([
      { delayMs: 0, load: async () => store({ LearningDashboard: (await loadLearningDashboard()).default }) },
      { delayMs: 0, load: async () => store({ DashboardQuestionDialog: (await loadDashboardQuestionDialog()).default }) },
      { delayMs: 0, load: async () => store({ QuestionZoomDialog: (await loadQuestionZoomDialog()).default }) },
      { delayMs: 0, load: async () => store({ SettingsPanel: (await loadSettingsPanel()).default }) },
      { delayMs: 0, load: async () => store({ NotesDialog: (await loadNotesDialog()).default }) },
      { delayMs: 0, load: async () => store({ TimerDialog: (await loadTimerDialog()).default }) },
      { delayMs: 0, load: async () => store({ QuestionBankEditor: (await loadQuestionBankEditor()).default }) },
    ])
    return () => {
      cancelled = true
      cancelPreloads()
    }
  }, [navigationReady])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    const finishPrinting = () => { setPrintMode(false); setPrintJob(null) }
    window.addEventListener('afterprint', finishPrinting)
    return () => window.removeEventListener('afterprint', finishPrinting)
  }, [])
  useEffect(() => {
    if (!printMode || !printJob) return
    let cancelled = false
    const preparePrint = async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (!printSheetRef.current) throw new Error('打印内容准备失败，请重试')
      await waitForExportContent(printSheetRef.current)
      if (!cancelled) { setToast('打印预览已就绪，可选择“另存为 PDF”'); window.print() }
    }
    preparePrint().catch(error => {
      if (cancelled) return
      setPrintMode(false); setPrintJob(null)
      setToast(error instanceof Error ? error.message : 'PDF 导出失败')
    })
    return () => { cancelled = true }
  }, [printMode, printJob])

  const bank = banks.find(b => b.id === bankId) || banks[0] || emptyWorkspaceBank
  const subject = bankSubject(bank)
  const notePreviewData = noteQuestionPreview ? (() => {
    const targetBank = banks.find(item => item.id === noteQuestionPreview.bankId)
    const targetEntry = targetBank && orderedQuestionEntriesForBank(targetBank).find(entry => entry.question.id === noteQuestionPreview.questionId)
    const targetSection = targetBank?.chapters.flatMap(chapter => chapter.sections).find(item => item.id === targetEntry?.sectionId)
    return targetBank && targetEntry ? { bank: targetBank, entry: targetEntry, questions: targetSection?.questions || [targetEntry.question] } : null
  })() : null
  const noteEditData = noteQuestionEditor ? (() => {
    const targetBank = banks.find(item => item.id === noteQuestionEditor.bankId)
    const targetEntry = targetBank && orderedQuestionEntriesForBank(targetBank).find(entry => entry.question.id === noteQuestionEditor.questionId)
    return targetBank && targetEntry ? { bank: targetBank, entry: targetEntry } : null
  })() : null
  const notePreviewQuestionIndex = notePreviewData?.questions.findIndex(item => item.id === notePreviewData.entry.question.id) ?? -1
  const mathFolderLabel = newBankMathModule === 'exams' ? '真题' : newBankMathModule === 'linear' ? '线代' : '高数'
  const newBankFolderPreview = newBankSubject === 'math'
    ? `数学/${mathFolderLabel}/${safeFolderName(newBankName || '题库名称')}`
    : `${newBankSubject === 'english' ? '英语' : '专业课'}/${safeFolderName(newBankName || '题库名称')}`
  const subjectBanks = useMemo(() => {
    const matchingBanks = banks.filter(item => bankSubject(item) === subject)
    if (subject !== 'math') return sortBanksForDisplay(matchingBanks)
    return sortBanksForDisplay(matchingBanks.filter(item => bankMathModules(item).includes(mathModule)))
  }, [banks, subject, mathModule])
  const section: Section | undefined = bank?.chapters.flatMap(c => c.sections).find(s => s.id === sectionId)
  const answerContext = `${subject}:${bank?.id || ''}:${sectionId}:${view}:${mathModule}:${englishNavigationMode}:${englishTopic}`
  const previousAnswerContext = useRef(answerContext)
  useEffect(() => {
    if (previousAnswerContext.current === answerContext) return
    previousAnswerContext.current = answerContext
    setAnswerOpen(false)
    setAnswerLocked(false)
    setQuestionNoteOpen(false)
    setQuestionNoteLocked(false)
  }, [answerContext])
  const bankQuestionEntries = useMemo(() => orderedQuestionEntriesForBank(bank), [bank])
  const englishTopicGroups = useMemo(() => subject === 'english' ? groupEnglishTopicEntries(bankQuestionEntries) : [], [subject, bankQuestionEntries])
  const selectedEnglishTopicGroup = englishTopicGroups.find(group => group.key === englishTopic) || englishTopicGroups[0]
  const isEnglishTopicMode = subject === 'english' && englishNavigationMode === 'topic'
  const isMathExamBank = subject === 'math' && bankMathModules(bank).includes('exams')
  const examKeyPointGroups = useMemo(() => isMathExamBank ? groupMathExamQuestions(bankQuestionEntries) : [], [isMathExamBank, bankQuestionEntries])
  const examKeyPointCatalogTree = useMemo(() => {
    const groupsByKey = new Map(examKeyPointGroups.map(group => [group.key, group]))
    return mathExamKeyPointCatalog.map(module => ({
      ...module,
      sections: module.sections.map(sectionItem => ({
        ...sectionItem,
        groups: sectionItem.topics.map(topic => groupsByKey.get(topic.key)).filter((group): group is MathExamKeyPointGroup => Boolean(group)),
      })).filter(sectionItem => sectionItem.groups.length),
    })).filter(module => module.sections.length)
  }, [examKeyPointGroups])
  const selectedExamKeyPointGroup = examKeyPointGroups.find(group => group.key === mathExamKeyPoint) || examKeyPointGroups[0]
  const isMathExamKeyPointMode = isMathExamBank && mathExamNavigationMode === 'keyPoint'
  const currentBankStats = useMemo(() => calculateLearningStats([bank], statuses), [bank, statuses])
  const currentChapter = bank.chapters.find(chapter => chapter.sections.some(item => item.id === sectionId))
  const currentPaperEntries = currentChapter ? bankQuestionEntries.filter(entry => entry.chapterId === currentChapter.id) : bankQuestionEntries
  const currentEnglishTopicEntries = useMemo(() => {
    if (!isEnglishTopicMode || !currentChapter) return []
    return selectedEnglishTopicGroup?.entries.filter(entry => entry.chapterId === currentChapter.id) || []
  }, [isEnglishTopicMode, currentChapter, selectedEnglishTopicGroup])
  const englishTopicNavigationGroups = useMemo(() => {
    if (!isEnglishTopicMode || !currentChapter || !currentEnglishTopicEntries.length) return []
    return [{ year: currentChapter.name.match(/^\d{4}/)?.[0] || currentChapter.name, entries: currentEnglishTopicEntries }]
  }, [isEnglishTopicMode, currentChapter, currentEnglishTopicEntries])
  const reviewEntries = useMemo(() => bankQuestionEntries.filter(entry => statuses[entry.question.id] === 'vague' || statuses[entry.question.id] === 'wrong'), [bankQuestionEntries, statuses])
  const reviewQuestions = useMemo(() => reviewEntries.map(entry => entry.question), [reviewEntries])
  const sourceQuestions = view === 'wrong'
    ? reviewQuestions
    : isMathExamKeyPointMode
      ? selectedExamKeyPointGroup?.entries.map(entry => entry.question) || []
      : isEnglishTopicMode
        ? currentEnglishTopicEntries.map(entry => entry.question)
      : section?.questions || []
  const currentNavigationQuestions = isMathExamKeyPointMode || isEnglishTopicMode
    ? sourceQuestions
    : subject === 'english' && currentChapter
      ? currentChapter.sections.flatMap(item => item.questions)
      : section?.questions || []
  const currentNavigationStats = view === 'section'
    ? calculateQuestionStats(currentNavigationQuestions, statuses)
    : currentBankStats
  const englishTopicYear = currentChapter?.name.match(/^\d{4}/)?.[0] || ''
  const englishTopicYearLabel = englishTopicYear ? `${englishTopicYear}年` : currentChapter?.name || ''
  const englishTopicSectionLabel = section?.name.replace(/^Part A\s*[·.]?\s*/i, '').trim() || ''
  const englishTopicContextLabel = isEnglishTopicMode
    ? [englishTopicYearLabel, englishTopicSectionLabel].filter(Boolean).join(' · ')
    : ''
  const currentStudyLabel = isMathExamKeyPointMode
    ? selectedExamKeyPointGroup?.key || '考点目录'
    : isEnglishTopicMode
      ? selectedEnglishTopicGroup?.label || '专题目录'
      : section?.name || '未选择'
  const binaryFilterMode = subject === 'english'
  const questionNavigationTags = (item: Question) => (item.tagIds || [])
    .map(tagId => questionTagById.get(tagId))
    .filter((tag): tag is QuestionTagDefinition => Boolean(tag))
  const questionNavigationTagLabel = (item: Question) => {
    const tags = questionNavigationTags(item)
    return tags.length ? tags.map(tag => tag.name).join('、') : '未添加标签'
  }
  const questionNavigationButtonClass = (selected: boolean, status: QuestionStatus) => `${selected ? 'selected ' : ''}${questionNavigationMode === 'mastery' ? status : 'tag-mode'}`
  const questionNavigationButtonStyle = (item: Question) => {
    if (questionNavigationMode !== 'tags') return undefined
    const tags = questionNavigationTags(item)
    if (!tags.length) return undefined
    const backgrounds = tags.slice(0, 3).map(tag => `color-mix(in srgb, ${tag.color} 16%, #fff)`)
    return { background: backgrounds.length === 1 ? backgrounds[0] : `linear-gradient(135deg, ${backgrounds.join(', ')})`, borderColor: `color-mix(in srgb, ${tags[0].color} 42%, #e3ddd5)` }
  }
  const renderQuestionNavigationIndicator = (item: Question, status: QuestionStatus) => {
    if (questionNavigationMode === 'tags') return <span className={`question-nav-mastery-dot ${status}`} aria-hidden="true"/>
    const tags = questionNavigationTags(item)
    return <span className={tags.length ? 'question-nav-tag-dots' : 'question-nav-tag-dots empty'} aria-hidden="true">{tags.slice(0, 3).map(tag => <i key={tag.id} style={{ backgroundColor: tag.color }}/>) }{tags.length > 3 && <em>+{tags.length - 3}</em>}</span>
  }
  const questionNavigationTitle = (context: string, item: Question) => {
    const title = `${context} · 第 ${item.number} 题`
    return questionNavigationMode === 'tags' ? `${title} · 标签：${questionNavigationTagLabel(item)}` : title
  }
  const renderQuestionNavigationModeSwitch = () => <div className="question-nav-mode-switch" role="group" aria-label="题号导航显示方式">
    <button type="button" className={questionNavigationMode === 'mastery' ? 'active' : ''} aria-pressed={questionNavigationMode === 'mastery'} onClick={() => setQuestionNavigationMode('mastery')}>熟练度</button>
    <button type="button" className={questionNavigationMode === 'tags' ? 'active' : ''} aria-pressed={questionNavigationMode === 'tags'} onClick={() => setQuestionNavigationMode('tags')}>标签</button>
  </div>
  const isPartBSection = view === 'section' && Boolean(section?.questions.length) && section!.questions.every(item => item.type === '阅读理解 Part B')
  const sharedPartBOptions = isPartBSection ? section?.questions[0]?.options || [] : []
  const hasLongPartBOptions = sharedPartBOptions.some(option => option.length > 180)
  const partBOptionBankMeta = section?.partBKind === 'ordering'
    ? { title: '待排序段落', description: '以下段落供第 41–45 题共同使用。' }
    : section?.partBKind === 'subheading'
      ? { title: '备选小标题', description: '以下小标题供第 41–45 题共同使用。' }
      : section?.partBKind === 'viewpoint'
        ? { title: '备选观点', description: '以下观点供第 41–45 题共同使用。' }
        : { title: '备选句', description: '以下句子供第 41–45 题共同使用。' }
  const statusFilterValues: QuestionStatus[] = view === 'wrong'
    ? binaryFilterMode ? ['wrong'] : ['vague', 'wrong']
    : binaryFilterMode ? ['none', 'wrong', 'proficient'] : ['none', 'wrong', 'vague', 'proficient']
  const statusFilterOptions = statusFilterValues.map(value => ({ value, label: (binaryFilterMode ? binaryStatusMeta : statusMeta)[value].label }))
  const activeQuestionFilterCount = advancedQuestionFilterCount(advancedFilter)
  const availableQuestionTypes = useMemo(() => Array.from(new Set(sourceQuestions.map(questionTypeFilterValue).filter(value => value !== IMAGE_QUESTION_TYPE))).sort((left, right) => {
    if (left === UNASSIGNED_QUESTION_TYPE) return 1
    if (right === UNASSIGNED_QUESTION_TYPE) return -1
    return left.localeCompare(right, 'zh-CN')
  }).map(value => ({ value, label: questionTypeFilterLabel(value) })), [sourceQuestions])
  const filteredQuestions = useMemo(() => sourceQuestions.filter(q => {
    const statusValue = effectiveQuestionStatus(q, statuses[q.id] || 'none', binaryFilterMode)
    const readingLabel = readingTypeMeta.find(item => item.value === q.readingType)?.label || ''
    const tagLabel = (q.tagIds || []).map(tagId => questionTagById.get(tagId)?.name || '').join(' ')
    const haystack = `${q.text} ${q.answer} ${q.analysis} ${q.type || ''} ${readingLabel} ${tagLabel}`.toLowerCase()
    return matchesAdvancedQuestionFilter(q, advancedFilter, statusValue) && haystack.includes(query.trim().toLowerCase())
  }), [sourceQuestions, query, statuses, binaryFilterMode, advancedFilter, questionTagById])
  const question = filteredQuestions[Math.min(questionIndex, Math.max(0, filteredQuestions.length - 1))]
  const questionSources = question ? questionImageSources(question, 'question') : []
  const answerSources = question ? questionImageSources(question, 'answer') : []
  const questionText = question && (question.type === '图片题' || questionSources.length) && question.text === `第 ${question.number} 题` ? '' : question?.text
  const questionTypeLabel = question?.type && !isImageQuestionType(question.type) ? question.type : undefined
  const hasAnswerImages = answerSources.length > 0
  const usesImageAnswer = Boolean(question && hasAnswerImages && isImageAnswerPlaceholder(question.answer))
  const currentQuestionNavigationEntry = question ? bankQuestionEntries.find(entry => entry.question.id === question.id) : undefined
  const currentEnglishTopicSection = isEnglishTopicMode && currentQuestionNavigationEntry
    ? bank.chapters.flatMap(chapter => chapter.sections).find(itemSection => itemSection.id === currentQuestionNavigationEntry.sectionId)
    : undefined
  const currentQuestionEntry = view === 'wrong' ? reviewEntries.find(entry => entry.question.id === question?.id) : undefined
  const currentQuestionStatus = effectiveQuestionStatus(question, question ? statuses[question.id] || 'none' : 'none', binaryFilterMode)
  const counts = bankQuestionEntries.reduce((acc, entry) => { const s = effectiveQuestionStatus(entry.question, statuses[entry.question.id] || 'none', binaryFilterMode); acc[s]++; return acc }, { none: 0, proficient: 0, vague: 0, wrong: 0 })
  const allPassageAnswersOpen = filteredQuestions.length > 0 && filteredQuestions.every(item => expandedPassageAnswers.has(item.id))
  const showFullPaperNavigation = binaryFilterMode && view === 'section' && !isEnglishTopicMode
  const showKeyPointNavigation = isMathExamKeyPointMode && view === 'section'
  const showEnglishTopicNavigation = isEnglishTopicMode && view === 'section'
  const questionEntriesById = useMemo(() => new Map(bankQuestionEntries.map(entry => [entry.question.id, entry])), [bankQuestionEntries])
  const filteredQuestionEntries = useMemo(() => filteredQuestions.map(item => questionEntriesById.get(item.id)).filter((entry): entry is BankQuestionEntry => Boolean(entry)), [filteredQuestions, questionEntriesById])
  const englishTopicSectionGroups = useMemo<EnglishTopicSectionGroup[]>(() => {
    if (!isEnglishTopicMode || !currentChapter) return []
    const entriesBySection = new Map<string, BankQuestionEntry[]>()
    filteredQuestionEntries.forEach(entry => {
      const entries = entriesBySection.get(entry.sectionId) || []
      entries.push(entry)
      entriesBySection.set(entry.sectionId, entries)
    })
    return currentChapter.sections
      .map(itemSection => ({ section: itemSection, entries: entriesBySection.get(itemSection.id) || [] }))
      .filter(group => group.entries.length > 0)
  }, [isEnglishTopicMode, currentChapter, filteredQuestionEntries])
  const currentEnglishTopicPassageGroup = englishTopicSectionGroups.find(group => group.entries.some(entry => entry.question.id === question?.id))
    || englishTopicSectionGroups.find(group => group.section.id === sectionId)
  const englishTopicHasPassageSection = Boolean(currentEnglishTopicPassageGroup && (currentEnglishTopicPassageGroup.section.passage || currentEnglishTopicPassageGroup.section.passageImageUrls?.length || currentEnglishTopicPassageGroup.section.passageAnalysisImageUrls?.length || (currentEnglishTopicPassageGroup.section.questions.length > 0 && currentEnglishTopicPassageGroup.section.questions.every(item => item.type === '阅读理解 Part B'))))
  const showPassageStudy = Boolean(question && view === 'section' && (isEnglishTopicMode
    ? englishTopicHasPassageSection
    : !isMathExamKeyPointMode && Boolean(section?.passage || section?.passageImageUrls?.length || section?.passageAnalysisImageUrls?.length || isPartBSection)))
  const keyPointNavigationGroups = useMemo<MathExamYearNavigationGroup[]>(() => {
    if (!showKeyPointNavigation) return []
    const groups = new Map<string, BankQuestionEntry[]>()
    filteredQuestionEntries.forEach(entry => {
      const year = entry.chapterName.match(/^\d{4}/)?.[0] || entry.chapterName
      const group = groups.get(year) || []
      group.push(entry)
      groups.set(year, group)
    })
    return Array.from(groups, ([year, entries]) => ({ year, entries }))
  }, [filteredQuestionEntries, showKeyPointNavigation])
  const reviewNavigationGroups = useMemo(() => {
    if (view !== 'wrong') return []
    const visibleIds = new Set(filteredQuestions.map(item => item.id))
    return bank.chapters.flatMap(chapter => chapter.sections.map(itemSection => ({
      id: itemSection.id,
      label: `${chapter.name} · ${itemSection.name}`,
      entries: reviewEntries.filter(entry => entry.sectionId === itemSection.id && visibleIds.has(entry.question.id)),
    }))).filter(group => group.entries.length)
  }, [view, filteredQuestions, bank.chapters, reviewEntries])
  const questionNavigationLegendQuestions = view === 'wrong'
    ? reviewNavigationGroups.flatMap(group => group.entries.map(entry => entry.question))
    : showKeyPointNavigation
      ? keyPointNavigationGroups.flatMap(group => group.entries.map(entry => entry.question))
      : showFullPaperNavigation
        ? currentPaperEntries.map(entry => entry.question)
        : filteredQuestions
  const questionNavigationLegendTagIds = new Set(questionNavigationLegendQuestions.flatMap(item => questionNavigationTags(item).map(tag => tag.id)))
  const questionNavigationLegendTags = questionTags.filter(tag => questionNavigationLegendTagIds.has(tag.id))
  const renderQuestionNavigationLegend = () => <div className="legend question-nav-legend">
    <span><i className={questionNavigationMode === 'mastery' ? 'question-nav-legend-square proficient' : 'question-nav-mastery-dot proficient'}/>{binaryFilterMode ? '正确' : '熟练'}</span>{!binaryFilterMode && <span><i className={questionNavigationMode === 'mastery' ? 'question-nav-legend-square vague' : 'question-nav-mastery-dot vague'}/>模糊</span>}<span><i className={questionNavigationMode === 'mastery' ? 'question-nav-legend-square wrong' : 'question-nav-mastery-dot wrong'}/>{binaryFilterMode ? '错误' : '错题'}</span>
    {questionNavigationLegendTags.map(tag => <span key={tag.id}><i className={questionNavigationMode === 'tags' ? 'question-nav-tag-legend-square' : 'question-nav-tag-legend-line'} style={{ backgroundColor: tag.color }}/>{tag.name}</span>)}
  </div>

  const currentNavigationChapterId = currentQuestionNavigationEntry?.chapterId || currentChapter?.id
  const currentNavigationSectionId = view === 'wrong'
    ? currentQuestionNavigationEntry?.sectionId
    : sectionId
  const currentNavigationKeyPointId = isMathExamKeyPointMode ? selectedExamKeyPointGroup?.key : undefined
  const LoadedSettingsPanel = deferredModules.SettingsPanel
  const LoadedTimerDialog = deferredModules.TimerDialog
  const LoadedNotesDialog = deferredModules.NotesDialog
  const LoadedQuestionBankEditor = deferredModules.QuestionBankEditor
  const LoadedLearningDashboard = deferredModules.LearningDashboard
  const LoadedDashboardQuestionDialog = deferredModules.DashboardQuestionDialog
  const LoadedQuestionZoomDialog = deferredModules.QuestionZoomDialog

  useEffect(() => {
    if (activePage !== 'study' || (!currentNavigationChapterId && !currentNavigationKeyPointId)) return

    if (!isMathExamKeyPointMode && currentNavigationChapterId) {
      setExpandedChapterIds(previous => {
        if (previous.has(currentNavigationChapterId)) return previous
        return new Set(previous).add(currentNavigationChapterId)
      })
    }

    let settleFrame = 0
    const frame = window.requestAnimationFrame(() => {
      settleFrame = window.requestAnimationFrame(() => {
        const container = chapterScrollRef.current
        if (!container) return
        const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-chapter-id], [data-section-id], [data-keypoint-id]'))
        const chapterTarget = currentNavigationChapterId
          ? elements.find(element => element.dataset.chapterId === currentNavigationChapterId)
          : undefined
        const sectionTarget = currentNavigationSectionId
          ? elements.find(element => element.dataset.sectionId === currentNavigationSectionId)
          : undefined
        const keyPointTarget = currentNavigationKeyPointId
          ? elements.find(element => element.dataset.keypointId === currentNavigationKeyPointId)
          : undefined
        const target = sectionTarget || keyPointTarget || chapterTarget
        if (!target) return

        const containerRect = container.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        const currentScrollTop = container.scrollTop
        const targetTop = targetRect.top - containerRect.top + currentScrollTop
        const top = navigationScrollTop({
          containerHeight: container.clientHeight,
          scrollHeight: container.scrollHeight,
          currentScrollTop,
          chapterTop: targetTop,
          sectionTop: sectionTarget ? targetTop : undefined,
          sectionHeight: sectionTarget ? targetRect.height : undefined,
        })
        if (Math.abs(top - currentScrollTop) < 1) return
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        container.scrollTo({ top, behavior })
      })
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (settleFrame) window.cancelAnimationFrame(settleFrame)
    }
  }, [activePage, isMathExamKeyPointMode, isEnglishTopicMode, currentNavigationChapterId, currentNavigationSectionId, currentNavigationKeyPointId])

  useEffect(() => {
    if (!navigationReady) return
    const currentPosition: SavedNavigation = {
      bankId: bank?.id || '',
      sectionId,
      questionId: question?.id || '',
      view,
      ...(subject === 'english' ? { englishNavigationMode, englishTopic } : {}),
    }
    if (subject === 'math') {
      mathStudyPositions.current[mathModule] = currentPosition
      studyPositions.current.math = currentPosition
    } else studyPositions.current[subject] = currentPosition
    if (currentPosition.bankId) {
      bankStudyPositions.current[currentPosition.bankId] = currentPosition
      if (subject === 'english') {
        if (englishNavigationMode === 'topic') englishTopicPositions.current[`${currentPosition.bankId}:${englishTopic}`] = currentPosition
        else englishPaperPositions.current[currentPosition.bankId] = currentPosition
      }
    }
    saveNavigation({
      ...currentPosition,
      page: activePage,
      profileBankId,
      studyPositions: studyPositions.current,
      mathStudyPositions: mathStudyPositions.current,
      bankStudyPositions: bankStudyPositions.current,
      englishPaperPositions: englishPaperPositions.current,
      englishTopicPositions: englishTopicPositions.current,
    })
  }, [navigationReady, bank?.id, sectionId, question?.id, view, activePage, profileBankId, subject, mathModule, englishNavigationMode, englishTopic])

  useEffect(() => {
    const questionId = question?.id || ''
    if (!questionId) {
      displayedQuestionId.current = ''
      return
    }
    if (!displayedQuestionId.current) {
      displayedQuestionId.current = questionId
      return
    }
    if (displayedQuestionId.current === questionId) return
    displayedQuestionId.current = questionId
    const frame = window.requestAnimationFrame(() => questionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => window.cancelAnimationFrame(frame)
  }, [question?.id])

  useEffect(() => {
    if (!sectionScrollToTopPending.current) return
    sectionScrollToTopPending.current = false
    const frame = window.requestAnimationFrame(() => {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      studyContentTopRef.current?.scrollIntoView({ behavior, block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [sectionId])

  function collapseAnswerUnlessLocked() {
    if (!answerLocked) setAnswerOpen(false)
    if (!questionNoteLocked) setQuestionNoteOpen(false)
  }

  function togglePassageAnalysis(sectionId: string) {
    setExpandedPassageAnalyses(previous => {
      const next = new Set(previous)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  function renderPassageAnalysis(section: Section, alt: string) {
    const urls = section.passageAnalysisImageUrls
    if (!urls?.length) return null
    const expanded = expandedPassageAnalyses.has(section.id)
    return <div className="source-analysis">
      <div className="source-analysis-heading">
        <div><span>FULL ANALYSIS</span><h3>全文解析</h3></div>
        <button className="passage-answer-toggle source-analysis-toggle" aria-expanded={expanded} onClick={() => togglePassageAnalysis(section.id)}><CircleHelp size={16}/>{expanded ? '收起全文解析' : '查看全文解析'}<ChevronDown className={expanded ? 'rotated' : ''} size={15}/></button>
      </div>
      {expanded && <AssetGallery urls={urls} alt={alt}/>}
    </div>
  }

  function updateQuestionTags(nextTags: QuestionTagDefinition[]) {
    setUserSettings(previous => ({ ...previous, questionTags: validateQuestionTagDefinitions(nextTags) }))
  }

  function resetQuestionTags() {
    setUserSettings(previous => ({ ...previous, questionTags: validateQuestionTagDefinitions(DEFAULT_QUESTION_TAGS) }))
  }

  function setQuestionTagIds(questionId: string, nextTagIds: string[]) {
    const validTagIds = [...new Set(nextTagIds)].filter(tagId => questionTagById.has(tagId))
    setBanks(previous => previous.map(item => ({
      ...item,
      chapters: item.chapters.map(chapter => ({
        ...chapter,
        sections: chapter.sections.map(itemSection => ({
          ...itemSection,
          questions: itemSection.questions.map(itemQuestion => itemQuestion.id === questionId
            ? { ...itemQuestion, tagIds: validTagIds.length ? validTagIds : undefined }
            : itemQuestion)
        }))
      }))
    })))
  }

  function selectBank(next: QuestionBank) {
    if (bankSubject(next) === 'math') {
      const modules = bankMathModules(next)
      if (modules.length === 1) setMathModule(modules[0])
      else if (!modules.includes(mathModule)) setMathModule('calculus')
    }
    const savedPosition = bankStudyPositions.current[next.id] || null
    const restored = resolveNavigation([next], statuses, savedPosition)
    setBankId(next.id)
    setSectionId(restored?.sectionId || next.chapters[0]?.sections[0]?.id || '')
    setMathExamNavigationMode('paper')
    setMathExamKeyPoint('')
    if (bankSubject(next) === 'english') {
      setEnglishNavigationMode(savedPosition?.englishNavigationMode === 'topic' ? 'topic' : 'paper')
      setEnglishTopic(savedPosition?.englishTopic || 'cloze')
    } else {
      setEnglishNavigationMode('paper')
      setEnglishTopic('cloze')
    }
    setExpandedChapterIds(new Set(restored ? [restored.chapterId] : next.chapters[0] ? [next.chapters[0].id] : []))
    setQuestionIndex(restored?.questionIndex || 0)
    collapseAnswerUnlessLocked()
    setExpandedPassageAnswers(new Set())
    setAdvancedFilter(createEmptyAdvancedQuestionFilter())
    setQuery('')
    setView(restored?.view || 'section')
    setSidebar(false)
  }
  function restoreSavedNavigation(targetBanks: QuestionBank[], targetStatuses: Record<string, QuestionStatus>) {
    const saved = loadNavigation()
    if (!saved) return false
    studyPositions.current = { ...saved.studyPositions }
    mathStudyPositions.current = { ...saved.mathStudyPositions }
    bankStudyPositions.current = Object.fromEntries(Object.entries(saved.bankStudyPositions || {})
      .filter(([savedBankId]) => targetBanks.some(item => item.id === savedBankId)))
    englishPaperPositions.current = Object.fromEntries(Object.entries(saved.englishPaperPositions || {})
      .filter(([savedBankId]) => targetBanks.some(item => item.id === savedBankId)))
    englishTopicPositions.current = Object.fromEntries(Object.entries(saved.englishTopicPositions || {})
      .filter(([, position]) => targetBanks.some(item => item.id === position.bankId)))
    setProfileBankId(resolveProfileBankId(targetBanks, saved.profileBankId || saved.bankId))
    setActivePage(saved.page)
    const restored = resolveNavigation(targetBanks, targetStatuses, saved)
    if (!restored) return saved.page === 'profile'
    const restoredBank = targetBanks.find(item => item.id === restored.bankId)
    if (restoredBank) {
      const restoredSubject = bankSubject(restoredBank)
      studyPositions.current[restoredSubject] = saved
      if (restoredSubject === 'english') {
        setEnglishNavigationMode(saved.englishNavigationMode === 'topic' ? 'topic' : 'paper')
        setEnglishTopic(saved.englishTopic || 'cloze')
      }
      if (restoredSubject === 'math') {
        const restoredModule = bankMathModule(restoredBank)
        setMathModule(restoredModule)
        if (!mathStudyPositions.current[restoredModule]) mathStudyPositions.current[restoredModule] = saved
      }
    }
    setBankId(restored.bankId); setSectionId(restored.sectionId); setExpandedChapterIds(new Set([restored.chapterId])); setQuestionIndex(restored.questionIndex); setView(restored.view)
    collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set()); setAdvancedFilter(createEmptyAdvancedQuestionFilter()); setQuery('')
    return true
  }
  function selectSubject(nextSubject: Subject) {
    if (bankSubject(bank) === nextSubject) {
      setActivePage('study'); setSidebar(false)
      return
    }
    const savedPosition = nextSubject === 'math'
      ? mathStudyPositions.current[mathModule] || studyPositions.current.math || null
      : studyPositions.current[nextSubject] || null
    const restored = resolveNavigation(banks.filter(item => bankSubject(item) === nextSubject), statuses, savedPosition)
    if (restored) {
      const restoredBank = banks.find(item => item.id === restored.bankId)
      let restoredChapterId = restored.chapterId
      let restoredSectionId = restored.sectionId
      let restoredQuestionIndex = restored.questionIndex
      if (nextSubject === 'math' && restoredBank) {
        const restoredModule = bankMathModule(restoredBank)
        setMathModule(restoredModule)
        if (savedPosition) mathStudyPositions.current[restoredModule] = savedPosition
      }
      if (nextSubject === 'english') {
        setEnglishNavigationMode(savedPosition?.englishNavigationMode === 'topic' ? 'topic' : 'paper')
        setEnglishTopic(savedPosition?.englishTopic || 'cloze')
        const topicRestored = restoredBank ? resolveEnglishTopicNavigation(restoredBank, savedPosition) : null
        if (topicRestored) {
          restoredChapterId = topicRestored.chapterId
          restoredSectionId = topicRestored.sectionId
          restoredQuestionIndex = topicRestored.questionIndex
        }
      }
      setBankId(restored.bankId); setSectionId(restoredSectionId); setExpandedChapterIds(new Set([restoredChapterId])); setQuestionIndex(restoredQuestionIndex); setView(restored.view)
      collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set()); setAdvancedFilter(createEmptyAdvancedQuestionFilter()); setQuery(''); setActivePage('study'); setSidebar(false)
      return
    }
    const nextBank = sortBanksForDisplay(banks.filter(item => bankSubject(item) === nextSubject))[0]
    if (nextBank) { setActivePage('study'); selectBank(nextBank) }
    else {
      setNewBankSubject(nextSubject)
      setSettingsPanelOpen(true)
      setToast(`还没有${subjectLabels[nextSubject]}题库，请在设置中创建`)
    }
  }
  function selectMathModule(nextModule: MathModule) {
    const mathBanks = banks.filter(item => bankSubject(item) === 'math' && bankMathModules(item).includes(nextModule))
    const restored = resolveNavigation(mathBanks, statuses, mathStudyPositions.current[nextModule] || null)
    if (restored) {
      const restoredBank = mathBanks.find(item => item.id === restored.bankId)
      setMathModule(nextModule)
      if (restoredBank) setBankId(restoredBank.id)
      setSectionId(restored.sectionId); setExpandedChapterIds(new Set([restored.chapterId])); setQuestionIndex(restored.questionIndex); setView(restored.view)
      collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set()); setAdvancedFilter(createEmptyAdvancedQuestionFilter()); setQuery(''); setActivePage('study'); setSidebar(false)
      return
    }
    setMathModule(nextModule)
    const nextBanks = sortBanksForDisplay(mathBanks)
    const currentBankIsVisible = bankSubject(bank) === 'math'
      && bankMathModules(bank).includes(nextModule)
      && bankMathModules(bank).length === 1
    if (currentBankIsVisible) {
      setActivePage('study'); setSidebar(false)
      return
    }
    const nextBank = nextBanks.find(item => bankMathModules(item).length === 1) || nextBanks[0]
    if (nextBank) {
      setActivePage('study')
      selectBank(nextBank)
    } else {
      setToast(`还没有${mathModuleLabels[nextModule]}题库，可以先新建一个`)
    }
  }
  function selectSection(id: string) {
    const owner = bank.chapters.find(chapter => chapter.sections.some(item => item.id === id))
    if (owner) setExpandedChapterIds(previous => new Set(previous).add(owner.id))
    sectionScrollToTopPending.current = shouldScrollSectionChangeToTop(subject, sectionId, id)
    setSectionId(id); setQuestionIndex(0); collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set()); setAdvancedFilter(createEmptyAdvancedQuestionFilter()); setView('section'); setSidebar(false)
  }
  function selectMathExamNavigationMode(nextMode: MathExamNavigationMode) {
    if (!isMathExamBank) return
    const nextGroup = nextMode === 'keyPoint' ? examKeyPointGroups[0] : undefined
    const nextSectionId = nextGroup?.entries[0]?.sectionId || bank.chapters[0]?.sections[0]?.id || ''
    setMathExamNavigationMode(nextMode)
    setMathExamKeyPoint(nextGroup?.key || '')
    setSectionId(nextSectionId)
    setQuestionIndex(0)
    collapseAnswerUnlessLocked()
    setExpandedPassageAnswers(new Set())
    setAdvancedFilter(createEmptyAdvancedQuestionFilter())
    setQuery('')
    setView('section')
    setSidebar(false)
  }
  function selectMathExamKeyPoint(key: string) {
    const group = examKeyPointGroups.find(item => item.key === key)
    if (!group) return
    setMathExamNavigationMode('keyPoint')
    setMathExamKeyPoint(group.key)
    setSectionId(group.entries[0]?.sectionId || '')
    setQuestionIndex(0)
    collapseAnswerUnlessLocked()
    setExpandedPassageAnswers(new Set())
    setAdvancedFilter(createEmptyAdvancedQuestionFilter())
    setQuery('')
    setView('section')
    setSidebar(false)
  }

  function englishTopicPositionKey(topic: EnglishTopicKey, targetBankId = bank?.id || '') {
    return `${targetBankId}:${topic}`
  }

  function rememberEnglishPosition(position: SavedNavigation) {
    if (!position.bankId) return
    bankStudyPositions.current[position.bankId] = position
    if (position.englishNavigationMode === 'topic' && position.englishTopic) {
      englishTopicPositions.current[englishTopicPositionKey(position.englishTopic, position.bankId)] = position
    } else if (position.englishNavigationMode === 'paper') {
      englishPaperPositions.current[position.bankId] = position
    }
  }

  function rememberCurrentEnglishPosition() {
    if (subject !== 'english' || !bank?.id) return
    rememberEnglishPosition({
      bankId: bank.id,
      sectionId,
      questionId: question?.id || '',
      view,
      englishNavigationMode,
      englishTopic,
    })
  }

  function topicEntryForSavedPosition(group: typeof englishTopicGroups[number], saved: SavedNavigation | undefined) {
    if (!saved) return undefined
    return group.entries.find(entry => entry.question.id === saved.questionId)
      || group.entries.find(entry => entry.sectionId === saved.sectionId)
  }

  function topicQuestionIndex(group: typeof englishTopicGroups[number], entry: BankQuestionEntry) {
    const chapterEntries = group.entries.filter(item => item.chapterId === entry.chapterId)
    return Math.max(0, chapterEntries.findIndex(item => item.question.id === entry.question.id))
  }

  function savedEnglishPaperPosition() {
    if (!bank) return undefined
    return englishPaperPositions.current[bank.id]
      || (bankStudyPositions.current[bank.id]?.englishNavigationMode ? undefined : bankStudyPositions.current[bank.id])
  }

  function savedEnglishTopicPosition(topic: EnglishTopicKey) {
    if (!bank) return undefined
    const saved = englishTopicPositions.current[englishTopicPositionKey(topic)]
    const current = bankStudyPositions.current[bank.id]
    return saved || (current?.englishNavigationMode === 'topic' && current.englishTopic === topic ? current : undefined)
  }

  function selectEnglishNavigationMode(nextMode: EnglishNavigationMode) {
    if (subject !== 'english') return
    if (nextMode === englishNavigationMode) return
    rememberCurrentEnglishPosition()
    let nextSectionId = sectionId
    let nextQuestionIndex = 0
    let nextView: 'section' | 'wrong' = 'section'
    if (nextMode === 'topic') {
      const nextGroup = englishTopicGroups.find(group => group.key === englishTopic) || englishTopicGroups[0]
      if (!nextGroup) return
      const saved = savedEnglishTopicPosition(nextGroup.key)
      const nextEntry = topicEntryForSavedPosition(nextGroup, saved) || nextGroup.entries.find(entry => entry.chapterId === currentChapter?.id) || nextGroup.entries[0]
      if (nextEntry) {
        nextSectionId = nextEntry.sectionId
        nextQuestionIndex = saved?.view === 'wrong'
          ? resolveNavigation([bank], statuses, saved)?.questionIndex || 0
          : topicQuestionIndex(nextGroup, nextEntry)
      }
      nextView = saved?.view || 'section'
      setEnglishTopic(nextGroup.key)
    } else {
      const saved = savedEnglishPaperPosition()
      const restored = resolveNavigation([bank], statuses, saved || null)
      nextSectionId = restored?.sectionId || bank.chapters[0]?.sections[0]?.id || ''
      nextQuestionIndex = restored?.questionIndex || 0
      nextView = restored?.view || 'section'
    }
    setEnglishNavigationMode(nextMode)
    setSectionId(nextSectionId)
    setQuestionIndex(nextQuestionIndex)
    collapseAnswerUnlessLocked()
    setExpandedPassageAnswers(new Set())
    setAdvancedFilter(createEmptyAdvancedQuestionFilter())
    setQuery('')
    setView(nextView)
    setSidebar(false)
  }
  function selectEnglishTopic(key: EnglishTopicKey) {
    const group = englishTopicGroups.find(item => item.key === key)
    if (!group) return
    rememberCurrentEnglishPosition()
    const saved = savedEnglishTopicPosition(group.key)
    const nextEntry = topicEntryForSavedPosition(group, saved) || group.entries.find(entry => entry.chapterId === currentChapter?.id) || group.entries[0]
    setEnglishNavigationMode('topic')
    setEnglishTopic(group.key)
    if (nextEntry) {
      setSectionId(nextEntry.sectionId)
      setQuestionIndex(saved?.view === 'wrong' ? resolveNavigation([bank], statuses, saved)?.questionIndex || 0 : topicQuestionIndex(group, nextEntry))
      rememberEnglishPosition({
        bankId: bank.id,
        sectionId: nextEntry.sectionId,
        questionId: nextEntry.question.id,
        view: saved?.view || 'section',
        englishNavigationMode: 'topic',
        englishTopic: group.key,
      })
    }
    collapseAnswerUnlessLocked()
    setExpandedPassageAnswers(new Set())
    setAdvancedFilter(createEmptyAdvancedQuestionFilter())
    setQuery('')
    setView(saved?.view || 'section')
    setSidebar(false)
  }
  function selectEnglishTopicEntry(entry: BankQuestionEntry, index: number) {
    if (!isEnglishTopicMode || entry.chapterId !== currentChapter?.id) return
    setSectionId(entry.sectionId)
    setQuestionIndex(index)
    collapseAnswerUnlessLocked()
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById(`question-${entry.question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })))
  }
  function selectEnglishTopicYear(chapterId: string) {
    if (!isEnglishTopicMode) return
    const saved = selectedEnglishTopicGroup && savedEnglishTopicPosition(selectedEnglishTopicGroup.key)
    const entry = selectedEnglishTopicGroup?.entries.find(item => item.chapterId === chapterId && item.question.id === saved?.questionId)
      || selectedEnglishTopicGroup?.entries.find(item => item.chapterId === chapterId)
    if (!entry) return
    setExpandedChapterIds(previous => new Set(previous).add(chapterId))
    setSectionId(entry.sectionId)
    setQuestionIndex(topicQuestionIndex(selectedEnglishTopicGroup!, entry))
    rememberEnglishPosition({
      bankId: bank.id,
      sectionId: entry.sectionId,
      questionId: entry.question.id,
      view: 'section',
      englishNavigationMode: 'topic',
      englishTopic: selectedEnglishTopicGroup!.key,
    })
    collapseAnswerUnlessLocked()
    setExpandedPassageAnswers(new Set())
    setAdvancedFilter(createEmptyAdvancedQuestionFilter())
    setQuery('')
    setView('section')
    setSidebar(false)
  }
  function selectEnglishTopicSection(sectionId: string) {
    if (!isEnglishTopicMode) return
    const entry = selectedEnglishTopicGroup?.entries.find(item => item.sectionId === sectionId)
    if (!entry) return
    const filteredIndex = filteredQuestionEntries.findIndex(item => item.sectionId === sectionId)
    setSectionId(entry.sectionId)
    setQuestionIndex(filteredIndex >= 0 ? filteredIndex : 0)
    rememberEnglishPosition({
      bankId: bank.id,
      sectionId: entry.sectionId,
      questionId: entry.question.id,
      view: 'section',
      englishNavigationMode: 'topic',
      englishTopic: selectedEnglishTopicGroup!.key,
    })
    collapseAnswerUnlessLocked()
    setExpandedPassageAnswers(new Set())
    setAdvancedFilter(createEmptyAdvancedQuestionFilter())
    setQuery('')
    setView('section')
    setSidebar(false)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById(`question-${entry.question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })))
  }
  function toggleChapter(id: string) {
    setExpandedChapterIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function showReviewBook() {
    if (view === 'wrong') {
      const previous = reviewReturnPosition.current
      reviewReturnPosition.current = null
      const restored = resolveNavigation(banks, statuses, previous)
      if (restored) {
        setBankId(restored.bankId); setSectionId(restored.sectionId); setExpandedChapterIds(new Set([restored.chapterId])); setQuestionIndex(restored.questionIndex); setView(restored.view)
      } else {
        setView('section'); setQuestionIndex(0)
      }
      collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set()); setAdvancedFilter(createEmptyAdvancedQuestionFilter()); setQuery(''); setSidebar(false)
      return
    }
    reviewReturnPosition.current = { bankId: bank?.id || '', sectionId, questionId: question?.id || '', view }
    setView('wrong'); setAdvancedFilter(createEmptyAdvancedQuestionFilter()); setQuery(''); setQuestionIndex(0); collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set()); setSidebar(false)
  }
  function markQuestion(questionId: string, status: QuestionStatus, targetQuestion?: Question) {
    const questionEntry = bankQuestionEntries.find(entry => entry.question.id === questionId)
    const item = targetQuestion || questionEntry?.question
    const previousStatus = effectiveQuestionStatus(item, statuses[questionId] || 'none', binaryFilterMode)
    setStatuses(prev => ({ ...prev, [questionId]: status })); setToast(`已标记为“${questionStatusMeta(item, status, binaryFilterMode).label}”`)
    setActivities(previous => updateStudyActivity(previous, {
      questionId,
      bankId: bank.id,
      status,
      previousStatus,
      chapterId: questionEntry?.chapterId,
      sectionId: questionEntry?.sectionId,
      questionNumber: item?.number,
      questionType: item?.type,
      readingType: item?.readingType,
      subject,
      source: view === 'wrong' ? 'wrong-book' : 'study',
      answerRevealed: isBinaryMasteryQuestion(item) ? expandedPassageAnswers.has(questionId) : answerOpen,
    }))
  }
  function markDashboardQuestion(targetBankId: string, questionId: string, status: QuestionStatus, answerRevealed: boolean) {
    const targetBank = banks.find(item => item.id === targetBankId)
    if (!targetBank) return
    const questionEntry = orderedQuestionEntriesForBank(targetBank).find(entry => entry.question.id === questionId)
    if (!questionEntry) return
    const targetSubject = bankSubject(targetBank)
    const targetBinaryMode = targetSubject === 'english'
    const previousStatus = effectiveQuestionStatus(questionEntry.question, statuses[questionId] || 'none', targetBinaryMode)
    setStatuses(previous => ({ ...previous, [questionId]: status }))
    setActivities(previous => updateStudyActivity(previous, {
      questionId,
      bankId: targetBank.id,
      status,
      previousStatus,
      chapterId: questionEntry.chapterId,
      sectionId: questionEntry.sectionId,
      questionNumber: questionEntry.question.number,
      questionType: questionEntry.question.type,
      readingType: questionEntry.question.readingType,
      subject: targetSubject,
      source: 'dashboard',
      answerRevealed,
    }))
    setToast(`已标记为“${questionStatusMeta(questionEntry.question, status, targetBinaryMode).label}”`)
  }
  function markDashboardReview(targetBankId: string, questionId: string, status: QuestionStatus, answerRevealed: boolean) {
    const targetBank = banks.find(item => item.id === targetBankId)
    if (!targetBank) return
    const questionEntry = orderedQuestionEntriesForBank(targetBank).find(entry => entry.question.id === questionId)
    if (!questionEntry) return
    const targetSubject = bankSubject(targetBank)
    const targetBinaryMode = targetSubject === 'english'
    const previousStatus = effectiveQuestionStatus(questionEntry.question, statuses[questionId] || 'none', targetBinaryMode)
    const result = updateQuestionReview(activities, {
      questionId,
      bankId: targetBank.id,
      previousStatus,
      chapterId: questionEntry.chapterId,
      sectionId: questionEntry.sectionId,
      questionNumber: questionEntry.question.number,
      questionType: questionEntry.question.type,
      readingType: questionEntry.question.readingType,
      subject: targetSubject,
      source: 'dashboard',
      answerRevealed,
    }, status)
    setActivities(result.activities)
    setStatuses(previous => ({ ...previous, [questionId]: result.status }))
    setToast(status === 'none' ? '已取消本次复习记录' : `第 ${buildQuestionReviewTimeline(result.activities, questionId).reviews.length} 次复习已记录为“${questionStatusMeta(questionEntry.question, result.status, targetBinaryMode).label}”`)
  }
  function resetDashboardReview(targetBankId: string, questionId: string) {
    const targetBank = banks.find(item => item.id === targetBankId)
    if (!targetBank || !orderedQuestionEntriesForBank(targetBank).some(entry => entry.question.id === questionId)) return
    const result = resetQuestionReview(activities, questionId)
    if (!result.reset) return
    setActivities(result.activities)
    setStatuses(previous => ({ ...previous, [questionId]: result.status }))
    setToast('已重置本题复习记录，初始标记已保留')
  }
  function deleteDashboardReview(targetBankId: string, questionId: string, attempt: number) {
    const targetBank = banks.find(item => item.id === targetBankId)
    if (!targetBank || !orderedQuestionEntriesForBank(targetBank).some(entry => entry.question.id === questionId)) return
    const result = deleteQuestionReview(activities, questionId, attempt)
    if (!result.deleted) return
    setActivities(result.activities)
    setStatuses(previous => ({ ...previous, [questionId]: result.status }))
    setToast(`已删除第 ${attempt} 次复习记录`)
  }
  function mark(status: QuestionStatus) { if (question) markQuestion(question.id, status, question) }
  function togglePassageAnswer(questionId: string) {
    setExpandedPassageAnswers(previous => {
      const next = new Set(previous)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }
  function toggleAllPassageAnswers() {
    setExpandedPassageAnswers(previous => {
      const next = new Set(previous)
      if (allPassageAnswersOpen) filteredQuestions.forEach(item => next.delete(item.id))
      else filteredQuestions.forEach(item => next.add(item.id))
      return next
    })
  }
  function jumpToPassageQuestion(questionId: string, index: number) {
    const entry = filteredQuestionEntries[index] || filteredQuestionEntries.find(item => item.question.id === questionId)
    if (isEnglishTopicMode && entry) setSectionId(entry.sectionId)
    setQuestionIndex(index)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })))
  }
  function moveQuestion(offset: -1 | 1) {
    const nextIndex = Math.max(0, Math.min(filteredQuestions.length - 1, questionIndex + offset))
    if (isEnglishTopicMode) {
      const nextEntry = filteredQuestionEntries[nextIndex]
      if (nextEntry) setSectionId(nextEntry.sectionId)
    }
    setQuestionIndex(nextIndex)
    collapseAnswerUnlessLocked()
  }
  function navigateToBankQuestion(entry: BankQuestionEntry) {
    openQuestionFromNote(bank.id, entry.question.id)
  }
  function openQuestionFromNote(bankId: string, questionId: string) {
    const targetBank = banks.find(item => item.id === bankId)
    const entry = targetBank && orderedQuestionEntriesForBank(targetBank).find(item => item.question.id === questionId)
    if (!targetBank || !entry) return
    const targetSection = targetBank.chapters.flatMap(chapter => chapter.sections).find(item => item.id === entry.sectionId)
    if (!targetSection) return
    const targetIndex = targetSection.questions.findIndex(item => item.id === entry.question.id)
    if (bankSubject(targetBank) === 'math') setMathModule(bankMathModule(targetBank))
    setActivePage('study'); setBankId(targetBank.id); setNotesOpen(false); setToolboxOpen(false)
    setExpandedChapterIds(previous => new Set(previous).add(entry.chapterId))
    setSectionId(entry.sectionId); setQuestionIndex(Math.max(0, targetIndex)); collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set()); setAdvancedFilter(createEmptyAdvancedQuestionFilter()); setQuery(''); setView('section')
    window.requestAnimationFrame(() => document.getElementById(`question-${entry.question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  function openNoteQuestionPreview(bankId: string, questionId: string) {
    const targetBank = banks.find(item => item.id === bankId)
    if (!targetBank || !orderedQuestionEntriesForBank(targetBank).some(entry => entry.question.id === questionId)) return
    setNoteQuestionPreview({ bankId, questionId })
  }
  function openNoteQuestionEditor(bankId: string, questionId: string) {
    const targetBank = banks.find(item => item.id === bankId)
    if (!targetBank || !orderedQuestionEntriesForBank(targetBank).some(entry => entry.question.id === questionId)) return
    setNoteQuestionEditor({ bankId, questionId })
  }
  function markReadingType(questionId: string, readingType: ReadingQuestionType | '') {
    setBanks(previous => previous.map(item => ({ ...item, chapters: item.chapters.map(chapter => ({ ...chapter, sections: chapter.sections.map(itemSection => ({
      ...itemSection,
      questions: itemSection.questions.map(itemQuestion => itemQuestion.id === questionId
        ? { ...itemQuestion, readingType: readingType || undefined }
        : itemQuestion)
    })) })) })))
    setToast(readingType ? `已标注为“${readingTypeMeta.find(item => item.value === readingType)?.label}”` : '已清除阅读题型标注')
  }
  function readingTypePicker(item: Question) {
    if (!isReadingTypeQuestion(item)) return null
    return <label className="reading-type-picker"><span>阅读题型</span><select aria-label={`第 ${item.number} 题阅读题型`} value={item.readingType || ''} onChange={event => markReadingType(item.id, event.target.value as ReadingQuestionType | '')}><option value="">未分类</option>{readingTypeMeta.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select><ChevronDown size={13}/></label>
  }
  function updateQuestionErrorRecord(questionId: string, wrongOption: string) {
    setQuestionErrorRecords(previous => {
      if (!wrongOption) {
        if (!previous[questionId]) return previous
        const next = { ...previous }
        delete next[questionId]
        return next
      }
      return { ...previous, [questionId]: { wrongOption, updatedAt: new Date().toISOString() } }
    })
  }
  function questionErrorRecordPicker(item: Question, status: QuestionStatus) {
    if (subject !== 'english' || status !== 'wrong' || !isEnglishObjectiveQuestion(item) || !item.options?.length) return null
    const record = questionErrorRecords[item.id]
    return <label className="reading-type-picker error-option-picker">
      <span>错误选项</span>
      <select aria-label={`第 ${item.number} 题错误选项`} value={record?.wrongOption || ''} onChange={event => updateQuestionErrorRecord(item.id, event.target.value)}>
        <option value="">未选择</option>
        {item.options.map((option, index) => { const key = questionOptionKey(option, index); return <option key={key} value={key}>{key}</option> })}
      </select>
      <ChevronDown size={13}/>
    </label>
  }
  function currentStudyRounds() {
    return updateStudyRound(studyRounds, userSettings.activeRound, statuses, activities)
  }
  function markNoteBucketDirty(questionId: string, targetBanks = banks) {
    const key = noteBucketKeyForQuestion(targetBanks, questionId)
    dirtyLocalNoteBuckets.current.add(key)
    dirtyWorkspaceNoteBuckets.current.add(key)
  }
  function markAllNoteBucketsDirty(notes: QuestionNotes, targetBanks = banks, includeWorkspace = true) {
    const keys = splitQuestionNotes(notes, targetBanks).keys()
    for (const key of keys) {
      dirtyLocalNoteBuckets.current.add(key)
      if (includeWorkspace) dirtyWorkspaceNoteBuckets.current.add(key)
    }
  }
  function updateQuestionNote(questionId: string, note: QuestionNote) {
    markNoteBucketDirty(questionId)
    setQuestionNotes(previous => {
      if (!hasQuestionNote(note)) {
        if (!previous[questionId]) return previous
        const next = { ...previous }
        delete next[questionId]
        return next
      }
      return { ...previous, [questionId]: note }
    })
  }
  function createPersonalNotebook(name: string): PersonalNotebook | null {
    const trimmedName = name.trim()
    if (!trimmedName) return null
    const now = new Date().toISOString()
    const notebook: PersonalNotebook = { id: `notebook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: trimmedName, notes: [], createdAt: now, updatedAt: now }
    personalNotebooksDirty.current = true
    setPersonalNotebooks(previous => [...previous, notebook])
    setToast(`已新建笔记本“${trimmedName}”`)
    return notebook
  }
  function createPersonalNote(notebookId: string, title: string): PersonalNote | null {
    const notebook = personalNotebooks.find(item => item.id === notebookId)
    const trimmedTitle = title.trim()
    if (!notebook || !trimmedTitle) return null
    const now = new Date().toISOString()
    const note: PersonalNote = { id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: trimmedTitle, text: '', drawing: { version: 1, aspectRatio: 5 / 3, strokes: [] }, updatedAt: now }
    personalNotebooksDirty.current = true
    setPersonalNotebooks(previous => previous.map(item => item.id === notebookId ? { ...item, notes: [...item.notes, note], updatedAt: now } : item))
    setToast(`已新建笔记“${trimmedTitle}”`)
    return note
  }
  function updatePersonalNote(notebookId: string, nextNote: PersonalNote) {
    personalNotebooksDirty.current = true
    const now = nextNote.updatedAt || new Date().toISOString()
    setPersonalNotebooks(previous => previous.map(notebook => notebook.id === notebookId
      ? { ...notebook, updatedAt: now, notes: notebook.notes.map(note => note.id === nextNote.id ? { ...note, ...nextNote } : note) }
      : notebook))
  }
  function deletePersonalNote(notebookId: string, noteId: string) {
    personalNotebooksDirty.current = true
    setPersonalNotebooks(previous => previous.map(notebook => notebook.id === notebookId
      ? { ...notebook, notes: notebook.notes.filter(note => note.id !== noteId), updatedAt: new Date().toISOString() }
      : notebook))
    setToast('已删除个人笔记')
  }
  function deletePersonalNotebook(notebookId: string) {
    personalNotebooksDirty.current = true
    setPersonalNotebooks(previous => previous.filter(notebook => notebook.id !== notebookId))
    setToast('已删除笔记本')
  }
  function switchStudyRound(nextRound: number) {
    if (nextRound === userSettings.activeRound) return
    const rounds = currentStudyRounds()
    const target = getStudyRound(rounds, nextRound)
    setStudyRounds(rounds)
    setUserSettings(previous => ({ ...previous, activeRound: nextRound, roundCount: Math.max(previous.roundCount, nextRound) }))
    setStatuses(target.statuses); setActivities(target.activities); collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set())
    setToast(`已切换到第 ${nextRound} 轮`)
  }
  function addStudyRound() {
    if (userSettings.roundCount >= 99) { setToast('最多可添加 99 轮'); return }
    const nextRound = userSettings.roundCount + 1
    const rounds = { ...currentStudyRounds(), [String(nextRound)]: emptyStudyRound() }
    setStudyRounds(rounds)
    setUserSettings(previous => ({ ...previous, activeRound: nextRound, roundCount: nextRound }))
    setStatuses({}); setActivities([]); collapseAnswerUnlessLocked(); setExpandedPassageAnswers(new Set())
    setToast(`已新增并切换到第 ${nextRound} 轮`)
  }
  function displayedStudyRound(round: number) {
    return round === userSettings.activeRound ? { statuses, activities } : getStudyRound(studyRounds, round)
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 6, banks, rounds: currentStudyRounds(), settings: userSettings, notes: questionNotes, personalNotebooks, errorRecords: questionErrorRecords }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `考研学习空间备份-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  function exportSingleBank(targetBank: QuestionBank) {
    const blob = new Blob([JSON.stringify({ version: 1, banks: [targetBank] }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${targetBank.name.replace(/[\\/:*?"<>|]/g, '-')}.json`; link.click(); URL.revokeObjectURL(url); setToast(`已导出“${targetBank.name}”`)
  }
  function clearMarks(targetBankId: string | 'all', status: QuestionStatus | 'all') {
    const targets = banks
      .filter(targetBank => targetBankId === 'all' || targetBank.id === targetBankId)
      .flatMap(targetBank => orderedQuestionEntriesForBank(targetBank).map(entry => ({ targetBank, entry })))
      .filter(({ entry }) => {
        const current = statuses[entry.question.id] || 'none'
        return current !== 'none' && (status === 'all' || current === status)
      })
    const now = new Date()
    setActivities(previous => targets.reduce((next, { targetBank, entry }) => updateStudyActivity(next, {
      questionId: entry.question.id,
      bankId: targetBank.id,
      status: 'none',
      previousStatus: statuses[entry.question.id] || 'none',
      chapterId: entry.chapterId,
      sectionId: entry.sectionId,
      questionNumber: entry.question.number,
      questionType: entry.question.type,
      readingType: entry.question.readingType,
      subject: bankSubject(targetBank),
      source: 'bulk-clear',
    }, now), previous))
    setStatuses(previous => clearQuestionStatuses(previous, banks, targetBankId, status)); setToast('所选标注已清除')
  }
  async function resetManagedBank(targetBank: QuestionBank) {
    if (protectedBankIds.has(targetBank.id)) { setToast('默认题库不能重置或清空'); return }
    await deleteAssets(assetKeysForBank(targetBank)); const baseline = builtInBanks.find(item => item.id === targetBank.id)
    const folderName = workspaceFolders[targetBank.id]
    if (workspaceHandle && workspaceState === 'connected' && folderName) {
      await removeBankFolder(workspaceHandle, folderName).catch(() => {})
      if (!baseline) await workspaceHandle.getDirectoryHandle(folderName, { create: true })
    }
    setStatuses(previous => clearQuestionStatuses(previous, banks, targetBank.id, 'all')); setBanks(previous => resetBankData(previous, targetBank.id, baseline))
    if (bankId === targetBank.id) { setSectionId(baseline?.chapters[0]?.sections[0]?.id || ''); setQuestionIndex(0); setView('section') }
    setToast(baseline ? '内置题库已恢复' : '自建题库内容已清空')
  }
  async function deleteManagedBank(targetBank: QuestionBank) {
    if (protectedBankIds.has(targetBank.id)) { setToast('默认题库不能删除'); return }
    if (banks.length <= 1) { setToast('至少需要保留一个题库'); return }
    await deleteAssets(assetKeysForBank(targetBank)); const ids = questionIdsForBank(targetBank)
    const folderName = workspaceFolders[targetBank.id]
    if (workspaceHandle && workspaceState === 'connected' && folderName) await removeBankFolder(workspaceHandle, folderName).catch(() => {})
    setWorkspaceFolders(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== targetBank.id)))
    setStatuses(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.has(id))))
    delete bankStudyPositions.current[targetBank.id]
    const remaining = removeBank(banks, targetBank.id); setBanks(remaining)
    if (bankId === targetBank.id) selectBank(remaining[0]); setToast(`已删除“${targetBank.name}”`)
  }
  async function restoreBuiltIns() {
    const builtInIds = new Set(builtInBanks.map(item => item.id)); const existingBuiltIns = banks.filter(item => builtInIds.has(item.id))
    await deleteAssets(existingBuiltIns.flatMap(assetKeysForBank)); setStatuses(previous => existingBuiltIns.reduce((next, item) => clearQuestionStatuses(next, banks, item.id, 'all'), previous))
    setBanks(previous => [...previous.filter(item => !builtInIds.has(item.id)), ...structuredClone(builtInBanks)]); setToast('内置题库已恢复')
  }
  async function factoryReset() {
    const protectedBanks = banks.filter(item => protectedBankIds.has(item.id))
    const removableBanks = banks.filter(item => !protectedBankIds.has(item.id))
    await deleteAssets(removableBanks.flatMap(assetKeysForBank))
    const defaults = [...structuredClone(protectedBanks), ...structuredClone(builtInBanks).filter(item => !protectedBankIds.has(item.id))]
    bankStudyPositions.current = {}
    personalNotebooksDirty.current = true
    setBanks(defaults); setStudyRounds({ '1': emptyStudyRound() }); setStatuses({}); setActivities([]); setQuestionNotes({}); setPersonalNotebooks([]); setQuestionErrorRecords({}); setUserSettings({ ...DEFAULT_USER_SETTINGS }); setBankId(defaults[0].id); setSectionId(defaults[0].chapters[0]?.sections[0]?.id || ''); setQuestionIndex(0); setView('section'); setSettingsOpen(false); setToast('已恢复出厂设置，默认题库已保留')
  }
  function printExport(job: ExportJob) {
    if (!job.questions.length) { setToast(job.mode === 'notes' ? '当前条件下没有可导出的笔记' : '当前条件下没有可导出的题目'); return }
    setPrintJob(job); setExportOpen(false)
    setToast(job.mode === 'notes' ? '正在准备笔记…' : '正在准备题目图片…')
    setPrintMode(true)
  }
  async function importData(file?: File) {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()); const imported = removeRetiredBanks(validateBanks(parsed))
      setBanks(prev => [...prev.filter(b => !imported.some(i => i.id === b.id)), ...imported])
      if (parsed.rounds || parsed.statuses || parsed.activities) {
        const importedSettings = parsed.settings
          ? validateUserSettings(parsed.settings)
          : { ...userSettings, activeRound: 1, roundCount: Math.max(5, userSettings.roundCount) }
        const importedRounds = migrateStudyRounds(parsed.rounds, parsed.statuses, parsed.activities)
        const targetRound = getStudyRound(importedRounds, importedSettings.activeRound)
        setStudyRounds(importedRounds); setStatuses(targetRound.statuses); setActivities(targetRound.activities); setUserSettings(importedSettings)
      } else if (parsed.settings) setUserSettings(validateUserSettings(parsed.settings))
      if (parsed.version >= 4 || parsed.notes || parsed.errorRecords) {
        notesLoaded.current = true
        setNotesReady(true)
        setQuestionNotes(validateQuestionNotes(parsed.notes))
        personalNotebooksDirty.current = true
        setPersonalNotebooks(validatePersonalNotebooks(parsed.personalNotebooks))
        setErrorRecordsReady(true)
        setQuestionErrorRecords(validateQuestionErrorRecords(parsed.errorRecords))
      }
      setToast(`成功导入 ${imported.length} 个题库`)
    } catch (e) { setToast(e instanceof Error ? e.message : '导入失败') }
    if (importRef.current) importRef.current.value = ''
  }
  async function importImages(fileList?: FileList | null) {
    const files = Array.from(fileList || []).filter(file => file.type.startsWith('image/'))
    if (!files.length) { setToast('所选目录中没有图片文件'); return }
    try {
      const result = await mergeImageEntries(banks, files.map(file => ({ file, relativePath: file.webkitRelativePath || file.name, bankId: bank.id })))
      if (!result.imported) { setToast(`没有图片符合命名规则，已跳过 ${result.skipped} 个文件`); return }
      setBanks(result.banks)
      if (result.firstSectionId) { setSectionId(result.firstSectionId); setView('section') }
      setToast(`已导入 ${result.imported} 张图片，匹配 ${result.matchedQuestions} 道题${result.createdQuestions ? `，自动新建/补全 ${result.createdQuestions} 道` : ''}${result.skipped ? `，跳过 ${result.skipped} 张` : ''}`)
    } catch (error) { setToast(error instanceof Error ? error.message : '图片导入失败') }
    if (imageImportRef.current) imageImportRef.current.value = ''
  }

  async function saveQuestionEditorChange(payload: QuestionBankEditorSave) {
    const targetBank = banks.find(item => item.id === payload.bankId)
    const targetQuestion = targetBank && orderedQuestionEntriesForBank(targetBank).find(entry => entry.question.id === payload.questionId)?.question
    if (!targetBank || !targetQuestion) throw new Error('找不到要保存的题目，请重新打开编辑器')
    try {
      let nextQuestion = { ...payload.question }
      if (payload.imageDeletes.length) {
        for (const deletion of payload.imageDeletes) {
          const relativePath = defaultWorkspaceSourcePath(deletion.source)
          const fileName = defaultWorkspaceSourceFileName(deletion.source)
          if (defaultWorkspaceConnected) {
            if (relativePath) await deleteDefaultWorkspaceImage(relativePath)
            else if (targetBank.workspaceFolder && fileName) await deleteDefaultWorkspaceImageByName(targetBank.workspaceFolder, fileName)
            if (deletion.source.key) await deleteAssets([deletion.source.key]).catch(() => {})
          } else if (deletion.source.key) {
            await deleteAssets([deletion.source.key])
          }
        }
      }
      if (payload.imageChanges.length) {
        if (defaultWorkspaceConnected) {
          for (const change of payload.imageChanges) {
            const sources = questionImageSources(nextQuestion, change.kind)
            let persistedSource: QuestionImageSource
            const originalFileName = defaultWorkspaceSourceFileName(change.source)
            if (change.source?.key && targetBank.workspaceFolder && originalFileName) {
              const result = await replaceDefaultWorkspaceImage(change.file, targetBank.workspaceFolder, originalFileName)
              await putAssets([{ key: change.source.key, file: change.file, url: defaultWorkspaceFileUrl(result.relativePath, result.modified) }])
              persistedSource = { key: change.source.key }
            } else if (change.source?.url && defaultWorkspaceSourcePath(change.source)) {
              const relativePath = defaultWorkspaceSourcePath(change.source)
              await writeDefaultWorkspaceImage(change.file, relativePath)
              persistedSource = { url: defaultWorkspaceFileUrl(relativePath, Date.now()) }
            } else {
              const oppositeKind = change.kind === 'question' ? 'answer' : 'question'
              const anchorSource = sources.find((source, index) => index !== change.index && source.key) || questionImageSources(nextQuestion, oppositeKind).find(source => source.key)
              const anchorFileName = defaultWorkspaceSourceFileName(anchorSource)
              const structuredFileName = structuredWorkspaceFileName(payload.questionId, change.kind, change.index + 1)
              if (targetBank.workspaceFolder && anchorFileName && structuredFileName) {
                const result = await addDefaultWorkspaceImage(change.file, targetBank.workspaceFolder, anchorFileName, structuredFileName)
                const key = `${payload.questionId}/${change.kind}/${change.index + 1}-${structuredFileName}`
                await putAssets([{ key, file: change.file, url: defaultWorkspaceFileUrl(result.relativePath, result.modified) }])
                persistedSource = { key }
              } else {
                const relativePath = editorImageRelativePath(payload.bankId, payload.questionId, change.kind, change.index)
                await writeDefaultWorkspaceImage(change.file, relativePath)
                persistedSource = { url: defaultWorkspaceFileUrl(relativePath, Date.now()) }
              }
            }
            const nextSources = sources.map((source, index) => index === change.index ? persistedSource : source)
            nextQuestion = questionWithImageSources(nextQuestion, change.kind, nextSources)
          }
        } else {
          await putAssets(payload.imageChanges.map(change => ({ key: change.key, file: change.file })))
        }
      }
      const nextBanks = banks.map(item => item.id !== payload.bankId ? item : {
        ...item,
        chapters: item.chapters.map(chapter => ({
          ...chapter,
          sections: chapter.sections.map(section => ({
            ...section,
            questions: section.questions.map(question => question.id === payload.questionId ? nextQuestion : question),
          })),
        })),
      })

      if (workspaceState === 'connected' && workspaceReady) {
        if (defaultWorkspaceConnected) await writeDefaultWorkspaceManifest(nextBanks, workspaceFolders)
        else if (workspaceHandle) await writeWorkspaceManifest(workspaceHandle, nextBanks, workspaceFolders)
      }
      setBanks(nextBanks)
      const nextAssetKeys = new Set(nextBanks.flatMap(assetKeysForBank))
      const removedKeys = assetKeysForBank(targetBank).filter(key => !nextAssetKeys.has(key))
      if (removedKeys.length) await deleteAssets(removedKeys).catch(() => {})
      const imageActionCount = payload.imageChanges.length + payload.imageDeletes.length
      setToast(`第 ${payload.question.number} 题已保存${imageActionCount ? `，处理 ${imageActionCount} 张图片` : ''}`)
      return nextQuestion
    } catch (error) {
      if (workspaceState === 'connected') setWorkspaceState('error')
      throw new Error(error instanceof Error ? `本地题库写入失败：${error.message}` : '本地题库写入失败，请检查文件夹权限')
    }
  }

  async function restoreWorkspaceCache(handle: FileSystemDirectoryHandle) {
    const cache = await loadWorkspaceCache('directory').catch(() => null)
    if (!cache?.manifest) return false
    setWorkspaceState('syncing')
    try {
      const manifest = cache.manifest
      const nextBanks = removeRetiredBanks(validateBanks(manifest))
      const folders = { ...(manifest.folders || {}) }
      const entries = cache.images.filter(item => item.url).map(item => {
        const target = item.bankId
          ? nextBanks.find(bank => bank.id === item.bankId)
          : item.bankFolder ? nextBanks.find(bank => folders[bank.id] === item.bankFolder) : nextBanks[0]
        if (!target) return null
        return {
          file: new File([], item.name),
          relativePath: item.relativePath,
          bankId: target.id,
          ...(item.url ? { assetUrl: item.url } : {}),
        }
      }).filter((entry): entry is { file: File; relativePath: string; bankId: string; assetUrl?: string } => Boolean(entry))
      const result = await mergeImageEntries(nextBanks, entries, { replaceExistingAssets: false })
      const resolvedUserData = resolveWorkspaceUserData(cache.userData, manifest.statuses, currentStudyRounds(), userSettings, cache.notes || {}, {}, [])
      const nextSettings = resolvedUserData.settings
      const nextRounds = resolvedUserData.rounds
      const nextNotes = resolvedUserData.notes
      const nextPersonalNotebooks = resolvedUserData.personalNotebooks
      const nextRound = getStudyRound(nextRounds, nextSettings.activeRound)
      const nextStatuses = nextRound.statuses
      const nextActivities = nextRound.activities
      if (!restoreSavedNavigation(result.banks, nextStatuses)) {
        const activeBank = result.banks.find(item => item.id === bankId) || result.banks[0]
        const activeSections = activeBank?.chapters.flatMap(chapter => chapter.sections) || []
        if (activeBank && !activeSections.some(item => item.id === sectionId)) {
          setBankId(activeBank.id)
          setSectionId(activeSections[0]?.id || '')
          setQuestionIndex(0)
        }
      }
      workspaceImages.current = structuredClone(cache.images)
      setWorkspaceStateBaseline(result.banks, folders, nextRounds, nextSettings, nextNotes, resolvedUserData.errorRecords, nextPersonalNotebooks)
      setWorkspaceReady(false)
      notesLoaded.current = true
      setNotesReady(true)
      setErrorRecordsReady(true)
      setBanks(result.banks)
      setStudyRounds(nextRounds)
      setStatuses(nextStatuses)
      setActivities(nextActivities)
      setQuestionNotes(nextNotes)
      setPersonalNotebooks(nextPersonalNotebooks)
      setUserSettings(nextSettings)
      setWorkspaceFolders(folders)
      setWorkspaceHandle(handle)
      setDefaultWorkspaceConnected(false)
      setQuestionErrorRecords(resolvedUserData.errorRecords)
      setWorkspaceState('connected')
      window.setTimeout(() => setWorkspaceReady(true), 0)
      setToast('已从本地缓存恢复题库；点击右上角按钮可重新同步')
      return true
    } catch {
      return false
    }
  }

  async function loadDefaultWorkspace() {
    setWorkspaceState('syncing')
    try {
      const index = await readDefaultWorkspace()
      if (!builtInBanks.length && index.manifest) initializeDefaultBanks(index.manifest.banks.filter(bank => defaultBankIds.includes(bank.id as typeof defaultBankIds[number])))
      let nextBanks = index.manifest ? removeRetiredBanks(validateBanks(index.manifest)) : structuredClone(banks)
      if (index.manifest && index.manifest.builtinEnglishVersion !== BUILTIN_ENGLISH_VERSION) {
        nextBanks = [...nextBanks.filter(bank => !bank.id.startsWith('english-')), ...structuredClone(englishBanks)]
      }
      const [savedNotes, savedPersonalNotebooks, savedErrorRecords] = await Promise.all([loadQuestionNotes(banks), loadPersonalNotebooks(), loadQuestionErrorRecords()])
      const resolvedUserData = resolveWorkspaceUserData(index.userData, index.manifest?.statuses, currentStudyRounds(), userSettings, { ...savedNotes, ...(index.notes || {}) }, savedErrorRecords, savedPersonalNotebooks)
      const nextSettings = resolvedUserData.settings
      const nextRounds = resolvedUserData.rounds
      const nextNotes = resolvedUserData.notes
      const nextPersonalNotebooks = resolvedUserData.personalNotebooks
      const nextRound = getStudyRound(nextRounds, nextSettings.activeRound)
      const nextStatuses = nextRound.statuses
      const nextActivities = nextRound.activities
      const discoveredBankFolders = new Set([...(index.bankFolders || []), ...index.images.map(item => item.bankFolder).filter(Boolean)])
      let folders = { ...(index.manifest?.folders || {}) }
      if (Array.isArray(index.bankFolders)) {
        folders = Object.fromEntries(Object.entries(folders).filter(([, folderName]) => discoveredBankFolders.has(folderName)))
        nextBanks = nextBanks.filter(item => !index.manifest?.folders?.[item.id] || discoveredBankFolders.has(index.manifest.folders[item.id]))
      }
      for (const folderName of discoveredBankFolders) {
        const displayName = workspaceBankName(folderName)
        let target = nextBanks.find(item => folders[item.id] === folderName)
        if (!target) {
          const sameName = nextBanks.filter(item => item.name === displayName || safeFolderName(item.name) === displayName)
          if (sameName.length === 1) target = sameName[0]
        }
        if (!target) {
          const subject = folderName.startsWith('英语/') ? 'english' : folderName.startsWith('专业课/') ? 'professional' : 'math'
          target = { id: `default-${Date.now()}-${nextBanks.length}`, name: displayName, description: '默认本地题库', subject, workspaceFolder: folderName, source: 'local', chapters: [] }
          nextBanks.push(target)
        }
        folders[target.id] = folderName
      }
      nextBanks = nextBanks.map(item => folders[item.id] ? { ...item, workspaceFolder: folders[item.id] } : item)
      const entries = index.images.map(item => {
        const target = item.bankFolder ? nextBanks.find(bank => folders[bank.id] === item.bankFolder) : nextBanks[0]
        return { file: new File([], item.name), relativePath: item.relativePath, bankId: target!.id, assetUrl: item.url }
      })
      const result = await mergeImageEntries(nextBanks, entries, { replaceExistingAssets: true })
      workspaceImages.current = index.images.map(item => ({
        ...item,
        bankId: (item.bankFolder ? result.banks.find(bank => folders[bank.id] === item.bankFolder) : result.banks[0])?.id,
      }))
      await writeDefaultWorkspaceNoteBuckets(nextNotes, result.banks)
      await writeDefaultWorkspaceUserData(nextRounds, nextSettings, {}, resolvedUserData.errorRecords, nextPersonalNotebooks)
      await persistWorkspaceCache('default', result.banks, folders, nextRounds, nextSettings, nextNotes, resolvedUserData.errorRecords, nextPersonalNotebooks).catch(() => {})
      markAllNoteBucketsDirty(nextNotes, result.banks, false)
      if (!restoreSavedNavigation(result.banks, nextStatuses)) {
        const activeBank = result.banks.find(item => item.id === bankId) || result.banks[0]
        const activeSections = activeBank?.chapters.flatMap(chapter => chapter.sections) || []
        if (activeBank && !activeSections.some(item => item.id === sectionId)) {
          setBankId(activeBank.id); setSectionId(activeSections[0]?.id || ''); setQuestionIndex(0)
        }
      }
      setWorkspaceReady(false)
      setWorkspaceStateBaseline(result.banks, folders, nextRounds, nextSettings, nextNotes, resolvedUserData.errorRecords, nextPersonalNotebooks)
      notesLoaded.current = true
      setNotesReady(true)
      setErrorRecordsReady(true)
      setBanks(result.banks); setStudyRounds(nextRounds); setStatuses(nextStatuses); setActivities(nextActivities); setQuestionNotes(nextNotes); setPersonalNotebooks(nextPersonalNotebooks); setUserSettings(nextSettings); setWorkspaceFolders(folders); setWorkspaceHandle(null); setDefaultWorkspaceConnected(true); setWorkspaceState('connected')
      setQuestionErrorRecords(resolvedUserData.errorRecords)
      window.setTimeout(() => setWorkspaceReady(true), 0)
      setToast(`已自动连接“${index.name}”${result.imported ? `，识别 ${result.imported} 张图片` : ''}`)
      return true
    } catch {
      setDefaultWorkspaceConnected(false); setWorkspaceState('none')
      setToast('默认题库读取失败，请点击右上角按钮重试')
      return false
    }
  }

  async function loadWorkspace(handle: FileSystemDirectoryHandle) {
    setWorkspaceState('syncing')
    try {
      // 只在连接数据目录后读取题库清单，不参与未连接状态的展示。
      await loadDefaultBanks().catch(() => {})
      if (!await hasWorkspacePermission(handle, true)) throw new Error('未获得题库文件夹读写权限')
      const [manifest, userData] = await Promise.all([readWorkspaceManifest(handle), readWorkspaceUserData(handle)])
      if (!builtInBanks.length && manifest) initializeDefaultBanks(manifest.banks.filter(bank => defaultBankIds.includes(bank.id as typeof defaultBankIds[number])))
      let nextBanks = manifest ? removeRetiredBanks(validateBanks(manifest)) : structuredClone(banks)
      let seededEnglishCount = 0
      if (manifest && manifest.builtinEnglishVersion !== BUILTIN_ENGLISH_VERSION) {
        seededEnglishCount = englishBanks.length
        nextBanks = [...nextBanks.filter(bank => !bank.id.startsWith('english-')), ...structuredClone(englishBanks)]
      }
      const [savedNotes, savedPersonalNotebooks, savedErrorRecords, workspaceNotes] = await Promise.all([loadQuestionNotes(banks), loadPersonalNotebooks(), loadQuestionErrorRecords(), readWorkspaceNoteBuckets(handle)])
      const resolvedUserData = resolveWorkspaceUserData(userData, manifest?.statuses, currentStudyRounds(), userSettings, { ...savedNotes, ...workspaceNotes }, savedErrorRecords, savedPersonalNotebooks)
      const nextSettings = resolvedUserData.settings
      const nextRounds = resolvedUserData.rounds
      const nextNotes = resolvedUserData.notes
      const nextPersonalNotebooks = resolvedUserData.personalNotebooks
      const nextRound = getStudyRound(nextRounds, nextSettings.activeRound)
      const nextStatuses = nextRound.statuses
      const nextActivities = nextRound.activities
      const scannedBankFolders = await scanWorkspaceBankFolders(handle)
      const images = await scanWorkspaceImages(handle, [...new Set([...scannedBankFolders, ...Object.values(manifest?.folders || {})])])
      const discoveredBankFolders = new Set([...scannedBankFolders, ...images.map(item => item.bankFolder).filter(Boolean)])
      let folders = { ...(manifest?.folders || {}) }
      folders = Object.fromEntries(Object.entries(folders).filter(([, folderName]) => discoveredBankFolders.has(folderName)))
      nextBanks = nextBanks.filter(item => !manifest?.folders?.[item.id] || discoveredBankFolders.has(manifest.folders[item.id]))
      for (const folderName of discoveredBankFolders) {
        const displayName = workspaceBankName(folderName)
        let target = nextBanks.find(item => folders[item.id] === folderName)
        if (!target) {
          const sameName = nextBanks.filter(item => item.name === displayName || safeFolderName(item.name) === displayName)
          if (sameName.length === 1) target = sameName[0]
        }
        if (!target) {
          const id = `workspace-${Date.now()}-${nextBanks.length}`
          const subject = folderName.startsWith('英语/') ? 'english' : folderName.startsWith('专业课/') ? 'professional' : 'math'
          target = { id, name: displayName, description: '本地文件夹题库', subject, workspaceFolder: folderName, source: 'local', chapters: [] }
          nextBanks.push(target)
        }
        folders[target!.id] = folderName
      }
      nextBanks = nextBanks.map(item => folders[item.id] ? { ...item, workspaceFolder: folders[item.id] } : item)
      const entries = images.map(item => {
        const target = item.bankFolder
          ? nextBanks.find(bank => folders[bank.id] === item.bankFolder)
          : nextBanks.find(bank => bank.id === bankId) || nextBanks[0]
        return {
          file: item.file,
          relativePath: item.relativePath,
          bankId: target!.id,
          assetUrl: URL.createObjectURL(item.file),
          fileHandle: item.fileHandle,
        }
      })
      const result = await mergeImageEntries(nextBanks, entries, { replaceExistingAssets: true })
      workspaceImages.current = images.map(item => ({
        name: item.file.name,
        relativePath: item.relativePath,
        bankFolder: item.bankFolder,
        bankId: (item.bankFolder ? result.banks.find(bank => folders[bank.id] === item.bankFolder) : result.banks.find(bank => bank.id === bankId) || result.banks[0])?.id,
      }))
      await writeWorkspaceNoteBuckets(handle, nextNotes, result.banks)
      await writeWorkspaceUserData(handle, nextRounds, nextSettings, {}, resolvedUserData.errorRecords, nextPersonalNotebooks)
      await persistWorkspaceCache('directory', result.banks, folders, nextRounds, nextSettings, nextNotes, resolvedUserData.errorRecords, nextPersonalNotebooks).catch(() => {})
      markAllNoteBucketsDirty(nextNotes, result.banks, false)
      if (!restoreSavedNavigation(result.banks, nextStatuses)) {
        const activeBank = result.banks.find(item => item.id === bankId) || result.banks[0]
        const activeSections = activeBank?.chapters.flatMap(chapter => chapter.sections) || []
        if (activeBank && !activeSections.some(item => item.id === sectionId)) {
          setBankId(activeBank.id)
          setSectionId(activeSections[0]?.id || '')
          setQuestionIndex(0)
        }
      }
      setWorkspaceReady(false)
      setWorkspaceStateBaseline(result.banks, folders, nextRounds, nextSettings, nextNotes, resolvedUserData.errorRecords, nextPersonalNotebooks)
      notesLoaded.current = true
      setNotesReady(true)
      setErrorRecordsReady(true)
      setBanks(result.banks); setStudyRounds(nextRounds); setStatuses(nextStatuses); setActivities(nextActivities); setQuestionNotes(nextNotes); setPersonalNotebooks(nextPersonalNotebooks); setUserSettings(nextSettings); setWorkspaceFolders(folders); setWorkspaceHandle(handle); setDefaultWorkspaceConnected(false)
      setQuestionErrorRecords(resolvedUserData.errorRecords)
      setWorkspaceState('connected')
      window.setTimeout(() => setWorkspaceReady(true), 0)
      const userDataMessage = userData ? '已读取文件夹中的学习数据' : '已将本机学习数据写入文件夹'
      setToast(`已连接“${handle.name}”，${userDataMessage}${seededEnglishCount ? `，更新 ${seededEnglishCount} 个内置英语题库` : ''}${result.imported ? `，同步 ${result.imported} 张图片` : ''}`)
      return true
    } catch (error) {
      if (isMissingWorkspaceError(error)) {
        await clearWorkspaceHandle().catch(() => {})
        setWorkspaceHandle(null); setWorkspaceState('none')
      } else {
        setWorkspaceState('error'); setToast(error instanceof Error ? error.message : '题库文件夹同步失败')
      }
      return false
    }
  }

  async function connectWorkspace() {
    try {
      if (defaultWorkspaceConnected) { await loadDefaultWorkspace(); return }
      if (workspaceHandle) {
        try {
          if (await hasWorkspacePermission(workspaceHandle, true) && await loadWorkspace(workspaceHandle)) return
        } catch (error) {
          if (!isMissingWorkspaceError(error)) throw error
          await clearWorkspaceHandle().catch(() => {})
          setWorkspaceHandle(null)
        }
      }
      const handle = await chooseWorkspace()
      await loadWorkspace(handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setWorkspaceState('error'); setToast(error instanceof Error ? error.message : '无法连接题库文件夹')
    }
  }
  async function switchWorkspace() {
    try {
      if (workspaceHandle && workspaceState === 'connected') {
        void Promise.all([
          writeWorkspaceManifest(workspaceHandle, banks, workspaceFolders),
          writeWorkspaceNoteBuckets(workspaceHandle, questionNotes, banks),
          writeWorkspaceUserData(workspaceHandle, currentStudyRounds(), userSettings, {}, questionErrorRecords, personalNotebooks),
        ]).catch(() => {})
      }
      const handle = await chooseWorkspace()
      await loadWorkspace(handle)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setToast(error instanceof Error ? error.message : '无法切换本地题库')
    }
  }
  function updateCloudSyncSettings(next: CloudSyncSettings) {
    setCloudSyncSettings(next)
    if (!saveCloudSyncSettings(next)) setCloudSyncMessage('OneDrive 配置保存失败，请检查浏览器存储空间')
  }
  async function signInOneDrive() {
    try {
      updateCloudSyncSettings(cloudSyncSettings)
      setCloudSyncState('syncing')
      await startOneDriveSignIn(cloudSyncSettings)
    } catch (error) {
      setCloudSyncState('error')
      setCloudSyncMessage(error instanceof Error ? error.message : 'OneDrive 登录失败')
    }
  }
  function signOutCloudSync() {
    signOutOneDrive()
    setOneDriveSignedIn(false)
    setCloudSyncState('idle')
    setCloudSyncMessage('已退出 OneDrive')
  }
  async function createCloudSyncImageFiles(): Promise<CloudSyncFile[]> {
    if (!cloudSyncSettings.includeBanks) return []
    const output: CloudSyncFile[] = []
    const addBlob = async (path: string, blob: Blob) => {
      output.push({ path, content: new Uint8Array(await blob.arrayBuffer()), contentType: 'binary', mimeType: blob.type || 'application/octet-stream' })
    }
    if (defaultWorkspaceConnected) {
      for (const image of workspaceImages.current) {
        if (!image.url) continue
        const response = await fetch(image.url)
        if (!response.ok) continue
        await addBlob(cloudSyncImagePath(image.bankFolder, image.relativePath), await response.blob())
      }
      return output
    }
    if (workspaceHandle && workspaceState === 'connected') {
      const images = await scanWorkspaceImages(workspaceHandle, Object.values(workspaceFolders))
      for (const image of images) await addBlob(cloudSyncImagePath(image.bankFolder, image.relativePath), image.file)
      return output
    }
    const keys = [...new Set(banks.flatMap(assetKeysForBank))]
    const assets = await getAssetFiles(keys)
    for (const asset of assets) {
      const fileName = asset.key.split('/').at(-1) || 'image.bin'
      await addBlob(cloudSyncAssetPath(asset.key, fileName), asset.blob)
    }
    return output
  }

  function cloudSyncImageEntryPath(path: string) {
    return path.slice(cloudSyncImagePrefix().length)
  }

  async function applyCloudSyncImages(files: CloudSyncFile[], initialBanks: QuestionBank[], folders: Record<string, string>) {
    const imageFiles = files.filter(file => file.path.startsWith(cloudSyncImagePrefix()) && file.content instanceof Uint8Array)
    if (!imageFiles.length) return { banks: initialBanks, count: 0 }
    const entries: Array<{ file: File; relativePath: string; bankId: string; assetUrl?: string }> = []
    let count = 0
    for (const item of imageFiles) {
      const content = item.content as Uint8Array
      const relativePath = cloudSyncImageEntryPath(item.path)
      const fileName = relativePath.split('/').at(-1) || 'image.bin'
      const file = new File([content as unknown as BlobPart], fileName, { type: item.mimeType || 'application/octet-stream' })
      const assetKey = cloudSyncAssetKey(item.path)
      if (assetKey) {
        await putAssets([{ key: assetKey, file }])
        count++
        continue
      }
      const bankFolder = Object.values(folders)
        .filter(Boolean)
        .sort((left, right) => right.length - left.length)
        .find(folder => relativePath === folder || relativePath.startsWith(`${folder}/`)) || ''
      const imageRelativePath = bankFolder ? relativePath.slice(bankFolder.length + 1) : relativePath
      const target = bankFolder
        ? initialBanks.find(bank => folders[bank.id] === bankFolder || bank.workspaceFolder === bankFolder)
        : initialBanks[0]
      if (!target) continue
      if (defaultWorkspaceConnected) {
        await writeDefaultWorkspaceImage(file, relativePath)
        entries.push({ file, relativePath: imageRelativePath, bankId: target.id, assetUrl: defaultWorkspaceFileUrl(relativePath, Date.now()) })
      } else if (workspaceHandle && workspaceState === 'connected') {
        await writeWorkspaceImage(workspaceHandle, file, relativePath)
        entries.push({ file, relativePath: imageRelativePath, bankId: target.id, assetUrl: URL.createObjectURL(file) })
      } else {
        entries.push({ file, relativePath: imageRelativePath, bankId: target.id })
      }
      count++
    }
    if (!entries.length) return { banks: initialBanks, count }
    const validEntries = entries.filter(entry => initialBanks.some(bank => bank.id === entry.bankId))
    const result = await mergeImageEntries(initialBanks, validEntries, { replaceExistingAssets: true })
    return { banks: result.banks, count }
  }

  async function syncOneDrive(silent = false) {
    if (!oneDriveSignedIn) {
      if (!silent) setCloudSyncMessage('请先登录 OneDrive')
      return
    }
    if (cloudSyncInFlight.current) return
    cloudSyncInFlight.current = true
    setCloudSyncState('syncing')
    try {
      const files = [
        ...createCloudSyncFiles(banks, workspaceFolders, currentStudyRounds(), userSettings, questionNotes, questionErrorRecords, personalNotebooks, cloudSyncSettings.includeBanks),
        ...(await createCloudSyncImageFiles()),
      ]
      const result = await syncCloudFiles(cloudSyncSettings, files)
      let syncedStatuses = statuses
      const userDataFile = result.files.find(file => file.path === cloudSyncUserDataPath())
      if (userDataFile && typeof userDataFile.content === 'string') {
        const parsed = JSON.parse(userDataFile.content)
        const resolved = resolveWorkspaceUserData(parsed, undefined, currentStudyRounds(), userSettings, questionNotes, questionErrorRecords, personalNotebooks)
        const nextRound = getStudyRound(resolved.rounds, resolved.settings.activeRound)
        syncedStatuses = nextRound.statuses
        notesLoaded.current = true
        setNotesReady(true)
        setErrorRecordsReady(true)
        setStudyRounds(resolved.rounds)
        setStatuses(nextRound.statuses)
        setActivities(nextRound.activities)
        setUserSettings(resolved.settings)
        setQuestionNotes(resolved.notes)
        setQuestionErrorRecords(resolved.errorRecords)
        setPersonalNotebooks(resolved.personalNotebooks)
      }
      if (cloudSyncSettings.includeBanks) {
        const manifestFile = result.files.find(file => file.path === cloudSyncManifestPath())
        let nextBanks = banks
        let folders = workspaceFolders
        if (manifestFile && typeof manifestFile.content === 'string') {
          const manifest = JSON.parse(manifestFile.content)
          nextBanks = removeRetiredBanks(validateBanks(manifest))
          folders = { ...(manifest.folders || {}) }
        }
        const downloadedImageFiles = result.files.filter(file => result.downloadedPaths.includes(file.path))
        const imageResult = await applyCloudSyncImages(downloadedImageFiles, nextBanks, folders)
        nextBanks = imageResult.banks
        setBanks(nextBanks)
        setWorkspaceFolders(folders)
        restoreSavedNavigation(nextBanks, syncedStatuses)
      }
      setOneDriveSignedIn(true)
      setCloudSyncState('connected')
      setCloudSyncLastSuccessfulAt(loadLastSuccessfulSyncAt(cloudSyncSettings))
      const conflictMessage = result.conflicts.length ? `，已保留 ${result.conflicts.length} 个冲突副本` : ''
      if (silent) setCloudSyncMessage(`自动同步完成：${result.uploaded + result.downloaded} 个文件${conflictMessage}`)
      else {
        setCloudSyncMessage(`已同步 ${result.uploaded + result.downloaded} 个文件${conflictMessage}`)
        setToast(`OneDrive 同步完成${conflictMessage}`)
      }
    } catch (error) {
      setCloudSyncState('error')
      setCloudSyncMessage(error instanceof Error ? error.message : 'OneDrive 同步失败')
      if (!silent) setToast(error instanceof Error ? error.message : 'OneDrive 同步失败')
    } finally {
      cloudSyncInFlight.current = false
    }
  }

  function resetCloudSyncTime() {
    if (!resetLastSuccessfulSyncAt(cloudSyncSettings)) {
      setCloudSyncMessage('上次同步时间重置失败，请检查浏览器存储空间')
      return
    }
    setCloudSyncLastSuccessfulAt('')
    setCloudSyncMessage('已重置上次成功同步时间')
  }

  useEffect(() => {
    setCloudSyncLastSuccessfulAt(loadLastSuccessfulSyncAt(cloudSyncSettings))
  }, [cloudSyncSettings.clientId, cloudSyncSettings.remotePath])

  useEffect(() => {
    if (!oneDriveSignedIn || cloudSyncSettings.startupSyncDelaySeconds <= 0) return
    const timer = window.setTimeout(() => { void syncOneDrive(true) }, cloudSyncSettings.startupSyncDelaySeconds * 1000)
    return () => window.clearTimeout(timer)
  }, [oneDriveSignedIn, cloudSyncSettings.startupSyncDelaySeconds])

  useEffect(() => {
    if (!oneDriveSignedIn || cloudSyncSettings.autoSyncMinutes <= 0) return
    const timer = window.setInterval(() => { void syncOneDrive(true) }, cloudSyncSettings.autoSyncMinutes * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [oneDriveSignedIn, cloudSyncSettings.autoSyncMinutes, banks, workspaceFolders, userSettings, questionNotes, questionErrorRecords, personalNotebooks])
  function openNewBank(targetSubject: Subject = subject) {
    setNewBankSubject(targetSubject)
    if (targetSubject === 'math') setNewBankMathModule(mathModule)
    setNewBankName('')
    setSettingsOpen(false)
    setSettingsPanelOpen(false)
    setNewBankOpen(true)
  }
  async function createBank() {
    const name = newBankName.trim()
    if (!name) { setToast('请输入题库名称'); return }
    const duplicate = banks.some(item => bankSubject(item) === newBankSubject && item.name.trim() === name && (newBankSubject !== 'math' || bankMathModules(item).includes(newBankMathModule)))
    if (duplicate) { setToast('当前板块已有同名题库，请换一个名称'); return }
    let workspaceFolder: string | undefined
    if (workspaceHandle && workspaceState === 'connected') {
      const folderGroup = newBankSubject === 'math' ? `数学/${mathFolderLabel}` : newBankSubject === 'english' ? '英语' : '专业课'
      const baseFolderName = `${folderGroup}/${safeFolderName(name)}`
      workspaceFolder = await createBankFolder(workspaceHandle, Object.values(workspaceFolders).includes(baseFolderName) ? `${baseFolderName}-${Date.now()}` : baseFolderName)
    }
    const created: QuestionBank = { id: `local-${Date.now()}`, name, description: '自建本地题库', subject: newBankSubject, source: 'local', chapters: [], ...(workspaceFolder ? { workspaceFolder } : {}) }
    if (workspaceFolder) setWorkspaceFolders(previous => ({ ...previous, [created.id]: workspaceFolder! }))
    if (newBankSubject === 'math') setMathModule(newBankMathModule)
    setBanks(previous => [...previous, created]); setBankId(created.id); setSectionId(''); setView('section'); setActivePage('study'); setNewBankName(''); setNewBankOpen(false); setToast(`已新建“${name}”，现在可以批量导入图片`)
  }
  function openRename(kind: 'bank' | 'chapter', id: string, name: string) { setRenameTarget({ kind, id, name }); setRenameValue(name) }
  function applyRename() {
    const name = renameValue.trim()
    if (!renameTarget || !name) { setToast('名称不能为空'); return }
    setBanks(previous => renameTarget.kind === 'bank' ? renameBank(previous, renameTarget.id, name) : renameChapter(previous, bank.id, renameTarget.id, name))
    setRenameTarget(null); setToast(`已重命名为“${name}”`)
  }

  const customExamDate = parseExamDateValue(userSettings.examDate || '')
  const markdownShortcuts = resolveMarkdownShortcutSettings(userSettings.markdownShortcuts)
  const examCountdown = getExamCountdown(countdownNow, customExamDate)
  const examDateLabel = `${examCountdown.target.getMonth() + 1} 月 ${examCountdown.target.getDate()} 日`
  const updateExamDate = (value: string) => {
    const date = parseExamDateValue(value)
    if (!date) return
    setUserSettings(previous => ({ ...previous, examDate: formatExamDateValue(date) }))
    setToast(`考试日期已修改为 ${date.getMonth() + 1} 月 ${date.getDate()} 日`)
  }
  const resetExamDate = () => {
    setUserSettings(previous => {
      const { examDate: _removed, ...rest } = previous
      return rest
    })
    setToast('已恢复默认考试日期')
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      setToast('当前浏览器不支持全屏显示')
    }
  }

  function toggleScreenAwake() {
    if (!screenWakeLockSupported) {
      setToast('当前浏览器不支持屏幕常亮')
      return
    }
    const enabled = !userSettings.keepScreenAwake
    setUserSettings(previous => ({ ...previous, keepScreenAwake: enabled }))
    setToast(enabled ? '已开启屏幕常亮' : '已关闭屏幕常亮')
  }

  function updateMarkdownShortcutSettings(settings: MarkdownShortcutSettings) {
    setUserSettings(previous => ({ ...previous, markdownShortcuts: settings }))
  }

  function resetMarkdownShortcutSettings() {
    setUserSettings(previous => {
      const { markdownShortcuts: _removed, ...rest } = previous
      return rest
    })
  }

  function renderEnglishTopicPassageGroup(group: EnglishTopicSectionGroup) {
    const topicSection = group.section
    const topicQuestions = group.entries.map(entry => entry.question)
    const topicAllPassageAnswersOpen = topicQuestions.length > 0 && topicQuestions.every(item => expandedPassageAnswers.has(item.id))
    const topicIsPartBSection = topicSection.questions.length > 0 && topicSection.questions.every(item => item.type === '阅读理解 Part B')
    const topicSharedPartBOptions = topicIsPartBSection ? topicSection.questions[0]?.options || [] : []
    const topicHasLongPartBOptions = topicSharedPartBOptions.some(option => option.length > 180)
    const topicPartBOptionBankMeta = topicSection.partBKind === 'ordering'
      ? { title: '待排序段落', description: '以下段落供第 41–45 题共同使用。' }
      : topicSection.partBKind === 'subheading'
        ? { title: '备选小标题', description: '以下小标题供第 41–45 题共同使用。' }
        : topicSection.partBKind === 'viewpoint'
          ? { title: '备选观点', description: '以下观点供第 41–45 题共同使用。' }
          : { title: '备选句', description: '以下句子供第 41–45 题共同使用。' }
    return <div className="english-topic-passage-group" key={topicSection.id}>
      <section className="passage-questions" aria-label={`${topicSection.name}题目与选项`}>
        <div className="passage-block-heading passage-block-heading-actions"><div><span>QUESTIONS & ANSWERS</span><h2>题目与选项</h2><p>{topicSection.name}</p></div><button className="batch-answer-toggle" aria-expanded={topicAllPassageAnswersOpen} onClick={() => setExpandedPassageAnswers(previous => { const next = new Set(previous); if (topicAllPassageAnswersOpen) topicQuestions.forEach(item => next.delete(item.id)); else topicQuestions.forEach(item => next.add(item.id)); return next })}><CircleHelp size={16}/>{topicAllPassageAnswersOpen ? '全部收起' : '全部展开'}<ChevronDown className={topicAllPassageAnswersOpen ? 'rotated' : ''} size={15}/></button></div>
        {topicIsPartBSection && topicSharedPartBOptions.length > 0 && <section className="part-b-choice-bank" aria-label="Part B 备选项"><div><span>OPTION BANK</span><h3>{topicPartBOptionBankMeta.title}</h3><p>{topicPartBOptionBankMeta.description}</p>{topicSection.partBSequence && <p className="part-b-sequence"><strong>已知顺序框架</strong>{topicSection.partBSequence}</p>}</div><div className={topicHasLongPartBOptions ? 'part-b-shared-options long-options' : 'part-b-shared-options'}>{topicSharedPartBOptions.map((option, index) => <div key={index}>{option}</div>)}</div></section>}
        {topicQuestions.map(item => {
          const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode)
          const itemStatusMeta = questionStatusMeta(item, itemStatus, binaryFilterMode)
          const itemAnswerOpen = expandedPassageAnswers.has(item.id)
          const itemQuestionSources = questionImageSources(item, 'question')
          const itemAnswerSources = questionImageSources(item, 'answer')
          const itemHasAnswerImages = itemAnswerSources.length > 0
          const itemUsesImageAnswer = itemHasAnswerImages && isImageAnswerPlaceholder(item.answer)
          const withoutRepeatedNumber = item.text.trim().replace(new RegExp(`^${item.number}\\s*[.\\uFF0E、)]\\s*`), '')
          const itemQuestionText = /^Blank\\s+\\d+\\.?$/i.test(withoutRepeatedNumber) ? '' : withoutRepeatedNumber
          return <article className="passage-question" id={`question-${item.id}`} key={item.id}>
            <div className="passage-question-head"><div className="passage-question-number"><span className="number">{String(item.number).padStart(2, '0')}</span><QuestionTagPicker tags={questionTags} selectedTagIds={item.tagIds} compact onChange={tagIds => setQuestionTagIds(item.id, tagIds)}/></div><span className={`current-status ${itemStatus}`}>{itemStatusMeta.icon} {itemStatusMeta.label}</span></div>
            {itemQuestionText && <p className="passage-question-text">{itemQuestionText}</p>}
            <AssetGallery sources={itemQuestionSources} alt="题目配图" onImageZoom={imageSource => setQuestionZoomTarget({ question: item, imageSource })}/>
            {item.options && !topicIsPartBSection && <div className="passage-options">{item.options.map((option, index) => <div key={index}>{option}</div>)}</div>}
            <button className="passage-answer-toggle" aria-expanded={itemAnswerOpen} onClick={() => togglePassageAnswer(item.id)}><CircleHelp size={16}/>{itemAnswerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={itemAnswerOpen ? 'rotated' : ''} size={15}/></button>
            {itemAnswerOpen && <div className="passage-answer">{!itemUsesImageAnswer && <div className="answer-result"><span>参考答案</span><strong>{item.answer}</strong></div>}<div className={itemUsesImageAnswer ? 'answer-analysis combined-image-answer' : 'answer-analysis'}><span>{itemUsesImageAnswer ? '参考答案和解析' : '原版解析'}</span>{itemHasAnswerImages ? <AssetGallery sources={itemAnswerSources} alt={itemUsesImageAnswer ? '参考答案和解析' : '原版解析截图'} eager/> : <p className="analysis-missing">原版解析截图暂未收录</p>}</div></div>}
            <QuestionNotePanel questionId={item.id} note={questionNotes[item.id]} markdownShortcuts={markdownShortcuts} onChange={note => updateQuestionNote(item.id, note)}/>
            <div className="passage-status"><div className="passage-markers">{readingTypePicker(item)}</div><div><span className="mastery-status-label">掌握情况</span>{questionErrorRecordPicker(item, itemStatus)}{masteryChoices(item, binaryFilterMode).map(s => { const meta = questionStatusMeta(item, s, binaryFilterMode); return <button key={s} className={itemStatus === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => markQuestion(item.id, itemStatus === s ? 'none' : s, item)}><b>{meta.icon}</b>{meta.label}</button> })}</div></div>
          </article>
        })}
      </section>
      {(topicSection.passage || topicSection.passageImageUrls?.length || topicSection.passageAnalysisImageUrls?.length) && <article className="source-passage"><div className="passage-block-heading"><span>ORIGINAL TEXT</span><h2>原文</h2><p>{topicSection.name}</p></div>{topicSection.passage && <div className="source-copy">{formatPassageParagraphs(topicSection.passage).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}{topicSection.passageImageUrls?.length && <div className="source-scan"><AssetGallery urls={topicSection.passageImageUrls} alt="专题原文"/></div>}{renderPassageAnalysis(topicSection, '专题全文解析')}</article>}
    </div>
  }
  function renderEnglishTopicPassageNavigation() {
    return <nav className="question-nav passage-question-nav english-topic-passage-nav" aria-label="专题题号导航"><div className="question-nav-heading"><div><strong>专题题号导航</strong></div>{renderQuestionNavigationModeSwitch()}</div><div className="number-grid">{filteredQuestions.map((item, index) => { const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode); return <button key={item.id} aria-current={index === questionIndex ? 'true' : undefined} title={questionNavigationTitle('本年度专题', item)} className={questionNavigationButtonClass(index === questionIndex, itemStatus)} style={questionNavigationButtonStyle(item)} onClick={() => jumpToPassageQuestion(item.id, index)}><span className="question-nav-number">{item.number}</span>{renderQuestionNavigationIndicator(item, itemStatus)}</button> })}</div>{renderQuestionNavigationLegend()}<div className="nav-accuracy"><span>本专题正确率</span><strong>{formatRate(currentNavigationStats.accuracy)}</strong><small>{currentNavigationStats.marked} 道题已标记</small></div></nav>
  }

  return <div className={subject === 'english' ? 'app-shell english-app' : 'app-shell'}>
    <header>
      {activePage === 'study' && <button ref={mobileMenuButtonRef} className="mobile-menu" onClick={() => setSidebar(true)} aria-label="打开菜单" aria-controls="question-bank-sidebar" aria-expanded={sidebar}><Menu/></button>}
      <div className="brand"><span className="brand-mark"><BookOpen size={20}/></span><div><strong>考研学习空间</strong><small>NPEE STUDY SPACE</small></div></div>
      <nav className="subject-nav" aria-label="学科导航">
        <button className={activePage === 'study' && subject === 'math' ? 'active' : ''} onClick={() => selectSubject('math')}>数学</button>
        <button className={activePage === 'study' && subject === 'english' ? 'active' : ''} onClick={() => selectSubject('english')}>英语</button>
        <button className={activePage === 'study' && subject === 'professional' ? 'active' : ''} onClick={() => selectSubject('professional')}>专业课</button>
        <button className={activePage === 'profile' ? 'active' : ''} onClick={() => { if (!profileBankId) setProfileBankId(bank.id); setActivePage('profile'); setSidebar(false) }}>我的</button>
      </nav>
      <div className="header-center exam-countdown" title={`${examCountdown.cohortYear} 年考研初试日期：${examCountdown.target.getFullYear()} 年 ${examDateLabel}`}><span>{examCountdown.cohortYear} 考研倒计时</span><strong>{examCountdown.days}</strong><em>天</em><small>{examDateLabel}</small></div>
      <div className="header-actions">
        <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={e => importData(e.target.files?.[0])}/>
        <input ref={node => { imageImportRef.current = node; node?.setAttribute('webkitdirectory', '') }} hidden type="file" multiple accept="image/*" onChange={e => importImages(e.target.files)}/>
        <div className="header-sync-status" title={workspaceState === 'connected' ? `已同步：${defaultWorkspaceConnected ? '默认题库' : workspaceHandle?.name}` : workspaceState === 'error' ? '题库连接失败，请点击按钮重试' : '数据与位置保存在本地'}><span className={`source-dot ${workspaceState === 'connected' ? 'workspace-on' : ''}`}/><span>{workspaceState === 'connected' ? '已同步' : workspaceState === 'syncing' ? '同步中' : workspaceState === 'error' ? '连接失败' : '本地保存'}</span>{cloudSyncSettings.showLastSuccessfulSync && oneDriveSignedIn && cloudSyncLastSuccessfulAt && <small>云端 {new Date(cloudSyncLastSuccessfulAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>}</div>
        <button className="workspace-sync-button" type="button" aria-label={workspaceState === 'connected' ? '重新同步题库' : '连接题库'} title={workspaceState === 'connected' ? '重新同步题库' : '连接题库'} onClick={connectWorkspace} disabled={workspaceState === 'syncing'}><FolderSync/></button>
        <div className="toolbox-module" ref={toolboxRef}>
          <button className={toolboxOpen ? 'tool-button toolbox-trigger active' : 'tool-button toolbox-trigger'} type="button" aria-label="工具箱" aria-haspopup="menu" aria-expanded={toolboxOpen} onClick={() => setToolboxOpen(open => !open)}><Wrench/><span>工具箱</span><ChevronDown/></button>
          {toolboxOpen && <div className="toolbox-popover" role="menu">
            <div className="toolbox-heading"><strong>工具箱</strong><button type="button" aria-label="关闭工具箱" onClick={() => setToolboxOpen(false)}><X/></button></div>
            <section><span>学习工具</span><div><button role="menuitem" type="button" onClick={() => { setToolboxOpen(false); setTimerView('large') }}><Timer/><span><strong>计时器</strong><small>记录专注学习时长，支持小窗显示</small></span></button><button role="menuitem" type="button" onClick={() => { setToolboxOpen(false); setNotesOpen(true) }}><NotebookPen/><span><strong>我的笔记</strong><small>按题库和章节汇总查看所有题目笔记</small></span></button></div></section>
          </div>}
        </div>
        <div className="settings-tools-module">
          <button className={settingsPanelOpen ? 'tool-button settings-tools-trigger active' : 'tool-button settings-tools-trigger'} aria-label="设置" aria-haspopup="dialog" aria-expanded={settingsPanelOpen} onClick={() => { setNewBankSubject(subject); setSettingsPanelOpen(open => !open) }}><SettingsIcon/><span>设置</span><ChevronDown/></button>
        </div>
        <button className="fullscreen-toggle" type="button" aria-label={isFullscreen ? '退出全屏' : '全屏显示'} title={isFullscreen ? '退出全屏' : '全屏显示'} onClick={() => { void toggleFullscreen() }}>{isFullscreen ? <Minimize2/> : <Maximize2/>}</button>
        <a className="github-link" href={githubRepositoryUrl} target="_blank" rel="noreferrer" aria-label="在 GitHub 查看考研学习空间" title="在 GitHub 查看项目"><GitHubMark/></a>
      </div>
    </header>

    <div className={activePage === 'profile' ? 'body-grid profile-mode' : 'body-grid'}>
      {activePage === 'study' && <>{sidebar && <div className="scrim" aria-hidden="true" onClick={() => setSidebar(false)}/>}
      <aside id="question-bank-sidebar" className={sidebar ? 'open' : ''} aria-hidden={compactLayout && !sidebar ? true : undefined} inert={compactLayout && !sidebar}>
        <div className="aside-mobile-title"><strong>题库导航</strong><button ref={sidebarCloseButtonRef} type="button" aria-label="关闭菜单" onClick={() => setSidebar(false)}><X/></button></div>
        {subject === 'math' && <div className="math-module-switch" role="group" aria-label="数学题库模块">
          {mathModuleOrder.map(module => <button key={module} type="button" className={mathModule === module ? 'active' : ''} aria-pressed={mathModule === module} title={`切换到${mathModuleLabels[module]}题库`} onClick={() => selectMathModule(module)}>
            <span>{mathModuleLabels[module]}</span>
          </button>)}
        </div>}
        <p className="eyebrow">题库类型</p>
        <div className="bank-select-row"><span className="bank-select-icon"><BookOpen size={17}/></span><select aria-label="选择题库" value={bank.id} onChange={event => { const selected = banks.find(item => item.id === event.target.value); if (selected) selectBank(selected) }}>{subjectBanks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="rename-button" aria-label={`重命名题库 ${bank.name}`} onClick={() => openRename('bank', bank.id, bank.name)}><Pencil size={13}/></button></div>
        <div className="selected-bank-meta">{protectedBankIds.has(bank.id) ? '默认题库' : bank.source === 'local' ? '自建题库' : '远程题库'} · {bank.chapters.length} 章 · {bankQuestionEntries.length} 道题</div>
        <button className={view === 'wrong' ? 'wrong-book active' : 'wrong-book'} onClick={showReviewBook}><AlertCircle size={17}/><span><strong>{view === 'wrong' ? '返回当前学习' : '本题库不熟练题'}</strong><small>{view === 'wrong' ? '退出复盘并返回上次位置' : binaryFilterMode ? '当前题库中的错误题' : '包含模糊和错题'}</small></span><em>{binaryFilterMode ? counts.wrong : counts.vague + counts.wrong}</em></button>
        {isMathExamBank && <div className="exam-navigation-switch" role="group" aria-label="真题目录模式">
          <button type="button" className={mathExamNavigationMode === 'paper' ? 'active' : ''} aria-pressed={mathExamNavigationMode === 'paper'} onClick={() => selectMathExamNavigationMode('paper')}><span>整卷</span><small>按年份</small></button>
          <button type="button" className={mathExamNavigationMode === 'keyPoint' ? 'active' : ''} aria-pressed={mathExamNavigationMode === 'keyPoint'} onClick={() => selectMathExamNavigationMode('keyPoint')}><span>考点目录</span><small>{examKeyPointGroups.length} 个考点</small></button>
        </div>}
        {subject === 'english' && englishTopicGroups.length > 0 && <div className="exam-navigation-switch english-navigation-switch" role="group" aria-label="英语目录模式">
          <button type="button" className={englishNavigationMode === 'paper' ? 'active' : ''} aria-pressed={englishNavigationMode === 'paper'} onClick={() => selectEnglishNavigationMode('paper')}><span>整卷</span><small>按年份</small></button>
          <button type="button" className={englishNavigationMode === 'topic' ? 'active' : ''} aria-pressed={englishNavigationMode === 'topic'} onClick={() => selectEnglishNavigationMode('topic')}><span>专题</span><small>{englishTopicGroups.length} 个专题</small></button>
        </div>}
        {isEnglishTopicMode && <div className="english-topic-switcher" role="group" aria-label="英语专题切换">
          {englishTopicGroups.map(group => {
            const topicCount = currentChapter ? group.entries.filter(entry => entry.chapterId === currentChapter.id).length : 0
            return <button key={group.key} type="button" className={selectedEnglishTopicGroup?.key === group.key ? 'active' : ''} aria-pressed={selectedEnglishTopicGroup?.key === group.key} onClick={() => selectEnglishTopic(group.key)}><span>{group.label}</span><small>{topicCount} 题</small></button>
          })}
        </div>}
        <div className="divider"/>
        <p className="eyebrow">{isMathExamKeyPointMode ? '考点导航' : isEnglishTopicMode ? '年份导航' : '章节导航'}</p>
        <div className="chapter-scroll" ref={chapterScrollRef}>{isMathExamKeyPointMode ? <div className="exam-keypoint-tree catalog-tree">{examKeyPointCatalogTree.map(module => <section className="exam-keypoint-module catalog-level-1-branch" key={module.key}>
          <div className="exam-keypoint-module-title catalog-level-1-heading"><strong>{module.label}</strong><small>{module.sections.reduce((count, sectionItem) => count + sectionItem.groups.length, 0)} 个考点</small></div>
          {module.sections.map(sectionItem => <div className="exam-keypoint-section catalog-level-2-branch" key={sectionItem.key}>
            <div className="exam-keypoint-section-title catalog-level-2-heading">{sectionItem.label}</div>
            {sectionItem.groups.map(group => {
              const groupProgress = navigationProgress(group.entries.map(entry => entry.question), statuses, binaryFilterMode)
              return <button key={group.key} type="button" data-keypoint-id={group.key} className={selectedExamKeyPointGroup?.key === group.key ? 'exam-keypoint-item catalog-level-3 active' : 'exam-keypoint-item catalog-level-3'} onClick={() => selectMathExamKeyPoint(group.key)}><span>{group.key}</span><small className="nav-progress" title={`已标记 ${groupProgress.marked}/${groupProgress.total} 题`}>{groupProgress.label}</small></button>
            })}
          </div>)}
        </section>)}{examKeyPointCatalogTree.length === 0 && <div className="empty-chapters">还没有考点<br/><small>请先补充题目的考点信息</small></div>}</div> : isEnglishTopicMode ? <div className="english-topic-year-tree catalog-tree">{bank.chapters.map(chapter => {
          const topicEntries = selectedEnglishTopicGroup?.entries.filter(entry => entry.chapterId === chapter.id) || []
          if (!topicEntries.length) return null
          const year = chapter.name.match(/^\d{4}/)?.[0] || chapter.name
          const yearProgress = navigationProgress(topicEntries.map(entry => entry.question), statuses, binaryFilterMode)
          const active = currentChapter?.id === chapter.id
          const readingTopicSections = selectedEnglishTopicGroup?.key === 'reading' ? chapter.sections.filter(itemSection => topicEntries.some(entry => entry.sectionId === itemSection.id)) : []
          if (selectedEnglishTopicGroup?.key === 'reading') {
            const expanded = expandedChapterIds.has(chapter.id)
            const readingProgress = navigationProgress(readingTopicSections.flatMap(itemSection => itemSection.questions), statuses, binaryFilterMode)
            return <div key={chapter.id} className={bank.chapters.length === 1 ? 'chapter single-chapter catalog-level-1-branch' : 'chapter catalog-level-1-branch'} data-chapter-id={chapter.id}>
              <div className="chapter-title catalog-level-1-container"><button className="chapter-toggle catalog-level-1" aria-expanded={expanded} onClick={() => toggleChapter(chapter.id)}>{expanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{chapter.name}</span><em>{readingTopicSections.length}</em><small className="nav-progress" title={`已标记 ${readingProgress.marked}/${readingProgress.total} 题`}>{readingProgress.label}</small></button><button className="rename-button" aria-label={`重命名章节 ${chapter.name}`} onClick={() => openRename('chapter', chapter.id, chapter.name)}><Pencil size={12}/></button></div>
              {expanded && <div className="english-section-group english-topic-reading-group catalog-level-2-branch"><div className="english-section-group-heading catalog-level-2-heading"><span>Section II 阅读理解</span><small title={`已标记 ${readingProgress.marked}/${readingProgress.total} 题`}>{readingProgress.label}</small></div>{readingTopicSections.map(itemSection => {
                const sectionProgress = navigationProgress(itemSection.questions, statuses, binaryFilterMode)
                const sectionActive = currentNavigationSectionId === itemSection.id
                const label = itemSection.name.replace(/^Part A\s*[·.]?\s*/i, '') || itemSection.name
                return <button key={itemSection.id} type="button" data-section-id={itemSection.id} aria-current={sectionActive ? 'page' : undefined} className={sectionActive ? 'section catalog-level-3 active' : 'section catalog-level-3'} onClick={() => selectEnglishTopicSection(itemSection.id)}><span>{label}</span><small className="nav-progress" title={`已标记 ${sectionProgress.marked}/${sectionProgress.total} 题`}>{sectionProgress.label}</small></button>
              })}</div>}
            </div>
          }
          return <div key={chapter.id} className={active ? 'english-topic-year-group active' : 'english-topic-year-group'}>
            <button type="button" data-chapter-id={chapter.id} aria-current={active ? 'page' : undefined} className={active ? 'english-topic-year-item catalog-level-1 active' : 'english-topic-year-item catalog-level-1'} onClick={() => selectEnglishTopicYear(chapter.id)}><span>{year}年</span><small className="nav-progress" title={`已标记 ${yearProgress.marked}/${yearProgress.total} 题`}>{yearProgress.label}</small></button>
            {readingTopicSections.length > 0 && <div className="english-topic-section-tree">{readingTopicSections.map(itemSection => {
              const sectionProgress = navigationProgress(itemSection.questions, statuses, binaryFilterMode)
              const sectionActive = currentNavigationSectionId === itemSection.id
              const label = itemSection.name.replace(/^Part A\s*[·.]?\s*/i, '') || itemSection.name
              return <button key={itemSection.id} type="button" data-section-id={itemSection.id} aria-current={sectionActive ? 'page' : undefined} className={sectionActive ? 'english-topic-section-item catalog-level-2 active' : 'english-topic-section-item catalog-level-2'} onClick={() => selectEnglishTopicSection(itemSection.id)}><span>{label}</span><small className="nav-progress" title={`已标记 ${sectionProgress.marked}/${sectionProgress.total} 题`}>{sectionProgress.label}</small></button>
            })}</div>}
          </div>
        })}</div> : <div className="chapter-tree catalog-tree">{bank.chapters.map(chapter => {
          const chapterProgress = navigationProgress(chapter.sections.flatMap(sectionItem => sectionItem.questions), statuses, binaryFilterMode)
          const visibleSections = chapter.sections.filter(sectionItem => sectionItem.questions.length > 0)
          const sectionGroups: SidebarSectionGroup[] = bank.id === 'english-exams'
            ? groupEnglishSections(visibleSections)
            : [{ key: 'all', label: '', sections: visibleSections }]
          return <div className={bank.chapters.length === 1 ? 'chapter single-chapter catalog-level-1-branch' : 'chapter catalog-level-1-branch'} data-chapter-id={chapter.id} key={chapter.id}>
            {bank.chapters.length > 1 && <div className="chapter-title catalog-level-1-container"><button className="chapter-toggle catalog-level-1" aria-expanded={expandedChapterIds.has(chapter.id)} onClick={() => toggleChapter(chapter.id)}>{expandedChapterIds.has(chapter.id) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{chapter.name}</span><em>{subject === 'english' ? sectionGroups.length : visibleSections.length}</em><small className="nav-progress" title={`已标记 ${chapterProgress.marked}/${chapterProgress.total} 题`}>{chapterProgress.label}</small></button><button className="rename-button" aria-label={`重命名章节 ${chapter.name}`} onClick={() => openRename('chapter', chapter.id, chapter.name)}><Pencil size={12}/></button></div>}
            {(bank.chapters.length === 1 || expandedChapterIds.has(chapter.id)) && sectionGroups.map(group => {
              const groupProgress = navigationProgress(group.sections.flatMap(sectionItem => sectionItem.questions), statuses, binaryFilterMode)
              const groupLevel = bank.chapters.length > 1 ? 2 : 1
              const sectionLevel = group.label ? groupLevel + 1 : groupLevel
              return <div key={`${chapter.id}-${group.key}`} className={`${group.label ? 'english-section-group ' : ''}catalog-level-${groupLevel}-branch`}>
                {group.label && <div className={`english-section-group-heading catalog-level-${groupLevel}-heading`}><span>{group.label}</span><small title={`已标记 ${groupProgress.marked}/${groupProgress.total} 题`}>{groupProgress.label}</small></div>}
                {group.sections.map(s => {
                  const sectionProgress = navigationProgress(s.questions, statuses, binaryFilterMode)
                  const label = group.key === 'all' ? s.name : englishSectionLabel(s, group.key)
                  const isCurrentSection = s.id === currentNavigationSectionId
                  return <button key={s.id} data-section-id={s.id} aria-current={isCurrentSection ? 'page' : undefined} onClick={() => selectSection(s.id)} className={isCurrentSection ? `section catalog-level-${sectionLevel} active` : `section catalog-level-${sectionLevel}`}><span>{label}</span><small className="nav-progress" title={`已标记 ${sectionProgress.marked}/${sectionProgress.total} 题`}>{sectionProgress.label}</small></button>
                })}
              </div>
            })}
          </div>
        })}{bank.chapters.length === 0 && <div className="empty-chapters">还没有章节<br/><small>点击顶部“图片”批量导入</small></div>}</div>}</div>
        <div className="aside-summary"><strong>学习概览</strong>{binaryFilterMode ? <div className="binary-summary"><span><i/>{counts.none} 未标记</span><span><i className="green"/>{counts.proficient} 正确</span><span><i className="red"/>{counts.wrong} 错误</span></div> : <div><span><i className="green"/>{counts.proficient} 熟练</span><span><i className="yellow"/>{counts.vague} 模糊</span><span><i className="red"/>{counts.wrong} 错题</span></div>}</div>
      </aside></>}

      <main className={activePage === 'profile' ? 'profile-main' : ''}>
        {activePage === 'profile' ? (LoadedLearningDashboard ? <LoadedLearningDashboard banks={banks} statuses={statuses} activities={activities} notes={questionNotes} questionTags={questionTags} selectedBankId={profileBankId} onSelectedBankIdChange={setProfileBankId} onQuestionStatusChange={markDashboardQuestion} onQuestionReviewStatusChange={markDashboardReview} onQuestionReviewReset={resetDashboardReview} onQuestionReviewDelete={deleteDashboardReview} onQuestionNoteChange={updateQuestionNote} onQuestionTagChange={setQuestionTagIds}/> : <DeferredInterfaceFallback/>) : <>
        <div className="page-head"><div><span className="breadcrumb">{bank.name} <ChevronRight size={13}/>{view === 'section' && currentChapter && !isMathExamKeyPointMode && !isEnglishTopicMode && <>{currentChapter.name} <ChevronRight size={13}/></>}{view === 'section' && isEnglishTopicMode && englishTopicContextLabel ? <>{currentStudyLabel} <ChevronRight size={13}/>{englishTopicContextLabel}</> : view === 'wrong' ? '本题库不熟练题' : currentStudyLabel}</span><div className="page-head-title-row"><h1>{view === 'wrong' ? '本题库不熟练题' : currentStudyLabel === '未选择' ? '请选择具体节题目' : currentStudyLabel}</h1><p>{view === 'wrong' ? `按章节和小节分组 · 共 ${reviewQuestions.length} 道不熟练题` : isMathExamKeyPointMode ? `按考点归类 · 共 ${sourceQuestions.length} 道题` : isEnglishTopicMode ? `按专题归类 · ${englishTopicContextLabel ? `${englishTopicContextLabel} · ` : ''}共 ${sourceQuestions.length} 道题` : section ? `共 ${section.questions.length} 道题` : '从左侧选择一个章节开始学习'}</p></div></div>
          <div className="page-head-tools" ref={filterToolsRef}>
            <div className="filter-row"><button type="button" className={advancedFilterOpen ? 'chip advanced-filter-trigger active' : 'chip advanced-filter-trigger'} aria-label="筛选题目" title="筛选题目" aria-expanded={advancedFilterOpen} aria-controls="question-filter-panel" onClick={() => setAdvancedFilterOpen(value => !value)}><Filter size={16}/>{activeQuestionFilterCount > 0 && <b>{activeQuestionFilterCount}</b>}</button><label className="search" aria-label="搜索当前题目范围"><Search size={17}/><input value={query} onChange={e => { setQuery(e.target.value); setQuestionIndex(0) }} placeholder={view === 'wrong' ? '搜索不熟练题' : isMathExamKeyPointMode ? '搜索当前考点' : isEnglishTopicMode ? '搜索当前专题' : '搜索当前小节'}/></label></div>
            {advancedFilterOpen && <AdvancedQuestionFilter filter={advancedFilter} tags={questionTags} statusOptions={statusFilterOptions} typeOptions={availableQuestionTypes} onChange={nextFilter => { setAdvancedFilter(nextFilter); setQuestionIndex(0) }} onClear={() => { setAdvancedFilter(createEmptyAdvancedQuestionFilter()); setQuestionIndex(0) }}/>}
          </div>
        </div>

        {showPassageStudy && isEnglishTopicMode ? <div ref={studyContentTopRef} className="passage-study-shell english-topic-passage-shell"><div className="passage-study">{currentEnglishTopicPassageGroup && renderEnglishTopicPassageGroup(currentEnglishTopicPassageGroup)}</div>{renderEnglishTopicPassageNavigation()}</div> : question && view === 'section' && !isEnglishTopicMode && (section?.passage || section?.passageImageUrls?.length || isPartBSection) ? <div ref={studyContentTopRef} className="passage-study-shell"><div className="passage-study">
          <section className="passage-questions" aria-label="题目与选项">
            <div className="passage-block-heading passage-block-heading-actions"><div><span>QUESTIONS & ANSWERS</span><h2>题目与选项</h2></div><button className="batch-answer-toggle" aria-expanded={allPassageAnswersOpen} onClick={toggleAllPassageAnswers}><CircleHelp size={16}/>{allPassageAnswersOpen ? '全部收起' : '全部展开'}<ChevronDown className={allPassageAnswersOpen ? 'rotated' : ''} size={15}/></button></div>
            {isPartBSection && sharedPartBOptions.length > 0 && <section className="part-b-choice-bank" aria-label="Part B 备选项"><div><span>OPTION BANK</span><h3>{partBOptionBankMeta.title}</h3><p>{partBOptionBankMeta.description}</p>{section?.partBSequence && <p className="part-b-sequence"><strong>已知顺序框架</strong>{section.partBSequence}</p>}</div><div className={hasLongPartBOptions ? 'part-b-shared-options long-options' : 'part-b-shared-options'}>{sharedPartBOptions.map((option, index) => <div key={index}>{option}</div>)}</div></section>}
            {filteredQuestions.map(item => {
              const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode)
              const itemStatusMeta = questionStatusMeta(item, itemStatus, binaryFilterMode)
              const itemAnswerOpen = expandedPassageAnswers.has(item.id)
              const itemQuestionSources = questionImageSources(item, 'question')
              const itemAnswerSources = questionImageSources(item, 'answer')
              const itemHasAnswerImages = itemAnswerSources.length > 0
              const itemUsesImageAnswer = itemHasAnswerImages && isImageAnswerPlaceholder(item.answer)
              const withoutRepeatedNumber = item.text.trim().replace(new RegExp(`^${item.number}\\s*[.\\uFF0E、)]\\s*`), '')
              const itemQuestionText = /^Blank\s+\d+\.?$/i.test(withoutRepeatedNumber) ? '' : withoutRepeatedNumber
              return <article className="passage-question" id={`question-${item.id}`} key={item.id}>
                <div className="passage-question-head"><div className="passage-question-number"><span className="number">{String(item.number).padStart(2, '0')}</span><QuestionTagPicker tags={questionTags} selectedTagIds={item.tagIds} compact onChange={tagIds => setQuestionTagIds(item.id, tagIds)}/></div><span className={`current-status ${itemStatus}`}>{itemStatusMeta.icon} {itemStatusMeta.label}</span></div>
                {itemQuestionText && <p className="passage-question-text">{itemQuestionText}</p>}
                <AssetGallery sources={itemQuestionSources} alt="题目配图" onImageZoom={imageSource => setQuestionZoomTarget({ question: item, imageSource })}/>
                {item.options && !isPartBSection && <div className="passage-options">{item.options.map((option, index) => <div key={index}>{option}</div>)}</div>}
                <button className="passage-answer-toggle" aria-expanded={itemAnswerOpen} onClick={() => togglePassageAnswer(item.id)}><CircleHelp size={16}/>{itemAnswerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={itemAnswerOpen ? 'rotated' : ''} size={15}/></button>
                {itemAnswerOpen && <div className="passage-answer">{!itemUsesImageAnswer && <div className="answer-result"><span>参考答案</span><strong>{item.answer}</strong></div>}<div className={itemUsesImageAnswer ? 'answer-analysis combined-image-answer' : 'answer-analysis'}><span>{itemUsesImageAnswer ? '参考答案和解析' : '原版解析'}</span>{itemHasAnswerImages ? <AssetGallery sources={itemAnswerSources} alt={itemUsesImageAnswer ? '参考答案和解析' : '原版解析截图'} eager/> : <p className="analysis-missing">原版解析截图暂未收录</p>}</div></div>}
                <QuestionNotePanel questionId={item.id} note={questionNotes[item.id]} markdownShortcuts={markdownShortcuts} onChange={note => updateQuestionNote(item.id, note)}/>
                <div className="passage-status"><div className="passage-markers">{readingTypePicker(item)}</div><div><span className="mastery-status-label">掌握情况</span>{questionErrorRecordPicker(item, itemStatus)}{masteryChoices(item, binaryFilterMode).map(s => { const meta = questionStatusMeta(item, s, binaryFilterMode); return <button key={s} className={itemStatus === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => markQuestion(item.id, itemStatus === s ? 'none' : s, item)}><b>{meta.icon}</b>{meta.label}</button> })}</div></div>
              </article>
            })}
          </section>
          {(section?.passage || section?.passageImageUrls?.length || section?.passageAnalysisImageUrls?.length) && <article className="source-passage">
            <div className="passage-block-heading"><span>ORIGINAL TEXT</span><h2>原文</h2></div>
            {section.passage && <div className="source-copy">{formatPassageParagraphs(section.passage).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
            {section.passageImageUrls?.length && <div className="source-scan"><AssetGallery urls={section.passageImageUrls} alt="Part B 原卷原文"/></div>}
            {renderPassageAnalysis(section, '全文解析')}
          </article>}
        </div><nav className="question-nav passage-question-nav" aria-label={showFullPaperNavigation ? '全卷导航' : '题号导航'}><div className="question-nav-heading"><div><strong>{showFullPaperNavigation ? '全卷导航' : '题号导航'}</strong></div>{renderQuestionNavigationModeSwitch()}</div><div className="number-grid">{showFullPaperNavigation ? currentPaperEntries.map(entry => { const item = entry.question; const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode); return <button key={item.id} aria-current={item.id === question.id ? 'true' : undefined} title={questionNavigationTitle(entry.sectionName, item)} className={questionNavigationButtonClass(item.id === question.id, itemStatus)} style={questionNavigationButtonStyle(item)} onClick={() => navigateToBankQuestion(entry)}><span className="question-nav-number">{item.number}</span>{renderQuestionNavigationIndicator(item, itemStatus)}</button> }) : filteredQuestions.map((item, index) => { const itemStatus = effectiveQuestionStatus(item, statuses[item.id] || 'none', binaryFilterMode); return <button key={item.id} aria-current={index === questionIndex ? 'true' : undefined} title={questionNavigationTitle('题号导航', item)} className={questionNavigationButtonClass(index === questionIndex, itemStatus)} style={questionNavigationButtonStyle(item)} onClick={() => jumpToPassageQuestion(item.id, index)}><span className="question-nav-number">{item.number}</span>{renderQuestionNavigationIndicator(item, itemStatus)}</button> })}</div>{renderQuestionNavigationLegend()}<div className="nav-accuracy"><span>本卷正确率</span><strong>{formatRate(currentNavigationStats.accuracy)}</strong><small>{currentNavigationStats.marked} 道题已标记</small></div></nav></div> : question ? <div ref={studyContentTopRef} className="study-layout">
          <section ref={questionCardRef} className="question-card">
            <div className="question-top"><div><span className="number">{String(question.number).padStart(2,'0')}</span><QuestionTagPicker tags={questionTags} selectedTagIds={question.tagIds} onChange={tagIds => setQuestionTagIds(question.id, tagIds)}/>{currentQuestionEntry && <span className="wrong-context">{currentQuestionEntry.chapterName} · {currentQuestionEntry.sectionName}</span>}</div><nav className="question-top-pager" aria-label="顶部上下题切换"><button disabled={questionIndex === 0} onClick={() => moveQuestion(-1)}><span>←</span> 上一题</button><em>{questionIndex + 1} / {filteredQuestions.length}</em><button disabled={questionIndex >= filteredQuestions.length - 1} onClick={() => moveQuestion(1)}>下一题 <span>→</span></button></nav><div className="question-top-mastery" aria-label="顶部熟练度标记">{questionErrorRecordPicker(question, currentQuestionStatus)}{masteryChoices(question, binaryFilterMode).map(s => { const meta = questionStatusMeta(question, s, binaryFilterMode); return <button key={s} className={currentQuestionStatus === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => mark(currentQuestionStatus === s ? 'none' : s)}><b>{meta.icon}</b>{meta.label}</button> })}</div></div>
            {(questionTypeLabel || question.score !== undefined || question.keyPoint) && <div className="question-meta-row" aria-label="题目信息">{questionTypeLabel && <span>{questionTypeLabel}</span>}{question.score !== undefined && <span>{question.score}分</span>}{question.keyPoint && <span className="question-key-point">{isMathExamBank ? mathExamKeyPointLabel(question.keyPoint) : question.keyPoint}</span>}</div>}
            {isEnglishTopicMode && currentEnglishTopicSection && (currentEnglishTopicSection.passage || currentEnglishTopicSection.passageImageUrls?.length || currentEnglishTopicSection.passageAnalysisImageUrls?.length) && <article className="english-topic-source"><div className="english-topic-source-heading"><div><span>ORIGINAL TEXT</span><h2>原文</h2></div><small>{currentQuestionNavigationEntry?.chapterName} · {currentEnglishTopicSection.name}</small></div>{currentEnglishTopicSection.passage && <div className="source-copy">{formatPassageParagraphs(currentEnglishTopicSection.passage).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}{currentEnglishTopicSection.passageImageUrls?.length && <div className="source-scan"><AssetGallery urls={currentEnglishTopicSection.passageImageUrls} alt="专题原文"/></div>}{renderPassageAnalysis(currentEnglishTopicSection, '专题全文解析')}</article>}
            <div className={questionSources.length && !questionText ? 'question-content image-only-question-content' : 'question-content'}>{questionText && <p>{questionText}</p>}<AssetGallery sources={questionSources} alt="题目配图" onImageZoom={imageSource => setQuestionZoomTarget({ question, imageSource })}/>{question.options && <div className="options">{question.options.map((o, i) => <div key={i}>{o}</div>)}</div>}</div>
            <div className="answer-toggle-shell standard-answer-toggle-shell">
              <button className={answerOpen ? 'answer-toggle passage-answer-toggle standard-answer-toggle has-answer-lock' : 'answer-toggle passage-answer-toggle standard-answer-toggle'} aria-expanded={answerOpen} onClick={() => setAnswerOpen(v => !v)}><CircleHelp size={19}/>{answerOpen ? '收起答案与解析' : '查看答案与解析'}<ChevronDown className={answerOpen ? 'rotated' : ''} size={18}/></button>
              {answerOpen && <button type="button" className={answerLocked ? 'answer-lock-toggle active' : 'answer-lock-toggle'} aria-label={answerLocked ? '取消锁定解析' : '锁定解析，切题时保持当前展开状态'} aria-pressed={answerLocked} title={answerLocked ? '已锁定，切题时解析保持展开' : '锁定后切题不再自动折叠'} onClick={() => setAnswerLocked(value => !value)}>
                {answerLocked ? <Lock size={14}/> : <Unlock size={14}/>}<span>{answerLocked ? '已锁定' : '锁定'}</span>
              </button>}
            </div>
            {answerOpen && <div className={`${hasAnswerImages ? 'answer answer-with-images' : 'answer'} passage-answer standard-answer-panel`}>{!usesImageAnswer && <div className="answer-result"><span>参考答案</span><strong>{question.answer}</strong></div>}<div className={usesImageAnswer ? 'answer-analysis combined-image-answer' : 'answer-analysis'}><span>{usesImageAnswer ? '参考答案和解析' : '原版解析'}</span>{hasAnswerImages ? <AssetGallery sources={answerSources} alt={usesImageAnswer ? '参考答案和解析' : '原版解析截图'} eager/> : <p className="analysis-missing">原版解析截图暂未收录</p>}</div>{question.videoUrl && <a href={question.videoUrl} target="_blank" rel="noreferrer">观看视频解析 →</a>}</div>}
            <QuestionNotePanel questionId={question.id} note={questionNotes[question.id]} markdownShortcuts={markdownShortcuts} open={questionNoteOpen} locked={questionNoteLocked} onOpenChange={setQuestionNoteOpen} onLockedChange={setQuestionNoteLocked} onChange={note => updateQuestionNote(question.id, note)}/>
            <div className="status-bar"><div className="status-labels">{readingTypePicker(question)}</div><div><span className="mastery-status-label">掌握情况</span>{questionErrorRecordPicker(question, currentQuestionStatus)}{masteryChoices(question, binaryFilterMode).map(s => { const meta = questionStatusMeta(question, s, binaryFilterMode); return <button key={s} className={currentQuestionStatus === s ? `status-button ${s} active` : `status-button ${s}`} onClick={() => mark(currentQuestionStatus === s ? 'none' : s)}><b>{meta.icon}</b>{meta.label}</button> })}</div></div>
            <nav className="question-bottom-pager" aria-label="底部上下题切换"><button disabled={questionIndex === 0} onClick={() => moveQuestion(-1)}><span>←</span> 上一题</button><em>{questionIndex + 1} / {filteredQuestions.length}</em><button disabled={questionIndex >= filteredQuestions.length - 1} onClick={() => moveQuestion(1)}>下一题 <span>→</span></button></nav>
          </section>
          <nav className={view === 'wrong' ? 'question-nav review-question-nav' : showKeyPointNavigation ? 'question-nav keypoint-question-nav' : showEnglishTopicNavigation ? 'question-nav english-topic-question-nav' : 'question-nav'} aria-label={showFullPaperNavigation ? '全卷导航' : showEnglishTopicNavigation ? '专题题号导航' : view === 'wrong' ? '不熟练题导航' : '题号导航'}>
            <div className="question-nav-heading"><div><strong>{showFullPaperNavigation ? '全卷导航' : showEnglishTopicNavigation ? '专题题号导航' : view === 'wrong' ? '不熟练题导航' : '题号导航'}</strong>{view === 'wrong' && <small>{reviewNavigationGroups.length} 个小节</small>}</div>{renderQuestionNavigationModeSwitch()}</div>
            {view === 'wrong' ? <div className="review-nav-groups">{reviewNavigationGroups.map(group => <section key={group.id}><span>{group.label}</span><div className="number-grid">{group.entries.map(entry => { const index = filteredQuestions.findIndex(item => item.id === entry.question.id); const navStatus = effectiveQuestionStatus(entry.question, statuses[entry.question.id] || 'none', binaryFilterMode); return <button key={entry.question.id} title={questionNavigationTitle(group.label, entry.question)} className={questionNavigationButtonClass(index === questionIndex, navStatus)} style={questionNavigationButtonStyle(entry.question)} onClick={() => { setQuestionIndex(index); collapseAnswerUnlessLocked() }}><span className="question-nav-number">{entry.question.number}</span>{renderQuestionNavigationIndicator(entry.question, navStatus)}</button> })}</div></section>)}</div> : showKeyPointNavigation ? <div className="keypoint-number-nav">{keyPointNavigationGroups.map(group => <section className="keypoint-year-row" key={group.year}><span className="keypoint-year-label">{group.year}年</span><div className="number-grid">{group.entries.map(entry => { const index = filteredQuestions.findIndex(item => item.id === entry.question.id); const navStatus = effectiveQuestionStatus(entry.question, statuses[entry.question.id] || 'none', binaryFilterMode); return <button key={entry.question.id} title={questionNavigationTitle(`${group.year}年`, entry.question)} className={questionNavigationButtonClass(index === questionIndex, navStatus)} style={questionNavigationButtonStyle(entry.question)} onClick={() => { setQuestionIndex(index); collapseAnswerUnlessLocked() }}><span className="question-nav-number">{entry.question.number}</span>{renderQuestionNavigationIndicator(entry.question, navStatus)}</button> })}</div></section>)}</div> : showEnglishTopicNavigation ? <div className="keypoint-number-nav english-topic-number-nav">{englishTopicNavigationGroups.map(group => <section className="keypoint-year-row" key={group.year}><span className="keypoint-year-label">{group.year}年</span><div className="number-grid">{group.entries.map(entry => { const index = filteredQuestions.findIndex(item => item.id === entry.question.id); const navStatus = effectiveQuestionStatus(entry.question, statuses[entry.question.id] || 'none', binaryFilterMode); return <button key={entry.question.id} title={questionNavigationTitle(`${group.year}年`, entry.question)} className={questionNavigationButtonClass(index === questionIndex, navStatus)} style={questionNavigationButtonStyle(entry.question)} onClick={() => selectEnglishTopicEntry(entry, index)}><span className="question-nav-number">{entry.question.number}</span>{renderQuestionNavigationIndicator(entry.question, navStatus)}</button> })}</div></section>)}</div> : <div className="number-grid">{showFullPaperNavigation ? currentPaperEntries.map(entry => { const q = entry.question; const navStatus = effectiveQuestionStatus(q, statuses[q.id] || 'none', binaryFilterMode); return <button key={q.id} aria-current={q.id === question.id ? 'true' : undefined} title={questionNavigationTitle(entry.sectionName, q)} className={questionNavigationButtonClass(q.id === question.id, navStatus)} style={questionNavigationButtonStyle(q)} onClick={() => navigateToBankQuestion(entry)}><span className="question-nav-number">{q.number}</span>{renderQuestionNavigationIndicator(q, navStatus)}</button> }) : filteredQuestions.map((q, i) => { const navStatus = effectiveQuestionStatus(q, statuses[q.id] || 'none', binaryFilterMode); return <button key={q.id} title={questionNavigationTitle('题号导航', q)} className={questionNavigationButtonClass(i === questionIndex, navStatus)} style={questionNavigationButtonStyle(q)} onClick={() => { setQuestionIndex(i); collapseAnswerUnlessLocked() }}><span className="question-nav-number">{q.number}</span>{renderQuestionNavigationIndicator(q, navStatus)}</button> })}</div>}
            {renderQuestionNavigationLegend()}
            {view === 'wrong' ? <div className="review-nav-summary">{!binaryFilterMode && <span><i className="yellow"/>模糊 <strong>{counts.vague}</strong></span>}<span><i className="red"/>{binaryFilterMode ? '错误' : '错题'} <strong>{counts.wrong}</strong></span></div> : <div className="nav-accuracy"><span>{showFullPaperNavigation ? '本卷正确率' : showEnglishTopicNavigation ? '本专题正确率' : '本节正确率'}</span><strong>{formatRate(currentNavigationStats.accuracy)}</strong><small>{currentNavigationStats.marked} 道题已标记</small></div>}
          </nav>
        </div> : <div className="no-results"><Search size={32}/><h2>{view === 'wrong' && reviewQuestions.length === 0 ? '不熟练题已经清空' : '没有符合条件的题目'}</h2><p>{view === 'wrong' && reviewQuestions.length === 0 ? '很好，当前题库没有模糊或错误的题目。' : '尝试更换筛选条件或清空搜索词。'}</p><button onClick={() => view === 'wrong' && reviewQuestions.length === 0 ? setView('section') : (setAdvancedFilter(createEmptyAdvancedQuestionFilter()), setQuery(''))}><RotateCcw size={16}/>{view === 'wrong' && reviewQuestions.length === 0 ? '返回当前小节' : '重置筛选'}</button></div>}

        </>}
        {printMode && printJob && <section className="print-sheet" aria-hidden="true" ref={printSheetRef}>
          <div className="print-title"><h1>{printJob.title}</h1><p>{printJob.subtitle}</p></div>
          {printJob.pages.map((pageQuestions, index) => <ExportPage key={index} questions={pageQuestions} statuses={printJob.statuses} questionContext={printJob.questionContext} notes={printJob.notes} pageNumber={index + 1} showType={false} mode={printJob.mode}/>)}
        </section>}
      </main>
    </div>
    {toast && <div className="toast">{toast}</div>}
    {newBankOpen && <div className="modal-backdrop" onClick={() => setNewBankOpen(false)}><section className="modal-card new-bank-dialog" role="dialog" aria-modal="true" aria-labelledby="new-bank-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setNewBankOpen(false)}><X/></button><div className="new-bank-heading"><span className="modal-icon"><BookOpen/></span><div><span>QUESTION BANK</span><h2 id="new-bank-title">新建题库</h2></div></div><p className="new-bank-description">连接工作区后会同步建立对应文件夹。</p><div className="new-bank-field"><div className="new-bank-field-heading"><strong>所属学科</strong><small>决定目录位置</small></div><div className="new-bank-subject-options">{([{ value: 'math', label: '数学', hint: '高数 / 线代' }, { value: 'english', label: '英语', hint: '英语一 / 英语二' }, { value: 'professional', label: '专业课', hint: '自定义课程' }] as Array<{ value: Subject; label: string; hint: string }>).map(option => <button key={option.value} type="button" className={newBankSubject === option.value ? 'active' : ''} onClick={() => setNewBankSubject(option.value)}><strong>{option.label}</strong><small>{option.hint}</small></button>)}</div></div>{newBankSubject === 'math' && <div className="new-bank-field"><div className="new-bank-field-heading"><strong>数学板块</strong></div><div className="new-bank-module-options">{mathModuleOrder.map(module => <button key={module} type="button" className={newBankMathModule === module ? 'active' : ''} onClick={() => setNewBankMathModule(module)}><strong>{mathModuleLabels[module]}</strong><small>{module === 'exams' ? '历年考研数学二真题' : module === 'calculus' ? '微积分与高数' : '矩阵与线性代数'}</small></button>)}</div></div>}<label className="new-bank-name-field"><span>题库名称</span><input autoFocus value={newBankName} onChange={event => setNewBankName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') createBank() }} placeholder={newBankSubject === 'professional' ? '例如：机械原理强化题' : newBankSubject === 'english' ? '例如：英语一阅读专项' : '例如：线代强化题'}/></label><div className="new-bank-folder-preview"><span>目录预览</span><code>{newBankFolderPreview}</code></div><button className="primary-button" onClick={createBank} disabled={!newBankName.trim()}>创建题库</button></section></div>}
    {exportOpen && <ExportDialog banks={banks} statuses={statuses} notes={questionNotes} defaultBankId={bank.id} defaultSectionId={sectionId} mode={exportMode} onClose={() => setExportOpen(false)} onPdf={printExport} onNotice={setToast}/>}
    {settingsPanelOpen && (LoadedSettingsPanel ? <LoadedSettingsPanel userSettings={userSettings} questionTags={questionTags} screenWakeLockSupported={screenWakeLockSupported} examDate={formatExamDateValue(examCountdown.target)} minExamDate={formatExamDateValue(countdownNow)} customExamDate={Boolean(customExamDate)} workspaceState={workspaceState} cloudSyncSettings={cloudSyncSettings} cloudSyncState={cloudSyncState} cloudSyncMessage={cloudSyncMessage} cloudSyncLastSuccessfulAt={cloudSyncLastSuccessfulAt} oneDriveSignedIn={oneDriveSignedIn} oneDriveAuthConfigured={isOneDriveWebAuthConfigured(cloudSyncSettings)} appVersion={appVersion} githubUrl={githubRepositoryUrl} roundMarkedCount={round => countMarkedQuestions(displayedStudyRound(round))} onClose={() => setSettingsPanelOpen(false)} onSwitchRound={switchStudyRound} onAddRound={addStudyRound} onUpdateExamDate={updateExamDate} onResetExamDate={resetExamDate} onToggleScreenAwake={toggleScreenAwake} onUpdateQuestionTags={updateQuestionTags} onResetQuestionTags={resetQuestionTags} onOpenNewBank={() => { setSettingsPanelOpen(false); openNewBank(newBankSubject) }} onOpenEditor={() => { setSettingsPanelOpen(false); setEditorOpen(true) }} onOpenStudyRecords={() => { setSettingsPanelOpen(false); setStudyRecordManagerOpen(true) }} onOpenDataManager={() => { setSettingsPanelOpen(false); setSettingsOpen(true) }} onConnectWorkspace={() => { setSettingsPanelOpen(false); void connectWorkspace() }} onSwitchWorkspace={() => { setSettingsPanelOpen(false); void switchWorkspace() }} onUpdateCloudSyncSettings={updateCloudSyncSettings} onSignInOneDrive={signInOneDrive} onSignOutOneDrive={signOutCloudSync} onCloudSync={() => { void syncOneDrive() }} onResetCloudSyncTime={resetCloudSyncTime} onImportData={() => { setSettingsPanelOpen(false); importRef.current?.click() }} onImportImages={() => { setSettingsPanelOpen(false); imageImportRef.current?.click() }} onOpenExport={() => { setSettingsPanelOpen(false); setExportMode('questions'); setExportOpen(true) }} onOpenNotesExport={() => { setSettingsPanelOpen(false); setExportMode('notes'); setExportOpen(true) }} onExportData={() => { setSettingsPanelOpen(false); exportData() }} onOpenUpdate={() => setUpdateOpen(true)} shortcutSettings={markdownShortcuts} onUpdateShortcutSettings={updateMarkdownShortcutSettings} onResetShortcutSettings={resetMarkdownShortcutSettings}/>: <DeferredInterfaceFallback/>)}
    {updateOpen && <UpdateDialog onClose={() => setUpdateOpen(false)}/>}
    {studyRecordManagerOpen && <StudyRecordManagerDialog banks={banks} activities={activities} statuses={statuses} activeBankId={bank.id} activeSectionId={sectionId} onClose={() => setStudyRecordManagerOpen(false)} onSave={(result, changedCount) => { setActivities(result.activities); setStatuses(result.statuses); setToast(`已保存 ${changedCount} 条学习记录修改`) }}/>}
    {editorOpen && (LoadedQuestionBankEditor ? <LoadedQuestionBankEditor banks={banks} activeBankId={bank.id} activeQuestionId={question?.id} onClose={() => setEditorOpen(false)} onSave={saveQuestionEditorChange}/> : <DeferredInterfaceFallback/>)}
    {notesOpen && !notePreviewData && !noteEditData && (LoadedNotesDialog ? <LoadedNotesDialog banks={banks} notes={questionNotes} personalNotebooks={personalNotebooks} onClose={() => setNotesOpen(false)} onOpenQuestion={openNoteQuestionPreview} onEditQuestion={openNoteQuestionEditor} onCreateNotebook={createPersonalNotebook} onCreateNote={createPersonalNote} onPersonalNoteChange={updatePersonalNote} onDeletePersonalNote={deletePersonalNote} onDeleteNotebook={deletePersonalNotebook}/> : <DeferredInterfaceFallback/>)}
    {timerView !== 'closed' && (LoadedTimerDialog ? <LoadedTimerDialog view={timerView} onViewChange={setTimerView} onClose={() => setTimerView('closed')}/> : <DeferredInterfaceFallback/>)}
    {renameTarget && <div className="modal-backdrop" onClick={() => setRenameTarget(null)}><section className="modal-card rename-card" role="dialog" aria-modal="true" aria-labelledby="rename-title" onClick={event => event.stopPropagation()}><button className="modal-close" aria-label="关闭" onClick={() => setRenameTarget(null)}><X/></button><span className="modal-icon"><Pencil/></span><h2 id="rename-title">重命名{renameTarget.kind === 'bank' ? '题库' : '章节'}</h2><p>只修改显示名称，不会改变题目、图片或学习状态。</p><label>新名称<input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') applyRename() }} placeholder={renameTarget.name}/></label><button className="primary-button" onClick={applyRename}>保存名称</button></section></div>}
    {questionZoomTarget && (LoadedQuestionZoomDialog ? <LoadedQuestionZoomDialog question={questionZoomTarget.question} imageSource={questionZoomTarget.imageSource} onClose={() => setQuestionZoomTarget(null)}/> : <DeferredInterfaceFallback/>)}
    {settingsOpen && <SettingsDialog banks={banks} activeBankId={bank.id} builtInIds={new Set(builtInBanks.map(item => item.id))} protectedBankIds={protectedBankIds} onClose={() => setSettingsOpen(false)} onOpenNewBank={() => openNewBank(newBankSubject)} onOpenEditor={() => { setSettingsOpen(false); setEditorOpen(true) }} onClearMarks={clearMarks} onExportBank={exportSingleBank} onResetBank={resetManagedBank} onDeleteBank={deleteManagedBank} onRestoreBuiltIns={restoreBuiltIns} onFactoryReset={factoryReset}/>}
    {notePreviewData && (LoadedDashboardQuestionDialog ? <LoadedDashboardQuestionDialog bankName={notePreviewData.bank.name} chapterName={notePreviewData.entry.chapterName} sectionName={notePreviewData.entry.sectionName} question={notePreviewData.entry.question} questions={notePreviewData.questions} questionStatuses={statuses} questionTags={questionTags} status={statuses[notePreviewData.entry.question.id] || 'none'} activities={activities} note={questionNotes[notePreviewData.entry.question.id]} markdownShortcuts={markdownShortcuts} binaryMode={bankSubject(notePreviewData.bank) === 'english'} onStatusChange={(status, answerRevealed) => markDashboardQuestion(notePreviewData.bank.id, notePreviewData.entry.question.id, status, answerRevealed)} onReviewStatusChange={(status, answerRevealed) => markDashboardReview(notePreviewData.bank.id, notePreviewData.entry.question.id, status, answerRevealed)} onResetReview={() => resetDashboardReview(notePreviewData.bank.id, notePreviewData.entry.question.id)} onDeleteReview={attempt => deleteDashboardReview(notePreviewData.bank.id, notePreviewData.entry.question.id, attempt)} onNoteChange={note => updateQuestionNote(notePreviewData.entry.question.id, note)} onQuestionTagChange={setQuestionTagIds} onQuestionSelect={item => setNoteQuestionPreview({ bankId: notePreviewData.bank.id, questionId: item.id })} onPreviousQuestion={() => { const previous = notePreviewData.questions[notePreviewQuestionIndex - 1]; if (previous) setNoteQuestionPreview({ bankId: notePreviewData.bank.id, questionId: previous.id }) }} onNextQuestion={() => { const next = notePreviewData.questions[notePreviewQuestionIndex + 1]; if (next) setNoteQuestionPreview({ bankId: notePreviewData.bank.id, questionId: next.id }) }} onClose={() => setNoteQuestionPreview(null)}/> : <DeferredInterfaceFallback/>)}
    {noteEditData && <QuestionNotePanel questionId={noteEditData.entry.question.id} note={questionNotes[noteEditData.entry.question.id]} markdownShortcuts={markdownShortcuts} initialExpanded expandedOnly onExpandedClose={() => setNoteQuestionEditor(null)} onChange={note => updateQuestionNote(noteEditData.entry.question.id, note)}/>}
  </div>
}
