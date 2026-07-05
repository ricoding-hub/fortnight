import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Profile,
  SplitActivity,
  SplitExpense,
  SplitExpenseShare,
  SplitGroup,
  SplitInvite,
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
  /** All member rows, including soft-left ones (needed for share history). */
  members: SplitMember[]
  /** Members still in the group (left_at == null) — use for pickers and display. */
  activeMembers: SplitMember[]
  expenses: SplitExpense[]
  settlements: SplitSettlement[]
  /** Trigger-written audit feed, newest first. */
  activity: SplitActivity[]
  /** Pending invitations for this group. */
  invites: SplitInvite[]
  /** Legacy 1:1 loans in this group (empty for connected groups — loans stay private). */
  legacyLoans: Loan[]
  /** expense_id → shares, for attribution and feed impact lines. */
  sharesByExpense: Map<string, SplitExpenseShare[]>
  /** memberId → net in pesos. Positive = creditor. */
  nets: Map<string, number>
  /** Suggested transfers (≤ N−1) in pesos. */
  suggestions: Array<{ fromMemberId: string; toMemberId: string; amount: number }>
  /** My net in pesos from split expenses/settlements only (excludes legacy loans). */
  mySplitNet: number
  /** True when the group is just the backfilled 2-person shell with no split activity. */
  isDirect: boolean
  /** True when any other member is a real linked Fortnight user. */
  isConnected: boolean
  /** True when the current user created the group. */
  isOwner: boolean
}

interface LegacyInputs {
  loans: Loan[]
  paymentsByLoan: Record<string, LoanPayment[]>
}

const EMPTY_GROUPS: GroupComputed[] = []
const EMPTY_PROFILES = new Map<string, Profile>()

function normName(s: string): string {
  return s.trim().toLowerCase()
}

/** Is this member row the current user? Prefers the real link, falls back to is_me. */
export function memberIsMe(m: SplitMember, userId: string | undefined): boolean {
  if (!userId) return false
  if (m.member_user_id != null) return m.member_user_id === userId
  return m.is_me
}

/**
 * Shared-expense groups, multi-user aware. One realtime subscription on
 * split_activity (written by DB triggers on every mutation, RLS-scoped to
 * my groups) drives refetches for changes made by ANY member. Legacy
 * loans arrive from the caller (which already mounts useLoans).
 *
 * Degrades gracefully: pre-021 DB → feature off (ready=false); pre-022 DB
 * → single-user behavior without activity/invites (multiUserReady=false).
 */
export function useSplitGroups(legacy: LegacyInputs) {
  const { user } = useAuth()
  const [groups, setGroups] = useState<SplitGroup[]>([])
  const [members, setMembers] = useState<SplitMember[]>([])
  const [expenses, setExpenses] = useState<SplitExpense[]>([])
  const [shares, setShares] = useState<SplitExpenseShare[]>([])
  const [settlements, setSettlements] = useState<SplitSettlement[]>([])
  const [activity, setActivity] = useState<SplitActivity[]>([])
  const [invites, setInvites] = useState<SplitInvite[]>([])
  const [profiles, setProfiles] = useState<Map<string, Profile>>(EMPTY_PROFILES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())
  const [tablesReady, setTablesReady] = useState(false)
  const [multiUserReady, setMultiUserReady] = useState(false)
  const groupIdsRef = useRef<Set<string>>(new Set())

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
    groupIdsRef.current = new Set(((g.data ?? []) as SplitGroup[]).map((x) => x.id))
    setTablesReady(true)

    // Multi-user tables (022) fetched separately so a pre-022 DB still works.
    const [act, inv, prof] = await Promise.all([
      supabase.from('split_activity').select('*').order('created_at', { ascending: false }).limit(400),
      supabase.from('split_invites').select('id, group_id, inviter_user_id, invited_member_id, email, status, created_at, responded_at'),
      supabase.from('profiles').select('*'),
    ])
    if (!act.error && !inv.error && !prof.error) {
      setActivity((act.data ?? []) as SplitActivity[])
      setInvites((inv.data ?? []) as SplitInvite[])
      setProfiles(new Map(((prof.data ?? []) as Profile[]).map((p) => [p.id, p])))
      setMultiUserReady(true)
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()

    const ch = supabase.channel(`split:${channelKey}`)
    if (tablesReady) {
      // My own writes (also covers pre-022 DBs without split_activity).
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
    if (multiUserReady) {
      // Every mutation by ANY member writes an activity row via trigger;
      // RLS (WALRUS) scopes events to groups I belong to.
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'split_activity' },
        () => void fetchAll(),
      )
      // Deletes only carry the PK — refetch if it was one of my groups.
      ch.on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'split_groups' },
        (payload) => {
          const oldId = (payload.old as { id?: string } | null)?.id
          if (!oldId || groupIdsRef.current.has(oldId)) void fetchAll()
        },
      )
    }
    ch.subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, channelKey, fetchAll, tablesReady, multiUserReady])

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
    const activityByGroup = new Map<string, SplitActivity[]>()
    for (const a of activity) {
      activityByGroup.set(a.group_id, [...(activityByGroup.get(a.group_id) ?? []), a])
    }
    const invitesByGroup = new Map<string, SplitInvite[]>()
    for (const i of invites) {
      invitesByGroup.set(i.group_id, [...(invitesByGroup.get(i.group_id) ?? []), i])
    }

    return groups.map((group) => {
      const gMembers = membersByGroup.get(group.id) ?? []
      const activeMembers = gMembers.filter((m) => m.left_at == null)
      const gExpenses = expenses.filter((e) => e.group_id === group.id)
      const gSettlements = settlements.filter((s) => s.group_id === group.id)
      const me = gMembers.find((m) => memberIsMe(m, user.id))
      const contact = gMembers.length === 2 ? gMembers.find((m) => !memberIsMe(m, user.id)) : undefined
      const isConnected = gMembers.some(
        (m) => !memberIsMe(m, user.id) && m.member_user_id != null,
      )

      // Legacy loans stay PRIVATE: excluded from the shared math the moment
      // a group is connected, so every member sees the same numbers.
      const legacyLoans = isConnected
        ? []
        : legacy.loans.filter(
            (l) =>
              l.group_id === group.id ||
              (l.group_id == null && contact != null && normName(l.name) === normName(contact.name)),
          )

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

      let mySplitNetCents = 0
      if (me) {
        const legacyMine = legacyNets?.get(me.id) ?? 0
        mySplitNetCents = (netsCents.get(me.id) ?? 0) - legacyMine
      }

      return {
        group,
        members: gMembers,
        activeMembers,
        expenses: gExpenses,
        settlements: gSettlements,
        activity: activityByGroup.get(group.id) ?? [],
        invites: invitesByGroup.get(group.id) ?? [],
        legacyLoans,
        sharesByExpense,
        nets: new Map([...netsCents.entries()].map(([id, c]) => [id, fromCents(c)])),
        suggestions: suggestions.map((t) => ({
          fromMemberId: t.fromMemberId,
          toMemberId: t.toMemberId,
          amount: fromCents(t.amountCents),
        })),
        mySplitNet: fromCents(mySplitNetCents),
        isDirect:
          gMembers.length === 2 &&
          !isConnected &&
          gExpenses.length === 0 &&
          gSettlements.length === 0,
        isConnected,
        isOwner: group.user_id === user.id,
      }
    })
  }, [user, groups, members, expenses, shares, settlements, activity, invites, legacy.loans, legacy.paymentsByLoan])

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

  /** Display name for a member: linked profile name wins over the local label. */
  const displayName = useCallback(
    (m: SplitMember): string => {
      if (m.member_user_id) {
        const p = profiles.get(m.member_user_id)
        if (p?.display_name) return p.display_name
      }
      return m.name
    },
    [profiles],
  )

  /* ─────────────────────────── mutations ─────────────────────────── */

  async function createGroup(
    name: string,
    memberNames: string[],
    emoji?: string | null,
  ): Promise<{ id: string; members: SplitMember[] }> {
    if (!user) throw new Error('Not authenticated')
    const { data: g, error: gErr } = await supabase
      .from('split_groups')
      .insert({ user_id: user.id, name: name.trim(), emoji: emoji ?? null })
      .select('id')
      .single()
    if (gErr || !g) throw gErr ?? new Error('No se pudo crear el grupo')

    const meName = memberNames.some((n) => normName(n) === 'yo') ? 'Tú' : 'Yo'
    const meRow: Record<string, unknown> = {
      group_id: g.id,
      user_id: user.id,
      name: meName,
      is_me: true,
    }
    if (multiUserReady) meRow.member_user_id = user.id
    const rows = [
      meRow,
      ...memberNames
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => ({ group_id: g.id, user_id: user.id, name: n, is_me: false })),
    ]
    const { data: created, error: mErr } = await supabase
      .from('split_members')
      .insert(rows)
      .select('*')
    if (mErr) {
      await supabase.from('split_groups').delete().eq('id', g.id)
      throw mErr
    }
    await fetchAll()
    return { id: g.id as string, members: (created ?? []) as SplitMember[] }
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
      ...(multiUserReady ? { group_id: groupId } : {}),
    }))
    const { error: sErr } = await supabase.from('split_expense_shares').insert(shareRows)
    if (sErr) {
      await supabase.from('split_expenses').delete().eq('id', e.id)
      throw sErr
    }

    // Account transaction only when the payer is me — same pattern as loans.
    const payer = members.find((m) => m.id === exp.paidByMemberId)
    if (exp.accountId && payer && memberIsMe(payer, user.id)) {
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
   * In NON-connected groups, when the edge involves me and the counterpart
   * contact has open legacy loans in the matching direction, waterfall the
   * amount into loan_payments oldest-first and record only the leftover as
   * a split_settlements row. Connected groups skip the waterfall entirely
   * (loans are private to their owner and excluded from shared math).
   */
  async function addSettlement(groupId: string, s: NewSettlement) {
    if (!user) throw new Error('Not authenticated')
    const gMembers = members.filter((m) => m.group_id === groupId)
    const from = gMembers.find((m) => m.id === s.fromMemberId)
    const to = gMembers.find((m) => m.id === s.toMemberId)
    if (!from || !to) throw new Error('Miembro no encontrado')

    const fromIsMe = memberIsMe(from, user.id)
    const toIsMe = memberIsMe(to, user.id)
    const involvesMe = fromIsMe || toIsMe
    const isConnected = gMembers.some((m) => !memberIsMe(m, user.id) && m.member_user_id != null)
    const contactMember = fromIsMe ? to : from
    let leftover = toCents(s.amount)

    if (involvesMe && !isConnected) {
      const targetDirection = fromIsMe ? 'i_owe' : 'owed_to_me'

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
      const txAmount = toIsMe ? s.amount : -s.amount // I receive + / I pay −
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

  /* ─────────────── multi-user mutations (via service-role API) ─────────────── */

  async function callSplitApi(path: string, body: unknown): Promise<Record<string, unknown>> {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Not authenticated')
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw new Error((payload.error as string) ?? 'request_failed')
    return payload
  }

  /** Send an email invitation; optionally links an existing local member slot. */
  async function invite(groupId: string, email: string, memberId?: string) {
    const result = await callSplitApi('/api/split/invite', { groupId, email: email.trim(), memberId })
    await fetchAll()
    return result
  }

  /** Accept or decline an invitation token (from email link or notification). */
  async function respondInvite(token: string, action: 'accept' | 'decline') {
    const result = await callSplitApi('/api/split/accept', { token, action })
    await fetchAll()
    return result
  }

  /** Soft-leave: caller must verify my net is 0 before offering this. */
  async function leaveGroup(groupId: string) {
    if (!user) throw new Error('Not authenticated')
    const mine = members.find((m) => m.group_id === groupId && memberIsMe(m, user.id))
    if (!mine) throw new Error('No eres miembro de este grupo')
    const { error: err } = await supabase
      .from('split_members')
      .update({ left_at: new Date().toISOString() })
      .eq('id', mine.id)
    if (err) throw err
    await fetchAll()
  }

  return {
    groups: user ? computed : EMPTY_GROUPS,
    profiles,
    splitCobrar,
    splitPagar,
    loading: user ? loading : false,
    /** False until migration 021 is applied — UI should hide group features. */
    ready: tablesReady,
    /** False until migration 022 is applied — UI should hide invite/activity features. */
    multiUserReady,
    error,
    displayName,
    createGroup,
    addMember,
    addExpense,
    deleteExpense,
    addSettlement,
    deleteGroup,
    invite,
    respondInvite,
    leaveGroup,
    refetch: fetchAll,
  }
}
