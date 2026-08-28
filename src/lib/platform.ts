/**
 * Platform checks used by the install flow and the login screen. Kept here so
 * the two screens can't drift apart on what counts as "iOS" or "installed".
 */

/** Running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
}

/** iPhone or iPad, where there is no beforeinstallprompt and no shared session. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
