import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconAlertTriangle, IconRefresh, IconTrash } from '@tabler/icons-react'

interface Props {
  children: ReactNode
  /** Shown in the copyable detail so we know which part of the app broke. */
  scope?: string
}

interface State {
  error: Error | null
  details: string | null
}

/**
 * Catches a render-time throw and shows something the user can act on.
 *
 * Without this, one bad line anywhere in the tree unmounts the whole app and
 * leaves a blank page — which is exactly what shipped in v1.7.5: a crash on
 * Inicio with no way for the user to see what happened, no way to recover, and
 * no way to tell us anything beyond "se quedó en blanco". A stack trace on a
 * phone is worthless unless it can be copied, so it can.
 *
 * Class component on purpose: `getDerivedStateFromError` has no hook.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, details: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept locally, never sent anywhere: this app handles financial data and
    // does not report to third parties.
    this.setState({ details: `${error.stack ?? error.message}\n${info.componentStack ?? ''}` })
    console.error('[Fortnight]', this.props.scope ?? 'app', error, info)
  }

  reload = () => {
    window.location.reload()
  }

  /** The way out when the failure really is a bad cache or a stuck worker. */
  resetApp = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      await Promise.all((regs ?? []).map((r) => r.unregister()))
      const keys = await caches?.keys?.()
      await Promise.all((keys ?? []).map((k) => caches.delete(k)))
    } catch {
      // Nothing to clean, or the browser won't let us. Reloading is still worth a try.
    }
    window.location.reload()
  }

  render() {
    const { error, details } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg px-6 py-10">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-peach-soft text-peach-deep">
          <IconAlertTriangle size={26} stroke={2} />
        </div>

        <div className="max-w-[34ch] text-center">
          <h1 className="font-display text-[20px] font-extrabold text-text">
            Algo se rompió en esta pantalla
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
            Tus datos están a salvo: esto falló al dibujar, no al guardar. Recarga
            para volver a entrar.
          </p>
        </div>

        <div className="flex w-full max-w-[280px] flex-col gap-2">
          <button
            type="button"
            onClick={this.reload}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[14px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            <IconRefresh size={16} stroke={2.2} /> Recargar
          </button>
          <button
            type="button"
            onClick={() => void this.resetApp()}
            className="flex items-center justify-center gap-2 rounded-xl bg-bg-secondary py-2.5 text-[12.5px] font-bold text-text-secondary transition-transform active:scale-[0.98]"
          >
            <IconTrash size={14} stroke={2.2} /> Si sigue igual, limpia la caché
          </button>
        </div>

        {/* The detail a user can actually send us from a phone. */}
        <details className="w-full max-w-[340px]">
          <summary className="cursor-pointer text-center text-[11.5px] font-semibold text-text-tertiary">
            Ver detalle técnico
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-bg-secondary p-3 text-[10px] leading-snug text-text-secondary">
            {this.props.scope ? `[${this.props.scope}] ` : ''}
            {details ?? error.message}
          </pre>
        </details>
      </div>
    )
  }
}
