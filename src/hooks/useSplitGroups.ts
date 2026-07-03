import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  computeShares,
  fromCents,
  loanNetForContact,
  memberNets,
  simplifyDebts,
  toCents,
  type ShareInput,
  type Transfer,
} from '@/lib/split'
import type {
  Loan,
  LoanPayment,
  SplitExpense,
  SplitExpenseShare,
  SplitGroup,
  SplitMember,
  SplitMethod,
  SplitSettlement,
} from '@/types'

export interface NewExpense {
  description: string
  /** Total in pesos (converted to centavos internally). */
  amount: number
  paidByMemberId: string
  method: SplitMethod
  /** Weight (pct/parts) or exact pesos per member, depending on method. */
  inputs: Array<{ memberId: string; weight?: number; exactAmount?: number }>
  accountId?: string | null
  date?: string
}

export interface NewSettlement {
  fromMemberId: string
  toMemberId: string
  /** Pesos. */
  amount: number
  accountId?: string | null
  note?: string | null
}

export interface GroupComputed {
  group: SplitGroup
  members: SplitMember[]
  expenses: SplitExpense[]
  settlements: SplitSettlement[]
  /** Legacy 1:1 loans stamped into (or name-matched to) this group. */
  legacyLoans: Loan[]
  /** memberId → net in pesos. Positive = creditor. */
  nets: Map<string, number>
  /** Suggested transfers (≤ N−1) in pesos. */
  suggestions: Array<{ fromMemberId: string; toMemberId: string; amount: number }>
  /** My net in pesos from split expenses/settlements only (excludes legacy loans). */
  mySplitNet: number
  /** True when the group is just the backfilled 2-person shell with no split activity. */
  isDirect: boolean
}

interface LegacyInputs {
  loans: Loan[]
  paymentsByLoan: Record<string, LoanPayment[]>
}

const EMPTY_GROUPS: GroupComputed[] = []

function normName(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Shared-expense groups. Mirrors the useLoans structure: parallel fetch,
 * one realtime channel, optimistic-ish mutations (refetch after write),
 * and a defensive guard so a not-yet-applied migration 021 cannot break
 * the shared WebSocket connection.
 *
 * Legacy loans arrive from the caller (which already mounts useLoans) to
 * avoid a duplicate subscription; they attach by group_id with a
 * name-match fallback for rows created by old clients post-migration.
 */
export function useSplitGroups(legacy: LegacyInputs) {
  const { user } = useAuth()
  const [groups, setGroups] = useState<SplitGroup[]>([])
  const [members, setMembers] = useState<SplitMember[]>([])
  const [expenses, setExpenses] = useState<SplitExpense[]>([])
  const [shares, setShares] = useState<SplitExpenseShare[]>([])
  const [settlements, setSettlements] = useState<SplitSettlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())
  const [tablesReady, setTablesReady] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const [g, m, e, s, st] = await Promise.all([
      supabase.from('split_groups').select('*').is('archived_at', null).order('created_at', { ascending: false }),
      supabase.from('split_members').select('*').order('created_at', { ascending: true }),
      supabase.from('split_expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('split_expense_shares').select('*'),
      supabase.from('split_settlements').select('*').order('created_at', { ascending: false }),
    ])
    // Treat errors as "migration not applied yet" — degrade gracefully.
    if (g.error || m.error || e.error || s.error || st.error) {
      setError(g.error ?? m.error ?? e.error ?? s.error ?? st.error)
      setLoading(false)
      return
    }
    setError(null)
    setGroups((g.data ?? []) as SplitGroup[])
    setMembers((m.data ?? []) as SplitMember[])
    setExpenses((e.data ?? []) as SplitExpense[])
    setShares((s.data ?? []) as SplitExpenseShare[])
    setSettlements((st.data ?? []) as SplitSettlement[])
    setTablesReady(true)
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()

    const ch = supabase.channel(`split:${channelKey}`)
    // Only subscribe once we know the tables exist, so a missing migration
    // cannot disrupt the shared WebSocket connection (pattern from useLoans).
    if (tablesReady) {
      for (const table of [
        'split_groups',
        'split_members',
        'split_expenses',
        'split_expense_shares',
        'split_settlements',
      ]) {
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `user_id=eq.${user.id}` },
          () => void fetchAll(),
        )
      }
    }
    ch.subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, channelKey, fetchAll, tablesReady])

  /* ─────────────── derived: per-group computation ─────────────── */

  const computed: GroupComputed[] = useMemo(() => {
    if (!user || groups.length === 0) return EMPTY_GROUPS

    const membersByGroup = new Map<string, SplitMember[]>()
    for (const m of members) {
      membersByGroup.set(m.group_id, [...(membersByGroup.get(m.group_id) ?? []), m])
    }
    const sharesByExpense = new Map<string, SplitExpenseShare[]>()
    for (const sh of shares) {
      sharesByExpense.set(sh.expense_id, [...(sharesByExpense.get(sh.expense_id) ?? []), sh])
    }

    return groups.map((group) => {
      const gMembers = membersByGroup.get(group.id) ?? []
      const gExpenses = expenses.filter((e) => e.group_id === group.id)
      const gSettlements = settlements.filter((s) => s.group_id === group.id)
      const me = gMembers.find((m) => m.is_me)
      const contact = gMembers.length === 2 ? gMembers.find((m) => !m.is_me) : undefined

      // Legacy loans: by group_id stamp, plus name-match fallback for
      // 2-person groups (old clients create loans without group_id).
      const legacyLoans = legacy.loans.filter(
        (l) =>
          l.group_id === group.id ||
          (l.group_id == null && contact != null && normName(l.name) === normName(contact.name)),
      )

      // Legacy nets (centavos) attach to me + the contact member.
      let legacyNets: Map<string, number> | undefined
      if (legacyLoans.length > 0 && me && contact) {
        const { myNetCents, contactNetCents } = loanNetForContact(legacyLoans, legacy.paymentsByLoan)
        legacyNets = new Map([
          [me.id, myNetCents],
          [contact.id, contactNetCents],
        ])
      }

      const netsCents = memberNets(
        gMembers.map((m) => m.id),
        gExpenses.map((e) => ({
          paidByMemberId: e.paid_by_member_id,
          totalCents: toCents(Number(e.amount)),
          shares: new Map(
            (sharesByExpense.get(e.id) ?? []).map((sh) => [sh.member_id, toCents(Number(sh.amount))]),
          ),
        })),
        gSettlements.map((s) => ({
          fromMemberId: s.from_member_id,
          toMemberId: s.to_member_id,
          amountCents: toCents(Number(s.amount)),
        })),
        legacyNets,
      )

      let suggestions: Transfer[] = []
      try {
        suggestions = simplifyDebts(netsCents)
      } catch {
        // Nets from inconsistent external data — no suggestions rather than crash.
      }

      // My split-only net (for KPIs on top of the loans KPIs, no double count).
      let mySplitNetCents = 0
      if (me) {
        const legacyMine = legacyNets?.get(me.id) ?? 0
        mySplitNetCents = (netsCents.get(me.id) ?? 0) - legacyMine
      }

      return {
        group,
        members: gMembers,
        expenses: gExpenses,
        settlements: gSettlements,
        legacyLoans,
        nets: new Map([...netsCents.entries()].map(([id, c]) => [id, fromCents(c)])),
        suggestions: suggestions.map((t) => ({
          fromMemberId: t.fromMemberId,
          toMemberId: t.toMemberId,
          amount: fromCents(t.amountCents),
        })),
        mySplitNet: fromCents(mySplitNetCents),
        isDirect: gMembers.length === 2 && gExpenses.length === 0 && gSettlements.length === 0,
      }
    })
  }, [user, groups, members, expenses, shares, settlements, legacy.loans, legacy.paymentsByLoan])

  /** Σ over groups of my positive split-only nets (pesos). */
  const splitCobrar = useMemo(
    () => computed.reduce((s, g) => s + Math.max(0, g.mySplitNet), 0),
    [computed],
  )
  /** Σ over groups of my negative split-only nets, as a positive number. */
  const splitPagar = useMemo(
    () => computed.reduce((s, g) => s + Math.max(0, -g.mySplitNet), 0),
    [computed],
  )

  /* ─────────────────────────── mutations ─────────────────────────── */

  async function createGroup(name: string, memberNames: string[], emoji?: string | null): Promise<string> {
    if (!user) throw new Error('Not authenticated')
    const { data: g, error: gErr } = await supabase
      .from('split_groups')
      .insert({ user_id: user.id, name: name.trim(), emoji: emoji ?? null })
      .select('id')
      .single()
    if (gErr || !g) throw gErr ?? new Error('No se pudo crear el grupo')

    const meName = memberNames.some((n) => normName(n) === 'yo') ? 'Tú' : 'Yo'
    const rows = [
      { group_id: g.id, user_id: user.id, name: meName, is_me: true },
      ...memberNames
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => ({ group_id: g.id, user_id: user.id, name: n, is_me: false })),
    ]
    const { error: mErr } = await supabase.from('split_members').insert(rows)
    if (mErr) {
      await supabase.from('split_groups').delete().eq('id', g.id)
      throw mErr
    }
    await fetchAll()
    return g.id as string
  }

  async function addMember(groupId: string, name: string) {
    if (!user) throw new Error('Not authenticated')
    const { error: err } = await supabase
      .from('split_members')
      .insert({ group_id: groupId, user_id: user.id, name: name.trim(), is_me: false })
    if (err) throw err
    await fetchAll()
  }

  async function addExpense(groupId: string, exp: NewExpense) {
    if (!user) throw new Error('Not authenticated')
    const totalCents = toCents(exp.amount)
    const shareInputs: ShareInput[] = exp.inputs.map((i) => ({
      memberId: i.memberId,
      weight: i.weight,
      exactCents: i.exactAmount != null ? toCents(i.exactAmount) : undefined,
    }))
    const computedShares = computeShares(totalCents, exp.method, shareInputs)

    const { data: e, error: eErr } = await supabase
      .from('split_expenses')
      .insert({
        group_id: groupId,
        user_id: user.id,
        description: exp.description.trim(),
        amount: exp.amount,
        paid_by_member_id: exp.paidByMemberId,
        split_method: exp.method,
        account_id: exp.accountId ?? null,
        expense_date: exp.date ?? new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .single()
    if (eErr || !e) throw eErr ?? new Error('No se pudo guardar el gasto')

    const shareRows = exp.inputs.map((i) => ({
      expense_id: e.id,
      member_id: i.memberId,
      user_id: user.id,
      amount: fromCents(computedShares.get(i.memberId) ?? 0),
      weight: exp.method === 'percentage' || exp.method === 'shares' ? (i.weight ?? null) : null,
    }))
    const { error: sErr } = await supabase.from('split_expense_shares').insert(shareRows)
    if (sErr) {
      await supabase.from('split_expenses').delete().eq('id', e.id)
      throw sErr
    }

    // Account transaction only when the payer is me — same pattern as loans.
    const payer = members.find((m) => m.id === exp.paidByMemberId)
    if (exp.accountId && payer?.is_me) {
      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: exp.accountId,
        amount: -exp.amount,
        type: 'transaction',
        description: `Gasto compartido: ${exp.description.trim()}`,
        date: exp.date ?? new Date().toISOString().slice(0, 10),
      })
    }
    await fetchAll()
  }

  async function deleteExpense(expenseId: string) {
    const { error: err } = await supabase.from('split_expenses').delete().eq('id', expenseId)
    if (err) throw err
    await fetchAll()
  }

  /**
   * Record a settlement on the edge from→to.
   *
   * When the edge involves me and the counterpart contact has open legacy
   * loans in the matching direction inside this group, waterfall the amount
   * into loan_payments oldest-first (marking paid_at at zero) and record
   * only the leftover as a split_settlements row. One optional transactions
   * row covers the full amount, keeping useLoans / Resumen consistent.
   */
  async function addSettlement(groupId: string, s: NewSettlement) {
    if (!user) throw new Error('Not authenticated')
    const gMembers = members.filter((m) => m.group_id === groupId)
    const from = gMembers.find((m) => m.id === s.fromMemberId)
    const to = gMembers.find((m) => m.id === s.toMemberId)
    if (!from || !to) throw new Error('Miembro no encontrado')

    const involvesMe = from.is_me || to.is_me
    const contactMember = from.is_me ? to : from
    let leftover = toCents(s.amount)

    if (involvesMe) {
      // Direction of legacy loans this settlement pays down:
      // I pay a contact → my 'i_owe' loans to them; they pay me → 'owed_to_me'.
      const targetDirection = from.is_me ? 'i_owe' : 'owed_to_me'

      // Fetch open loans fresh — avoids stale props at settle time.
      // Prefer the stamp; fall back to contact-name match client-side below.
      const { data: loanRows, error: lErr } = await supabase
        .from('loans')
        .select('*, loan_payments(*)')
        .is('paid_at', null)
        .eq('direction', targetDirection)
        .order('created_at', { ascending: true })
      if (lErr) throw lErr

      const openLoans = ((loanRows ?? []) as Array<Loan & { loan_payments: LoanPayment[] }>).filter(
        (l) =>
          l.group_id === groupId ||
          (l.group_id == null && normName(l.name) === normName(contactMember.name)),
      )

      for (const loan of openLoans) {
        if (leftover <= 0) break
        const paid = (loan.loan_payments ?? []).reduce((sum, p) => sum + toCents(Number(p.amount)), 0)
        const remaining = Math.max(0, toCents(Number(loan.amount)) - paid)
        if (remaining <= 0) continue
        const applied = Math.min(leftover, remaining)
        const { error: pErr } = await supabase.from('loan_payments').insert({
          loan_id: loan.id,
          user_id: user.id,
          amount: fromCents(applied),
          note: s.note ?? `Liquidación de grupo`,
        })
        if (pErr) throw pErr
        if (applied === remaining) {
          await supabase.from('loans').update({ paid_at: new Date().toISOString() }).eq('id', loan.id)
        }
        leftover -= applied
      }
    }

    if (leftover > 0) {
      const { error: stErr } = await supabase.from('split_settlements').insert({
        group_id: groupId,
        user_id: user.id,
        from_member_id: s.fromMemberId,
        to_member_id: s.toMemberId,
        amount: fromCents(leftover),
        note: s.note ?? null,
        account_id: s.accountId ?? null,
      })
      if (stErr) throw stErr
    }

    // One transaction row for the FULL settled amount (not just leftover).
    if (involvesMe && s.accountId) {
      const txAmount = to.is_me ? s.amount : -s.amount // I receive + / I pay −
      const groupName = groups.find((g) => g.id === groupId)?.name ?? ''
      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: s.accountId,
        amount: txAmount,
        type: 'transaction',
        description: `Liquidación: ${contactMember.name}${groupName ? ` · ${groupName}` : ''}`,
        date: new Date().toISOString().slice(0, 10),
      })
    }
    await fetchAll()
  }

  async function deleteGroup(groupId: string) {
    // Legacy loans keep living (FK is on delete set null) — only split data cascades.
    const { error: err } = await supabase.from('split_groups').delete().eq('id', groupId)
    if (err) throw err
    await fetchAll()
  }

  return {
    groups: user ? computed : EMPTY_GROUPS,
    splitCobrar,
    splitPagar,
    loading: user ? loading : false,
    /** False until migration 021 is applied — UI should hide group features. */
    ready: tablesReady,
    error,
    createGroup,
    addMember,
    addExpense,
    deleteExpense,
    addSettlement,
    deleteGroup,
    refetch: fetchAll,
  }
}
