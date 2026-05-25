import { useState } from 'react'
import { IconCheck, IconLink, IconTrash } from '@tabler/icons-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAccounts } from '@/hooks/useAccounts'
import { useGoals } from '@/hooks/useGoals'
import { useToast } from '@/hooks/useToast'
import type { Goal } from '@/types'

interface Props {
  goal: Goal
  onClose: () => void
}

function isMoney(v: string) {
  return v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0
}

export function GoalEditModal({ goal, onClose }: Props) {
  const toast = useToast()
  const { data: accounts } = useAccounts()
  const { update, remove, setLinkedAccounts } = useGoals()

  const [name, setName] = useState(goal.name)
  const [target, setTarget] = useState(String(Math.round(goal.target)))
  const [monthly, setMonthly] = useState(String(Math.round(goal.monthly)))
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set(goal.linked_account_ids))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Debt goals only link to credit accounts; savings goals only to debit.
  const eligibleAccounts = accounts.filter((a) =>
    goal.is_debt ? a.type === 'credit' : a.type === 'debit',
  )

  function toggleAccount(id: string) {
    setLinkedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setError('')
    if (!name.trim() || !isMoney(target) || !isMoney(monthly)) {
      setError('Revisa los campos: nombre, monto y mensual son obligatorios.')
      return
    }
    setSubmitting(true)
    try {
      await update(goal.id, {
        name: name.trim(),
        target: Number(target),
        monthly: Number(monthly),
        deadline: deadline || null,
      })
      const currentSet = new Set(goal.linked_account_ids)
      const changed =
        currentSet.size !== linkedIds.size ||
        [...linkedIds].some((id) => !currentSet.has(id))
      if (changed) {
        await setLinkedAccounts(goal.id, Array.from(linkedIds))
      }
      toast.success('Meta actualizada', name.trim())
      onClose()
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`¿Eliminar la meta "${goal.name}"? Esta acción no se puede deshacer.`)) return
    setSubmitting(true)
    try {
      await remove(goal.id)
      toast.success('Meta eliminada', goal.name)
      onClose()
    } catch {
      setError('No se pudo eliminar.')
      setSubmitting(false)
    }
  }

  const targetNum = Number(target) || 0
  const monthlyNum = Number(monthly) || 0
  const remaining = Math.max(targetNum - goal.saved, 0)
  const monthsLeft = monthlyNum > 0 ? Math.ceil(remaining / monthlyNum) : Infinity

  const linkedBalance = accounts
    .filter((a) => linkedIds.has(a.id))
    .reduce((s, a) => s + Number(a.balance), 0)

  return (
    <Modal open title="Editar meta" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2.5">
          <Input
            label={goal.is_debt ? 'Deuda total' : 'Monto objetivo'}
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <Input
            label="Mensual"
            inputMode="decimal"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-semibold text-text-secondary">
            Fecha objetivo
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-[14px] text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Preview */}
        <div className="rounded-xl bg-bg-secondary p-3 text-[12px] text-text-secondary">
          A este ritmo logras la meta en{' '}
          <b className="text-text">
            {Number.isFinite(monthsLeft) ? `${monthsLeft} meses` : '∞ meses'}
          </b>
          .
        </div>

        {/* Linked accounts */}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-text-secondary">
            Cuentas enlazadas ({goal.is_debt ? 'crédito' : 'débito'})
          </p>
          {eligibleAccounts.length === 0 ? (
            <p className="rounded-xl bg-bg-secondary p-3 text-[12px] text-text-secondary">
              No tienes cuentas de {goal.is_debt ? 'crédito' : 'débito'}.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {eligibleAccounts.map((a) => {
                const sel = linkedIds.has(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAccount(a.id)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                    style={{
                      background: sel ? (a.color ?? '#6366F1') + '15' : 'var(--color-bg-secondary)',
                      borderWidth: 2,
                      borderStyle: 'solid',
                      borderColor: sel ? (a.color ?? '#6366F1') : 'transparent',
                    }}
                  >
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold text-white"
                      style={{ background: a.color ?? '#6B7194' }}
                    >
                      {a.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-text">{a.name}</p>
                      <p className="font-mono text-[11px] text-text-tertiary">
                        ${Math.round(a.balance).toLocaleString()}
                      </p>
                    </div>
                    {sel && <IconCheck size={18} stroke={3} color={a.color ?? '#6366F1'} />}
                  </button>
                )
              })}
            </div>
          )}

          {linkedIds.size > 0 && (
            <div className="mt-2 rounded-xl bg-asset-soft p-3 text-[12px] text-asset-deep">
              <IconLink size={12} className="mr-1 inline" />
              {goal.is_debt ? 'Deuda real enlazada' : 'Progreso enlazado'}:{' '}
              <b>
                $
                {Math.round(
                  goal.is_debt ? linkedBalance : linkedBalance,
                ).toLocaleString()}
              </b>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-debt-soft px-3 py-2 text-[12px] font-semibold text-debt">
            {error}
          </p>
        )}

        <Button loading={submitting} onClick={() => void handleSave()} className="mt-1">
          Guardar cambios
        </Button>

        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={submitting}
          className="flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-debt"
        >
          <IconTrash size={14} stroke={2} /> Eliminar meta
        </button>
      </div>
    </Modal>
  )
}
