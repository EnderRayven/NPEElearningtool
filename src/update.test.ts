import { describe, expect, it } from 'vitest'
import { compareAppVersions, isNewerAppVersion, parseGitHubRelease } from './update'

describe('应用更新版本处理', () => {
  it('按语义版本比较正式版与预发布版', () => {
    expect(compareAppVersions('v0.4.10', '0.4.9')).toBeGreaterThan(0)
    expect(compareAppVersions('0.4.9', '0.4.10')).toBeLessThan(0)
    expect(compareAppVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareAppVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0)
  })

  it('只把新版本识别为可更新', () => {
    expect(isNewerAppVersion('0.5.0', '0.4.5')).toBe(true)
    expect(isNewerAppVersion('0.4.5', '0.4.5')).toBe(false)
    expect(isNewerAppVersion('0.4.4', '0.4.5')).toBe(false)
  })

  it('从 GitHub Release 提取软件更新包', () => {
    const release = parseGitHubRelease({
      tag_name: 'v0.5.0',
      name: '应用更新',
      body: '- 修复更新流程',
      published_at: '2026-08-09T00:00:00Z',
      html_url: 'https://github.com/EnderRayven/NPEElearningtool/releases/tag/v0.5.0',
      assets: [
        { name: 'NPEE-Study-Space-v0.5.0-Question-Bank.zip', browser_download_url: 'https://example.test/data.zip', size: 200 },
        { name: 'NPEE-Study-Space-v0.5.0-Software.zip', browser_download_url: 'https://example.test/software.zip', size: 100 },
      ],
    })
    expect(release.version).toBe('0.5.0')
    expect(release.softwareAsset).toMatchObject({ name: 'NPEE-Study-Space-v0.5.0-Software.zip', size: 100 })
  })
})
