import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import { nodeViewCtx, prosePluginsCtx } from '@milkdown/kit/core'
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { codeBlockSchema } from '@milkdown/kit/preset/commonmark'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/kit/prose/view'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { toggleMark, wrapIn } from '@milkdown/kit/prose/commands'
import { $view } from '@milkdown/kit/utils'
import katex from 'katex'
import '@milkdown/crepe/theme/frame.css'
import '@milkdown/crepe/theme/common/reset.css'
import '@milkdown/crepe/theme/common/latex.css'
import '@milkdown/crepe/theme/common/list-item.css'
import '@milkdown/crepe/theme/common/toolbar.css'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { DEFAULT_MARKDOWN_SHORTCUTS, matchesShortcut, resolveMarkdownShortcutSettings, type MarkdownShortcutAction, type MarkdownShortcutSettings } from './shortcutSettings'

function createMarkdownShortcutPlugin(getShortcuts: () => MarkdownShortcutSettings) {
  const actionForEvent = (event: KeyboardEvent, shortcuts: MarkdownShortcutSettings): MarkdownShortcutAction | null => {
    return Object.entries(shortcuts).find(([, binding]) => matchesShortcut(event, binding))?.[0] as MarkdownShortcutAction | null
  }

  return new Plugin({
    handleKeyDown(view: EditorView, event: KeyboardEvent) {
      const shortcuts = getShortcuts()
      const action = actionForEvent(event, shortcuts)
      const isChangedDefault = Object.entries(DEFAULT_MARKDOWN_SHORTCUTS).some(([actionId, binding]) => matchesShortcut(event, binding) && !matchesShortcut(event, shortcuts[actionId as MarkdownShortcutAction]))
      if (!action && !isChangedDefault) return false
      event.preventDefault()
      if (!action) return true
      const { schema } = view.state
      if (action === 'bold' || action === 'italic' || action === 'inlineCode') {
        const markName = action === 'bold' ? 'strong' : action === 'italic' ? 'emphasis' : 'inlineCode'
        const mark = schema.marks[markName]
        return mark ? toggleMark(mark)(view.state, view.dispatch, view) : true
      }
      const list = schema.nodes[action === 'orderedList' ? 'ordered_list' : 'bullet_list']
      return list ? wrapIn(list)(view.state, view.dispatch, view) : true
    },
  })
}

function createHeadingMarkdownHintPlugin() {
  return new Plugin({
    props: {
      handleClick(view, pos, event) {
        const target = event.target
        if (!(target instanceof HTMLElement)) return false
        const heading = target.closest('h1, h2, h3, h4, h5, h6')
        if (!heading || !view.dom.contains(heading)) return false

        const headingPos = view.posAtDOM(heading, 0)
        const node = view.state.doc.nodeAt(headingPos)
        if (!node || node.type.name !== 'heading') return false

        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, headingPos + 1)))
        view.focus()
        return true
      },
      decorations(state) {
        const { $from } = state.selection
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const node = $from.node(depth)
          if (node.type.name !== 'heading') continue
          const from = $from.before(depth)
          const level = Number(node.attrs.level ?? 1)
          const prefix = `${'#'.repeat(Math.max(1, Math.min(6, level)))} `
          return DecorationSet.create(state.doc, [Decoration.node(from, from + node.nodeSize, {
            class: 'markdown-note-heading-active',
            'data-markdown-prefix': prefix,
          })])
        }
        return DecorationSet.empty
      },
    },
  })
}

function syncMathPreviewPlacement(dom: HTMLElement, preview: HTMLElement) {
  const formulaRect = dom.getBoundingClientRect()
  const previewRect = preview.getBoundingClientRect()
  let clipParent = dom.parentElement

  while (clipParent) {
    const style = getComputedStyle(clipParent)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') break
    clipParent = clipParent.parentElement
  }

  const clipRect = clipParent?.getBoundingClientRect()
  const top = Math.max(0, clipRect?.top ?? 0)
  const bottom = Math.min(window.innerHeight, clipRect?.bottom ?? window.innerHeight)
  const gap = 10
  const spaceAbove = formulaRect.top - top
  const spaceBelow = bottom - formulaRect.bottom
  const shouldPlaceAbove = spaceBelow < previewRect.height + gap && spaceAbove > spaceBelow

  dom.dataset.previewPlacement = shouldPlaceAbove ? 'above' : 'below'
}

function createInlineMathNodeView(node: ProseMirrorNode, view: Parameters<NodeViewConstructor>[1], getPos: Parameters<NodeViewConstructor>[2]): NodeView {
  let currentNode = node
  let editing = false
  let sourceElement: HTMLSpanElement | null = null
  let previewElement: HTMLDivElement | null = null

  const dom = document.createElement('span')
  dom.dataset.type = 'math_inline'
  dom.dataset.value = String(node.attrs.value ?? '')
  dom.className = 'markdown-note-math'
  dom.setAttribute('contenteditable', 'false')

  const getPosition = () => typeof getPos === 'function' ? getPos() : null

  const renderFormula = (value: string) => {
    dom.dataset.value = value
    dom.replaceChildren()
    katex.render(value, dom, { throwOnError: false })
  }

  const formulaSource = () => {
    const raw = sourceElement?.textContent ?? ''
    return raw.replace(/^\$/, '').replace(/\$$/, '')
  }

  const updateFormula = (value: string) => {
    const position = getPosition()
    if (position == null) return
    const transaction = view.state.tr.setNodeAttribute(position, 'value', value)
    view.dispatch(transaction)
    currentNode = view.state.doc.nodeAt(position) ?? currentNode
  }

  const renderPreview = (value: string) => {
    if (!previewElement) return
    previewElement.replaceChildren()
    katex.render(value || '\\,', previewElement, { throwOnError: false, displayMode: true })
    syncMathPreviewPlacement(dom, previewElement)
  }

  const finishEditing = () => {
    if (!editing) return
    const value = formulaSource()
    editing = false
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
    sourceElement?.removeEventListener('input', handleInput)
    sourceElement?.removeEventListener('keydown', handleSourceKeydown)
    document.removeEventListener('scroll', handlePreviewViewportChange, true)
    window.removeEventListener('resize', handlePreviewViewportChange)
    sourceElement = null
    previewElement = null
    dom.dataset.editing = 'false'
    dom.dataset.previewPlacement = 'below'
    dom.setAttribute('contenteditable', 'false')
    renderFormula(value)
    if (value !== String(currentNode.attrs.value ?? '')) updateFormula(value)
  }

  const handleDocumentPointerDown = (event: PointerEvent) => {
    if (!dom.contains(event.target as Node)) finishEditing()
  }

  const handlePreviewViewportChange = () => {
    if (editing && previewElement) syncMathPreviewPlacement(dom, previewElement)
  }

  const handleInput = () => {
    const value = formulaSource()
    dom.dataset.value = value
    updateFormula(value)
    renderPreview(value)
  }

  const handleSourceKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finishEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (sourceElement) sourceElement.textContent = `$${String(currentNode.attrs.value ?? '')}$`
      finishEditing()
    }
  }

  const enterEditing = () => {
    if (editing) return
    editing = true
    dom.dataset.editing = 'true'
    sourceElement = document.createElement('span')
    sourceElement.className = 'markdown-note-math-source'
    sourceElement.contentEditable = 'true'
    sourceElement.spellcheck = false
    sourceElement.textContent = `$${String(currentNode.attrs.value ?? '')}$`
    previewElement = document.createElement('div')
    previewElement.className = 'markdown-note-math-preview'
    previewElement.setAttribute('role', 'status')
    previewElement.setAttribute('aria-label', '公式预览')
    dom.replaceChildren(sourceElement, previewElement)
    renderPreview(String(currentNode.attrs.value ?? ''))
    syncMathPreviewPlacement(dom, previewElement)
    sourceElement.addEventListener('input', handleInput)
    sourceElement.addEventListener('keydown', handleSourceKeydown)
    document.addEventListener('pointerdown', handleDocumentPointerDown, true)
    document.addEventListener('scroll', handlePreviewViewportChange, true)
    window.addEventListener('resize', handlePreviewViewportChange)
    sourceElement.focus({ preventScroll: true })

    const textNode = sourceElement.firstChild
    if (textNode) {
      const selection = window.getSelection()
      const range = document.createRange()
      const end = Math.max(1, textNode.textContent?.length ?? 1)
      range.setStart(textNode, Math.min(1, end))
      range.setEnd(textNode, Math.max(1, end - 1))
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (!editing) {
      event.preventDefault()
      event.stopPropagation()
      enterEditing()
    }
  }

  dom.addEventListener('pointerdown', handlePointerDown)
  renderFormula(String(node.attrs.value ?? ''))

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      if (!editing) renderFormula(String(nextNode.attrs.value ?? ''))
      else {
        dom.dataset.value = String(nextNode.attrs.value ?? '')
        renderPreview(String(nextNode.attrs.value ?? ''))
      }
      return true
    },
    stopEvent(event) {
      return editing && Boolean(sourceElement?.contains(event.target as Node))
    },
    ignoreMutation() {
      return true
    },
    destroy() {
      finishEditing()
      dom.removeEventListener('pointerdown', handlePointerDown)
    },
  }
}

function createMathBlockNodeView(node: ProseMirrorNode, view: Parameters<NodeViewConstructor>[1], getPos: Parameters<NodeViewConstructor>[2]): NodeView {
  const language = String(node.attrs.language ?? '').toLowerCase()
  if (language !== 'latex') {
    const dom = document.createElement('pre')
    dom.className = 'markdown-note-code-block'
    const contentDOM = document.createElement('code')
    dom.append(contentDOM)
    return { dom, contentDOM }
  }

  let currentNode = node
  let editing = false
  let sourceElement: HTMLDivElement | null = null
  let previewElement: HTMLDivElement | null = null

  const dom = document.createElement('div')
  dom.className = 'markdown-note-math-block'
  dom.dataset.type = 'math_block'
  dom.setAttribute('contenteditable', 'false')

  const getPosition = () => typeof getPos === 'function' ? getPos() : null
  const nodeValue = () => String(currentNode.textContent ?? '')

  const renderFormula = (value: string) => {
    dom.replaceChildren()
    katex.render(value || '\\,', dom, { throwOnError: false, displayMode: true })
  }

  const updateFormula = (value: string) => {
    const position = getPosition()
    if (position == null) return
    const latestNode = view.state.doc.nodeAt(position)
    if (!latestNode) return
    const from = position + 1
    const to = from + latestNode.content.size
    const transaction = value
      ? view.state.tr.replaceWith(from, to, view.state.schema.text(value))
      : view.state.tr.delete(from, to)
    view.dispatch(transaction)
    currentNode = view.state.doc.nodeAt(position) ?? currentNode
  }

  const sourceValue = () => {
    const raw = sourceElement?.textContent ?? ''
    return raw.replace(/^\$\$\s?/, '').replace(/\s?\$\$$/, '')
  }

  const renderPreview = (value: string) => {
    if (!previewElement) return
    previewElement.replaceChildren()
    katex.render(value || '\\,', previewElement, { throwOnError: false, displayMode: true })
    syncMathPreviewPlacement(dom, previewElement)
  }

  const finishEditing = () => {
    if (!editing) return
    const value = sourceValue()
    editing = false
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
    sourceElement?.removeEventListener('input', handleInput)
    sourceElement?.removeEventListener('keydown', handleSourceKeydown)
    document.removeEventListener('scroll', handlePreviewViewportChange, true)
    window.removeEventListener('resize', handlePreviewViewportChange)
    sourceElement = null
    previewElement = null
    dom.dataset.editing = 'false'
    dom.dataset.previewPlacement = 'below'
    dom.setAttribute('contenteditable', 'false')
    renderFormula(value)
    if (value !== nodeValue()) updateFormula(value)
  }

  const handleDocumentPointerDown = (event: PointerEvent) => {
    if (!dom.contains(event.target as Node)) finishEditing()
  }

  const handlePreviewViewportChange = () => {
    if (editing && previewElement) syncMathPreviewPlacement(dom, previewElement)
  }

  const handleInput = () => {
    const value = sourceValue()
    updateFormula(value)
    renderPreview(value)
  }

  const handleSourceKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (sourceElement) sourceElement.textContent = `$$${nodeValue()}$$`
      finishEditing()
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      finishEditing()
    }
  }

  const enterEditing = () => {
    if (editing) return
    editing = true
    dom.dataset.editing = 'true'
    dom.setAttribute('contenteditable', 'false')
    sourceElement = document.createElement('div')
    sourceElement.className = 'markdown-note-math-block-source'
    sourceElement.contentEditable = 'true'
    sourceElement.spellcheck = false
    sourceElement.textContent = `$$${nodeValue()}$$`
    previewElement = document.createElement('div')
    previewElement.className = 'markdown-note-math-block-preview'
    previewElement.setAttribute('role', 'status')
    previewElement.setAttribute('aria-label', '公式预览')
    dom.replaceChildren(sourceElement, previewElement)
    renderPreview(nodeValue())
    syncMathPreviewPlacement(dom, previewElement)
    sourceElement.addEventListener('input', handleInput)
    sourceElement.addEventListener('keydown', handleSourceKeydown)
    document.addEventListener('pointerdown', handleDocumentPointerDown, true)
    document.addEventListener('scroll', handlePreviewViewportChange, true)
    window.addEventListener('resize', handlePreviewViewportChange)
    sourceElement.focus({ preventScroll: true })

    const textNode = sourceElement.firstChild
    if (textNode) {
      const selection = window.getSelection()
      const range = document.createRange()
      const end = textNode.textContent?.length ?? 0
      range.setStart(textNode, Math.min(2, end))
      range.setEnd(textNode, Math.max(2, end - 2))
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (!editing) {
      event.preventDefault()
      event.stopPropagation()
      enterEditing()
    }
  }

  dom.addEventListener('pointerdown', handlePointerDown)
  renderFormula(nodeValue())

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      if (!editing) renderFormula(nodeValue())
      else renderPreview(nodeValue())
      return true
    },
    stopEvent(event) {
      return editing && Boolean(sourceElement?.contains(event.target as Node))
    },
    ignoreMutation() {
      return true
    },
    destroy() {
      finishEditing()
      dom.removeEventListener('pointerdown', handlePointerDown)
    },
  }
}

const markdownCodeBlockView = $view(codeBlockSchema.node, () => createMathBlockNodeView)

interface MarkdownNotePreviewProps {
  source: string
  className?: string
}

export function MarkdownNotePreview({ source, className = '' }: MarkdownNotePreviewProps) {
  const classes = ['markdown-note-preview', className].filter(Boolean).join(' ')
  return <div className={classes} data-markdown-note-preview>
    {source.trim()
      ? <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} skipHtml>{source}</ReactMarkdown>
      : <p className="markdown-note-empty">输入 Markdown 后，这里会实时显示格式和公式。</p>}
  </div>
}

interface MarkdownNoteEditorProps {
  value: string
  onChange: (value: string) => void
  expanded?: boolean
  shortcuts?: MarkdownShortcutSettings
}

export function MarkdownNoteEditor({ value, onChange, expanded = false, shortcuts }: MarkdownNoteEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<Crepe | null>(null)
  const latestValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const shortcutsRef = useRef(resolveMarkdownShortcutSettings(shortcuts))
  latestValueRef.current = value
  shortcutsRef.current = resolveMarkdownShortcutSettings(shortcuts)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let disposed = false
    const editor = new Crepe({
      root,
      defaultValue: latestValueRef.current,
      features: {
        [Crepe.Feature.Cursor]: false,
        [Crepe.Feature.ImageBlock]: false,
        [Crepe.Feature.BlockEdit]: false,
        // Keep Crepe's keymap plugin active, but hide its floating toolbar in CSS
        // so the note remains a clean Typora-like editing surface.
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.LinkTooltip]: false,
        [Crepe.Feature.TopBar]: false,
        [Crepe.Feature.AI]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Latex]: {},
        [Crepe.Feature.Placeholder]: {
          mode: 'doc',
          text: '记录思路、易错点、公式或复习提醒……',
        },
      },
    })
    editor.editor.config((ctx) => {
      ctx.update(prosePluginsCtx, plugins => [
        createMarkdownShortcutPlugin(() => shortcutsRef.current),
        createHeadingMarkdownHintPlugin(),
        ...plugins,
      ])
      ctx.update(nodeViewCtx, nodeViews => [
        ...nodeViews.filter(([name]) => name !== 'math_inline' && name !== 'code_block'),
        ['math_inline', createInlineMathNodeView] as [string, NodeViewConstructor],
      ])
    })
    editor.editor.use(markdownCodeBlockView)
    editorRef.current = editor
    editor.on(listener => {
      listener.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown)
      })
    })

    void editor.create().catch(error => {
      if (!disposed) console.error('文字笔记编辑器加载失败', error)
    })

    return () => {
      disposed = true
      if (editorRef.current === editor) editorRef.current = null
      void editor.destroy()
    }
  }, [])

  return <div className={expanded ? 'markdown-note-editor expanded' : 'markdown-note-editor'}>
    <div className="markdown-note-editor-toolbar">
      <span>文字笔记</span>
      <small>
        <span>支持 Markdown · 行内公式 <code>$...$</code> · 块级公式 <code>$$...$$</code></span>
      </small>
    </div>
    <div ref={rootRef} className="markdown-note-wysiwyg" data-markdown-note-editor aria-label="文字笔记" />
  </div>
}
