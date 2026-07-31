interface NavigationScrollPosition {
  containerHeight: number
  scrollHeight: number
  chapterTop: number
  sectionTop?: number
  sectionHeight?: number
}

export function shouldScrollSectionChangeToTop(subject: string, currentSectionId: string, nextSectionId: string) {
  return subject === 'english' && Boolean(nextSectionId) && nextSectionId !== currentSectionId
}

export function navigationScrollTop({
  containerHeight,
  scrollHeight,
  chapterTop,
  sectionTop,
  sectionHeight = 0,
}: NavigationScrollPosition) {
  if (containerHeight <= 0 || scrollHeight <= containerHeight) return 0

  const topPadding = 10
  const bottomPadding = 14
  const maxScrollTop = Math.max(0, scrollHeight - containerHeight)
  let targetScrollTop = chapterTop - topPadding

  if (sectionTop !== undefined) {
    const sectionBottom = sectionTop + sectionHeight
    const visibleBottom = targetScrollTop + containerHeight - bottomPadding
    if (sectionBottom > visibleBottom) {
      const sectionOffset = Math.min(160, Math.max(72, containerHeight * 0.28))
      targetScrollTop = sectionTop - sectionOffset
    }
  }

  return Math.max(0, Math.min(maxScrollTop, targetScrollTop))
}
