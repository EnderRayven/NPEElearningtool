import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownNoteEditor, MarkdownNotePreview } from './MarkdownNote'

describe('MarkdownNote', () => {
  it('renders Markdown and LaTeX as a live preview without treating HTML as markup', () => {
    const markup = renderToStaticMarkup(createElement(MarkdownNotePreview, {
      source: '# 结论\n\n**重点**：$x^2$\n\n<script>alert(1)</script>',
    }))

    expect(markup).toContain('<h1>结论</h1>')
    expect(markup).toContain('<strong>重点</strong>')
    expect(markup).toContain('class="katex"')
    expect(markup).not.toContain('alert(1)')
    expect(markup).not.toContain('<script>')
  })

  it('mounts one WYSIWYG editing surface for Markdown and formulas', () => {
    const markup = renderToStaticMarkup(createElement(MarkdownNoteEditor, { value: '$x$', onChange: () => {} }))
    expect(markup).toContain('class="markdown-note-editor"')
    expect(markup).toContain('data-markdown-note-editor')
    expect(markup).not.toContain('常用快捷键')
    expect(markup).not.toContain('markdown-note-shortcut-hints')
    expect(markup).not.toContain('markdown-note-input')
    expect(markup).not.toContain('data-markdown-note-preview')
  })
})
