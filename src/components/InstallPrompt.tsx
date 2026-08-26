import { useState } from 'react'
import { IconDeviceMobilePlus, IconShare2, IconSquarePlus } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { usePwaStore } from '@/store/pwaStore'

const DISMISS_KEY = 'fortnight:install-dismissed'

/** Already running as an installed app? Then there is nothing to offer. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Offer to install the app on our own terms.
 *
 * Chrome fires `beforeinstallprompt` exactly once; if the user dismisses the
 * browser's own infobar there is no way back. We keep the event and offer a
 * button that works whenever they want it. iOS has no such event at all, so
 * there we explain the manual Share > Add to Home Screen flow instead.
 */
export function InstallPrompt() {
  const installEvent = usePwaStore((s) => s.installEvent)
  const setInstallEvent = usePwaStore((s) => s.setInstallEvent)
  const [iosOpen, setIosOpen] = useState(false)
  // Read once on mount: an effect would flash the banner before hiding it.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (isStandalone() || dismissed) return null

  const ios = isIOS()
  // On iOS we always offer the guide; elsewhere only when Chrome gave us the event.
  if (!ios && !installEvent) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Private mode: fine, we just won't remember.
    }
  }

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    setInstallEvent(null)
    if (outcome === 'accepted') dismiss()
  }

  return (
    <>
      <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-primary-soft px-3.5 py-2.5">
        <IconDeviceMobilePlus size={18} className="shrink-0 text-primary-deep" stroke={2.2} />
        <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-primary-deep">
          Instala Fortnight para abrirla como app y usarla sin conexión.
        </p>
        <button
          type="button"
          onClick={() => (ios ? setIosOpen(true) : void install())}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-bold text-white transition-transform active:scale-95"
        >
          Instalar
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ahora no"
          className="shrink-0 px-1 text-[16px] leading-none text-primary-deep opacity-55 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      </div>

      <Modal open={iosOpen} onClose={() => setIosOpen(false)} title="Instalar en iPhone">
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] leading-relaxed text-text-secondary">
            Safari no permite instalar con un botón. Son dos pasos desde el navegador:
          </p>
          <ol className="flex flex-col gap-3">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-deep">
                <IconShare2 size={17} stroke={2.2} />
              </span>
              <span className="text-[13px] text-text">
                Toca <b>Compartir</b> en la barra inferior de Safari.
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-deep">
                <IconSquarePlus size={17} stroke={2.2} />
              </span>
              <span className="text-[13px] text-text">
                Elige <b>Añadir a pantalla de inicio</b> y confirma.
              </span>
            </li>
          </ol>
          <p className="rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[12px] leading-snug text-text-secondary">
            Al abrirla desde el icono te pedirá iniciar sesión una vez más: la app
            instalada no comparte la sesión con Safari.
          </p>
          <Button onClick={() => setIosOpen(false)}>Entendido</Button>
        </div>
      </Modal>
    </>
  )
}
