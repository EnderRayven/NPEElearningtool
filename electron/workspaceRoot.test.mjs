import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isUsableDataRoot, readWorkspaceManifest } from './workspaceRoot.mjs'

const temporaryRoots = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function createTemporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'npee-workspace-root-'))
  temporaryRoots.push(root)
  return root
}

describe('Electron workspace root recovery', () => {
  it('recognizes an explicitly created empty workspace without creating anything', async () => {
    const root = await createTemporaryRoot()
    const workspaceRoot = path.join(root, '默认题库')
    await mkdir(workspaceRoot, { recursive: true })
    await writeFile(path.join(workspaceRoot, '题库数据.json'), JSON.stringify({ version: 2, banks: [], folders: {} }))

    expect(await isUsableDataRoot(root)).toBe(true)
    await expect(access(path.join(root, '用户数据'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('treats a missing workspace as optional instead of creating it', async () => {
    const root = await createTemporaryRoot()

    expect(await isUsableDataRoot(root)).toBe(false)
    await expect(access(path.join(root, '默认题库'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an invalid manifest instead of selecting it as a usable data root', async () => {
    const root = await createTemporaryRoot()
    const workspaceRoot = path.join(root, '默认题库')
    await mkdir(workspaceRoot, { recursive: true })
    await writeFile(path.join(workspaceRoot, '题库数据.json'), '{invalid')

    expect(await readWorkspaceManifest(workspaceRoot)).toBeNull()
    expect(await isUsableDataRoot(root)).toBe(false)
  })
})
