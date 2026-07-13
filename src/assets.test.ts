import { describe, expect, it } from 'vitest'
import { parseStructuredImagePath } from './assets'

describe('parseStructuredImagePath', () => {
  it('识别最新 Q/A 命名和点号分片格式', () => {
    expect(parseStructuredImagePath('01 行列式 1-基础/Q-01-1-01.2.png', 'Q-01-1-01.2.png')).toMatchObject({ chapterCode: '01', chapterName: '行列式', sectionCode: '1', sectionName: '基础', questionCode: '01', kind: 'question', order: 2 })
    expect(parseStructuredImagePath('01 行列式 1-基础/A-01-1-01.png', 'A-01-1-01.png')).toMatchObject({ kind: 'answer', order: 1 })
  })

  it('没有标准文件夹标题时生成安全的默认名称', () => {
    expect(parseStructuredImagePath('导入/Q-02-3-08.2.jpg', 'Q-02-3-08.2.jpg')).toMatchObject({ chapterName: '第 02 章', sectionName: '第 3 节', kind: 'question', order: 2 })
  })

  it('严格拒绝历史文件名和带尾缀目录', () => {
    expect(parseStructuredImagePath('01 行列式 1-基础/01-1-01.png', '01-1-01.png')).toBeNull()
    expect(parseStructuredImagePath('01 行列式 1-基础.old/Q-01-1-01.png', 'Q-01-1-01.png')).toMatchObject({ chapterName: '第 01 章', sectionName: '第 1 节' })
  })

  it('支持无固定上限的分片序号', () => {
    expect(parseStructuredImagePath('01 行列式 1-基础/A-01-1-03.5000.png', 'A-01-1-03.5000.png')).toMatchObject({ questionCode: '03', kind: 'answer', order: 5000 })
  })
})
