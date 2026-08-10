import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const WORKSPACE_MANIFEST = '题库数据.json'

export function isWorkspaceManifest(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.banks))
}

export async function readWorkspaceManifest(workspaceRoot) {
  try {
    const value = JSON.parse(await readFile(path.join(workspaceRoot, WORKSPACE_MANIFEST), 'utf8'))
    return isWorkspaceManifest(value) ? value : null
  } catch {
    return null
  }
}

export async function isUsableDataRoot(candidate) {
  const workspaceRoot = path.join(candidate, '默认题库')
  const manifest = await readWorkspaceManifest(workspaceRoot)
  return Boolean(manifest)
}
