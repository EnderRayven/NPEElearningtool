const DB_NAME = 'npee-question-assets'
const STORE_NAME = 'assets'
const DB_VERSION = 1

export interface AssetInput { key: string; file: File; url?: string }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开图片素材库'))
  })
}

export async function putAssets(inputs: AssetInput[]) {
  if (!inputs.length) return
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    inputs.forEach(({ key, file, url }) => store.put(url ? { key, url, name: file.name, type: file.type, updatedAt: Date.now() } : { key, blob: file, name: file.name, type: file.type, updatedAt: Date.now() }))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('图片写入失败，可能已超出浏览器存储空间'))
    transaction.onabort = () => reject(transaction.error || new Error('图片写入已中止'))
  })
  database.close()
}

export async function getAssetBlobs(keys: string[]): Promise<Blob[]> {
  if (!keys.length) return []
  const database = await openDatabase()
  const records = await Promise.all(keys.map(key => new Promise<{ blob?: Blob; url?: string } | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })))
  database.close()
  const blobs = await Promise.all(records.map(async record => {
    if (record?.blob instanceof Blob) return record.blob
    if (record?.url) { const response = await fetch(record.url); return response.ok ? response.blob() : null }
    return null
  }))
  return blobs.filter((blob): blob is Blob => blob !== null)
}

export async function deleteAssets(keys: string[]) {
  if (!keys.length) return
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite'); const store = transaction.objectStore(STORE_NAME)
    keys.forEach(key => store.delete(key)); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function clearAssets() {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite'); transaction.objectStore(STORE_NAME).clear()
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export type ImageKind = 'question' | 'answer'

export interface StructuredImageMatch {
  chapterCode: string
  chapterName: string
  sectionCode: string
  sectionName: string
  questionCode: string
  kind: ImageKind
  order: number
}

export function parseStructuredImagePath(relativePath: string, filename: string): StructuredImageMatch | null {
  const basename = filename.replace(/\.[^.]+$/, '')
  const match = basename.match(/^(Q|A)-(\d+)-(\d+)-(\d+)(?:\.(\d+))?$/i)
  if (!match) return null
  const [, kindToken, chapterCode, sectionCode, questionCode, orderToken] = match
  const folders = relativePath.split('/').slice(0, -1)
  const folderPattern = new RegExp(`^0*${Number(chapterCode)}\\s*([^0-9]*?)\\s+0*${Number(sectionCode)}[-_ ](.+?)$`, 'i')
  const folderMatch = folders.map(folder => folder.includes('.') ? null : folder.match(folderPattern)).find(Boolean)
  return {
    chapterCode,
    chapterName: folderMatch?.[1]?.trim() || `第 ${chapterCode} 章`,
    sectionCode,
    sectionName: folderMatch?.[2]?.trim() || `第 ${sectionCode} 节`,
    questionCode,
    kind: kindToken.toUpperCase() === 'A' ? 'answer' : 'question',
    order: Number(orderToken || 1)
  }
}
