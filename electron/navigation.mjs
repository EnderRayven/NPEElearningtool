const ONEDRIVE_AUTH_HOSTS = new Set([
  'account.live.com',
  'account.microsoft.com',
  'login.live.com',
  'login.microsoft.com',
  'login.microsoftonline.com',
  'signup.live.com',
])

function parseUrl(value) {
  try { return new URL(value) } catch { return null }
}

export function isOneDriveAuthUrl(target) {
  const candidate = parseUrl(target)
  return candidate?.protocol === 'https:' && ONEDRIVE_AUTH_HOSTS.has(candidate.hostname)
}

export function isDesktopAppUrl(target, appUrl) {
  const candidate = parseUrl(target)
  const application = parseUrl(appUrl)
  return Boolean(candidate && application && candidate.origin === application.origin)
}

export function isAllowedDesktopNavigation(target, appUrl) {
  return isDesktopAppUrl(target, appUrl) || isOneDriveAuthUrl(target)
}
