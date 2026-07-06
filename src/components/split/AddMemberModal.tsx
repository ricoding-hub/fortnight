import { useEffect, useState } from 'react'
import { IconCheck, IconCopy, IconShare, IconUserPlus } from '@tabler/icons-react'
import clsx from 'clsx'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { RecentContact } from '@/components/split/GroupFormModal'

interface AddMemberModalProps {
  open: boolean
  onClose: () => void
  groupName: string
  /** Join link (/join/{invite_code}); undefined until migration 023 runs. */
  inviteLink?: string
  /** Contacts from other groups, excluding people already in this one. */
  recentContacts: RecentContact[]
  onAdd: (name: string, memberUserId?: string | null) => Promise<void>
}

export function AddMemberModal({
  open,
  onClose,
  groupName,
  inviteLink,
  recentContacts,
  onAdd,
}: AddMemberModalProps) {
  const [name, setName] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('')
      setBusyKey(null)
      setCopied(false)
      setFormError('')
    }
  }, [open])

  async function add(personName: string, memberUserId?: string | null, key = 'input') {
    setBusyKey(key)
    setFormError('')
    try {
      await onAdd(personName, memberUserId)
      onClose()
    } catch {
      setFormError('No se pudo agregar — quizá ya hay alguien con ese nombre en el grupo')
      setBusyKey(null)
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function shareLink() {
    if (!inviteLink) return
    if (canNativeShare) {
      try {
        await navigator.share({
          title: `Únete a "${groupName}" en Fortnight`,
          url: inviteLink,
        })
        return
      } catch {
        // user cancelled the share sheet — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setFormError('No se pudo copiar el enlace')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Agregar personas">
      <div className="flex flex-col gap-3">
        {/* Share invite link — the Splitwise way */}
        {inviteLink && (
          <button
            type="button"
            onClick={() => void shareLink()}
            className="flex items-center gap-3 rounded-xl bg-primary-soft/40 px-3.5 py-3 text-left transition-all active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              {copied ? <IconCheck size={17} stroke={2.5} /> : canNativeShare ? <IconShare size={17} /> : <IconCopy size={17} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-text">
                {copied ? '¡Enlace copiado!' : 'Compartir enlace de invitación'}
              </span>
              <span className="block text-[11px] leading-snug text-text-secondary">
                Quien lo abra elige quién es en el grupo o se agrega como persona nueva.
              </span>
            </span>
          </button>
        )}

        {/* Recent contacts */}
        {recentContacts.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
              Recientes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recentContacts.slice(0, 8).map((c) => {
                const key = c.memberUserId ?? `local:${c.name.trim().toLowerCase()}`
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={busyKey != null}
                    onClick={() => void add(c.name, c.memberUserId, key)}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full bg-bg-secondary px-3 py-1.5 text-[12px] font-bold text-text-secondary transition-all hover:bg-primary-soft hover:text-primary-deep active:scale-95',
                      busyKey === key && 'opacity-50',
                    )}
                  >
                    {c.memberUserId && (
                      <span className="h-1.5 w-1.5 rounded-full bg-asset" aria-hidden />
                    )}
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* New local member */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Persona nueva (la administras tú)
          </p>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              autoComplete="off"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg-elevated px-4 text-base text-text placeholder:text-text-tertiary transition-all hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <Button
              compact
              loading={busyKey === 'input'}
              disabled={!name.trim() || busyKey != null}
              onClick={() => void add(name.trim())}
            >
              <IconUserPlus size={14} /> Agregar
            </Button>
          </div>
        </div>

        {formError && <p className="text-xs text-debt">• {formError}</p>}
      </div>
    </Modal>
  )
}
