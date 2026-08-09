import type { QuestionBank } from './types'
import { mergeStudyActivities, validateStudyActivities } from './studyActivity'
import { validateStudyRounds, type StudyRounds } from './studyRounds'
import {
  validatePersonalNotebooks,
  validateQuestionErrorRecords,
  validateQuestionNotes,
  type PersonalNotebooks,
  type QuestionErrorRecords,
  type QuestionNotes,
} from './questionNotes'
import { DEFAULT_USER_SETTINGS, validateUserSettings, type UserSettings } from './userSettings'
import { createWorkspaceManifest, createWorkspaceUserData, type WorkspaceManifest, type WorkspaceUserData } from './workspace'

const SETTINGS_KEY = 'npee:onedrive-sync-settings:v1'
const DEVICE_KEY = 'npee:onedrive-sync-device:v1'
const SESSION_KEY = 'npee:onedrive-sync-session:v1'
const STATE_PREFIX = 'npee:onedrive-sync-state:v1:'
const PKCE_VERIFIER_KEY = 'npee:onedrive-pkce-verifier:v1'
const PKCE_STATE_KEY = 'npee:onedrive-pkce-state:v1'
const INDEX_PATH = 'sync/index.json'
const USER_DATA_PATH = '用户数据/用户数据.json'
const MANIFEST_PATH = '默认题库/题库数据.json'
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'
const AUTH_ROOT = (import.meta.env.VITE_ONEDRIVE_AUTHORITY || 'https://login.microsoftonline.com/consumers/oauth2/v2.0').replace(/\/+$/, '')
const BUILT_IN_CLIENT_ID = (import.meta.env.VITE_ONEDRIVE_CLIENT_ID || '').trim()
const GRAPH_SCOPES = 'openid profile offline_access User.Read Files.ReadWrite.AppFolder'

export interface CloudSyncSettings {
  clientId: string
  redirectUri: string
  remotePath: string
  includeBanks: boolean
}

interface OneDriveSession {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

export type CloudSyncState = 'idle' | 'syncing' | 'connected' | 'error'

export interface CloudSyncFile {
  path: string
  content: string
}

export interface CloudSyncEntry {
  path: string
  hash: string
  size: number
  updatedAt: string
  deviceId: string
  deletedAt?: string
}

export interface CloudSyncIndex {
  version: 1
  updatedAt: string
  deviceId: string
  files: Record<string, CloudSyncEntry>
}

export interface CloudSyncResult {
  files: CloudSyncFile[]
  uploaded: number
  downloaded: number
  conflicts: string[]
  firstSync: boolean
}

export const DEFAULT_CLOUD_SYNC_SETTINGS: CloudSyncSettings = {
  clientId: BUILT_IN_CLIENT_ID,
  redirectUri: '',
  remotePath: 'npee-study-space',
  includeBanks: false,
}

export function oneDriveClientId(settings: CloudSyncSettings) {
  return BUILT_IN_CLIENT_ID || settings.clientId.trim()
}

export function oneDriveRedirectUri(settings: CloudSyncSettings) {
  return settings.redirectUri.trim() || defaultRedirectUri()
}

export function isOneDriveWebAuthConfigured(settings: CloudSyncSettings) {
  return Boolean(oneDriveClientId(settings) && oneDriveRedirectUri(settings))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function defaultRedirectUri() {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  if (url.protocol === 'http:' && url.hostname === '127.0.0.1') url.hostname = 'localhost'
  return `${url.origin}${url.pathname}`
}

function cleanSettings(value: unknown): CloudSyncSettings {
  if (!isRecord(value)) return { ...DEFAULT_CLOUD_SYNC_SETTINGS, redirectUri: defaultRedirectUri() }
  const runtimeRedirectUri = defaultRedirectUri()
  return {
    clientId: BUILT_IN_CLIENT_ID || (typeof value.clientId === 'string' ? value.clientId.trim() : ''),
    redirectUri: runtimeRedirectUri || (typeof value.redirectUri === 'string' ? value.redirectUri.trim() : ''),
    remotePath: typeof value.remotePath === 'string' && value.remotePath.trim() ? value.remotePath.trim().replace(/^\/+|\/+$/g, '') : DEFAULT_CLOUD_SYNC_SETTINGS.remotePath,
    includeBanks: value.includeBanks === true,
  }
}

export function loadCloudSyncSettings(storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return { ...DEFAULT_CLOUD_SYNC_SETTINGS, redirectUri: defaultRedirectUri() }
  try { return cleanSettings(JSON.parse(storage.getItem(SETTINGS_KEY) || 'null')) }
  catch { return { ...DEFAULT_CLOUD_SYNC_SETTINGS, redirectUri: defaultRedirectUri() } }
}

export function saveCloudSyncSettings(settings: CloudSyncSettings, storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return false
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(cleanSettings(settings))); return true }
  catch { return false }
}

export function hasOneDriveSession(storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return false
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null') as Partial<OneDriveSession> | null
    return Boolean(value?.accessToken && ((typeof value.expiresAt === 'number' && value.expiresAt > Date.now() + 30_000) || value.refreshToken))
  } catch { return false }
}

export function signOutOneDrive(
  storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage,
  transientStorage: Storage | null = typeof window === 'undefined' ? null : window.sessionStorage,
) {
  storage?.removeItem(SESSION_KEY)
  transientStorage?.removeItem(PKCE_VERIFIER_KEY)
  transientStorage?.removeItem(PKCE_STATE_KEY)
}

function deviceId(storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return 'server-device'
  try {
    const existing = storage.getItem(DEVICE_KEY)
    if (existing) return existing
    const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    storage.setItem(DEVICE_KEY, next)
    return next
  } catch { return `device-${Date.now()}` }
}

function stateKey(settings: CloudSyncSettings) {
  return `${STATE_PREFIX}${oneDriveClientId(settings)}|${settings.remotePath}`
}

function readLocalIndex(settings: CloudSyncSettings, storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): CloudSyncIndex | null {
  if (!storage) return null
  try {
    const value = JSON.parse(storage.getItem(stateKey(settings)) || 'null')
    return isRecord(value) && value.version === 1 && isRecord(value.files) ? value as unknown as CloudSyncIndex : null
  } catch { return null }
}

function writeLocalIndex(settings: CloudSyncSettings, index: CloudSyncIndex, storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) return
  try { storage.setItem(stateKey(settings), JSON.stringify(index)) } catch {}
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2) + '\n'
}

export function createCloudSyncFiles(
  banks: QuestionBank[],
  folders: Record<string, string>,
  rounds: StudyRounds,
  settings: UserSettings,
  notes: QuestionNotes,
  errorRecords: QuestionErrorRecords,
  personalNotebooks: PersonalNotebooks,
  includeBanks = false,
): CloudSyncFile[] {
  const files: CloudSyncFile[] = [{
    path: USER_DATA_PATH,
    content: stringifyJson(createWorkspaceUserData(rounds, settings, notes, errorRecords, personalNotebooks)),
  }]
  if (includeBanks) files.unshift({ path: MANIFEST_PATH, content: stringifyJson(createWorkspaceManifest(banks, folders)) })
  return files
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength
}

async function sha256(value: string) {
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error('当前浏览器不支持 OneDrive 同步所需的加密摘要功能')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), item => item.toString(16).padStart(2, '0')).join('')
}

function base64Url(value: Uint8Array) {
  let binary = ''
  value.forEach(item => { binary += String.fromCharCode(item) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

function randomUrlToken(length = 32) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

function oauthError(value: unknown) {
  return isRecord(value) && typeof value.error_description === 'string' ? value.error_description : 'OneDrive 授权失败，请检查应用注册和重定向地址'
}

export async function startOneDriveSignIn(settings: CloudSyncSettings, storage: Storage | null = typeof window === 'undefined' ? null : window.sessionStorage) {
  const clientId = oneDriveClientId(settings)
  const redirectUri = oneDriveRedirectUri(settings)
  if (!clientId) throw new Error('当前版本尚未配置 OneDrive 网页授权应用，请联系应用维护者')
  if (!redirectUri) throw new Error('当前页面没有可用的 OneDrive 回调地址')
  if (!storage) throw new Error('当前环境不支持 OneDrive 登录会话')
  const verifier = randomUrlToken(48)
  const state = randomUrlToken(24)
  storage.setItem(PKCE_VERIFIER_KEY, verifier)
  storage.setItem(PKCE_STATE_KEY, state)
  const challenge = await pkceChallenge(verifier)
  const url = new URL(`${AUTH_ROOT}/authorize`)
  url.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, response_mode: 'query', scope: GRAPH_SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString()
  window.location.assign(url.toString())
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(`${AUTH_ROOT}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(oauthError(payload))
  return payload as { access_token: string; refresh_token?: string; expires_in?: number }
}

export async function completeOneDriveSignIn(
  settings: CloudSyncSettings,
  storage: Storage | null = typeof window === 'undefined' ? null : window.sessionStorage,
  tokenStorage: Storage | null = typeof window === 'undefined' ? null : window.localStorage,
) {
  if (typeof window === 'undefined' || !storage || !tokenStorage) return false
  const clientId = oneDriveClientId(settings)
  const redirectUri = oneDriveRedirectUri(settings)
  if (!clientId || !redirectUri) throw new Error('当前版本尚未配置 OneDrive 网页授权应用，请联系应用维护者')
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const error = params.get('error_description') || params.get('error')
  if (!code && !error) return false
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`)
  if (error) throw new Error(error)
  if (!code) throw new Error('OneDrive 未返回授权码，请重新登录')
  const expectedState = storage.getItem(PKCE_STATE_KEY)
  const verifier = storage.getItem(PKCE_VERIFIER_KEY)
  if (!expectedState || expectedState !== returnedState || !verifier) throw new Error('OneDrive 授权状态校验失败，请重新登录')
  const payload = await tokenRequest(new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri, scope: GRAPH_SCOPES, code_verifier: verifier }))
  tokenStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: payload.access_token, refreshToken: payload.refresh_token, expiresAt: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000 }))
  storage.removeItem(PKCE_STATE_KEY)
  storage.removeItem(PKCE_VERIFIER_KEY)
  return true
}

async function accessToken(settings: CloudSyncSettings, storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage) {
  if (!storage) throw new Error('当前环境不支持 OneDrive 登录会话')
  let session: OneDriveSession | null = null
  try { session = JSON.parse(storage.getItem(SESSION_KEY) || 'null') as OneDriveSession | null } catch {}
  if (!session?.accessToken) throw new Error('请先登录 OneDrive')
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken
  if (!session.refreshToken) throw new Error('OneDrive 登录已过期，请重新登录')
  const payload = await tokenRequest(new URLSearchParams({ client_id: oneDriveClientId(settings), grant_type: 'refresh_token', refresh_token: session.refreshToken, scope: GRAPH_SCOPES }))
  storage.setItem(SESSION_KEY, JSON.stringify({ accessToken: payload.access_token, refreshToken: payload.refresh_token || session.refreshToken, expiresAt: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000 }))
  return payload.access_token
}

function pathSegments(path: string) {
  return path.split('/').map(item => item.trim()).filter(Boolean).map(encodeURIComponent).join('/')
}

class OneDriveClient {
  constructor(private readonly settings: CloudSyncSettings) {}

  private async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${await accessToken(this.settings)}`)
    headers.set('Cache-Control', 'no-store')
    return fetch(`${GRAPH_ROOT}${path}`, { ...init, headers })
  }

  private approotItemPath(path: string) {
    const suffix = path ? `:/${pathSegments(path)}:` : ''
    return `/me/drive/special/approot${suffix}`
  }

  private itemPath(path: string) {
    const root = this.settings.remotePath.trim().replace(/^\/+|\/+$/g, '')
    const fullPath = [root, path].filter(Boolean).join('/')
    return this.approotItemPath(fullPath)
  }

  async readText(path: string) {
    const response = await this.request(`${this.itemPath(path)}/content`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`OneDrive 读取失败（${response.status}）`)
    return response.text()
  }

  private async ensureFolder(path: string) {
    let current = ''
    const rootSegments = this.settings.remotePath.split('/').map(item => item.trim()).filter(Boolean)
    const pathSegmentsToCreate = path.split('/').map(item => item.trim()).filter(Boolean)
    for (const segment of [...rootSegments, ...pathSegmentsToCreate]) {
      const next = current ? `${current}/${segment}` : segment
      const existing = await this.request(this.approotItemPath(next))
      if (existing.ok) { current = next; continue }
      if (existing.status !== 404) throw new Error(`OneDrive 检查目录失败（${existing.status}）`)
      const response = await this.request(`${this.approotItemPath(current)}/children`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: segment, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) })
      if (!response.ok && response.status !== 409) throw new Error(`OneDrive 创建目录失败（${response.status}）`)
      current = next
    }
  }

  async writeText(path: string, content: string) {
    if (byteLength(content) > 250 * 1024 * 1024) throw new Error('当前版本暂不支持超过 250 MB 的 OneDrive 文件')
    const parent = path.split('/').slice(0, -1).join('/')
    if (parent) await this.ensureFolder(parent)
    const response = await this.request(`${this.itemPath(path)}/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: content })
    if (!response.ok) throw new Error(`OneDrive 写入失败（${response.status}）`)
  }
}

function emptyIndex(id: string): CloudSyncIndex {
  return { version: 1, updatedAt: new Date(0).toISOString(), deviceId: id, files: {} }
}

function validRemoteIndex(value: unknown): CloudSyncIndex | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.files)) return null
  const files: Record<string, CloudSyncEntry> = {}
  Object.entries(value.files).forEach(([path, item]) => {
    if (!isRecord(item) || typeof item.hash !== 'string' || typeof item.updatedAt !== 'string' || typeof item.deviceId !== 'string') return
    files[path] = { path, hash: item.hash, size: typeof item.size === 'number' ? item.size : 0, updatedAt: item.updatedAt, deviceId: item.deviceId, ...(typeof item.deletedAt === 'string' ? { deletedAt: item.deletedAt } : {}) }
  })
  return { version: 1, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(), deviceId: typeof value.deviceId === 'string' ? value.deviceId : '', files }
}

function mergeRecordByUpdatedAt<T extends { updatedAt: string }>(local: Record<string, T>, remote: Record<string, T>) {
  const merged: Record<string, T> = { ...remote }
  Object.entries(local).forEach(([key, value]) => {
    const previous = merged[key]
    merged[key] = !previous || value.updatedAt >= previous.updatedAt ? value : previous
  })
  return merged
}

function mergeNotebooks(local: PersonalNotebooks, remote: PersonalNotebooks): PersonalNotebooks {
  const byId = new Map(remote.map(item => [item.id, item]))
  local.forEach(notebook => {
    const previous = byId.get(notebook.id)
    if (!previous) byId.set(notebook.id, notebook)
    else {
      const notes = mergeRecordByUpdatedAt(Object.fromEntries(notebook.notes.map(note => [note.id, note])), Object.fromEntries(previous.notes.map(note => [note.id, note])))
      byId.set(notebook.id, { ...(notebook.updatedAt >= previous.updatedAt ? notebook : previous), notes: Object.values(notes) })
    }
  })
  return validatePersonalNotebooks([...byId.values()])
}

export function mergeCloudSyncUserData(local: WorkspaceUserData | null | undefined, remote: WorkspaceUserData): WorkspaceUserData {
  const localRounds = validateStudyRounds(local?.rounds)
  const remoteRounds = validateStudyRounds(remote.rounds)
  const rounds: StudyRounds = {}
  new Set([...Object.keys(remoteRounds), ...Object.keys(localRounds)]).forEach(key => {
    const left = localRounds[key] || { statuses: {}, activities: [] }
    const right = remoteRounds[key] || { statuses: {}, activities: [] }
    rounds[key] = { statuses: { ...right.statuses, ...left.statuses }, activities: mergeStudyActivities(validateStudyActivities(left.activities), validateStudyActivities(right.activities)) }
  })
  const notes = mergeRecordByUpdatedAt(validateQuestionNotes(local?.notes), validateQuestionNotes(remote.notes))
  return createWorkspaceUserData(
    rounds,
    validateUserSettings({ ...DEFAULT_USER_SETTINGS, ...remote.settings, ...local?.settings }),
    notes,
    mergeRecordByUpdatedAt(validateQuestionErrorRecords(local?.errorRecords), validateQuestionErrorRecords(remote.errorRecords)),
    mergeNotebooks(validatePersonalNotebooks(local?.personalNotebooks), validatePersonalNotebooks(remote.personalNotebooks)),
  )
}

export function mergeCloudSyncManifest(local: WorkspaceManifest | null | undefined, remote: WorkspaceManifest): WorkspaceManifest {
  const banks = new Map((Array.isArray(remote.banks) ? remote.banks : []).map(bank => [bank.id, bank]))
  ;(Array.isArray(local?.banks) ? local.banks : []).forEach(bank => banks.set(bank.id, bank))
  return { ...remote, banks: [...banks.values()], folders: { ...(remote.folders || {}), ...(local?.folders || {}) }, updatedAt: new Date().toISOString() }
}

function mergeFile(path: string, localContent: string, remoteContent: string) {
  try {
    if (path === USER_DATA_PATH) return { content: stringifyJson(mergeCloudSyncUserData(JSON.parse(localContent) as WorkspaceUserData, JSON.parse(remoteContent) as WorkspaceUserData)), merged: true }
    if (path === MANIFEST_PATH) return { content: stringifyJson(mergeCloudSyncManifest(JSON.parse(localContent) as WorkspaceManifest, JSON.parse(remoteContent) as WorkspaceManifest)), merged: true }
  } catch {}
  return { content: localContent, merged: false }
}

function conflictPath(path: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `sync/conflicts/${stamp}-${path.replaceAll('/', '__')}`
}

export async function syncCloudFiles(settings: CloudSyncSettings, files: CloudSyncFile[], storage: Storage | null = typeof window === 'undefined' ? null : window.localStorage): Promise<CloudSyncResult> {
  if (!isOneDriveWebAuthConfigured(settings)) throw new Error('当前版本尚未配置 OneDrive 网页授权应用，请联系应用维护者')
  const client = new OneDriveClient(settings)
  const id = deviceId(storage)
  const previous = readLocalIndex(settings, storage)
  const rawRemoteIndex = await client.readText(INDEX_PATH)
  const remoteIndex = rawRemoteIndex ? validRemoteIndex(JSON.parse(rawRemoteIndex)) : null
  if (rawRemoteIndex && !remoteIndex) throw new Error('OneDrive 同步索引格式无法识别')
  const firstSync = !previous
  const localByPath = new Map(files.map(file => [file.path, file]))
  const localEntries = new Map<string, CloudSyncEntry>()
  for (const file of files) {
    const hash = await sha256(file.content)
    localEntries.set(file.path, { path: file.path, hash, size: byteLength(file.content), updatedAt: new Date().toISOString(), deviceId: id })
  }
  const nextFiles = new Map(localByPath)
  const nextIndex: CloudSyncIndex = remoteIndex || emptyIndex(id)
  const conflicts: string[] = []
  let uploaded = 0
  let downloaded = 0
  const paths = new Set([...localByPath.keys(), ...Object.keys(nextIndex.files)])

  for (const path of paths) {
    const local = localByPath.get(path)
    const localEntry = localEntries.get(path)
    const remoteEntry = nextIndex.files[path]
    const previousEntry = previous?.files[path]
    if (!remoteEntry || remoteEntry.deletedAt) {
      if (local && localEntry) { await client.writeText(path, local.content); nextIndex.files[path] = localEntry; uploaded++ }
      continue
    }
    if (!local || !localEntry) {
      const content = await client.readText(path)
      if (content !== null) { nextFiles.set(path, { path, content }); downloaded++ }
      continue
    }
    if (remoteEntry.hash === localEntry.hash) { nextIndex.files[path] = remoteEntry; continue }
    const localChanged = !previousEntry || localEntry.hash !== previousEntry.hash
    const remoteChanged = !previousEntry || remoteEntry.hash !== previousEntry.hash
    if (firstSync || (!localChanged && remoteChanged)) {
      const content = await client.readText(path)
      if (content !== null) { nextFiles.set(path, { path, content }); nextIndex.files[path] = remoteEntry; downloaded++ }
      continue
    }
    if (localChanged && !remoteChanged) { await client.writeText(path, local.content); nextIndex.files[path] = localEntry; uploaded++; continue }
    const remoteContent = await client.readText(path)
    if (remoteContent === null) continue
    const merged = mergeFile(path, local.content, remoteContent)
    if (!merged.merged) { await client.writeText(conflictPath(path), remoteContent); conflicts.push(path) }
    const hash = await sha256(merged.content)
    const mergedEntry = { path, hash, size: byteLength(merged.content), updatedAt: new Date().toISOString(), deviceId: id }
    await client.writeText(path, merged.content)
    nextFiles.set(path, { path, content: merged.content })
    nextIndex.files[path] = mergedEntry
    uploaded++
  }
  nextIndex.updatedAt = new Date().toISOString()
  nextIndex.deviceId = id
  await client.writeText(INDEX_PATH, stringifyJson(nextIndex))
  writeLocalIndex(settings, nextIndex, storage)
  return { files: [...nextFiles.values()], uploaded, downloaded, conflicts, firstSync }
}

export function cloudSyncUserDataPath() { return USER_DATA_PATH }
export function cloudSyncManifestPath() { return MANIFEST_PATH }
