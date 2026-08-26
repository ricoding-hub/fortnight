import { useCallback, useState } from 'react'
import type { useLoans, NewLoan, LoanPatch } from '@/hooks/useLoans'
import { useToast } from '@/hooks/useToast'
import { errorMessage } from '@/lib/errorMessage'
import { AbonoModal, MarkPaidModal } from '@/components/split/LoanActionModals'
import { LoanDetailModal } from '@/components/split/LoanDetailModal'
import { LoanFormModal } from '@/components/split/LoanFormModal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { formatMXN } from '@/lib/format'
import type { Loan, LoanDirection } from '@/types'

interface Options {
  /** The caller's `useLoans()` instance — injected so we don't open a second
   *  realtime channel for the same table. */
  loans: ReturnType<typeof useLoans>
  /** Names offered by the form's autocomplete. */
  existingNames?: string[]
  /** Extra work when creating (e.g. stamping the direct group id). */
  onCreate?: (data: NewLoan) => Promise<void>
  /** Extra work when editing (e.g. renaming the split member). */
  onEdit?: (id: string, patch: LoanPatch) => Promise<void>
  /** Called after any mutation, so the caller can refetch derived data. */
  afterMutation?: () => void | Promise<void>
}

/**
 * Owns every loan modal and its state in one place. Views call the `open*`
 * helpers and render `modals`; nothing can drift into a modal that is mounted
 * but unreachable, which is exactly how the per-loan actions got lost.
 */
export function useLoanActions(options: Options) {
  const { loans, existingNames = [], onCreate, onEdit, afterMutation } = options
  const toast = useToast()

  const [detailLoan, setDetailLoan] = useState<Loan | null>(null)
  const [abonoLoan, setAbonoLoan] = useState<Loan | null>(null)
  const [markPaidLoan, setMarkPaidLoan] = useState<Loan | null>(null)
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null)
  const [formDirection, setFormDirection] = useState<LoanDirection>('owed_to_me')

  const paymentsOf = useCallback(
    (loan: Loan | null) => (loan ? loans.paymentsByLoan[loan.id] ?? [] : []),
    [loans.paymentsByLoan],
  )

  /** Keep the open detail sheet in sync with the freshest loan row. */
  const liveDetailLoan = detailLoan
    ? loans.data.find((l) => l.id === detailLoan.id) ?? detailLoan
    : null

  async function settle(fn: () => Promise<void>, ok: [string, string], fail: string) {
    try {
      await fn()
      await afterMutation?.()
      toast.success(ok[0], ok[1])
    } catch (e) {
      toast.error(fail, errorMessage(e))
    }
  }

  const openCreate = useCallback((direction: LoanDirection = 'owed_to_me') => {
    setEditingLoan(null)
    setFormDirection(direction)
    setFormOpen(true)
  }, [])

  const openEditLoan = useCallback((loan: Loan) => {
    setEditingLoan(loan)
    setFormDirection(loan.direction)
    setFormOpen(true)
    setDetailLoan(null)
  }, [])

  const modals = (
    <>
      <LoanDetailModal
        open={liveDetailLoan != null}
        onClose={() => setDetailLoan(null)}
        loan={liveDetailLoan}
        payments={paymentsOf(liveDetailLoan)}
        onAbono={() => { setAbonoLoan(liveDetailLoan); setDetailLoan(null) }}
        onMarkPaid={() => { setMarkPaidLoan(liveDetailLoan); setDetailLoan(null) }}
        onUnmarkPaid={() => {
          const l = liveDetailLoan
          if (!l) return
          setDetailLoan(null)
          void settle(() => loans.unmarkPaid(l.id), ['Préstamo reabierto', `${l.name} volvió a estar activo`], 'No se pudo reabrir')
        }}
        onEdit={() => { if (liveDetailLoan) openEditLoan(liveDetailLoan) }}
        onDelete={() => { setDeletingLoan(liveDetailLoan); setDetailLoan(null) }}
        onDeletePayment={async (paymentId) => {
          await settle(
            () => loans.deletePayment(paymentId),
            ['Abono eliminado', 'El saldo pendiente se actualizó'],
            'No se pudo eliminar el abono',
          )
        }}
      />

      {abonoLoan && (
        <AbonoModal
          open
          loan={abonoLoan}
          payments={paymentsOf(abonoLoan)}
          onClose={() => setAbonoLoan(null)}
          onSubmit={async (amount, opts) => {
            const l = abonoLoan
            await settle(
              () => loans.addPayment(l.id, amount, opts),
              ['Abono registrado', `${formatMXN(amount)} · ${l.name}`],
              'No se pudo registrar el abono',
            )
            setAbonoLoan(null)
          }}
        />
      )}

      {markPaidLoan && (
        <MarkPaidModal
          open
          loan={markPaidLoan}
          payments={paymentsOf(markPaidLoan)}
          onClose={() => setMarkPaidLoan(null)}
          onSubmit={async (opts) => {
            const l = markPaidLoan
            await settle(
              () => loans.markPaid(l.id, opts),
              ['Préstamo saldado', `Cuentas claras con ${l.name}`],
              'No se pudo saldar',
            )
            setMarkPaidLoan(null)
          }}
        />
      )}

      <ConfirmModal
        open={deletingLoan != null}
        title="Eliminar préstamo"
        message={
          deletingLoan
            ? `Se eliminará el préstamo de ${deletingLoan.name} y sus abonos. Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          const l = deletingLoan
          if (!l) return
          void settle(() => loans.deleteLoan(l.id), ['Préstamo eliminado', `Se eliminó el préstamo de ${l.name}`], 'No se pudo eliminar')
        }}
        onClose={() => setDeletingLoan(null)}
      />

      <LoanFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingLoan(null) }}
        defaultDirection={formDirection}
        editingLoan={editingLoan}
        existingNames={existingNames}
        onCreate={async (data) => {
          if (onCreate) await onCreate(data)
          else await loans.create(data)
          await afterMutation?.()
          toast.success('Préstamo registrado', `${data.name} · ${formatMXN(data.amount)}`)
        }}
        onEdit={async (id, patch) => {
          if (onEdit) await onEdit(id, patch)
          else await loans.update(id, patch)
          await afterMutation?.()
          toast.success('Préstamo actualizado', patch.name ?? '')
        }}
      />
    </>
  )

  return {
    loans,
    openDetail: setDetailLoan,
    openAbono: setAbonoLoan,
    openMarkPaid: setMarkPaidLoan,
    openDelete: setDeletingLoan,
    openEdit: openEditLoan,
    openCreate,
    modals,
  }
}
