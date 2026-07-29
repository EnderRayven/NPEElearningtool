import { useEffect, useState, type ComponentType } from 'react'
import { CalendarDays, ChevronRight, CircleHelp, Download, ExternalLink, FileImage, FileText, FileUp, FolderOpen, FolderSync, HardDrive, Info, Pencil, Plus, RotateCcw, Settings as SettingsIcon, SunMedium, X } from 'lucide-react'
import type { UserSettings } from './userSettings'

type SettingsSection = 'study' | 'focus' | 'data' | 'about'
type WorkspaceState = 'none' | 'available' | 'syncing' | 'connected' | 'error'
type PanelIcon = ComponentType<{ size?: number; strokeWidth?: number }>

interface Props {
  userSettings: UserSettings
  screenWakeLockSupported: boolean
  examDate: string
  minExamDate: string
  customExamDate: boolean
  workspaceState: WorkspaceState
  appVersion: string
  githubUrl: string
  roundMarkedCount: (round: number) => number
  onClose: () => void
  onSwitchRound: (round: number) => void
  onAddRound: () => void
  onUpdateExamDate: (value: string) => void
  onResetExamDate: () => void
  onToggleScreenAwake: () => void
  onOpenNewBank: () => void
  onOpenEditor: () => void
  onOpenDataManager: () => void
  onConnectWorkspace: () => void
  onSwitchWorkspace: () => void
  onImportData: () => void
  onImportImages: () => void
  onOpenExport: () => void
  onExportData: () => void
}

const sectionItems: Array<{ id: SettingsSection; label: string; description: string; icon: PanelIcon }> = [
  { id: 'study', label: '学习设置', description: '轮次与考试日期', icon: RotateCcw },
  { id: 'focus', label: '专注模式', description: '不熄屏与学习状态', icon: SunMedium },
  { id: 'data', label: '题库与数据', description: '题库、导入导出与备份', icon: HardDrive },
  { id: 'about', label: '关于', description: '版本与项目链接', icon: Info },
]

const sectionTitles: Record<SettingsSection, { eyebrow: string; title: string; description: string }> = {
  study: { eyebrow: 'LEARNING', title: '学习设置', description: '管理学习轮次和考试倒计时。' },
  focus: { eyebrow: 'FOCUS', title: '专注模式', description: '让学习页面更适合长时间使用。' },
  data: { eyebrow: 'QUESTION BANKS & DATA', title: '题库与数据', description: '集中管理题库、导入导出、备份与重置。' },
  about: { eyebrow: 'ABOUT', title: '关于', description: '查看当前版本、项目地址和数据说明。' },
}

function ActionCard(props: { icon: PanelIcon; title: string; description: string; onClick: () => void; accent?: boolean }) {
  const Icon = props.icon
  return <button className={props.accent ? 'settings-panel-action accent' : 'settings-panel-action'} type="button" onClick={props.onClick}>
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

function GitHubMark({ size = 19 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.22c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.58-.29-5.29-1.29-5.29-5.68 0-1.25.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.96 10.96 0 0 1 5.75 0C17.03 5.02 18 5.33 18 5.33c.63 1.58.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.09 0 4.41-2.72 5.38-5.31 5.67.42.36.79 1.07.79 2.16v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>
}

export default function SettingsPanel(props: Props) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('study')
  const heading = sectionTitles[activeSection]

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') props.onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [props.onClose])

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const previousHtmlOverscroll = html.style.overscrollBehavior
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscroll = body.style.overscrollBehavior
    const previousBodyPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - html.clientWidth
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
    return () => {
      html.style.overscrollBehavior = previousHtmlOverscroll
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscroll
      body.style.paddingRight = previousBodyPaddingRight
    }
  }, [])

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

  function renderDataSettings() {
    return <div className="settings-panel-data-stack">
      <section className="settings-panel-group">
        <GroupHeading title="题库操作" description="创建、编辑和维护当前题库"/>
        <div className="settings-panel-action-grid">
          <ActionCard icon={Plus} title="新建题库" description="批量导入图片建立新题库" onClick={props.onOpenNewBank} accent/>
          <ActionCard icon={Pencil} title="编辑题目与图片" description="从 PDF 截图、裁剪并替换题图" onClick={props.onOpenEditor}/>
        </div>
      </section>

      <section className="settings-panel-group">
        <GroupHeading title="题库连接" description="同步本地题库文件夹"/>
        <WorkspaceStatus state={props.workspaceState}/>
        <div className="settings-panel-action-grid">
          <ActionCard icon={FolderSync} title={props.workspaceState === 'connected' ? '重新同步题库' : '连接题库文件夹'} description={props.workspaceState === 'connected' ? '重新读取当前题库与用户数据' : '连接本地目录并启用实时保存'} onClick={props.onConnectWorkspace} accent/>
          <ActionCard icon={FolderOpen} title="切换题库文件夹" description="选择另一套本地题库目录" onClick={props.onSwitchWorkspace}/>
        </div>
      </section>

      <section className="settings-panel-group">
        <GroupHeading title="导入与导出" description="迁移题库、图片和学习资料"/>
        <div className="settings-panel-action-grid">
          <ActionCard icon={FileUp} title="导入题库" description="载入 JSON 题库或完整备份" onClick={props.onImportData} accent/>
          <ActionCard icon={FileImage} title="导入图片" description="按命名规则匹配题图与解析图" onClick={props.onImportImages}/>
          <ActionCard icon={FileText} title="导出题目" description="按当前范围生成 PDF 或图片" onClick={props.onOpenExport}/>
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
          <ActionCard icon={HardDrive} title="备份与重置管理" description="查看存储、导出单库、恢复内置或出厂设置" onClick={props.onOpenDataManager} accent/>
        </div>
      </section>

      <section className="settings-panel-info-card"><strong>本地优先</strong><span>未连接文件夹时，题库、标注和笔记仍会保存在当前浏览器中。</span></section>
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
    if (activeSection === 'focus') return renderFocusSettings()
    if (activeSection === 'data') return renderDataSettings()
    return renderAboutSettings()
  }

  return <div className="modal-backdrop settings-panel-backdrop" onClick={props.onClose}>
    <section className="settings-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-panel-title" onClick={event => event.stopPropagation()}>
      <div className="settings-panel-header"><div className="settings-panel-heading"><span className="settings-panel-heading-icon"><SettingsIcon size={19}/></span><div><h2 id="settings-panel-title">设置</h2><p>按类别管理考研学习空间</p></div></div><button className="settings-panel-close" type="button" aria-label="关闭设置" onClick={props.onClose}><X size={18}/></button></div>
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
