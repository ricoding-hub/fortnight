/**
 * Which install path — if any — the browser in front of us actually supports.
 *
 * The old check was `isIOS() || hasPromptEvent`, and it mis-served most of the
 * world. It offered Safari's "Compartir → Añadir a pantalla de inicio" inside
 * iOS Chrome and inside the WhatsApp and Instagram webviews, where that menu
 * doesn't exist; it missed modern iPads, which report themselves as
 * "Macintosh"; and it stayed quiet on macOS Safari, which has been able to
 * install to the Dock since Safari 17. The result is an offer that either
 * lies or never appears — which is what the report was about.
 *
 * Everything here is a pure function of the user agent so it can be tested
 * against real strings instead of guessed at.
 */

export type InstallMethod =
  /** Already running from the home screen or the Dock: nothing to offer. */
  | 'installed'
  /** The browser gave us `beforeinstallprompt`: a real one-tap button. */
  | 'prompt'
  /** Safari on iPhone: Share → Añadir a pantalla de inicio. */
  | 'ios-safari'
  /** Safari on iPad: same flow, the Share button lives up top. */
  | 'ipad-safari'
  /** Safari 17+ on macOS: Share → Añadir al Dock. */
  | 'macos-safari'
  /** Firefox on Android: menu → Instalar. No prompt event there. */
  | 'android-firefox'
  /** An iOS browser or in-app webview that cannot install. Safari can. */
  | 'ios-elsewhere'
  /** Desktop Firefox, old Safari, anything else: not installable at all. */
  | 'none'

export interface InstallEnv {
  hasPromptEvent: boolean
  standalone: boolean
  ua: string
  /** iPadOS reports a desktop UA; touch points are what give it away. */
  maxTouchPoints: number
}

/** iOS browsers that are not Safari, plus the webviews links open in. */
const IOS_NON_SAFARI =
  /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo|FBAN|FBAV|FBIOS|Instagram|Line\/|Twitter|MicroMessenger|WhatsApp|GSA\//i

function safariMajor(ua: string): number | null {
  const m = /Version\/(\d+)/.exec(ua)
  return m ? Number(m[1]) : null
}

export function detectInstallMethod(env: InstallEnv): InstallMethod {
  const { ua, standalone, hasPromptEvent, maxTouchPoints } = env
  if (standalone) return 'installed'

  // A real prompt beats every hand-written guide. Chrome, Edge and Samsung
  // Internet fire it on Android, Windows, macOS, Linux and ChromeOS alike.
  if (hasPromptEvent) return 'prompt'

  const isIPhone = /iPhone|iPod/i.test(ua)
  // iPadOS 13+ says "Macintosh"; only the touch points tell it apart from a Mac.
  const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)

  if (isIPhone || isIPad) {
    // Chrome on iOS can bookmark, not install: its "Add to Home Screen" opens
    // back in Chrome instead of standalone. Webviews can't do even that.
    if (IOS_NON_SAFARI.test(ua)) return 'ios-elsewhere'
    return isIPad ? 'ipad-safari' : 'ios-safari'
  }

  // Desktop Safari. "Add to Dock" arrived in Safari 17 (macOS Sonoma);
  // offering it to Safari 16 would send the user hunting for a missing menu.
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Edg\//i.test(ua)) {
    const major = safariMajor(ua)
    return major != null && major >= 17 ? 'macos-safari' : 'none'
  }

  // Firefox on Android installs from its own menu and never fires the event.
  // Desktop Firefox cannot install at all, so the Android check is the point.
  if (/Android/i.test(ua) && /Firefox\//i.test(ua)) return 'android-firefox'

  return 'none'
}

/** The methods that have something to put on screen. */
export type OfferableMethod = Exclude<InstallMethod, 'installed' | 'none'>

/** Type guard, so the caller's copy table only has to cover real cases. */
export function canOfferInstall(method: InstallMethod): method is OfferableMethod {
  return method !== 'installed' && method !== 'none'
}
