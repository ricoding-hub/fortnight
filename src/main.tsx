import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { usePwaStore, type BeforeInstallPromptEvent } from '@/store/pwaStore'

/**
 * Service worker: registered in 'prompt' mode. A new version waits instead of
 * taking over, so the app never reloads out from under someone mid-capture.
 * The banner asks; `applyUpdate` is what actually swaps and reloads.
 */
const updateSW = registerSW({
  onNeedRefresh() {
    usePwaStore.getState().setUpdateReady(true)
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return
    // iOS PWA: Safari doesn't check for a new worker when the app returns from
    // the background, so we ask on every activation.
    document.addEventListener('visibilitychange', () => {
      // Offline this rejects; `void` wouldn't catch it and every tab focus
      // would log an unhandled rejection.
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
  },
})
usePwaStore.getState().setApplyUpdate(() => void updateSW(true))

/** Connectivity, surfaced to the user rather than guessed at. */
window.addEventListener('offline', () => {
  usePwaStore.getState().setOffline(true)
})
window.addEventListener('online', () => {
  const s = usePwaStore.getState()
  s.setOffline(false)
  s.setBackOnline(true)
})

/**
 * Install prompt: Chrome fires this once and, if we ignore it, the user can
 * never get the offer back. Stash it so the app can offer installing itself.
 */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  usePwaStore.getState().setInstallEvent(e as BeforeInstallPromptEvent)
})
window.addEventListener('appinstalled', () => {
  usePwaStore.getState().setInstallEvent(null)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
