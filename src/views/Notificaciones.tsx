import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  IconBell,
  IconCash,
  IconChevronLeft,
  IconCreditCard,
  IconRocket,
  IconTarget,
  IconUsers,
  IconX,
} from '@tabler/icons-react'
import { useNotifications } from '@/hooks/useNotifications'
import { Richeto } from '@/components/Richeto'
import type { Notification, NotificationType } from '@/types'

const TYPE_META: Record<
  NotificationType,
  { icon: typeof IconBell; bg: string; fg: string }
> = {
  payment_due: { icon: IconCreditCard, bg: 'bg-debt-soft', fg: 'text-debt-deep' },
  payday: { icon: IconCash, bg: 'bg-asset-soft', fg: 'text-asset-deep' },
  goal: { icon: IconRocket, bg: 'bg-lavender-soft', fg: 'text-lavender-deep' },
  mission: { icon: IconTarget, bg: 'bg-primary-soft', fg: 'text-primary-deep' },
  split: { icon: IconUsers, bg: 'bg-primary-soft', fg: 'text-primary-deep' },
}

export function Notificaciones() {
  const navigate = useNavigate()
  const { data, unreadCount, loading, markRead, markAllRead, dismiss } =
    useNotifications()

  return (
    <div className="flex flex-col pb-24 animate-[fade-in_300ms_ease-out]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pb-2 pt-4 lg:pt-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Volver"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated text-text-secondary shadow-card transition-all active:scale-95"
          >
            <IconChevronLeft size={18} stroke={2} />
          </button>
          <div>
            <h1 className="font-display text-[22px] font-bold leading-tight text-text">
              Notificaciones
            </h1>
            {unreadCount > 0 && (
              <p className="text-[11px] font-semibold text-text-tertiary">
                {unreadCount} sin leer
              </p>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-[12px] font-bold text-primary transition-opacity active:opacity-70"
          >
            Marcar todo leído
          </button>
        )}
      </header>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-2 px-4 pt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl shimmer" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
          <Richeto size={72} />
          <p className="font-display text-lg font-bold text-text">
            Todo está al día
          </p>
          <p className="text-sm text-text-secondary">
            No tienes notificaciones pendientes.
          </p>
        </div>
      )}

      {/* List */}
      {!loading && data.length > 0 && (
        <ul className="flex flex-col px-4 pt-2">
          {data.map((notif) => (
            <NotifItem
              key={notif.id}
              notif={notif}
              onRead={() => {
                void markRead(notif.id)
                if (notif.link) void navigate(notif.link)
              }}
              onDismiss={() => void dismiss(notif.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface NotifItemProps {
  notif: Notification
  onRead: () => void
  onDismiss: () => void
}

function NotifItem({ notif, onRead, onDismiss }: NotifItemProps) {
  const meta = TYPE_META[notif.type] ?? TYPE_META['payday']
  const Icon = meta.icon
  const timeAgo = formatDistanceToNow(parseISO(notif.created_at), {
    locale: es,
    addSuffix: true,
  })

  return (
    <li
      className={
        'flex items-start gap-3 rounded-xl px-3 py-3.5 transition-colors ' +
        (notif.read ? '' : 'bg-primary-tint')
      }
    >
      <button
        type="button"
        onClick={onRead}
        className="mt-0.5 shrink-0 transition-transform active:scale-95"
        aria-label="Marcar como leída"
      >
        <span
          className={
            'flex h-9 w-9 items-center justify-center rounded-md ' + meta.bg
          }
        >
          <Icon size={16} stroke={2} className={meta.fg} />
        </span>
      </button>

      <button
        type="button"
        onClick={onRead}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <p className="text-[13px] font-bold leading-snug text-text">
          {notif.title}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
          {notif.body}
        </p>
        <p className="mt-1 text-[10.5px] text-text-tertiary">{timeAgo}</p>
      </button>

      {!notif.read && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Descartar"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-all hover:bg-bg-secondary active:scale-95"
      >
        <IconX size={14} stroke={2} />
      </button>
    </li>
  )
}
