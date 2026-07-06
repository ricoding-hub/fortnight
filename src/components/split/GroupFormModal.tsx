import { useEffect, useState } from 'react'
import { IconLink, IconPlus, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export interface GroupMemberDraft {
  name: string
  /** Linked Fortnight user (from recent contacts) — sees the group instantly. */
  memberUserId?: string | null
}

export interface RecentContact {
  name: string
  memberUserId: string | null
}

interface GroupFormModalProps {
  open: boolean
  onClose: () => void
  /** People from previous groups, offered as one-tap chips. */
  recentContacts?: RecentContact[]
  onCreate: (name: string, members: GroupMemberDraft[]) => Promise<void>
}

export function GroupFormModal({ open, onClose, recentContacts = [], onCreate }: GroupFormModalProps) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState<GroupMemberDraft[]>([{ name: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('')
      setMembers([{ name: '' }])
      setFormError('')
    }
  }, [open])

  const chosenKeys = new Set(
    members.map((m) => m.memberUserId ?? `local:${m.name.trim().toLowerCase()}`),
  )

  function addRecent(c: RecentContact) {
    const key = c.memberUserId ?? `local:${c.name.trim().toLowerCase()}`
    if (chosenKeys.has(key)) return
    setMembers((prev) => {
      // Fill the first empty row, else append.
      const emptyIdx = prev.findIndex((m) => !m.name.trim())
      const draft = { name: c.name, memberUserId: c.memberUserId }
      if (emptyIdx >= 0) return prev.map((m, i) => (i === emptyIdx ? draft : m))
      return [...prev, draft]
    })
  }

  function setMemberName(i: number, value: string) {
    // Typing over a linked contact detaches the link (it becomes a local name).
    setMembers((prev) => prev.map((m, j) => (j === i ? { name: value } : m)))
  }

  function removeMember(i: number) {
    setMembers((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ name: '' }]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = members
      .map((m) => ({ ...m, name: m.name.trim() }))
      .filter((m) => m.name.length > 0)
    if (!name.trim()) { setFormError('Escribe un nombre para el grupo'); return }
    if (cleaned.length === 0) { setFormError('Agrega al menos una persona además de ti'); return }
    const keys = cleaned.map((m) => m.name.toLowerCase())
    if (new Set(keys).size !== keys.length) { setFormError('Hay nombres repetidos'); return }
    setSubmitting(true)
    try {
      await onCreate(name.trim(), cleaned)
      onClose()
    } catch {
      setFormError('No se pudo crear el grupo')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo grupo">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="Nombre del grupo"
          placeholder="Viaje a Cancún, Depa, Cena…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        {recentContacts.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-text">Recientes</p>
            <div className="flex flex-wrap gap-1.5">
              {recentContacts.slice(0, 8).map((c) => {
                const key = c.memberUserId ?? `local:${c.name.trim().toLowerCase()}`
                const chosen = chosenKeys.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={chosen}
                    onClick={() => addRecent(c)}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-all active:scale-95',
                      chosen
                        ? 'bg-primary-soft text-primary-deep opacity-60'
                        : 'bg-bg-secondary text-text-secondary hover:bg-primary-soft hover:text-primary-deep',
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

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-text">Personas (además de ti)</p>
          {members.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={m.name}
                onChange={(e) => setMemberName(i, e.target.value)}
                placeholder={`Persona ${i + 1}`}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg-elevated px-4 text-base text-text placeholder:text-text-tertiary transition-all hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              {m.memberUserId && (
                <span className="shrink-0 rounded-full bg-asset-soft px-2 py-0.5 text-[10px] font-extrabold text-asset-deep">
                  Conectado
                </span>
              )}
              <button
                type="button"
                onClick={() => removeMember(i)}
                aria-label="Quitar persona"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
              >
                <IconX size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setMembers((prev) => [...prev, { name: '' }])}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
          >
            <IconPlus size={14} /> Agregar persona
          </button>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-text-tertiary">
          <IconLink size={13} className="mt-0.5 shrink-0" />
          Al crear el grupo podrás compartir un enlace de invitación para que
          cada persona se una con su propia cuenta.
        </p>

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Crear grupo
        </Button>
      </form>
    </Modal>
  )
}
