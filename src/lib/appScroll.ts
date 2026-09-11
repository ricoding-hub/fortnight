/**
 * The app's scroll container.
 *
 * The document itself no longer scrolls: the shell is exactly one viewport tall
 * and only the content area moves. That change exists because `html` and `body`
 * both carried `height: 100%` while the content overflowed them, and WebKit
 * anchors a bottom-positioned `fixed` element to that body box instead of to
 * the viewport — which floated the bottom nav into mid-screen, climbing higher
 * the further you scrolled.
 *
 * With no document scroll there is nothing left to mis-anchor, but it does mean
 * `document.body.style.overflow = 'hidden'` no longer freezes anything. Modals
 * lock this element instead.
 */
export const APP_SCROLL_ID = 'app-scroll'

/** The scroller, or null on screens outside the shell (login, callback). */
export function getAppScroller(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById(APP_SCROLL_ID)
}

/**
 * Freeze the app's scroll and return the function that restores it.
 *
 * Note what this deliberately does NOT do: set `overflow: hidden` on the
 * scroller. Hiding overflow on an already-scrolled container leaves it with no
 * scrollable extent, so the browser clamps it to the top — opening a modal
 * would yank the page behind it back to the beginning, and closing would leave
 * it there. Swallowing the input events instead keeps the position to the pixel
 * and changes no layout at all, so there is no scrollbar shift to compensate.
 */
export function lockAppScroll(): () => void {
  if (typeof document === 'undefined') return () => {}

  const el = getAppScroller()

  // Outside the shell — the login screen — the document is still the scroller,
  // and there `overflow: hidden` is both safe and the conventional lock.
  if (!el) {
    const body = document.body
    const prevOverflow = body.style.overflow
    const prevPadding = body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbar > 0) {
      const current = parseInt(window.getComputedStyle(body).paddingRight, 10) || 0
      body.style.paddingRight = `${current + scrollbar}px`
    }
    return () => {
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPadding
    }
  }

  const block = (e: Event) => e.preventDefault()
  // Non-passive: a passive listener is not allowed to preventDefault.
  el.addEventListener('wheel', block, { passive: false })
  el.addEventListener('touchmove', block, { passive: false })

  return () => {
    el.removeEventListener('wheel', block)
    el.removeEventListener('touchmove', block)
  }
}
