import { type ReactNode, useState } from 'react'
import {
  IconBrowser,
  IconDeviceMobilePlus,
  IconDotsVertical,
  IconShare2,
  IconSquarePlus,
} from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { usePwaStore } from '@/store/pwaStore'
import { canOfferInstall, detectInstallMethod, type OfferableMethod } from '@/lib/install'
import { isStandalone } from '@/lib/platform'

const DISMISS_KEY = 'fortnight:install-dismissed'

/**
 * Offer to install the app — but only where installing is actually possible,
 * and only with steps that match the browser in front of the user.
 *
 * Chrome fires `beforeinstallprompt` exactly once; if the user dismisses the
 * browser's own infobar there is no way back, so we keep the event and offer
 * our own button. Safari has no such event and needs a written guide, which
 * differs between iPhone, iPad and the Mac. Everywhere else — desktop
 * Firefox, old Safari, the webviews that WhatsApp and Instagram open links
 * in — installing is not on the table and the banner stays away entirely.
 */
export function InstallPrompt() {
  const installEvent = usePwaStore((s) => s.installEvent)
  const setInstallEvent = usePwaStore((s) => s.setInstallEvent)
  const [guideOpen, setGuideOpen] = useState(false)
  // Read once on mount: an effect would flash the banner before hiding it.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  const method = detectInstallMethod({
    hasPromptEvent: installEvent != null,
    standalone: isStandalone(),
    ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
  })

  if (dismissed || !canOfferInstall(method)) return null

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
    // Only burn the event when they actually installed. Clearing it on
    // 'dismissed' too meant cancelling the dialog killed our own offer until
    // the next reload — the very trap the browser infobar sets.
    if (outcome === 'accepted') {
      setInstallEvent(null)
      dismiss()
    }
  }

  const copy = COPY[method]

  return (
    <>
      <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-primary-soft px-3.5 py-2.5">
        <IconDeviceMobilePlus size={18} className="shrink-0 text-primary-deep" stroke={2.2} />
        <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-primary-deep">
          {copy.banner}
        </p>
        {/* No button where there is nothing to press: in another iOS browser
            the only move is opening Safari, and a button can't do that. */}
        {method !== 'ios-elsewhere' && (
          <button
            type="button"
            onClick={() => (method === 'prompt' ? void install() : setGuideOpen(true))}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-bold text-white transition-transform active:scale-95"
          >
            {method === 'prompt' ? 'Instalar' : 'Cómo'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ahora no"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[16px] leading-none text-primary-deep opacity-55 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      </div>

      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title={copy.title}>
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] leading-relaxed text-text-secondary">{copy.intro}</p>
          <ol className="flex flex-col gap-3">
            {copy.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-deep">
                  {s.icon}
                </span>
                <span className="text-[13px] text-text">{s.text}</span>
              </li>
            ))}
          </ol>
          {copy.note && (
            <p className="rounded-xl bg-bg-secondary px-3.5 py-2.5 text-[12px] leading-snug text-text-secondary">
              {copy.note}
            </p>
          )}
          <Button onClick={() => setGuideOpen(false)}>Entendido</Button>
        </div>
      </Modal>
    </>
  )
}

interface Copy {
  banner: string
  title: string
  intro: string
  steps: { icon: ReactNode; text: ReactNode }[]
  note?: ReactNode
}

const share = <IconShare2 size={17} stroke={2.2} />
const add = <IconSquarePlus size={17} stroke={2.2} />
const menu = <IconDotsVertical size={17} stroke={2.2} />
const browser = <IconBrowser size={17} stroke={2.2} />

/** iOS keeps the installed app's cookies apart from Safari's. */
const IOS_SESSION_NOTE =
  'Al abrirla desde el icono te pedirá iniciar sesión una vez más: la app instalada no comparte la sesión con Safari.'

const COPY: Record<OfferableMethod, Copy> = {
  prompt: {
    banner: 'Instala Fortnight para abrirla como app y usarla sin conexión.',
    title: 'Instalar Fortnight',
    intro: 'Tu navegador puede instalarla en un toque.',
    steps: [{ icon: add, text: 'Confirma en el cuadro que abre el navegador.' }],
  },

  'ios-safari': {
    banner: 'Instala Fortnight para abrirla como app y usarla sin conexión.',
    title: 'Instalar en iPhone',
    intro: 'Safari no permite instalar con un botón. Son dos pasos desde el navegador:',
    steps: [
      { icon: share, text: <>Toca <b>Compartir</b> en la barra inferior de Safari.</> },
      { icon: add, text: <>Elige <b>Añadir a pantalla de inicio</b> y confirma.</> },
    ],
    note: IOS_SESSION_NOTE,
  },

  'ipad-safari': {
    banner: 'Instala Fortnight para abrirla como app y usarla sin conexión.',
    title: 'Instalar en iPad',
    intro: 'Safari no permite instalar con un botón. Son dos pasos desde el navegador:',
    steps: [
      { icon: share, text: <>Toca <b>Compartir</b> en la barra superior de Safari.</> },
      { icon: add, text: <>Elige <b>Añadir a pantalla de inicio</b> y confirma.</> },
    ],
    note: IOS_SESSION_NOTE,
  },

  'macos-safari': {
    banner: 'Añade Fortnight al Dock para abrirla como app.',
    title: 'Añadir al Dock',
    intro: 'Safari la instala como app desde el menú Compartir:',
    steps: [
      { icon: share, text: <>Abre <b>Compartir</b> en la barra de Safari.</> },
      { icon: add, text: <>Elige <b>Añadir al Dock</b> y confirma.</> },
    ],
  },

  'android-firefox': {
    banner: 'Instala Fortnight para abrirla como app y usarla sin conexión.',
    title: 'Instalar en Firefox',
    intro: 'Firefox instala desde su propio menú:',
    steps: [
      { icon: menu, text: <>Abre el menú <b>⋮</b> arriba a la derecha.</> },
      { icon: add, text: <>Elige <b>Instalar</b> y confirma.</> },
    ],
  },

  // Chrome, Firefox y los navegadores dentro de WhatsApp o Instagram no pueden
  // instalar en iOS: sólo Safari. Se dice, sin prometer un botón que no existe.
  'ios-elsewhere': {
    banner: 'Ábrela en Safari para instalarla como app en tu iPhone.',
    title: 'Instalar en iPhone',
    intro: 'En iPhone sólo Safari puede instalar una app web.',
    steps: [{ icon: browser, text: <>Abre esta página en <b>Safari</b>.</> }],
    note: IOS_SESSION_NOTE,
  },
}
