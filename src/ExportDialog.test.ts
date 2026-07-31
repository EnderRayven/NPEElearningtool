import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ExportDialog, { dateFolderName, estimatedExportNoteHeight, exportDrawingHeightForNote, exportEntriesForScope, exportQuestionsPerPage, ExportPage, filterQuestionsForExport, filterQuestionsWithNotes, imageExportFolderName, imageExportRootFolderName, originalAssetName, paginateNotesForExport, splitPages } from './ExportDialog'
import type { Question } from './types'
import { isImageAnswerPlaceholder } from './questionPresentation'

const questions: Question[] = Array.from({ length: 5 }, (_, index) => ({
  id: `q-${index + 1}`, number: index + 1, type: '图片题', text: '', answer: '答案', analysis: '解析'
}))

describe('export selection', () => {
  it('识别答案图的无效占位文字', () => {
    expect(isImageAnswerPlaceholder('见答案图片')).toBe(true)
    expect(isImageAnswerPlaceholder('见答案图片。')).toBe(true)
    expect(isImageAnswerPlaceholder('A. 真实答案')).toBe(false)
  })

  it('支持每页一题或两题', () => {
    expect(splitPages(questions, 1).map(page => page.length)).toEqual([1, 1, 1, 1, 1])
    expect(splitPages(questions, 2).map(page => page.length)).toEqual([2, 2, 1])
  })

  it('包含笔记时使用单题分页，避免笔记挤出页面', () => {
    expect(exportQuestionsPerPage(2, true)).toBe(1)
    expect(exportQuestionsPerPage(2, false)).toBe(2)
    expect(exportQuestionsPerPage(1, true)).toBe(1)
  })

  it('从独立笔记入口打开时只显示笔记导出选项', () => {
    const bank = {
      id: 'bank-1',
      name: '测试题库',
      source: 'local' as const,
      chapters: [{ id: 'chapter-1', name: '第一章', sections: [{ id: 'section-1', name: '选择题', questions }] }],
    }
    const markup = renderToStaticMarkup(createElement(ExportDialog, {
      banks: [bank],
      statuses: {},
      notes: {},
      defaultBankId: bank.id,
      defaultSectionId: 'section-1',
      mode: 'notes',
      onClose: () => {},
      onPdf: () => {},
      onNotice: () => {},
    }))
    expect(markup).toContain('<h2 id="export-title">导出笔记</h2>')
    expect(markup).toContain('仅含有笔记的题目')
    expect(markup).toContain('当前范围内没有可导出的笔记')
    expect(markup).not.toContain('复制原图到文件夹')
  })

  it('支持整库、整章和整节，并保留题目来源', () => {
    const bank = {
      id: 'bank-1', name: '测试题库', source: 'local' as const, chapters: [
        { id: 'chapter-1', name: '第一章', sections: [
          { id: 'section-1', name: '选择题', questions: [questions[0], questions[1]] },
          { id: 'section-2', name: '判断题', questions: [questions[2]] },
        ] },
        { id: 'chapter-2', name: '第二章', sections: [
          { id: 'section-3', name: '简答题', questions: [questions[3], questions[4]] },
        ] },
      ],
    }
    expect(exportEntriesForScope(bank, 'section', 'chapter-1', 'section-2').map(entry => entry.question.id)).toEqual(['q-3'])
    expect(exportEntriesForScope(bank, 'chapter', 'chapter-1', 'section-1').map(entry => entry.question.id)).toEqual(['q-1', 'q-2', 'q-3'])
    expect(exportEntriesForScope(bank, 'bank', 'chapter-1', 'section-1').map(entry => entry.question.id)).toEqual(['q-1', 'q-2', 'q-3', 'q-4', 'q-5'])
    expect(exportEntriesForScope(bank, 'bank', 'chapter-1', 'section-1')[3]).toMatchObject({ chapterName: '第二章', sectionName: '简答题' })
  })

  it('为原图复制生成稳定的日期目录和原始文件名', () => {
    expect(dateFolderName(new Date(2026, 6, 14))).toBe('2026-07-14')
    expect(originalAssetName('bank/question/1-Q-02-3-06.1.png')).toBe('Q-02-3-06.1.png')
    expect(imageExportFolderName('880/线代', '02 矩阵', '综合', new Date(2026, 6, 14))).toBe('2026-07-14-880-线代-02 矩阵-综合')
    expect(imageExportRootFolderName('880/线代', 'bank', '', new Date(2026, 6, 14))).toBe('2026-07-14-880-线代-整库')
    expect(imageExportRootFolderName('880/线代', 'chapter', '02 矩阵', new Date(2026, 6, 14))).toBe('2026-07-14-880-线代-02 矩阵')
  })

  it('按学习状态筛选并把缺省状态视为未标记', () => {
    const statuses = { 'q-1': 'wrong', 'q-2': 'proficient', 'q-3': 'vague' } as const
    expect(filterQuestionsForExport(questions, 'wrong', statuses).map(question => question.id)).toEqual(['q-1'])
    expect(filterQuestionsForExport(questions, 'review', statuses).map(question => question.id)).toEqual(['q-1', 'q-3'])
    expect(filterQuestionsForExport(questions, 'none', statuses)).toHaveLength(2)
    expect(filterQuestionsForExport(questions, 'all', statuses)).toHaveLength(5)
  })

  it('导出页面只包含题目，不包含答案与解析', () => {
    const markup = renderToStaticMarkup(createElement(ExportPage, { questions: [{ ...questions[0], text: '题目正文', answer: '秘密答案', analysis: '秘密解析' }], statuses: { 'q-1': 'vague' }, questionContext: { 'q-1': { chapterName: '第一章', sectionName: '选择题' } }, pageNumber: 1 }))
    expect(markup).toContain('题目正文')
    expect(markup).toContain('第一章 · 选择题')
    expect(markup).toContain('模糊')
    expect(markup).not.toContain('秘密答案')
    expect(markup).not.toContain('秘密解析')
  })

  it('按导出设置包含文字和手写笔记', () => {
    const markup = renderToStaticMarkup(createElement(ExportPage, {
      questions: [questions[0]],
      notes: {
        'q-1': {
          text: '注意换元范围',
          updatedAt: '2026-07-29T00:00:00.000Z',
          drawing: {
            version: 1,
            aspectRatio: 5 / 3,
            strokes: [{ id: 'stroke-1', color: '#8f3028', size: 2, input: 'pen', points: [{ x: .1, y: .2 }, { x: .3, y: .4 }] }],
          },
        },
      },
      pageNumber: 1,
    }))
    expect(markup).toContain('我的笔记')
    expect(markup).toContain('注意换元范围')
    expect(markup).toContain('aria-label="手写笔记"')
    expect(markup).toContain('<path')
  })

  it('笔记导出只保留有笔记的题号信息和笔记内容', () => {
    const notes = {
      'q-1': {
        text: '只导出这条笔记',
        updatedAt: '2026-07-29T00:00:00.000Z',
        drawing: { version: 1 as const, aspectRatio: 5 / 3, strokes: [] },
      },
    }
    expect(filterQuestionsWithNotes(questions, notes).map(question => question.id)).toEqual(['q-1'])
    const markup = renderToStaticMarkup(createElement(ExportPage, {
      questions: [{ ...questions[0], text: '不应出现的题干', options: ['A. 不应出现的选项'] }],
      statuses: { 'q-1': 'wrong' },
      questionContext: { 'q-1': { chapterName: '第一章', sectionName: '选择题' } },
      notes,
      pageNumber: 1,
      mode: 'notes',
    }))
    expect(markup).toContain('01')
    expect(markup).toContain('第一章 · 选择题')
    expect(markup).toContain('只导出这条笔记')
    expect(markup).toContain('class="export-note export-note-only"')
    expect(markup).not.toContain('<aside')
    expect(markup).not.toContain('不应出现的题干')
    expect(markup).not.toContain('不应出现的选项')
    expect(markup).not.toContain('错题')
  })

  it('裁掉手写笔记底部空白并保留安全边距', () => {
    const note = {
      text: '',
      updatedAt: '2026-07-29T00:00:00.000Z',
      drawing: {
        version: 1 as const,
        aspectRatio: 5 / 3,
        strokes: [{ id: 'stroke-1', color: '#8f3028', size: 2, input: 'pen' as const, points: [{ x: .1, y: .1 }, { x: .3, y: .25 }] }],
      },
    }
    expect(exportDrawingHeightForNote(note)).toBe(206)
    expect(exportDrawingHeightForNote(note)).toBeLessThan(600)
  })

  it('根据内容高度自动把多条短笔记排在同一页', () => {
    const shortNotes = Object.fromEntries(questions.slice(0, 4).map(question => [question.id, {
      text: '短笔记',
      updatedAt: '2026-07-29T00:00:00.000Z',
      drawing: { version: 1 as const, aspectRatio: 5 / 3, strokes: [] },
    }]))
    const pages = paginateNotesForExport(questions, shortNotes)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toHaveLength(4)
    expect(estimatedExportNoteHeight(shortNotes['q-1'])).toBeLessThan(200)
  })
})
