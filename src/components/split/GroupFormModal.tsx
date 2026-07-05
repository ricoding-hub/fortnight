import { useEffect, useState } from 'react'
import { IconMail, IconPlus, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export interface GroupMemberDraft {
  name: string
  /** Optional — sends a Fortnight invitation after the group is created. */
  email: string
}

interface GroupFormModalProps {
  open: boolean
  onClose: () => void
  /** When false (migration 022 not applied) the email fields are hidden. */
  invitesEnabled?: boolean
  onCreate: (name: string, members: GroupMemberDraft[]) => Promise<void>
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function GroupFormModal({ open, onClose, invitesEnabled = false, onCreate }: GroupFormModalProps) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState<GroupMemberDraft[]>([
    { name: '', email: '' },
    { name: '', email: '' },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('')
      setMembers([{ name: '', email: '' }, { name: '', email: '' }])
      setFormError('')
    }
  }, [open])

  function setMember(i: number, patch: Partial<GroupMemberDraft>) {
    setMembers((prev) => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  }

  function removeMember(i: number) {
    setMembers((prev) => prev.filter((_, j) => j !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = members
      .map((m) => ({ name: m.name.trim(), email: m.email.trim().toLowerCase() }))
      .filter((m) => m.name.length > 0 || m.email.length > 0)
      .map((m) => ({ ...m, name: m.name || m.email.split('@')[0] }))
    if (!name.trim()) { setFormError('Escribe un nombre para el grupo'); return }
    if (cleaned.length === 0) { setFormError('Agrega al menos una persona además de ti'); return }
    const keys = cleaned.map((m) => m.name.toLowerCase())
    if (new Set(keys).size !== keys.length) { setFormError('Hay nombres repetidos'); return }
    const badEmail = cleaned.find((m) => m.email && !EMAIL_RE.test(m.email))
    if (badEmail) { setFormError(`Correo inválido: ${badEmail.email}`); return }
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

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-text">Personas (además de ti)</p>
          {members.map((m, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-xl bg-bg-secondary/50 p-2">
              <div className="flex items-center gap-2">
                <input
                  value={m.name}
                  onChange={(e) => setMember(i, { name: e.target.value })}
                  placeholder={`Persona ${i + 1}`}
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg-elevated px-4 text-base text-text placeholder:text-text-tertiary transition-all hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
                {members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMember(i)}
                    aria-label="Quitar persona"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-debt/10 hover:text-debt"
                  >
                    <IconX size={15} />
                  </button>
                )}
              </div>
              {invitesEnabled && (
                <div className="flex items-center gap-2 pl-1">
                  <IconMail size={14} className="shrink-0 text-text-tertiary" />
                  <input
                    type="email"
                    value={m.email}
                    onChange={(e) => setMember(i, { email: e.target.value })}
                    placeholder="Correo para invitar (opcional)"
                    autoComplete="off"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[13px] text-text placeholder:text-text-tertiary focus-visible:border-primary focus-visible:outline-none"
                  />
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setMembers((prev) => [...prev, { name: '', email: '' }])}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
          >
            <IconPlus size={14} /> Agregar persona
          </button>
        </div>

        {invitesEnabled && (
          <p className="text-[11px] leading-snug text-text-tertiary">
            Con correo: la persona recibe una invitación y verá el grupo en su propia
            cuenta. Sin correo: la administras tú como miembro local.
          </p>
        )}

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Crear grupo
        </Button>
      </form>
    </Modal>
  )
}
