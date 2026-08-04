import { Fragment, useEffect, useState, useSyncExternalStore } from 'react'
import { ZoomIn } from 'lucide-react'
import { getAssetBlobs, getAssetRevision, subscribeAssetChanges } from './assets'
import type { QuestionImageSource } from './questionImages'

interface Props { keys?: string[]; urls?: string[]; sources?: QuestionImageSource[]; alt: string; className?: string; trackExportLoading?: boolean; eager?: boolean; onImageZoom?: (source: QuestionImageSource) => void }

// Default-workspace files are served with long-lived immutable caching. Keep a
// small explicit version on direct image URLs so regenerated crops cannot be
// hidden behind an older browser-cached image with the same path.
const DEFAULT_WORKSPACE_ASSET_VERSION = '20260718-1'

function versionDefaultWorkspaceUrl(source: string) {
  if (!source.includes('/api/default-workspace/file?') || source.includes('assetVersion=')) return source
  return `${source}${source.includes('?') ? '&' : '?'}assetVersion=${DEFAULT_WORKSPACE_ASSET_VERSION}`
}

export default function AssetGallery({ keys = [], urls = [], sources, alt, className, trackExportLoading = false, eager = false, onImageZoom }: Props) {
  const imageSources: QuestionImageSource[] = sources || [...urls.map(url => ({ url } as QuestionImageSource)), ...keys.filter(Boolean).map(key => ({ key }))]
  const keyEntries = imageSources.map((source, index) => ({ source, index })).filter(item => Boolean(item.source.key)) as Array<{ source: QuestionImageSource & { key: string }; index: number }>
  const keySignature = keyEntries.map(({ source }) => source.key).join('\u0000')
  const sourceSignature = imageSources.map(source => `${source.key || ''}:${source.url || ''}`).join('\u0001')
  const assetSignature = `${keySignature}\u0002${sourceSignature}`
  const [localUrls, setLocalUrls] = useState<Array<string | null>>([])
  const [loadState, setLoadState] = useState<{ signature: string; status: 'loading' | 'ready' | 'error' }>(() => ({ signature: assetSignature, status: keyEntries.length ? 'loading' : 'ready' }))
  const assetRevision = useSyncExternalStore(subscribeAssetChanges, getAssetRevision, getAssetRevision)

  useEffect(() => {
    let disposed = false
    let objectUrls: string[] = []
    // Drop the previous blob immediately when either keys or direct URLs
    // change; otherwise a long analysis image can remain visible after the
    // user navigates to another question.
    setLocalUrls([])
    setLoadState({ signature: assetSignature, status: keyEntries.length ? 'loading' : 'ready' })
    getAssetBlobs(keyEntries.map(({ source }) => source.key)).then(blobs => {
      const resolved = Array<string | null>(imageSources.length).fill(null)
      blobs.forEach((blob, blobIndex) => {
        if (!blob) return
        const objectUrl = URL.createObjectURL(blob)
        objectUrls.push(objectUrl)
        resolved[keyEntries[blobIndex].index] = objectUrl
      })
      const hasMissingAssets = blobs.length < keyEntries.length
      if (!disposed) { setLocalUrls(resolved); setLoadState({ signature: assetSignature, status: hasMissingAssets ? 'error' : 'ready' }) }
      else objectUrls.forEach(URL.revokeObjectURL)
    }).catch(() => { if (!disposed) { setLocalUrls([]); setLoadState({ signature: assetSignature, status: 'error' }) } })
    return () => { disposed = true; objectUrls.forEach(URL.revokeObjectURL) }
  }, [assetSignature, assetRevision])

  const resolvedEntries = imageSources.map((source, index) => ({ source, resolvedSource: source.url ? versionDefaultWorkspaceUrl(source.url) : loadState.signature === assetSignature ? localUrls[index] : null })).filter((entry): entry is { source: QuestionImageSource; resolvedSource: string } => Boolean(entry.resolvedSource))
  const exportState = loadState.signature === assetSignature ? loadState.status : keyEntries.length ? 'loading' : 'ready'
  if (!resolvedEntries.length && !trackExportLoading) return null
  return <div className={className || 'asset-gallery'} data-export-asset-state={trackExportLoading ? exportState : undefined}>{resolvedEntries.map(({ source, resolvedSource }, index) => {
    const image = <img src={resolvedSource} alt={`${alt}${resolvedEntries.length > 1 ? ` ${index + 1}` : ''}`} loading={trackExportLoading || eager ? 'eager' : 'lazy'} draggable={false} onDragStart={event => event.preventDefault()}/>
    if (!onImageZoom) return <Fragment key={`${resolvedSource}-${index}`}>{image}</Fragment>
    return <span className="asset-gallery-item" key={`${resolvedSource}-${index}`}>{image}<button className="asset-gallery-zoom-trigger" type="button" aria-label={`放大查看${alt}${resolvedEntries.length > 1 ? ` ${index + 1}` : ''}`} title="放大图片" onClick={() => onImageZoom(source)}><ZoomIn size={15}/></button></span>
  })}</div>
}
