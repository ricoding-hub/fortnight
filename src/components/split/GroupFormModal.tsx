import { useEffect, useState } from 'react'
import { IconPlus, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

interface GroupFormModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, memberNames: string[]) => Promise<void>
}

export function GroupFormModal({ open, onClose, onCreate }: GroupFormModalProps) {
  const [name, setName] = useState('')
  const [memberNames, setMemberNames] = useState<string[]>(['', ''])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('')
      setMemberNames(['', ''])
      setFormError('')
    }
  }, [open])

  function setMember(i: number, value: string) {
    setMemberNames((prev) => prev.map((n, j) => (j === i ? value : n)))
  }

  function removeMember(i: number) {
    setMemberNames((prev) => prev.filter((_, j) => j !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = memberNames.map((n) => n.trim()).filter((n) => n.length > 0)
    if (!name.trim()) { setFormError('Escribe un nombre para el grupo'); return }
    if (cleaned.length === 0) { setFormError('Agrega al menos una persona además de ti'); return }
    const keys = cleaned.map((n) => n.toLowerCase())
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

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-text">Personas (además de ti)</p>
          {memberNames.map((n, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={n}
                onChange={(e) => setMember(i, e.target.value)}
                placeholder={`Persona ${i + 1}`}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg-elevated px-4 text-base text-text placeholder:text-text-tertiary transition-all hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              {memberNames.length > 1 && (
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
          ))}
          <button
            type="button"
            onClick={() => setMemberNames((prev) => [...prev, ''])}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
          >
            <IconPlus size={14} /> Agregar persona
          </button>
        </div>

        {formError && <p className="text-xs text-debt">• {formError}</p>}

        <Button type="submit" loading={submitting} className="mt-1">
          Crear grupo
        </Button>
      </form>
    </Modal>
  )
}
