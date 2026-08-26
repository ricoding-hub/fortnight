import { IconCloudOff, IconRefresh, IconSparkles } from '@tabler/icons-react'
import { usePwaStore } from '@/store/pwaStore'

/**
 * One slim banner for the two states the app used to keep to itself: a new
 * version waiting, and no connectivity. Both are actionable — updating and
 * reloading are the user's call, not a silent side effect.
 */
export function PwaBanner() {
  const updateReady = usePwaStore((s) => s.updateReady)
  const offline = usePwaStore((s) => s.offline)
  const backOnline = usePwaStore((s) => s.backOnline)
  const applyUpdate = usePwaStore((s) => s.applyUpdate)
  const setBackOnline = usePwaStore((s) => s.setBackOnline)

  if (!updateReady && !offline && !backOnline) return null

  // Offline is the most important thing to say, so it wins the slot.
  if (offline) {
    return (
      <Bar tone="warning" icon={<IconCloudOff size={15} stroke={2.2} />}>
        <span>Sin conexión. Estás viendo los últimos datos guardados.</span>
      </Bar>
    )
  }

  if (backOnline) {
    return (
      <Bar
        tone="asset"
        icon={<IconRefresh size={15} stroke={2.2} />}
        action={{ label: 'Actualizar', onClick: () => window.location.reload() }}
        onDismiss={() => setBackOnline(false)}
      >
        <span>Volvió la conexión. Recarga para ver tus datos al día.</span>
      </Bar>
    )
  }

  return (
    <Bar
      tone="primary"
      icon={<IconSparkles size={15} stroke={2.2} />}
      action={{ label: 'Actualizar', onClick: applyUpdate }}
      onDismiss={() => usePwaStore.setState({ updateReady: false })}
    >
      <span>Hay una versión nueva de Fortnight.</span>
    </Bar>
  )
}

function Bar({
  tone,
  icon,
  children,
  action,
  onDismiss,
}: {
  tone: 'primary' | 'warning' | 'asset'
  icon: React.ReactNode
  children: React.ReactNode
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void
}) {
  const tones = {
    primary: 'bg-primary-soft text-primary-deep',
    warning: 'bg-peach-soft text-peach-deep',
    asset: 'bg-asset-soft text-asset-deep',
  } as const

  return (
    <div
      role="status"
      className={`flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold ${tones[tone]}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 rounded-lg bg-white/60 px-2.5 py-1 text-[11.5px] font-bold transition-transform active:scale-95"
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Ocultar aviso"
          className="shrink-0 px-1 text-[15px] leading-none opacity-60 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  )
}
