import { useState, type ComponentType, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronRight, CircleHelp, Cloud, Download, ExternalLink, FileImage, FileText, FileUp, FolderOpen, FolderSync, GripVertical, HardDrive, History, Info, Keyboard, LogIn, LogOut, NotebookPen, Pencil, Plus, RefreshCcw, RotateCcw, Settings as SettingsIcon, SunMedium, Tag, X } from 'lucide-react'
import type { UserSettings } from './userSettings'
import type { QuestionTagDefinition } from './questionTags'
import type { CloudSyncSettings, CloudSyncState } from './cloudSync'
import { DEFAULT_MARKDOWN_SHORTCUTS, formatShortcut, MARKDOWN_SHORTCUT_ACTIONS, sameShortcut, shortcutFromKeyboardEvent, type MarkdownShortcutAction, type MarkdownShortcutSettings } from './shortcutSettings'
import { useDialogFocus } from './useDialogFocus'
import { useModalScrollLock } from './useModalScrollLock'

type SettingsSection = 'study' | 'tags' | 'focus' | 'shortcuts' | 'data' | 'sync' | 'about'
type WorkspaceState = 'none' | 'available' | 'syncing' | 'connected' | 'error'
type PanelIcon = ComponentType<{ size?: number; strokeWidth?: number }>

interface Props {
  userSettings: UserSettings
  questionTags: QuestionTagDefinition[]
  screenWakeLockSupported: boolean
  examDate: string
  minExamDate: string
  customExamDate: boolean
  workspaceState: WorkspaceState
  cloudSyncSettings: CloudSyncSettings
  cloudSyncState: CloudSyncState
  cloudSyncMessage: string
  oneDriveSignedIn: boolean
  oneDriveAuthConfigured: boolean
  appVersion: string
  githubUrl: string
  roundMarkedCount: (round: number) => number
  onClose: () => void
  onSwitchRound: (round: number) => void
  onAddRound: () => void
  onUpdateExamDate: (value: string) => void
  onResetExamDate: () => void
  onToggleScreenAwake: () => void
  onUpdateQuestionTags: (tags: QuestionTagDefinition[]) => void
  onResetQuestionTags: () => void
  onOpenNewBank: () => void
  onOpenEditor: () => void
  onOpenStudyRecords: () => void
  onOpenDataManager: () => void
  onConnectWorkspace: () => void
  onSwitchWorkspace: () => void
  onUpdateCloudSyncSettings: (settings: CloudSyncSettings) => void
  onSignInOneDrive: () => void
  onSignOutOneDrive: () => void
  onCloudSync: () => void
  onImportData: () => void
  onImportImages: () => void
  onOpenExport: () => void
  onOpenNotesExport: () => void
  onExportData: () => void
  shortcutSettings: MarkdownShortcutSettings
  onUpdateShortcutSettings: (settings: MarkdownShortcutSettings) => void
  onResetShortcutSettings: () => void
}

const sectionItems: Array<{ id: SettingsSection; label: string; description: string; icon: PanelIcon }> = [
  { id: 'data', label: '题库与数据', description: '题库、导入导出与备份', icon: HardDrive },
  { id: 'sync', label: '同步', description: 'OneDrive 多端数据同步', icon: Cloud },
  { id: 'study', label: '学习设置', description: '轮次与考试日期', icon: RotateCcw },
  { id: 'tags', label: '题目标记', description: '标签名称与颜色', icon: Tag },
  { id: 'focus', label: '专注模式', description: '不熄屏与学习状态', icon: SunMedium },
  { id: 'shortcuts', label: '快捷键', description: '汇总与自定义操作', icon: Keyboard },
  { id: 'about', label: '关于', description: '版本与项目链接', icon: Info },
]

const sectionTitles: Record<SettingsSection, { eyebrow: string; title: string; description: string }> = {
  study: { eyebrow: 'LEARNING', title: '学习设置', description: '管理学习轮次和考试倒计时。' },
  tags: { eyebrow: 'QUESTION TAGS', title: '题目标记', description: '自定义题目标记的名称与颜色。' },
  focus: { eyebrow: 'FOCUS', title: '专注模式', description: '让学习页面更适合长时间使用。' },
  shortcuts: { eyebrow: 'SHORTCUTS', title: '快捷键', description: '集中查看并自定义常用操作。' },
  data: { eyebrow: 'QUESTION BANKS & DATA', title: '题库与数据', description: '集中管理题库、导入导出、备份与重置。' },
  sync: { eyebrow: 'SYNC', title: '同步', description: '配置 OneDrive，让学习数据在多台设备间保持一致。' },
  about: { eyebrow: 'ABOUT', title: '关于', description: '查看当前版本、项目地址和数据说明。' },
}

const fixedShortcutGroups: Array<{ title: string; description: string; items: Array<{ label: string; shortcut: string; note?: string }> }> = [
  {
    title: '列表编辑',
    description: 'Markdown 文字笔记中的固定操作',
    items: [
      { label: '增加列表层级', shortcut: 'Tab' },
      { label: '减少列表层级', shortcut: 'Shift+Tab' },
      { label: '创建下一项', shortcut: 'Enter' },
    ],
  },
  {
    title: '手写工具',
    description: '聚焦手写编辑器后使用',
    items: [
      { label: '橡皮擦 / 画笔 / 套索', shortcut: '1 / 2 / 3' },
      { label: '插入或收缩空间', shortcut: '4', note: '仅题目笔记' },
      { label: '图形工具', shortcut: '5', note: '仅题目笔记' },
      { label: '复制 / 粘贴选中笔迹', shortcut: '⌘/Ctrl+C · ⌘/Ctrl+V' },
      { label: '撤销', shortcut: '⌘/Ctrl+Z' },
      { label: '重做', shortcut: '⌘/Ctrl+Shift+Z · ⌘/Ctrl+Y' },
      { label: '删除选中笔迹', shortcut: 'Delete / Backspace', note: '套索选择时' },
    ],
  },
  {
    title: '公式与标签',
    description: '编辑公式或题目标记时使用',
    items: [
      { label: '确认行内公式 / 取消编辑', shortcut: 'Enter / Esc' },
      { label: '确认块公式 / 取消编辑', shortcut: '⌘/Ctrl+Enter / Esc' },
      { label: '提交标签', shortcut: 'Enter · 逗号 · 中文逗号 · 顿号' },
      { label: '删除上一个标签', shortcut: 'Backspace', note: '输入框为空时' },
    ],
  },
  {
    title: '弹窗与表单',
    description: '界面层级中的通用键盘操作',
    items: [
      { label: '关闭当前弹窗或面板', shortcut: 'Esc' },
      { label: '切换弹窗内焦点', shortcut: 'Tab / Shift+Tab' },
      { label: '提交当前输入表单', shortcut: 'Enter', note: '新建、重命名、缩放等输入框' },
    ],
  },
]

function ActionCard(props: { icon: PanelIcon; title: string; description: string; onClick: () => void }) {
  const Icon = props.icon
  return <button className="settings-panel-action" type="button" onClick={props.onClick}>
    <span className="settings-panel-action-icon"><Icon size={18}/></span>
    <span className="settings-panel-action-copy"><strong>{props.title}</strong><small>{props.description}</small></span>
    <ChevronRight className="settings-panel-action-arrow" size={15}/>
  </button>
}

function GroupHeading(props: { title: string; description: string }) {
  return <div className="settings-panel-group-heading"><strong>{props.title}</strong><span>{props.description}</span></div>
}

function WorkspaceStatus({ state }: { state: WorkspaceState }) {
  const text = state === 'connected' ? '已连接本地题库文件夹' : state === 'syncing' ? '正在同步题库…' : state === 'error' ? '题库连接异常' : '当前使用浏览器本地保存'
  return <div className={`settings-panel-status ${state}`}><span className="source-dot"/><span>{text}</span></div>
}

function CloudSyncStatus({ state, signedIn, authConfigured, message }: { state: CloudSyncState; signedIn: boolean; authConfigured: boolean; message: string }) {
  const text = message || (state === 'syncing' ? '正在连接 OneDrive…' : signedIn ? 'OneDrive 已登录' : authConfigured ? '尚未登录 OneDrive' : '网页授权尚未配置')
  return <div className={`settings-panel-status ${state === 'error' ? 'error' : state === 'syncing' ? 'syncing' : signedIn ? '' : 'idle'}`}><span className="source-dot"/><span>{text}</span></div>
}

function GitHubMark({ size = 19 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.22c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.58-.29-5.29-1.29-5.29-5.68 0-1.25.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.96 10.96 0 0 1 5.75 0C17.03 5.02 18 5.33 18 5.33c.63 1.58.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.09 0 4.41-2.72 5.38-5.31 5.67.42.36.79 1.07.79 2.16v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>
}

export default function SettingsPanel(props: Props) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('data')
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null)
  const [shortcutError, setShortcutError] = useState('')
  const heading = sectionTitles[activeSection]
  const dialogRef = useDialogFocus<HTMLElement>(props.onClose)
  useModalScrollLock()

  function renderStudySettings() {
    return <div className="settings-panel-stack">
      <section className="settings-panel-card settings-panel-round-card">
        <div className="settings-panel-card-heading"><span className="settings-panel-card-icon"><RotateCcw size={18}/></span><div><strong>当前学习轮次</strong><small>每轮标记与统计相互独立</small></div></div>
        <div className="settings-panel-inline-control"><select aria-label="当前学习轮次" value={props.userSettings.activeRound} onChange={event => props.onSwitchRound(Number(event.target.value))}>{Array.from({ length: props.userSettings.roundCount }, (_, index) => index + 1).map(round => <option key={round} value={round}>第 {round} 轮 · {props.roundMarkedCount(round)} 道已标记</option>)}</select><button type="button" onClick={props.onAddRound} disabled={props.userSettings.roundCount >= 99}><Plus size={14}/>新增一轮</button></div>
        <p>现有记录在第 1 轮；新增轮次不会覆盖其他记录。</p>
      </section>
      <section className="settings-panel-card">
        <div className="settings-panel-card-heading"><span className="settings-panel-card-icon"><CalendarDays size={18}/></span><div><strong>考试日期</strong><small>用于页面顶部的考试倒计时</small></div></div>
        <div className="settings-panel-inline-control"><input aria-label="考试日期" type="date" min={props.minExamDate} value={props.examDate} onChange={event => props.onUpdateExamDate(event.currentTarget.value)}/><button type="button" onClick={props.onResetExamDate} disabled={!props.customExamDate}>恢复默认</button></div>
        <p>日期只保存在用户数据中，不修改题库内容。</p>
      </section>
      <section className="settings-panel-info-card"><strong>学习统计</strong><span>正确率只统计已标记题目，每题每天取最后一次标记。</span></section>
    </div>
  }

  function renderFocusSettings() {
    const enabled = Boolean(props.userSettings.keepScreenAwake)
    return <div className="settings-panel-stack">
      <section className={enabled ? 'settings-panel-feature-card active' : 'settings-panel-feature-card'}>
        <div className="settings-panel-feature-icon"><SunMedium size={24}/></div>
        <div className="settings-panel-feature-copy"><strong>不熄屏</strong><p>{props.screenWakeLockSupported ? '学习时保持屏幕常亮，切回页面后会自动恢复。' : '当前浏览器不支持 Screen Wake Lock，无法使用屏幕常亮。'}</p></div>
        <button className={enabled ? 'settings-panel-switch on' : 'settings-panel-switch'} type="button" role="switch" aria-checked={enabled} aria-label="不熄屏" disabled={!props.screenWakeLockSupported} onClick={props.onToggleScreenAwake}><span/></button>
      </section>
      <section className="settings-panel-info-card"><strong>使用提示</strong><span>开启后浏览器会阻止设备自动熄屏；关闭页面或关闭开关后会释放屏幕唤醒锁。</span></section>
    </div>
  }

  function renderShortcutSettings() {
    function updateShortcut(action: MarkdownShortcutAction, event: KeyboardEvent<HTMLInputElement>) {
      const next = shortcutFromKeyboardEvent(event.nativeEvent)
      if (!next) return
      event.preventDefault()
      const conflict = MARKDOWN_SHORTCUT_ACTIONS.some(item => item.id !== action && sameShortcut(props.shortcutSettings[item.id], next))
      if (conflict) {
        setShortcutError('这个组合键已经分配给其他文字笔记操作。')
        return
      }
      setShortcutError('')
      props.onUpdateShortcutSettings({ ...props.shortcutSettings, [action]: next })
    }

    return <div className="settings-panel-stack">
      <section className="settings-panel-card settings-panel-shortcuts-card">
        <div className="settings-panel-card-heading"><span className="settings-panel-card-icon"><Keyboard size={18}/></span><div><strong>文字笔记快捷键</strong><small>点击输入框后直接按新的组合键</small></div></div>
        <div className="settings-panel-shortcut-list" aria-label="文字笔记快捷键列表">
          {MARKDOWN_SHORTCUT_ACTIONS.map(item => <label className="settings-panel-shortcut-row" key={item.id}><span><strong>{item.label}</strong><small>Markdown 编辑</small></span><input aria-label={`${item.label}快捷键`} value={formatShortcut(props.shortcutSettings[item.id])} readOnly onKeyDown={event => updateShortcut(item.id, event)}/></label>)}
        </div>
        {shortcutError && <p className="settings-panel-shortcut-error" role="alert">{shortcutError}</p>}
        <div className="settings-panel-tag-actions"><button type="button" onClick={() => { setShortcutError(''); props.onResetShortcutSettings() }}><RotateCcw size={13}/>恢复默认快捷键</button><span>默认：{formatShortcut(DEFAULT_MARKDOWN_SHORTCUTS.bold)}、{formatShortcut(DEFAULT_MARKDOWN_SHORTCUTS.italic)}、{formatShortcut(DEFAULT_MARKDOWN_SHORTCUTS.inlineCode)}；列表为 {formatShortcut(DEFAULT_MARKDOWN_SHORTCUTS.orderedList)}、{formatShortcut(DEFAULT_MARKDOWN_SHORTCUTS.bulletList)}。</span></div>
      </section>
      <section className="settings-panel-card settings-panel-shortcut-reference-card">
        <div className="settings-panel-card-heading"><span className="settings-panel-card-icon"><Keyboard size={18}/></span><div><strong>固定快捷键</strong><small>按使用场景分类，当前不可自定义</small></div></div>
        <div className="settings-panel-shortcut-reference-list" aria-label="固定快捷键列表">
          {fixedShortcutGroups.map(group => <section className="settings-panel-shortcut-group" key={group.title}>
            <div className="settings-panel-shortcut-group-heading"><strong>{group.title}</strong><span>{group.description}</span></div>
            <div className="settings-panel-shortcut-reference-rows">
              {group.items.map(item => <div className="settings-panel-shortcut-reference-row" key={`${group.title}-${item.label}`}><span><strong>{item.label}</strong>{item.note && <small>{item.note}</small>}</span><kbd>{item.shortcut}</kbd></div>)}
            </div>
          </section>)}
        </div>
      </section>
    </div>
  }

  function renderTagSettings() {
    function updateTag(id: string, patch: Partial<QuestionTagDefinition>) {
      props.onUpdateQuestionTags(props.questionTags.map(tag => tag.id === id ? { ...tag, ...patch } : tag))
    }

    function moveTag(draggedId: string, targetId: string, placeAfter: boolean) {
      if (draggedId === targetId) return
      const draggedTag = props.questionTags.find(tag => tag.id === draggedId)
      if (!draggedTag) return
      const remaining = props.questionTags.filter(tag => tag.id !== draggedId)
      const targetIndex = remaining.findIndex(tag => tag.id === targetId)
      if (targetIndex < 0) return
      remaining.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedTag)
      props.onUpdateQuestionTags(remaining)
    }

    return <div className="settings-panel-stack">
      <section className="settings-panel-card">
        <div className="settings-panel-card-heading"><span className="settings-panel-card-icon"><Tag size={18}/></span><div><strong>标签颜色与名称</strong><small>题号旁的标签可以同时选择多个</small></div></div>
        <div className="settings-panel-tag-list" aria-label="标签顺序">
          {props.questionTags.map(tag => <div
            className={draggedTagId === tag.id ? 'settings-panel-tag-row is-dragging' : 'settings-panel-tag-row'}
            key={tag.id}
            draggable
            onDragStart={event => { setDraggedTagId(tag.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', tag.id) }}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
            onDrop={event => { event.preventDefault(); const draggedId = draggedTagId || event.dataTransfer.getData('text/plain'); const rect = event.currentTarget.getBoundingClientRect(); moveTag(draggedId, tag.id, event.clientY > rect.top + rect.height / 2); setDraggedTagId(null) }}
            onDragEnd={() => setDraggedTagId(null)}
          >
            <span className="settings-panel-tag-drag" title="拖动调整顺序" aria-label={`拖动${tag.name}调整顺序`}><GripVertical size={15}/></span>
            <span className="settings-panel-tag-preview"><i style={{ backgroundColor: tag.color }}/><strong>{tag.name}</strong></span>
            <label><span>显示名称</span><input aria-label={`${tag.name}标签名称`} value={tag.name} onChange={event => updateTag(tag.id, { name: event.target.value })}/></label>
            <label className="settings-panel-color-field"><span>颜色</span><input aria-label={`${tag.name}标签颜色`} type="color" value={tag.color} onChange={event => updateTag(tag.id, { color: event.target.value })}/></label>
          </div>)}
        </div>
        <div className="settings-panel-tag-actions"><button type="button" onClick={props.onResetQuestionTags}><RotateCcw size={13}/>恢复默认标签</button><span>红色默认“必做题”、蓝色默认“选做题”、灰色默认“特难题”、黑色默认“不做”。</span></div>
      </section>
      <section className="settings-panel-info-card"><strong>使用方式</strong><span>打开题目后，点击题号旁的标签图标即可添加或取消标记；标签会随题库和完整备份保存。</span></section>
    </div>
  }

  function renderDataSettings() {
    return <div className="settings-panel-data-stack">
      <section className="settings-panel-group">
        <GroupHeading title="题库操作" description="创建、编辑和维护当前题库"/>
        <div className="settings-panel-action-grid">
          <ActionCard icon={Plus} title="新建题库" description="批量导入图片建立新题库" onClick={props.onOpenNewBank}/>
          <ActionCard icon={Pencil} title="编辑题目与图片" description="从 PDF 截图、裁剪并替换题图" onClick={props.onOpenEditor}/>
        </div>
      </section>

      <section className="settings-panel-group">
        <GroupHeading title="学习记录" description="按题目查看、补录、修改或删除全部做题记录"/>
        <div className="settings-panel-action-grid single">
          <ActionCard icon={History} title="学习记录管理" description="查看每题全部记录，并修改状态与日期时间" onClick={props.onOpenStudyRecords}/>
        </div>
      </section>

      <section className="settings-panel-group">
        <GroupHeading title="题库连接" description="同步本地题库文件夹"/>
        <WorkspaceStatus state={props.workspaceState}/>
        <div className="settings-panel-action-grid">
          <ActionCard icon={FolderSync} title={props.workspaceState === 'connected' ? '重新同步题库' : '连接题库文件夹'} description={props.workspaceState === 'connected' ? '重新读取当前题库与用户数据' : '连接本地目录并启用实时保存'} onClick={props.onConnectWorkspace}/>
          <ActionCard icon={FolderOpen} title="切换题库文件夹" description="选择另一套本地题库目录" onClick={props.onSwitchWorkspace}/>
        </div>
      </section>

      <section className="settings-panel-group">
        <GroupHeading title="导入与导出" description="迁移题库、图片和学习资料"/>
        <div className="settings-panel-action-grid">
          <ActionCard icon={FileUp} title="导入题库" description="载入 JSON 题库或完整备份" onClick={props.onImportData}/>
          <ActionCard icon={FileImage} title="导入图片" description="按命名规则匹配题图与解析图" onClick={props.onImportImages}/>
          <ActionCard icon={FileText} title="导出题目" description="按当前范围生成 PDF 或图片" onClick={props.onOpenExport}/>
          <ActionCard icon={NotebookPen} title="导出笔记" description="按范围导出文字与手写笔记" onClick={props.onOpenNotesExport}/>
          <ActionCard icon={Download} title="完整备份" description="保存题库、学习记录和题目笔记" onClick={props.onExportData}/>
        </div>
        <div className="settings-panel-rule-inline">
          <div className="settings-panel-rule-heading"><span className="settings-panel-rule-icon"><CircleHelp size={16}/></span><div><strong>图片命名规则</strong><small>导入图片时按以下格式自动匹配</small></div></div>
          <div className="settings-panel-rule-content"><code>Q-01-1-01.1.png</code><span>题目第 1 张</span><code>A-01-1-01.1.png</code><span>答案第 1 张</span><code>01 行列式 01-基础</code><span>文件夹格式</span></div>
          <p>Q 表示题目，A 表示答案；末尾序号用于多图题。章节号和小节号使用两位数字。</p>
        </div>
      </section>

      <section className="settings-panel-group">
        <GroupHeading title="备份与重置" description="存储占用、清除标注和恢复数据"/>
        <div className="settings-panel-action-grid">
          <ActionCard icon={HardDrive} title="备份与重置管理" description="查看存储、导出单库、恢复内置或出厂设置" onClick={props.onOpenDataManager}/>
        </div>
      </section>

      <section className="settings-panel-info-card"><strong>本地优先</strong><span>未连接文件夹时，题库、标注和笔记仍会保存在当前浏览器中。</span></section>
    </div>
  }

  function renderSyncSettings() {
    return <div className="settings-panel-stack">
      <section className="settings-panel-group settings-panel-cloud-sync-group">
        <GroupHeading title="OneDrive 同步" description="跨设备同步学习数据与题目笔记"/>
        <CloudSyncStatus state={props.cloudSyncState} signedIn={props.oneDriveSignedIn} authConfigured={props.oneDriveAuthConfigured} message={props.cloudSyncMessage}/>
        <div className="settings-panel-sync-fields">
          <label><span>OneDrive 应用目录</span><input value={props.cloudSyncSettings.remotePath} onChange={event => props.onUpdateCloudSyncSettings({ ...props.cloudSyncSettings, remotePath: event.currentTarget.value })} placeholder="npee-study-space" autoComplete="off"/></label>
          <label className="settings-panel-sync-check"><input type="checkbox" checked={props.cloudSyncSettings.includeBanks} onChange={event => props.onUpdateCloudSyncSettings({ ...props.cloudSyncSettings, includeBanks: event.currentTarget.checked })}/><span>同步题库结构（暂不包含图片）</span></label>
        </div>
        <div className="settings-panel-sync-actions">
          <button type="button" disabled={!props.oneDriveSignedIn && !props.oneDriveAuthConfigured} onClick={props.oneDriveSignedIn ? props.onCloudSync : props.onSignInOneDrive}>{props.oneDriveSignedIn ? <RefreshCcw size={14}/> : <LogIn size={14}/>}<span>{props.oneDriveSignedIn ? '立即同步' : '网页登录 OneDrive'}</span></button>
          {props.oneDriveSignedIn && <button type="button" onClick={props.onSignOutOneDrive}><LogOut size={14}/>退出登录</button>}
        </div>
        <p className="settings-panel-sync-help"><Cloud size={13}/>点击后将在网页中打开 Microsoft 登录，授权完成会自动返回本页。应用使用 OneDrive App Folder 和 <code>Files.ReadWrite.AppFolder</code> 权限；登录令牌保存在本机浏览器，可随时退出登录清除。</p>
      </section>
      <section className="settings-panel-info-card"><strong>同步范围</strong><span>默认同步学习轮次、熟练度、复习记录、考试日期和笔记；开启题库结构后会额外同步题库 JSON，但当前版本不包含图片。</span></section>
    </div>
  }

  function renderAboutSettings() {
    return <div className="settings-panel-stack">
      <section className="settings-panel-about-card">
        <div className="settings-panel-about-brand"><img className="settings-panel-about-icon" src="/favicon.svg" alt="" aria-hidden="true" draggable={false}/><div><strong>考研学习空间</strong><span>本地优先的考研题库与学习工具</span></div></div>
        <span className="settings-panel-version">v{props.appVersion}</span>
      </section>
      <a className="settings-panel-about-link" href={props.githubUrl} target="_blank" rel="noreferrer">
        <span className="settings-panel-about-link-icon"><GitHubMark/></span><span className="settings-panel-action-copy"><strong>GitHub 项目主页</strong><small>查看源代码、更新记录与问题反馈</small></span><ExternalLink className="settings-panel-action-arrow" size={15}/>
      </a>
      <div className="settings-panel-about-grid">
        <section className="settings-panel-info-card"><strong>数据归属</strong><span>题库、学习标注和笔记默认保存在本地，不会自动上传。</span></section>
        <section className="settings-panel-info-card"><strong>当前版本</strong><span>v{props.appVersion} · 数据格式可通过完整备份迁移。</span></section>
      </div>
      <section className="settings-panel-about-note"><Info size={15}/><span>连接题库文件夹后，可以在本地目录中管理题库和学习数据；断开后仍可继续使用浏览器本地数据。</span></section>
    </div>
  }

  function renderContent() {
    if (activeSection === 'study') return renderStudySettings()
    if (activeSection === 'tags') return renderTagSettings()
    if (activeSection === 'focus') return renderFocusSettings()
    if (activeSection === 'shortcuts') return renderShortcutSettings()
    if (activeSection === 'data') return renderDataSettings()
    if (activeSection === 'sync') return renderSyncSettings()
    return renderAboutSettings()
  }

  return <div className="modal-backdrop settings-panel-backdrop" onClick={props.onClose}>
    <section ref={dialogRef} className="settings-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-panel-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <div className="settings-panel-header"><div className="settings-panel-heading"><span className="settings-panel-heading-icon"><SettingsIcon size={19}/></span><div><h2 id="settings-panel-title">设置</h2><p>按类别管理考研学习空间</p></div></div><button className="settings-panel-close" type="button" aria-label="关闭设置" data-dialog-initial-focus onClick={props.onClose}><X size={18}/></button></div>
      <div className="settings-panel-layout">
        <nav className="settings-panel-nav" aria-label="设置分类">
          <span className="settings-panel-nav-label">设置分类</span>
          {sectionItems.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={activeSection === item.id ? 'active' : ''} aria-current={activeSection === item.id ? 'page' : undefined} onClick={() => setActiveSection(item.id)}><span className="settings-panel-nav-icon"><Icon size={17}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={14}/></button> })}
          <div className="settings-panel-nav-note"><span className="source-dot"/>数据优先保存在本地</div>
        </nav>
        <div className="settings-panel-content"><div className="settings-panel-content-heading"><div><span>{heading.eyebrow}</span><h3>{heading.title}</h3><p>{heading.description}</p></div><span className="settings-panel-step">{sectionItems.findIndex(item => item.id === activeSection) + 1} / {sectionItems.length}</span></div>{renderContent()}</div>
      </div>
    </section>
  </div>
}
