const IMAGE_ANSWER_PLACEHOLDERS = new Set(['见答案图片'])

export function isImageAnswerPlaceholder(value: string) {
  return IMAGE_ANSWER_PLACEHOLDERS.has(value.trim().replace(/[.。！!]+$/, ''))
}

export function isImageQuestionType(value?: string) {
  return Boolean(value && /图片|图像|截图/.test(value))
}
