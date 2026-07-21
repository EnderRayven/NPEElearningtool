import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAssetBlobs, getAssetRevision, parseStructuredImagePath, putAssets, readableAssetStorageError, subscribeAssetChanges } from './assets'

afterEach(() => vi.unstubAllGlobals())

describe('parseStructuredImagePath', () => {
  it('将 Chrome Blob 写入故障转换为可操作的中文提示', () => {
    expect(readableAssetStorageError(new Error('Failed to write blobs (TimestampError)')).message).toContain('刷新页面')
    expect(readableAssetStorageError(new Error('IO error: Unable to create writable file')).message).toContain('文件夹读取')
  })

  it('只识别最新目录和 Q/A 分片格式', () => {
    expect(parseStructuredImagePath('01 行列式 01-基础/Q-01-1-01.1.png', 'Q-01-1-01.1.png')).toMatchObject({ chapterCode: '01', chapterName: '行列式', sectionCode: '1', sectionName: '基础', questionCode: '01', kind: 'question', order: 1 })
    expect(parseStructuredImagePath('01 行列式 01-基础/A-01-1-01.2.png', 'A-01-1-01.2.png')).toMatchObject({ kind: 'answer', order: 2 })
  })

  it('拒绝非标准目录、缺少首图序号和未补齐的题号', () => {
    expect(parseStructuredImagePath('01 行列式 1-基础/Q-01-1-01.1.png', 'Q-01-1-01.1.png')).toBeNull()
    expect(parseStructuredImagePath('01 行列式 01-基础/Q-01-1-01.png', 'Q-01-1-01.png')).toBeNull()
    expect(parseStructuredImagePath('导入/Q-1-1-1.1.png', 'Q-1-1-1.1.png')).toBeNull()
    expect(parseStructuredImagePath('01 行列式 01-基础/01-1-01.png', '01-1-01.png')).toBeNull()
  })

  it('支持无固定上限的分片序号', () => {
    expect(parseStructuredImagePath('01 行列式 01-基础/A-01-1-03.5000.png', 'A-01-1-03.5000.png')).toMatchObject({ questionCode: '03', kind: 'answer', order: 5000 })
  })

  it('从强化36讲目录中读取学科和真实讲次标题', () => {
    expect(parseStructuredImagePath('01 高数18讲 01-第1讲 函数极限与连续/Q-01-1-01.1.png', 'Q-01-1-01.1.png')).toMatchObject({ chapterName: '高数18讲', sectionName: '第1讲 函数极限与连续' })
    expect(parseStructuredImagePath('02 线代9讲 07-第7讲 特征值与特征向量/Q-02-7-01.1.png', 'Q-02-7-01.1.png')).toMatchObject({ chapterName: '线代9讲', sectionName: '第7讲 特征值与特征向量' })
  })

  it('URL 素材只保存在内存，不依赖 IndexedDB 写入', async () => {
    const payload = new Blob(['image'], { type: 'image/png' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(payload, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('indexedDB', undefined)
    await putAssets([{ key: 'default/question.png', file: new File([], 'question.png', { type: 'image/png' }), url: '/api/default-workspace/file?path=question.png' }])
    const result = await getAssetBlobs(['default/question.png'])
    expect(fetchMock).toHaveBeenCalledWith('/api/default-workspace/file?path=question.png')
    expect(result).toHaveLength(1)
    expect(await result[0].text()).toBe('image')
  })

  it('工作区素材注册后通知当前题目重新加载', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const listener = vi.fn()
    const unsubscribe = subscribeAssetChanges(listener)
    const previousRevision = getAssetRevision()
    await putAssets([{ key: 'default/restored.png', file: new File([], 'restored.png'), url: '/api/default-workspace/file?path=restored.png' }])
    expect(getAssetRevision()).toBeGreaterThan(previousRevision)
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
