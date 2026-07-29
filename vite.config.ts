import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const MANIFEST = '题库数据.json'
const USER_DATA = '用户数据.json'
const NOTES_FOLDER = '用户笔记'
const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|avif)$/i
const STRUCTURED_IMAGE_PATTERN = /^(?:Q|A)-\d+-\d+-\d+(?:\.\d+)?\.(?:png|jpe?g|webp|gif|bmp|avif)$/i
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif'
}
const MATH_MODULE_FOLDERS = new Set(['高数', '线代', '真题'])
const GROUPING_FOLDERS = new Set(['数学', '英语', '专业课'])

function bankFoldersFromDirectoryPaths(directoryPaths: string[]) {
  const folders = new Set<string>()
  for (const rawPath of directoryPaths) {
    const parts = rawPath.replaceAll('\\', '/').split('/').filter(Boolean)
    if (!parts.length) continue
    if (parts[0] === '数学') {
      if (MATH_MODULE_FOLDERS.has(parts[1] || '') && parts[2]) folders.add(parts.slice(0, 3).join('/'))
      else if (parts[1] && !MATH_MODULE_FOLDERS.has(parts[1])) folders.add(parts.slice(0, 2).join('/'))
      continue
    }
    if (GROUPING_FOLDERS.has(parts[0])) {
      if (parts[1]) folders.add(parts.slice(0, 2).join('/'))
      continue
    }
    folders.add(parts[0])
  }
  return [...folders].sort()
}

function defaultWorkspacePlugin(): Plugin {
  const root = path.resolve(process.cwd(), '默认题库')
  const userDataRoot = path.resolve(process.cwd(), '用户数据')
  function resolveBankPath(relativePath: string, bankFolders: string[]) {
    const knownFolder = [...bankFolders]
      .sort((left, right) => right.length - left.length)
      .find(folder => relativePath.startsWith(`${folder}/`))
    if (knownFolder) return { bankFolder: knownFolder, relativePath: relativePath.slice(knownFolder.length + 1) }
    const separator = relativePath.indexOf('/')
    return separator < 0
      ? { bankFolder: '', relativePath }
      : { bankFolder: relativePath.slice(0, separator), relativePath: relativePath.slice(separator + 1) }
  }
  function noteSegment(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  }
  async function readNotesFromDisk(): Promise<Record<string, unknown>> {
    const notes: Record<string, unknown> = {}
    try {
      const notesRoot = path.join(userDataRoot, NOTES_FOLDER)
      for (const bankEntry of await readdir(notesRoot, { withFileTypes: true })) {
        if (!bankEntry.isDirectory() || bankEntry.name.startsWith('.')) continue
        for (const chapterEntry of await readdir(path.join(notesRoot, bankEntry.name), { withFileTypes: true })) {
          if (!chapterEntry.isFile() || !chapterEntry.name.endsWith('.json')) continue
          try {
            const parsed = JSON.parse(await readFile(path.join(notesRoot, bankEntry.name, chapterEntry.name), 'utf8')) as { notes?: Record<string, unknown> }
            if (parsed.notes && typeof parsed.notes === 'object' && !Array.isArray(parsed.notes)) Object.assign(notes, parsed.notes)
          } catch {}
        }
      }
    } catch {}
    return notes
  }
  async function scan(bankFolders: string[], directory = root, prefix = ''): Promise<Array<{ name: string; relativePath: string; bankFolder: string; url: string }>> {
    const output: Array<{ name: string; relativePath: string; bankFolder: string; url: string }> = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === MANIFEST || entry.name === NOTES_FOLDER) continue
      const absolute = path.join(directory, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) output.push(...await scan(bankFolders, absolute, relativePath))
      else if (entry.isFile() && STRUCTURED_IMAGE_PATTERN.test(entry.name)) {
        const modified = (await stat(absolute)).mtimeMs
        const resolved = resolveBankPath(relativePath, bankFolders)
        output.push({ name: entry.name, ...resolved, url: `/api/default-workspace/file?path=${encodeURIComponent(path.relative(root, absolute))}&v=${modified}` })
      }
    }
    return output
  }
  async function collectDirectories(directory = root, prefix = ''): Promise<string[]> {
    const output: string[] = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === MANIFEST || entry.name === NOTES_FOLDER || !entry.isDirectory()) continue
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      output.push(relativePath, ...await collectDirectories(path.join(directory, entry.name), relativePath))
    }
    return output
  }
  async function findFilesByName(directory: string, fileName: string): Promise<string[]> {
    const matches: string[] = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) matches.push(...await findFilesByName(absolute, fileName))
      else if (entry.isFile() && entry.name === fileName) matches.push(absolute)
    }
    return matches
  }
  const configureWorkspaceServer = (server: { middlewares: Connect.Server }) => {
      server.middlewares.use('/api/default-workspace/index', async (_request, response) => {
        try {
          let manifest = null
          let userData = null
          try { manifest = JSON.parse(await readFile(path.join(root, MANIFEST), 'utf8')) } catch {}
          try { userData = JSON.parse(await readFile(path.join(userDataRoot, USER_DATA), 'utf8')) } catch {}
          const directoryPaths = await collectDirectories()
          const discoveredBankFolders = bankFoldersFromDirectoryPaths(directoryPaths)
          const manifestBankFolders = Object.values((manifest as { folders?: Record<string, string> } | null)?.folders || {})
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          const bankFolders = [...new Set([...manifestBankFolders, ...discoveredBankFolders])]
          response.end(JSON.stringify({ name: '默认题库', manifest, userData, notes: await readNotesFromDisk(), bankFolders: discoveredBankFolders, images: await scan(bankFolders) }))
        } catch (error) { response.statusCode = 500; response.end(error instanceof Error ? error.message : '默认题库扫描失败') }
      })
      server.middlewares.use('/api/default-workspace/file', async (request, response) => {
        try {
          const relative = new URL(request.url || '', 'http://localhost').searchParams.get('path') || ''
          const absolute = path.resolve(root, relative)
          if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) { response.statusCode = 403; response.end(); return }
          const [resolvedRoot, resolvedFile] = await Promise.all([realpath(root), realpath(absolute)])
          if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) { response.statusCode = 403; response.end(); return }
          response.setHeader('Content-Type', IMAGE_CONTENT_TYPES[path.extname(resolvedFile).toLowerCase()] || 'application/octet-stream')
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          createReadStream(resolvedFile).on('error', () => { response.statusCode = 404; response.end() }).pipe(response)
        } catch { response.statusCode = 404; response.end() }
      })
      server.middlewares.use('/api/default-workspace/image', (request, response) => {
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(); return }
        const relative = new URL(request.url || '', 'http://localhost').searchParams.get('path') || ''
        const absolute = path.resolve(root, relative)
        if (absolute === root || !absolute.startsWith(`${root}${path.sep}`)) { response.statusCode = 403; response.end('路径不安全'); return }
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk))
        request.on('end', async () => {
          try {
            await mkdir(path.dirname(absolute), { recursive: true })
            await writeFile(absolute, Buffer.concat(chunks))
            response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}')
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : '图片写入失败') }
        })
      })
      server.middlewares.use('/api/default-workspace/delete-image', (request, response) => {
        if (request.method !== 'DELETE') { response.statusCode = 405; response.end(); return }
        const params = new URL(request.url || '', 'http://localhost').searchParams
        const relative = params.get('path') || ''
        const bankFolder = params.get('bankFolder') || ''
        const fileName = params.get('fileName') || ''
        const reject = (statusCode: number, message: string) => {
          const error = new Error(message) as Error & { statusCode: number }
          error.statusCode = statusCode
          throw error
        }
        const remove = async () => {
          if (relative) {
            const absolute = path.resolve(root, relative)
            if (absolute === root || !absolute.startsWith(`${root}${path.sep}`)) reject(403, '路径不安全')
            await unlink(absolute)
            return
          }
          if (!bankFolder || !fileName || fileName.includes('/') || fileName.includes('\\') || !IMAGE_PATTERN.test(fileName)) reject(400, '删除目标无效')
          const folder = path.resolve(root, bankFolder)
          if (!folder.startsWith(`${root}${path.sep}`)) reject(403, '路径不安全')
          const matches = await findFilesByName(folder, fileName)
          if (!matches.length) reject(404, '图片不存在')
          if (matches.length > 1) reject(409, '存在多个同名图片')
          await unlink(matches[0])
        }
        void remove()
          .then(() => { response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}') })
          .catch(error => {
            const statusCode = (error as { statusCode?: number }).statusCode || ((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 400)
            response.statusCode = statusCode; response.end(error instanceof Error ? error.message : '图片删除失败')
          })
      })
      server.middlewares.use('/api/default-workspace/replace-image', (request, response) => {
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(); return }
        const params = new URL(request.url || '', 'http://localhost').searchParams
        const bankFolder = params.get('bankFolder') || ''
        const fileName = params.get('fileName') || ''
        if (!bankFolder || !fileName || fileName.includes('/') || fileName.includes('\\') || !IMAGE_PATTERN.test(fileName)) { response.statusCode = 400; response.end('替换目标无效'); return }
        const folder = path.resolve(root, bankFolder)
        if (!folder.startsWith(`${root}${path.sep}`)) { response.statusCode = 403; response.end('路径不安全'); return }
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk))
        request.on('end', async () => {
          try {
            const matches = await findFilesByName(folder, fileName)
            if (!matches.length) { response.statusCode = 404; response.end('原图片不存在'); return }
            if (matches.length > 1) { response.statusCode = 409; response.end('存在多个同名图片') ; return }
            await writeFile(matches[0], Buffer.concat(chunks))
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ relativePath: path.relative(root, matches[0]).replaceAll(path.sep, '/'), modified: Date.now() }))
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : '图片替换失败') }
        })
      })
      server.middlewares.use('/api/default-workspace/add-image', (request, response) => {
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(); return }
        const params = new URL(request.url || '', 'http://localhost').searchParams
        const bankFolder = params.get('bankFolder') || ''
        const anchorFileName = params.get('anchorFileName') || ''
        const fileName = params.get('fileName') || ''
        if (!bankFolder || !anchorFileName || !fileName || [anchorFileName, fileName].some(value => value.includes('/') || value.includes('\\') || !IMAGE_PATTERN.test(value))) { response.statusCode = 400; response.end('新增目标无效'); return }
        const folder = path.resolve(root, bankFolder)
        if (!folder.startsWith(`${root}${path.sep}`)) { response.statusCode = 403; response.end('路径不安全'); return }
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk))
        request.on('end', async () => {
          try {
            const matches = await findFilesByName(folder, anchorFileName)
            if (!matches.length) { response.statusCode = 404; response.end('找不到图片目录'); return }
            if (matches.length > 1) { response.statusCode = 409; response.end('存在多个同名图片'); return }
            const target = path.join(path.dirname(matches[0]), fileName)
            await writeFile(target, Buffer.concat(chunks))
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ relativePath: path.relative(root, target).replaceAll(path.sep, '/'), modified: Date.now() }))
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : '图片新增失败') }
        })
      })
      server.middlewares.use('/api/default-workspace/manifest', (request, response) => {
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(); return }
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk))
        request.on('end', async () => {
          try {
            const content = Buffer.concat(chunks).toString('utf8')
            JSON.parse(content)
            await writeFile(path.join(root, MANIFEST), content)
            response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}')
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : '写入失败') }
        })
      })
      server.middlewares.use('/api/default-workspace/user-data', (request, response) => {
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(); return }
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk))
        request.on('end', async () => {
          try {
            const content = Buffer.concat(chunks).toString('utf8')
            JSON.parse(content)
            await mkdir(userDataRoot, { recursive: true })
            await writeFile(path.join(userDataRoot, USER_DATA), content)
            response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}')
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : '写入失败') }
        })
      })
      server.middlewares.use('/api/default-workspace/note-bucket', (request, response) => {
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(); return }
        const chunks: Buffer[] = []
        request.on('data', chunk => chunks.push(chunk))
        request.on('end', async () => {
          try {
            const content = Buffer.concat(chunks).toString('utf8')
            const payload = JSON.parse(content) as { bankId?: string; chapterId?: string }
            if (!payload.bankId || !payload.chapterId) { response.statusCode = 400; response.end('章节信息缺失'); return }
            const bankDirectory = path.join(userDataRoot, NOTES_FOLDER, noteSegment(payload.bankId))
            await mkdir(bankDirectory, { recursive: true })
            await writeFile(path.join(bankDirectory, `${noteSegment(payload.chapterId)}.json`), content)
            response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}')
          } catch (error) { response.statusCode = 400; response.end(error instanceof Error ? error.message : '写入失败') }
        })
      })
  }
  return {
    name: 'default-question-bank-workspace',
    handleHotUpdate(context) {
      if (path.resolve(context.file) === path.join(root, MANIFEST)) return []
    },
    configureServer: configureWorkspaceServer,
    configurePreviewServer: configureWorkspaceServer
  }
}

export default defineConfig({ plugins: [react(), defaultWorkspacePlugin()] })
