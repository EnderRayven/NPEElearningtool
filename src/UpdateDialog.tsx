import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download, ExternalLink, RefreshCcw, RotateCcw, X } from 'lucide-react'
import { appVersion, githubRepositoryUrl } from './appMeta'
import { desktopUpdateApi, downloadWebUpdate, fetchLatestRelease, formatUpdateSize, isDesktopApp, isNewerAppVersion, type DesktopUpdateState, type UpdateRelease } from './update'
import { useModalScrollLock } from './useModalScrollLock'

type ViewState = {
  status: DesktopUpdateState['status'] | 'web-downloading' | 'web-downloaded'
  release: UpdateRelease | null
  version: string
  releaseNotes: string
  progress: number
  error: string
}

const initialState: ViewState = { status: 'idle', release: null, version: '', releaseNotes: '', progress: 0, error: '' }

function stateFromDesktop(state: DesktopUpdateState, previous: ViewState): ViewState {
  return {
    ...previous,
    status: state.status,
    version: state.version,
    releaseNotes: state.releaseNotes,
    progress: state.progress,
    error: state.error,
  }
}

function releaseNotesText(release: UpdateRelease | null, state: ViewState) {
  return release?.body || state.releaseNotes || '本次版本没有附加更新说明。'
}

export default function UpdateDialog(props: { onClose: () => void }) {
  const desktop = isDesktopApp()
  const [state, setState] = useState(initialState)
  const checkStarted = useRef(false)
  useModalScrollLock()

  async function checkUpdate() {
    setState(previous => ({ ...previous, status: 'checking', error: '', progress: 0 }))
    if (desktop) {
      const api = desktopUpdateApi()
      if (!api) return
      try {
        const next = await api.checkForUpdates()
        setState(previous => stateFromDesktop(next, previous))
      } catch (error) {
        setState(previous => ({ ...previous, status: 'error', error: error instanceof Error ? error.message : '检查更新失败' }))
      }
      return
    }
    try {
      const release = await fetchLatestRelease()
      setState(previous => ({ ...previous, status: isNewerAppVersion(release.version) ? 'available' : 'not-available', release, version: release.version, releaseNotes: release.body, error: '' }))
    } catch (error) {
      setState(previous => ({ ...previous, status: 'error', error: error instanceof Error ? error.message : '检查更新失败' }))
    }
  }

  useEffect(() => {
    let active = true
    const api = desktopUpdateApi()
    const unsubscribe = api?.onUpdateState(next => {
      if (active) setState(previous => stateFromDesktop(next, previous))
    })
    if (desktop && api) {
      api.getUpdateState().then(next => { if (active) setState(previous => stateFromDesktop(next, previous)) }).catch(() => {})
    }
    if (!checkStarted.current) {
      checkStarted.current = true
      void checkUpdate()
    }
    return () => { active = false; unsubscribe?.() }
  }, [])

  async function downloadUpdate() {
    if (desktop) {
      const api = desktopUpdateApi()
      if (!api) return
      try {
        const next = await api.downloadUpdate()
        setState(previous => stateFromDesktop(next, previous))
      } catch (error) {
        setState(previous => ({ ...previous, status: 'error', error: error instanceof Error ? error.message : '更新包下载失败' }))
      }
      return
    }
    if (!state.release?.softwareAsset) return
    setState(previous => ({ ...previous, status: 'web-downloading', progress: 0, error: '' }))
    try {
      await downloadWebUpdate(state.release.softwareAsset, progress => setState(previous => ({ ...previous, progress })))
      setState(previous => ({ ...previous, status: 'web-downloaded', progress: 1 }))
    } catch (error) {
      setState(previous => ({ ...previous, status: 'error', error: error instanceof Error ? error.message : '更新包下载失败' }))
    }
  }

  function installUpdate() {
    const api = desktopUpdateApi()
    if (!api) return
    void api.installUpdate().catch(error => setState(previous => ({ ...previous, status: 'error', error: error instanceof Error ? error.message : '安装更新失败' })))
  }

  const hasUpdate = state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded' || state.status === 'web-downloading'
  const downloaded = state.status === 'downloaded' || state.status === 'web-downloaded'
  const version = state.version || state.release?.version
  const notes = releaseNotesText(state.release, state)
  const checkLabel = state.status === 'checking' ? '检查中…' : '重新检查'
  const unsupported = state.status === 'unsupported'

  return <div className="modal-backdrop update-dialog-backdrop" onClick={props.onClose}>
    <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title" onClick={event => event.stopPropagation()}>
      <button className="modal-close" type="button" aria-label="关闭更新" onClick={props.onClose}><X/></button>
      <div className="update-dialog-heading"><span className="modal-icon"><Download/></span><div><span>{desktop ? 'DESKTOP UPDATE' : 'WEB UPDATE'}</span><h2 id="update-dialog-title">应用更新</h2></div></div>
      <p className="update-dialog-intro">当前版本 v{appVersion}。{desktop ? '更新会在应用内下载，完成后重启安装。' : '更新包会从应用内直接下载，不必再打开 GitHub。'}</p>

      {state.status === 'checking' && <div className="update-dialog-state update-dialog-loading" role="status"><RefreshCcw size={18}/><span>正在检查最新版本…</span></div>}
      {state.status === 'not-available' && <div className="update-dialog-state update-dialog-success" role="status"><CheckCircle2 size={19}/><div><strong>当前已是最新版本</strong><small>已检查 GitHub Releases</small></div></div>}
      {unsupported && <div className="update-dialog-state update-dialog-muted" role="status"><span>当前封装格式暂不支持自动安装，请使用项目发布页中的安装包更新。</span></div>}
      {state.status === 'error' && <div className="update-dialog-state update-dialog-error" role="alert"><div><strong>更新检查失败</strong><small>{state.error || '请检查网络后重试。'}</small></div></div>}
      {state.status === 'web-downloaded' && <div className="update-dialog-state update-dialog-success" role="status"><CheckCircle2 size={19}/><div><strong>更新包已开始下载</strong><small>下载完成后解压并替换应用文件，再重新启动网页版本。</small></div></div>}

      {hasUpdate && <section className="update-dialog-release">
        <div className="update-dialog-release-heading"><div><span>NEW RELEASE</span><strong>v{version}</strong></div>{state.release?.publishedAt && <time dateTime={state.release.publishedAt}>{new Date(state.release.publishedAt).toLocaleDateString('zh-CN')}</time>}</div>
        <p className="update-dialog-release-name">{state.release?.name || state.releaseNotes || '发现新版本'}</p>
        <div className="update-dialog-notes">{notes}</div>
        {state.release?.softwareAsset && <small className="update-dialog-asset">软件更新包 · {formatUpdateSize(state.release.softwareAsset.size) || '大小以下载结果为准'}</small>}
        {state.status === 'downloading' || state.status === 'web-downloading' ? <div className="update-dialog-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)}><span style={{ width: `${Math.max(4, state.progress * 100)}%` }}/><strong>{Math.round(state.progress * 100)}%</strong></div> : null}
        <div className="update-dialog-actions">
          {!downloaded && <button className="primary-button" type="button" disabled={state.status === 'downloading' || state.status === 'web-downloading' || (!desktop && !state.release?.softwareAsset)} onClick={() => void downloadUpdate()}><Download size={16}/>{desktop ? '下载更新' : state.release?.softwareAsset ? '下载网页更新包' : '暂无软件包'}</button>}
          {desktop && downloaded && <button className="primary-button" type="button" onClick={installUpdate}><RotateCcw size={16}/>重启并安装</button>}
          {state.release?.htmlUrl && <a className="update-dialog-release-link" href={state.release.htmlUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>查看发布说明</a>}
        </div>
      </section>}

      <div className="update-dialog-footer"><span>{desktop ? '支持 macOS / Windows 安装包自动更新；Linux 请使用发布页。' : '网页端下载的是软件更新包，题库数据仍按当前工作区独立保存。'}</span><button type="button" onClick={() => void checkUpdate()} disabled={state.status === 'checking'}><RefreshCcw size={14}/>{checkLabel}</button></div>
      {!desktop && <a className="update-dialog-project-link" href={githubRepositoryUrl} target="_blank" rel="noreferrer">项目主页</a>}
    </section>
  </div>
}
