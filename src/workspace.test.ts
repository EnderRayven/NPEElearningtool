import { describe, expect, it } from 'vitest'
import { isMissingWorkspaceError, safeFolderName } from './workspace'

describe('safeFolderName', () => {
  it('removes characters forbidden in local folder names', () => {
    expect(safeFolderName('高数/强化:2027?')).toBe('高数-强化-2027-')
  })

  it('provides a readable fallback', () => {
    expect(safeFolderName('   ')).toBe('未命名题库')
  })
})

describe('isMissingWorkspaceError', () => {
  it('识别目录移动后产生的 NotFoundError', () => {
    expect(isMissingWorkspaceError(new DOMException('missing', 'NotFoundError'))).toBe(true)
    expect(isMissingWorkspaceError(new Error('missing'))).toBe(false)
  })
})
