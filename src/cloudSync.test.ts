import { describe, expect, it } from 'vitest'
import { createCloudSyncFiles, DEFAULT_CLOUD_SYNC_SETTINGS, hasOneDriveSession, loadCloudSyncSettings, loadLastSuccessfulSyncAt, mergeCloudSyncUserData, oneDriveClientId, resetLastSuccessfulSyncAt, saveCloudSyncSettings, signOutOneDrive } from './cloudSync'
import { createWorkspaceUserData } from './workspace'

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
