import { appVersion, githubRepositoryUrl } from './appMeta'

export type UpdateReleaseAsset = {
  name: string
  browserDownloadUrl: string
  size: number
}

export type UpdateRelease = {
  version: string
  tagName: string
  name: string
  body: string
  publishedAt: string
  htmlUrl: string
  softwareAsset: UpdateReleaseAsset | null
}

export type DesktopUpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'unsupported'

export type DesktopUpdateState = {
  status: DesktopUpdateStatus
  version: string
  releaseName: string
  releaseNotes: string
  releaseDate: string
  progress: number
  error: string
}

type DesktopUpdateApi = {
  isDesktop: boolean
  platform: string
  getUpdateState: () => Promise<DesktopUpdateState>
  checkForUpdates: () => Promise<DesktopUpdateState>
  downloadUpdate: () => Promise<DesktopUpdateState>
  installUpdate: () => Promise<DesktopUpdateState>
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void
}

declare global {
  interface Window {
    npeeDesktop?: DesktopUpdateApi
  }
}

const VERSION_PATTERN = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/
const RELEASE_API_URL = `${githubRepositoryUrl.replace('github.com/', 'api.github.com/repos/')}/releases/latest`
const FETCH_TIMEOUT_MS = 12_000

function versionParts(value: string) {
  const match = value.trim().match(VERSION_PATTERN)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2] || 0), patch: Number(match[3] || 0), preRelease: match[4] || '' }
}

export function compareAppVersions(left: string, right: string) {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  if (!leftParts || !rightParts) return left.localeCompare(right, undefined, { numeric: true })
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (leftParts[key] !== rightParts[key]) return leftParts[key] > rightParts[key] ? 1 : -1
  }
  if (!leftParts.preRelease && rightParts.preRelease) return 1
  if (leftParts.preRelease && !rightParts.preRelease) return -1
  return leftParts.preRelease.localeCompare(rightParts.preRelease, undefined, { numeric: true })
}

export function isNewerAppVersion(version: string, current = appVersion) {
  return compareAppVersions(version, current) > 0
}

function toAsset(value: unknown): UpdateReleaseAsset | null {
  if (!value || typeof value !== 'object') return null
  const asset = value as { name?: unknown; browser_download_url?: unknown; size?: unknown }
  if (typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string') return null
  return { name: asset.name, browserDownloadUrl: asset.browser_download_url, size: typeof asset.size === 'number' ? asset.size : 0 }
}

export function parseGitHubRelease(payload: unknown): UpdateRelease {
  if (!payload || typeof payload !== 'object') throw new Error('更新信息格式无效')
  const release = payload as { tag_name?: unknown; name?: unknown; body?: unknown; published_at?: unknown; html_url?: unknown; assets?: unknown }
  if (typeof release.tag_name !== 'string' || !versionParts(release.tag_name)) throw new Error('更新版本号无效')
  const assets = Array.isArray(release.assets) ? release.assets.map(toAsset).filter((asset): asset is UpdateReleaseAsset => Boolean(asset)) : []
  const softwareAsset = assets.find(asset => /(?:软件包|software)\.zip$/i.test(asset.name)) || assets.find(asset => /\.zip$/i.test(asset.name)) || null
  return {
    version: release.tag_name.replace(/^v/i, ''),
    tagName: release.tag_name,
    name: typeof release.name === 'string' && release.name.trim() ? release.name : release.tag_name,
    body: typeof release.body === 'string' ? release.body : '',
    publishedAt: typeof release.published_at === 'string' ? release.published_at : '',
    htmlUrl: typeof release.html_url === 'string' ? release.html_url : githubRepositoryUrl,
    softwareAsset,
  }
}

export async function fetchLatestRelease(signal?: AbortSignal): Promise<UpdateRelease> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`)
    return parseGitHubRelease(await response.json())
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export async function downloadWebUpdate(asset: UpdateReleaseAsset, onProgress?: (progress: number) => void) {
  const response = await fetch(asset.browserDownloadUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`更新包下载失败（${response.status}）`)
  if (!response.body) {
    const blob = await response.blob()
    triggerBrowserDownload(blob, asset.name)
    onProgress?.(1)
    return
  }
  const total = Number(response.headers.get('content-length')) || asset.size || 0
  const reader = response.body.getReader()
  const chunks: BlobPart[] = []
  let received = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    chunks.push(result.value)
    received += result.value.byteLength
    if (total) onProgress?.(Math.min(received / total, 1))
  }
  triggerBrowserDownload(new Blob(chunks, { type: 'application/zip' }), asset.name)
  onProgress?.(1)
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noreferrer'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function isDesktopApp() {
  return Boolean(window.npeeDesktop?.isDesktop)
}

export function desktopUpdateApi() {
  return window.npeeDesktop || null
}

export function formatUpdateSize(size: number) {
  if (!size || size < 1024) return ''
  const units = ['KB', 'MB', 'GB']
  let value = size / 1024
  let unit = units[0]
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`
}
