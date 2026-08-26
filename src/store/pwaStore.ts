import { create } from 'zustand'

interface PwaState {
  /** A new service worker is waiting: the user decides when to apply it. */
  updateReady: boolean
  /** The browser reports no connectivity. */
  offline: boolean
  /** Connectivity just came back; data on screen may be stale. */
  backOnline: boolean
  /** Deferred beforeinstallprompt event, when the browser offered one. */
  installEvent: BeforeInstallPromptEvent | null
  /** Applies the waiting service worker and reloads. Set from main.tsx. */
  applyUpdate: () => void

  setUpdateReady: (v: boolean) => void
  setOffline: (v: boolean) => void
  setBackOnline: (v: boolean) => void
  setInstallEvent: (e: BeforeInstallPromptEvent | null) => void
  setApplyUpdate: (fn: () => void) => void
}

/** The install prompt event isn't in lib.dom yet. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Service-worker and connectivity state, surfaced to the user instead of
 * being handled silently. Set from main.tsx (outside React) and read by
 * PwaBanner and the install button.
 */
export const usePwaStore = create<PwaState>((set) => ({
  updateReady: false,
  offline: typeof navigator !== 'undefined' && !navigator.onLine,
  backOnline: false,
  installEvent: null,
  applyUpdate: () => window.location.reload(),

  setUpdateReady: (v) => set({ updateReady: v }),
  setOffline: (v) => set({ offline: v }),
  setBackOnline: (v) => set({ backOnline: v }),
  setInstallEvent: (e) => set({ installEvent: e }),
  setApplyUpdate: (fn) => set({ applyUpdate: fn }),
}))
