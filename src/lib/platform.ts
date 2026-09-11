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

/**
 * iPhone or iPad, where there is no beforeinstallprompt and no shared session.
 *
 * iPadOS 13+ reports a desktop "Macintosh" user agent, so a plain UA test
 * missed every modern iPad; touch points are what tell the two apart.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1
}
