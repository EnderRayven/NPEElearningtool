import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const workspaceRoot = fileURLToPath(new URL('../数据/默认题库', import.meta.url))
const manifest = JSON.parse(readFileSync(path.join(workspaceRoot, '题库数据.json'), 'utf8'))
const imagePattern = /\.(png|jpe?g|webp|gif|bmp|avif)$/i
const structuredImagePattern = /^(Q|A)-(\d{2})-(\d+)-(\d{2,})\.(\d+)\.(png|jpe?g|webp|gif|bmp|avif)$/i

function imageFiles(directory = workspaceRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.')) return []
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return imageFiles(absolute)
    return entry.isFile() && imagePattern.test(entry.name) ? [absolute] : []
  })
}

function directWorkspacePath(source) {
  if (!source) return null
  const url = new URL(source, 'http://localhost')
  return url.pathname === '/api/default-workspace/file' ? url.searchParams.get('path') : null
}

describe('default workspace assets', () => {
  it('keeps every referenced image present and non-empty', () => {
    const bankFolders = Object.entries(manifest.folders || {}).sort((left, right) => right[1].length - left[1].length)
    const structuredAssets = new Map()
    for (const absolute of imageFiles()) {
      const relative = path.relative(workspaceRoot, absolute).split(path.sep).join('/')
      const owner = bankFolders.find(([, folder]) => relative.startsWith(`${folder}/`))
      const match = path.basename(absolute).match(structuredImagePattern)
      if (!owner || !match) continue
      const [bankId] = owner
      const [, token, chapterCode, sectionCode, questionCode, order] = match
      const kind = token.toUpperCase() === 'A' ? 'answer' : 'question'
      const questionId = `${bankId}-${chapterCode}-${sectionCode}-${questionCode}`
      structuredAssets.set(`${questionId}/${kind}/${Number(order)}-${path.basename(absolute)}`, absolute)
    }

    const failures = []
    const referencedKeys = []
    const directPaths = new Set()
    for (const bank of manifest.banks) for (const chapter of bank.chapters) for (const section of chapter.sections) {
      for (const source of section.passageImageUrls || []) {
        const relative = directWorkspacePath(source)
        if (relative) directPaths.add(relative)
      }
      for (const question of section.questions) {
        for (const key of [...(question.imageKeys || []), ...(question.answerImageKeys || [])].filter(Boolean)) referencedKeys.push(key)
        for (const source of [question.imageUrl, question.answerImageUrl, ...(question.imageUrls || []), ...(question.answerImageUrls || [])]) {
          const relative = directWorkspacePath(source)
          if (relative) directPaths.add(relative)
        }
      }
    }

    for (const key of referencedKeys) {
      const absolute = structuredAssets.get(key)
      if (!absolute || statSync(absolute).size === 0) failures.push(key)
    }
    for (const relative of directPaths) {
      const absolute = path.join(workspaceRoot, relative)
      try {
        if (statSync(absolute).size === 0) failures.push(relative)
      } catch {
        failures.push(relative)
      }
    }

    const textbookKeys = referencedKeys.filter(key => key.startsWith('default-mechanical-theory-textbook-exercises-'))
    expect(textbookKeys).toHaveLength(180)
    expect(failures).toEqual([])
  })
})
