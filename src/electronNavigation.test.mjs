import { describe, expect, it } from 'vitest'
import { isAllowedDesktopNavigation, isDesktopAppUrl, isOneDriveAuthUrl } from '../electron/navigation.mjs'

const appUrl = 'http://localhost:45217'

describe('Electron navigation policy', () => {
  it('keeps the app callback on the desktop origin', () => {
    expect(isDesktopAppUrl('http://localhost:45217/?code=auth-code&state=state', appUrl)).toBe(true)
    expect(isAllowedDesktopNavigation('http://localhost:45217/?code=auth-code', appUrl)).toBe(true)
  })

  it('keeps OneDrive sign-in inside the desktop window', () => {
    expect(isOneDriveAuthUrl('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize')).toBe(true)
    expect(isAllowedDesktopNavigation('https://login.live.com/oauth20_authorize.srf', appUrl)).toBe(true)
  })

  it('does not allow lookalike app URLs or unrelated external pages', () => {
    expect(isDesktopAppUrl('http://localhost:45217.evil.example/?code=auth-code', appUrl)).toBe(false)
    expect(isAllowedDesktopNavigation('https://example.com/', appUrl)).toBe(false)
  })
})
