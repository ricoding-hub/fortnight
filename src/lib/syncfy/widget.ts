/**
 * Lazy loader + thin wrapper around the Syncfy authentication widget v3.
 *
 * The widget requires:
 *   1. A <div> in the DOM to mount into (element: "#syncfy-widget")
 *   2. token + config passed to the constructor
 *   3. Callbacks registered via .on() AFTER construction
 *
 * Reference: https://github.com/Paybook/sync-widget/blob/master/widget/
 */

const WIDGET_CSS =
  'https://www.syncfy.com/widget/v3/syncfy-authentication-widget.css'
const WIDGET_JS =
  'https://www.syncfy.com/widget/v3/syncfy-authentication-widget.js'

const CONTAINER_ID = 'syncfy-widget-root'
const SCRIPT_TIMEOUT_MS = 15_000

let scriptPromise: Promise<void> | null = null

declare global {
  interface Window {
    SyncfyWidget?: new (params: SyncfyWidgetParams) => SyncfyWidgetInstance
  }
}

interface SyncfyWidgetParams {
  token: string
  /** CSS selector of the mount element — required by the widget. */
  element: string
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
}

export interface SyncfyWidgetCredential {
  id_credential: string
  id_site?: string
  name?: string
  organization?: { name?: string }
}

export interface SyncfyWidgetInstance {
  open(): void
  close(): void
  on(event: string, cb: (...args: unknown[]) => void): void
}

/** Ensures the mount div exists and returns its CSS selector. */
function ensureContainer(): string {
  if (!document.getElementById(CONTAINER_ID)) {
    const div = document.createElement('div')
    div.id = CONTAINER_ID
    document.body.appendChild(div)
  }
  return `#${CONTAINER_ID}`
}

/**
 * Loads the Syncfy widget script + stylesheet exactly once. The promise is
 * cached after a successful load; cleared on failure so the next call retries.
 */
function loadWidget(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (!document.querySelector(`link[data-syncfy="css"]`)) {
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

    const fail = (msg: string) => {
      document.querySelector(`script[data-syncfy="js"]`)?.remove()
      scriptPromise = null
      reject(new Error(msg))
    }

    const timer = setTimeout(
      () => fail('El widget tardó demasiado en cargar (timeout)'),
      SCRIPT_TIMEOUT_MS,
    )

    const script = existing ?? document.createElement('script')
    script.src = WIDGET_JS
    script.async = true
    script.dataset.syncfy = 'js'
    script.addEventListener('load', () => { clearTimeout(timer); resolve() })
    script.addEventListener('error', () => {
      clearTimeout(timer)
      fail('No se pudo descargar el widget de Syncfy')
    })
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
 * Loads the widget if needed, mounts it into a dedicated container div,
 * registers callbacks via .on(), and calls open().
 */
export async function openSyncfyWidget(
  opts: OpenSyncfyWidgetOptions,
): Promise<SyncfyWidgetInstance> {
  await loadWidget()
  const Ctor = window.SyncfyWidget
  if (!Ctor) throw new Error('SyncfyWidget constructor not available')

  const element = ensureContainer()

  const instance = new Ctor({
    token: opts.token,
    element,
    config: {
      locale: 'es',
      entrypoint: { country: 'MX' },
      navigation: { displayStatusInToast: true },
    },
  })

  // Events registered via .on() after construction.
  // Note: close event name is "closed" in the v3 API.
  instance.on('success', (cred) => opts.onSuccess(cred as SyncfyWidgetCredential))
  instance.on('error', (err) => opts.onError?.(err))
  instance.on('closed', () => opts.onClose?.())

  instance.open()
  return instance
}
