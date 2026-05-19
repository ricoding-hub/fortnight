/**
 * Lazy loader + thin wrapper around the Syncfy authentication widget.
 *
 * The widget script and stylesheet are injected on first use so the bundle
 * stays light for users who never connect a bank. The constructor and
 * lifecycle match the Syncfy quickstart example (v3 widget): we pass a
 * fresh token plus a `config` object and call `.open()` to launch.
 */

const WIDGET_CSS =
  'https://syncfy.com/widget/v3/syncfy-authentication-widget.css'
const WIDGET_JS = 'https://syncfy.com/widget/v3/syncfy-authentication-widget.js'

let scriptPromise: Promise<void> | null = null

declare global {
  interface Window {
    SyncfyWidget?: new (params: SyncfyWidgetParams) => SyncfyWidgetInstance
  }
}

interface SyncfyWidgetParams {
  token: string
  config: {
    locale?: string
    entrypoint?: {
      country?: string
      siteOrganizationType?: string
      id_site?: string
    }
    navigation?: {
      displayStatusInToast?: boolean
    }
  }
  events?: {
    /** Fired when the user successfully links a bank credential. */
    onSuccess?: (credential: SyncfyWidgetCredential) => void
    onError?: (err: unknown) => void
    onClose?: () => void
  }
}

export interface SyncfyWidgetCredential {
  id_credential: string
  id_site?: string
  /** Some widget versions expose the bank name here; we fall back if missing. */
  name?: string
  organization?: { name?: string }
}

export interface SyncfyWidgetInstance {
  open(): void
  close?(): void
  on?(event: string, cb: (...args: unknown[]) => void): void
}

/**
 * Loads the Syncfy widget script + stylesheet exactly once. Subsequent
 * calls reuse the cached promise.
 */
function loadWidget(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const cssLoaded = document.querySelector<HTMLLinkElement>(
      `link[data-syncfy="css"]`,
    )
    if (!cssLoaded) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = WIDGET_CSS
      link.dataset.syncfy = 'css'
      document.head.appendChild(link)
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-syncfy="js"]`,
    )
    if (existing && window.SyncfyWidget) {
      resolve()
      return
    }

    const script = existing ?? document.createElement('script')
    script.src = WIDGET_JS
    script.async = true
    script.dataset.syncfy = 'js'
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () =>
      reject(new Error('Failed to load Syncfy widget script')),
    )
    if (!existing) document.body.appendChild(script)
  })
  return scriptPromise
}

export interface OpenSyncfyWidgetOptions {
  token: string
  onSuccess: (credential: SyncfyWidgetCredential) => void
  onError?: (err: unknown) => void
  onClose?: () => void
}

/**
 * Loads the widget if needed, then instantiates it with Mexican defaults
 * and opens it. Returns the instance so callers can close it imperatively
 * (e.g. when their modal unmounts).
 */
export async function openSyncfyWidget(
  opts: OpenSyncfyWidgetOptions,
): Promise<SyncfyWidgetInstance> {
  await loadWidget()
  const Ctor = window.SyncfyWidget
  if (!Ctor) throw new Error('SyncfyWidget constructor not available')

  const instance = new Ctor({
    token: opts.token,
    config: {
      locale: 'es',
      entrypoint: {
        country: 'MX',
      },
      navigation: { displayStatusInToast: true },
    },
    events: {
      onSuccess: opts.onSuccess,
      onError: opts.onError,
      onClose: opts.onClose,
    },
  })

  // Some widget builds dispatch events via .on() instead of the events
  // option; wire both paths so we don't miss callbacks.
  instance.on?.('success', (cred) =>
    opts.onSuccess(cred as SyncfyWidgetCredential),
  )
  instance.on?.('error', (err) => opts.onError?.(err))
  instance.on?.('close', () => opts.onClose?.())

  instance.open()
  return instance
}
