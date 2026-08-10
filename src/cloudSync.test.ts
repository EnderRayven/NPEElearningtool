import { describe, expect, it, vi } from 'vitest'
import { createCloudSyncFiles, DEFAULT_CLOUD_SYNC_SETTINGS, hasOneDriveSession, loadCloudSyncSettings, loadLastSuccessfulSyncAt, mergeCloudSyncManifest, mergeCloudSyncUserData, oneDriveClientId, resetLastSuccessfulSyncAt, saveCloudSyncSettings, signOutOneDrive, syncCloudFiles } from './cloudSync'
import { createWorkspaceManifest, createWorkspaceUserData } from './workspace'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

const emptyDrawing = { version: 1 as const, aspectRatio: 5 / 3, strokes: [] }
const note = (updatedAt: string, text: string) => ({ text, drawing: emptyDrawing, updatedAt })

describe('cloud sync data model', () => {
  it('stores the user data file by default and adds the manifest on request', () => {
    const files = createCloudSyncFiles([], {}, { '1': { statuses: {}, activities: [] } }, { activeRound: 1, roundCount: 5 }, {}, {}, [], false)
    expect(files.map(file => file.path)).toEqual(['用户数据/用户数据.json'])
    expect(createCloudSyncFiles([], {}, { '1': { statuses: {}, activities: [] } }, { activeRound: 1, roundCount: 5 }, {}, {}, [], true).map(file => file.path)).toEqual(['默认题库/题库数据.json', '用户数据/用户数据.json'])
  })

  it('preserves bank deletion tombstones when manifests merge', () => {
    const bank = (id: string) => ({ id, name: id, source: 'local' as const, chapters: [] })
    const local = createWorkspaceManifest([bank('local-bank')], { 'local-bank': '本地题库' }, { 'deleted-bank': '2026-08-10T10:00:00.000Z' })
    const remote = createWorkspaceManifest([bank('remote-bank'), bank('deleted-bank')], { 'remote-bank': '远端题库', 'deleted-bank': '旧题库' }, { 'deleted-bank': '2026-08-09T10:00:00.000Z' })
    const merged = mergeCloudSyncManifest(local, remote)
    expect(merged.banks.map(item => item.id).sort()).toEqual(['local-bank', 'remote-bank'])
    expect(merged.folders).toEqual({ 'local-bank': '本地题库', 'remote-bank': '远端题库' })
    expect(merged.deletedBankIds).toEqual({ 'deleted-bank': '2026-08-10T10:00:00.000Z' })
  })

  it('publishes a tombstone when a previously synced bank image is deleted locally', async () => {
    const settings = { ...DEFAULT_CLOUD_SYNC_SETTINGS, clientId: 'client-id', redirectUri: 'http://localhost:45217/', remotePath: 'study-space', includeBanks: true }
    const storage = new MemoryStorage()
    storage.setItem('npee:onedrive-sync-session:v1', JSON.stringify({ accessToken: 'token', expiresAt: Date.now() + 300_000 }))
    const currentFiles = createCloudSyncFiles([], {}, { '1': { statuses: {}, activities: [] } }, { activeRound: 1, roundCount: 5 }, {}, {}, [], true)
    const imagePath = '题库图片/数学/高数/本地题库/question.png'
    const previousIndex = {
      version: 1 as const,
      updatedAt: '2026-08-09T10:00:00.000Z',
      deviceId: 'old-device',
      files: Object.fromEntries([
        ...currentFiles.map(file => [file.path, { path: file.path, hash: `${file.path}-old-hash`, size: 1, updatedAt: '2026-08-09T10:00:00.000Z', deviceId: 'old-device', contentType: 'text' as const }]),
        [imagePath, { path: imagePath, hash: 'image-old-hash', size: 3, updatedAt: '2026-08-09T10:00:00.000Z', deviceId: 'old-device', contentType: 'binary' as const, mimeType: 'image/png' }],
      ]),
    }
    storage.setItem(`npee:onedrive-sync-state:v1:${oneDriveClientId(settings)}|study-space`, JSON.stringify(previousIndex))
    let writtenIndex = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/sync/index.json:/content')) {
        if (init?.method === 'PUT') writtenIndex = String(init.body || '')
        else return new Response(JSON.stringify(previousIndex), { status: 200 })
      }
      return new Response('', { status: 200 })
    }))
    try {
      const result = await syncCloudFiles(settings, currentFiles, storage)
      const syncedIndex = JSON.parse(writtenIndex) as typeof previousIndex
      expect(result.conflicts).toEqual([])
      expect(result.files.some(file => file.path === imagePath)).toBe(false)
      expect(syncedIndex.files[imagePath].deletedAt).toEqual(expect.any(String))
      expect(syncedIndex.files[imagePath].hash).toBe('')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('merges independent round statuses and keeps the newer note', () => {
    const local = createWorkspaceUserData(
      { '1': { statuses: { local: 'wrong' }, activities: [] } },
      { activeRound: 1, roundCount: 5 },
      { localNote: note('2026-08-09T10:00:00.000Z', 'local') },
    )
    const remote = createWorkspaceUserData(
      { '1': { statuses: { remote: 'proficient' }, activities: [] } },
      { activeRound: 1, roundCount: 5 },
      { localNote: note('2026-08-09T11:00:00.000Z', 'remote') },
    )
    const merged = mergeCloudSyncUserData(local, remote)
    expect(merged.rounds?.['1'].statuses).toEqual({ remote: 'proficient', local: 'wrong' })
    expect(merged.notes?.localNote.text).toBe('remote')
  })

  it('persists only non-secret OneDrive settings', () => {
    const storage = new MemoryStorage()
    const settings = { ...DEFAULT_CLOUD_SYNC_SETTINGS, clientId: 'client-id', redirectUri: 'https://example.test/', includeBanks: true, autoSyncMinutes: 15, startupSyncDelaySeconds: 30, showLastSuccessfulSync: false }
    expect(saveCloudSyncSettings(settings, storage)).toBe(true)
    expect(loadCloudSyncSettings(storage)).toMatchObject({ ...settings, clientId: oneDriveClientId(settings) })
  })

  it('keeps the last successful sync time separate from sync settings', () => {
    const storage = new MemoryStorage()
    const settings = { ...DEFAULT_CLOUD_SYNC_SETTINGS, clientId: 'client-id', remotePath: 'study-space' }
    storage.setItem(`npee:onedrive-sync-last-success:v1:${oneDriveClientId(settings)}|study-space`, '2026-08-09T09:00:00.000Z')
    expect(loadLastSuccessfulSyncAt(settings, storage)).toBe('2026-08-09T09:00:00.000Z')
    expect(resetLastSuccessfulSyncAt(settings, storage)).toBe(true)
    expect(loadLastSuccessfulSyncAt(settings, storage)).toBe('')
  })

  it('keeps the browser login session until the user signs out', () => {
    const storage = new MemoryStorage()
    storage.setItem('npee:onedrive-sync-session:v1', JSON.stringify({ accessToken: 'token', refreshToken: 'refresh-token', expiresAt: Date.now() - 1 }))
    expect(hasOneDriveSession(storage)).toBe(true)
    signOutOneDrive(storage, null)
    expect(hasOneDriveSession(storage)).toBe(false)
  })
})
