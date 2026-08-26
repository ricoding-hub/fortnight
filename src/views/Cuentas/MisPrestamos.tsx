import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowDown, IconArrowUp, IconCheck, IconUsers } from '@tabler/icons-react'
import clsx from 'clsx'

import { supabase } from '@/lib/supabase'
import { useLoans, loanRemaining } from '@/hooks/useLoans'
import { useSplitGroups, memberIsMe } from '@/hooks/useSplitGroups'
import { usePeopleBalances, type BalanceEntry } from '@/hooks/usePeopleBalances'
import { useLoanActions } from '@/hooks/useLoanActions'
import { BalanceRow } from '@/components/split/BalanceRow'
import { ContactLoansModal } from '@/components/split/ContactLoansModal'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useUiStore } from '@/store/uiStore'
import { GroupFormModal } from '@/components/split/GroupFormModal'
import { ExpenseFormModal } from '@/components/split/ExpenseFormModal'
import { SettleAllModal, type SettleAllBreakdownLine } from '@/components/split/SettleAllModal'
import { LoanFlowChart } from '@/components/LoanFlowChart'
import { buildLoanFlow } from '@/lib/loanFlow'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/StatCard'
import { fmtCompact } from '@/lib/loanFormat'
import { formatMXN } from '@/lib/format'
import type { Loan, LoanDirection, SplitExpense, SplitExpenseShare, SplitSettlement } from '@/types'

export function MisPrestamos() {
  const loansApi = useLoans()
  const {
    data: allLoans,
    active,
    paid,
    paymentsByLoan,
    loading,
    error,
    refetch: refetchLoans,
  } = loansApi
  const {
    groups: splitGroups,
    profiles,
    recentContacts,
    ready: splitReady,
    displayName,
    createGroup,
    ensureDirectGroup,
    settleAllWithContact,
    addExpense,
  } = useSplitGroups({ loans: allLoans, paymentsByLoan })
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const storeLoanOpen = useUiStore((s) => s.loanModalOpen)
  const closeLoanModal = useUiStore((s) => s.closeLoanModal)

  const [groupFormOpen, setGroupFormOpen] = useState(false)
  const [settleAllContact, setSettleAllContact] = useState<{
    name: string
    net: number
    breakdown: SettleAllBreakdownLine[]
  } | null>(null)
  const [addExpenseGroupId, setAddExpenseGroupId] = useState<string | null>(null)
  /** Person sheet for a contact with no split group (works offline). */
  const [contactSheet, setContactSheet] = useState<BalanceEntry | null>(null)

  const allNames = useMemo(() => {
    const names = new Set([...active, ...paid].map((l) => l.name.trim()))
    return Array.from(names).sort()
  }, [active, paid])

  // Direct 2-person group per contact (connected or not), for the settle-all
  // breakdown and for keeping a renamed contact in sync with their group.
  const directGroupByContact = useMemo(() => {
    const map = new Map<string, (typeof splitGroups)[number]>()
    for (const g of splitGroups) {
      if (g.activeMembers.length !== 2) continue
      const contact = g.activeMembers.find((m) => !memberIsMe(m, user?.id))
      if (contact) map.set(contact.name.trim().toLowerCase(), g)
    }
    return map
  }, [splitGroups, user?.id])

  // Unified Splitwise-style balances (people + groups) — the single source for
  // the list AND the KPIs, so the hero can never disagree with the rows.
  const balances = usePeopleBalances({
    active,
    paid,
    paymentsByLoan,
    splitGroups,
    profiles,
    displayName,
    userId: user?.id,
  })
  const { totalCobrar, totalPagar, netoTotal, peopleOwingMe, peopleIOwe } = balances
  const teDeben = balances.entries.filter((e) => e.net > 0.005)
  const debes = balances.entries.filter((e) => e.net < -0.005)
  const enPaz = balances.entries.filter((e) => Math.abs(e.net) <= 0.005)

  /* ── Loan actions (detail, abono, saldar, editar, eliminar) ── */
  const loanActions = useLoanActions({
    loans: loansApi,
    existingNames: allNames,
    afterMutation: refetchLoans,
    onCreate: async (data) => {
      // Stamp the loan into the contact's existing direct group when there is
      // one and it isn't connected (connected groups keep loans private).
      const direct = directGroupByContact.get(data.name.trim().toLowerCase())
      const groupId = direct && !direct.isConnected ? direct.group.id : null
      await loansApi.create({ ...data, group_id: groupId })
    },
    onEdit: async (id, patch) => {
      const before = allLoans.find((l) => l.id === id)
      await loansApi.update(id, patch)
      // Renaming the contact should rename their 1:1 member row too, or the
      // loan silently detaches from the relationship it belongs to.
      const oldName = before?.name.trim().toLowerCase()
      const newName = patch.name?.trim()
      if (!newName || !oldName || newName.toLowerCase() === oldName) return
      const direct = directGroupByContact.get(oldName)
      if (!direct || direct.isConnected) return
      const member = direct.activeMembers.find((m) => !memberIsMe(m, user?.id))
      if (!member) return
      await supabase.from('split_members').update({ name: newName }).eq('id', member.id)
      if (direct.group.name.trim().toLowerCase() === oldName) {
        await supabase.from('split_groups').update({ name: newName }).eq('id', direct.group.id)
      }
    },
  })

  function openCreate(dir: LoanDirection = 'owed_to_me') {
    loanActions.openCreate(dir)
  }

  useEffect(() => {
    if (storeLoanOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openCreate('owed_to_me')
      closeLoanModal()
    }
  }, [storeLoanOpen, closeLoanModal])

  // Group backing the add-expense modal.
  const addExpenseGroup = addExpenseGroupId
    ? splitGroups.find((g) => g.group.id === addExpenseGroupId)
    : undefined

  // Recovered in the last 30 days: abonos on owed_to_me loans + settlements received.
  const recuperado30d = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffISO = cutoff.toISOString()
    let sum = 0
    for (const l of allLoans) {
      if (l.direction !== 'owed_to_me') continue
      for (const p of paymentsByLoan[l.id] ?? []) {
        if (p.created_at >= cutoffISO) sum += Number(p.amount)
      }
    }
    for (const g of splitGroups) {
      const me = g.members.find((m) => memberIsMe(m, user?.id))
      if (!me) continue
      for (const s of g.settlements) {
        if (s.to_member_id === me.id && s.created_at >= cutoffISO) sum += Number(s.amount)
      }
    }
    return sum
  }, [allLoans, paymentsByLoan, splitGroups, user?.id])

  // Monthly lending flow for the chart at the bottom.
  const loanFlow = useMemo(() => {
    const myMemberIds = new Set<string>()
    const expenses: SplitExpense[] = []
    const settlements: SplitSettlement[] = []
    const sharesByExpense = new Map<string, SplitExpenseShare[]>()
    for (const g of splitGroups) {
      const me = g.members.find((m) => memberIsMe(m, user?.id))
      if (me) myMemberIds.add(me.id)
      expenses.push(...g.expenses)
      settlements.push(...g.settlements)
      for (const e of g.expenses) {
        sharesByExpense.set(e.id, g.sharesByExpense.get(e.id) ?? [])
      }
    }
    return buildLoanFlow({
      loans: allLoans,
      paymentsByLoan,
      expenses,
      sharesByExpense,
      settlements,
      myMemberIds,
      now: new Date(),
      months: 6,
    })
  }, [splitGroups, allLoans, paymentsByLoan, user?.id])

  const hasFlowData = useMemo(
    () => loanFlow.some((p) => p.prestado !== 0 || p.recuperado !== 0 || p.pendiente !== 0),
    [loanFlow],
  )

  /**
   * Open a balance. A real group navigates to its screen; a purely local
   * contact opens their loans sheet instead of materialising a group as a
   * side effect of a tap (which also broke before the split migrations).
   */
  function openEntry(e: BalanceEntry) {
    if (e.groupId) void navigate(`/cuentas/prestamos/${e.groupId}`)
    else setContactSheet(e)
  }

  /** Prepare the settle-all modal with a transparent breakdown. */
  function openSettleAll(e: BalanceEntry) {
    if (Math.abs(e.net) < 0.005) return
    const breakdown: SettleAllBreakdownLine[] = e.loans
      .map((l) => ({
        label: `Préstamo · ${l.direction === 'owed_to_me' ? 'te debe' : 'debes'}`,
        amount: loanRemaining(l, paymentsByLoan[l.id] ?? []),
      }))
      .filter((line) => line.amount > 0)
    const direct = directGroupByContact.get((e.contactName ?? e.name).trim().toLowerCase())
    if (direct && Math.abs(direct.mySplitNet) > 0.005) {
      breakdown.push({ label: 'Gastos compartidos (neto)', amount: Math.abs(direct.mySplitNet) })
    }
    setSettleAllContact({ name: e.contactName ?? e.name, net: e.net, breakdown })
  }

  async function handleSettleAll(opts: { accountId?: string | null; note?: string | null }) {
    if (!settleAllContact) return
    const groupId = await ensureDirectGroup(settleAllContact.name)
    await settleAllWithContact(groupId, opts)
    // Immediate refresh — loan payments live in useLoans, whose realtime
    // echo may lag; without this the settled balance lingered on screen.
    await refetchLoans()
    toast.success(
      'Todo saldado',
      `Cuentas en cero con ${settleAllContact.name} · ${formatMXN(Math.abs(settleAllContact.net))}`,
    )
  }

  /** Wiring shared by every BalanceRow: per-loan actions. */
  const loanRowHandlers = {
    paymentsByLoan,
    onOpenLoan: loanActions.openDetail,
    onAbonoLoan: loanActions.openAbono,
    onMarkPaidLoan: loanActions.openMarkPaid,
    onEditLoan: loanActions.openEdit,
    onDeleteLoan: loanActions.openDelete,
    onUnmarkPaidLoan: (l: Loan) => loanActions.openDetail(l),
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3 animate-[fade-in_300ms_ease-out]">
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] rounded-xl shimmer" />
          ))}
        </div>
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-debt/20 bg-debt/5">
          <p className="text-sm font-medium text-debt">No se pudieron cargar los préstamos.</p>
        </Card>
      </div>
    )
  }

  const hasAny = balances.entries.length > 0

  return (
    <div className="flex flex-col gap-3 pb-24 animate-[fade-in_300ms_ease-out]">
      {/* Net balance hero — loans + splits, always coherent. Hidden when
          there is nothing yet so the empty state stands alone. */}
      {hasAny && (
      <>
      <div className="px-4 pt-2">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-text-secondary">Balance de préstamos</p>
          <p
            className={clsx(
              'mt-0.5 text-[26px] font-bold leading-tight tabular-nums',
              netoTotal > 0 ? 'text-asset-deep' : netoTotal < 0 ? 'text-debt-deep' : 'text-text',
            )}
          >
            {netoTotal > 0 ? '+' : ''}{fmtCompact(netoTotal)}
          </p>
          {(totalCobrar > 0 || totalPagar > 0) && (
            <div className="mt-2.5 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
              <div
                className="rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(totalCobrar / (totalCobrar + totalPagar)) * 100}%` }}
              />
              <div
                className="rounded-full bg-debt transition-all duration-500"
                style={{ width: `${(totalPagar / (totalCobrar + totalPagar)) * 100}%` }}
              />
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            {peopleOwingMe > 0 && `Te deben ${peopleOwingMe} persona${peopleOwingMe === 1 ? '' : 's'}`}
            {peopleOwingMe > 0 && peopleIOwe > 0 && ' · '}
            {peopleIOwe > 0 && `Debes a ${peopleIOwe} persona${peopleIOwe === 1 ? '' : 's'}`}
            {peopleOwingMe === 0 && peopleIOwe === 0 && 'Sin saldos pendientes'}
          </p>
        </Card>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2 px-4">
        <StatCard compact label="Por cobrar" value={fmtCompact(totalCobrar)} tone="primary" icon={IconArrowDown} />
        <StatCard compact label="Por pagar" value={fmtCompact(totalPagar)} tone="debt" icon={IconArrowUp} />
        <StatCard compact label="Recuperado 30d" value={fmtCompact(recuperado30d)} tone="asset" icon={IconCheck} />
      </div>
      </>
      )}

      {!hasAny ? (
        <div className="px-4">
          <EmptyState
            icon={IconUsers}
            title="Sin préstamos"
            description="Registra lo que te deben, lo que debes, o crea un grupo para dividir gastos."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button compact onClick={() => openCreate('owed_to_me')}>
                  <IconArrowDown size={14} /> Me deben
                </Button>
                <Button compact variant="secondary" onClick={() => openCreate('i_owe')}>
                  <IconArrowUp size={14} /> Yo debo
                </Button>
                {splitReady && (
                  <Button compact variant="secondary" onClick={() => setGroupFormOpen(true)}>
                    <IconUsers size={14} /> Grupo
                  </Button>
                )}
              </div>
            }
          />
        </div>
      ) : (
        <>
          {/* Saldos — Splitwise-style balances (people + groups) */}
          <div className="flex flex-col gap-3 px-4">
            <div className="flex items-center justify-end gap-3">
              {splitReady && (
                <button
                  type="button"
                  onClick={() => setGroupFormOpen(true)}
                  className="text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
                >
                  + Grupo
                </button>
              )}
              <button
                type="button"
                onClick={() => openCreate()}
                className="text-[11px] font-bold text-primary transition-colors hover:text-primary-deep"
              >
                + Nuevo
              </button>
            </div>

            {teDeben.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-asset-deep">
                  Te deben
                </p>
                {teDeben.map((e) => (
                  <BalanceRow
                    key={e.key}
                    entry={e}
                    {...loanRowHandlers}
                    onOpen={() => openEntry(e)}
                    onSettle={splitReady && e.kind === 'person' ? () => openSettleAll(e) : undefined}
                  />
                ))}
              </div>
            )}

            {debes.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-debt-deep">
                  Debes
                </p>
                {debes.map((e) => (
                  <BalanceRow
                    key={e.key}
                    entry={e}
                    {...loanRowHandlers}
                    onOpen={() => openEntry(e)}
                    onSettle={splitReady && e.kind === 'person' ? () => openSettleAll(e) : undefined}
                  />
                ))}
              </div>
            )}

            {enPaz.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                  En paz
                </p>
                {enPaz.map((e) => (
                  <BalanceRow key={e.key} entry={e} {...loanRowHandlers} onOpen={() => openEntry(e)} />
                ))}
              </div>
            )}
          </div>

        </>
      )}

      {/* Lending flow analytics — understand and heal your finances */}
      {hasFlowData && (
        <div className="flex flex-col gap-2 px-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Flujo de préstamos
          </p>
          <Card className="p-3.5">
            <p className="mb-2 text-[11px] leading-snug text-text-secondary">
              Cuánto prestas vs cuánto recuperas cada mes. La línea roja es lo que
              te deben al cierre — si no baja, es momento de cobrar.
            </p>
            <LoanFlowChart data={loanFlow} />
          </Card>
        </div>
      )}

      {/* ── Modals ── */}
      {/* Loan detail / abono / saldar / editar / eliminar all live in the hook,
          so a modal can never end up mounted without a way to reach it. */}
      {loanActions.modals}

      {contactSheet && (
        <ContactLoansModal
          open
          onClose={() => setContactSheet(null)}
          name={contactSheet.name}
          avatarUrl={contactSheet.avatarUrl}
          net={contactSheet.net}
          activeLoans={contactSheet.loans}
          paidLoans={contactSheet.paidLoans}
          paymentsByLoan={paymentsByLoan}
          onOpenLoan={loanActions.openDetail}
          onAbono={loanActions.openAbono}
          onMarkPaid={loanActions.openMarkPaid}
          onEdit={loanActions.openEdit}
          onDelete={loanActions.openDelete}
          onUnmarkPaid={loanActions.openDetail}
        />
      )}

      {settleAllContact && (
        <SettleAllModal
          open
          contactName={settleAllContact.name}
          net={settleAllContact.net}
          breakdown={settleAllContact.breakdown}
          onClose={() => setSettleAllContact(null)}
          onConfirm={handleSettleAll}
        />
      )}

      {addExpenseGroup && (
        <ExpenseFormModal
          open
          onClose={() => setAddExpenseGroupId(null)}
          members={addExpenseGroup.activeMembers.map((m) => ({ ...m, name: displayName(m) }))}
          onSubmit={async (exp) => {
            await addExpense(addExpenseGroup.group.id, exp)
            toast.success('Gasto registrado', `${exp.description} · ${formatMXN(exp.amount)}`)
          }}
        />
      )}


      <GroupFormModal
        open={groupFormOpen}
        onClose={() => setGroupFormOpen(false)}
        recentContacts={recentContacts}
        onCreate={async (name, memberDrafts) => {
          const { id } = await createGroup(name, memberDrafts)
          const linked = memberDrafts.filter((m) => m.memberUserId).length
          toast.success(
            'Grupo creado',
            linked > 0
              ? `${name} · ${linked} contacto${linked === 1 ? '' : 's'} conectado${linked === 1 ? '' : 's'} ya lo ve${linked === 1 ? '' : 'n'}`
              : `${name} · ${memberDrafts.length + 1} personas`,
          )
          void navigate(`/cuentas/prestamos/${id}`)
        }}
      />
    </div>
  )
}
