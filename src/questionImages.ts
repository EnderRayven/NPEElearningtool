import type { Question } from './types'

export type QuestionImageKind = 'question' | 'answer'
export interface QuestionImageSource { key?: string; url?: string }

const structuredWorkspaceImageKeyPattern = /\/(?:question|answer)\/\d+-(?:Q|A)-\d{2}-\d+-\d{2,}\.\d+\.(?:png|jpe?g|webp|gif|bmp|avif)$/i

/** Structured keys point to an existing image in a bank folder. Editor keys do not. */
export function isStructuredWorkspaceImageKey(key?: string) {
  return Boolean(key && structuredWorkspaceImageKeyPattern.test(key))
}

export function hasCustomImageSources(question: Question, kind: QuestionImageKind) {
  return questionImageSources(question, kind).some(source => Boolean(source.url) || Boolean(source.key && !isStructuredWorkspaceImageKey(source.key)))
}

export function questionImageSources(question: Question, kind: QuestionImageKind): QuestionImageSource[] {
  const keys = kind === 'question' ? question.imageKeys || [] : question.answerImageKeys || []
  const urls = kind === 'question' ? question.imageUrls : question.answerImageUrls
  if (urls) {
    const count = Math.max(urls.length, keys.length)
    return (Array.from({ length: count }, (_, index): QuestionImageSource | null => urls[index] ? { url: urls[index] } : keys[index] ? { key: keys[index] } : null)).filter((source): source is QuestionImageSource => Boolean(source))
  }
  const legacyUrl = kind === 'question' ? question.imageUrl : question.answerImageUrl
  return [...(legacyUrl ? [{ url: legacyUrl }] : []), ...keys.map(key => ({ key }))]
}

export function questionWithImageSources(question: Question, kind: QuestionImageKind, sources: QuestionImageSource[]): Question {
  const urls = sources.map(source => source.url || null)
  // Keep placeholders so URL and IndexedDB sources stay aligned by position.
  const keys = sources.map(source => source.key || '')
  const firstUrl = sources.find(source => source.url)?.url
  return {
    ...question,
    imageUrl: kind === 'question' ? firstUrl : question.imageUrl,
    answerImageUrl: kind === 'answer' ? firstUrl : question.answerImageUrl,
    imageUrls: kind === 'question' ? urls : question.imageUrls,
    answerImageUrls: kind === 'answer' ? urls : question.answerImageUrls,
    imageKeys: kind === 'question' ? keys : question.imageKeys,
    answerImageKeys: kind === 'answer' ? keys : question.answerImageKeys,
  }
}
