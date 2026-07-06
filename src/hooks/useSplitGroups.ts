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

  /**
   * People I've shared any group with, deduped (linked contacts by user id,
   * local members by normalized name), most-recent group first. Used by the
   * "Recientes" chips when creating groups or adding members.
   */
  const recentContacts = useMemo(() => {
    if (!user) return [] as Array<{ name: string; memberUserId: string | null }>
    const seen = new Set<string>()
    const out: Array<{ name: string; memberUserId: string | null }> = []
    for (const g of computed) {
      for (const m of g.members) {
        if (memberIsMe(m, user.id)) continue
        const key = m.member_user_id ?? `local:${normName(m.name)}`
        if (seen.has(key)) continue
        seen.add(key)
        const p = m.member_user_id ? profiles.get(m.member_user_id) : undefined
        out.push({ name: p?.display_name ?? m.name, memberUserId: m.member_user_id })
      }
    }
    return out
  }, [user, computed, profiles])

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
    members: Array<{ name: string; memberUserId?: string | null }>,
    emoji?: string | null,
  ): Promise<{ id: string; members: SplitMember[] }> {
    if (!user) throw new Error('Not authenticated')
    const { data: g, error: gErr } = await supabase
      .from('split_groups')
      .insert({ user_id: user.id, name: name.trim(), emoji: emoji ?? null })
      .select('id')
      .single()
    if (gErr || !g) throw gErr ?? new Error('No se pudo crear el grupo')

    const meName = members.some((m) => normName(m.name) === 'yo') ? 'Tú' : 'Yo'
    const meRow: Record<string, unknown> = {
      group_id: g.id,
      user_id: user.id,
      name: meName,
      is_me: true,
    }
    if (multiUserReady) meRow.member_user_id = user.id
    const rows = [
      meRow,
      ...members
        .map((m) => ({ ...m, name: m.name.trim() }))
        .filter((m) => m.name.length > 0)
        .map((m) => ({
          group_id: g.id,
          user_id: user.id,
          name: m.name,
          is_me: false,
          // Linked recent contact → they see the group instantly via RLS.
          ...(multiUserReady && m.memberUserId ? { member_user_id: m.memberUserId } : {}),
        })),
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

  async function addMember(groupId: string, name: string, memberUserId?: string | null) {
    if (!user) throw new Error('Not authenticated')
    const { error: err } = await supabase.from('split_members').insert({
      group_id: groupId,
      user_id: user.id,
      name: name.trim(),
      is_me: false,
      ...(multiUserReady && memberUserId ? { member_user_id: memberUserId } : {}),
    })
    if (err) throw err
    await fetchAll()
  }

  /** Rename a group (any member). The DB trigger logs group_renamed. */
  async function updateGroup(groupId: string, patch: { name: string }) {
    const { error: err } = await supabase
      .from('split_groups')
      .update({ name: patch.name.trim() })
      .eq('id', groupId)
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
   * Edit an expense: recompute shares and replace them. Does NOT touch
   * account transactions — an edit's account adjustment stays manual.
   * The DB trigger logs expense_edited.
   */
  async function updateExpense(expenseId: string, groupId: string, exp: NewExpense) {
    if (!user) throw new Error('Not authenticated')
    const totalCents = toCents(exp.amount)
    const shareInputs: ShareInput[] = exp.inputs.map((i) => ({
      memberId: i.memberId,
      weight: i.weight,
      exactCents: i.exactAmount != null ? toCents(i.exactAmount) : undefined,
    }))
    const computedShares = computeShares(totalCents, exp.method, shareInputs)

    const { error: eErr } = await supabase
      .from('split_expenses')
      .update({
        description: exp.description.trim(),
        amount: exp.amount,
        paid_by_member_id: exp.paidByMemberId,
        split_method: exp.method,
        ...(exp.date ? { expense_date: exp.date } : {}),
      })
      .eq('id', expenseId)
    if (eErr) throw eErr

    const { error: dErr } = await supabase
      .from('split_expense_shares')
      .delete()
      .eq('expense_id', expenseId)
    if (dErr) throw dErr

    const shareRows = exp.inputs.map((i) => ({
      expense_id: expenseId,
      member_id: i.memberId,
      user_id: user.id,
      amount: fromCents(computedShares.get(i.memberId) ?? 0),
      weight: exp.method === 'percentage' || exp.method === 'shares' ? (i.weight ?? null) : null,
      ...(multiUserReady ? { group_id: groupId } : {}),
    }))
    const { error: sErr } = await supabase.from('split_expense_shares').insert(shareRows)
    if (sErr) throw sErr
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

  /** Undo a mistaken settlement. Loan payments / account transactions
   *  created alongside it are NOT reverted — warn in the confirm dialog. */
  async function deleteSettlement(settlementId: string) {
    const { error: err } = await supabase
      .from('split_settlements')
      .delete()
      .eq('id', settlementId)
    if (err) throw err
    await fetchAll()
  }

  /**
   * Find (or create) the direct 2-person group for a 1:1 contact, and stamp
   * any of their orphan loans with the group id so traceability triggers
   * and group math cover them. Returns the group id.
   */
  async function ensureDirectGroup(contactName: string): Promise<string> {
    if (!user) throw new Error('Not authenticated')
    const key = normName(contactName)

    let groupId = computed.find(
      (g) =>
        !g.isConnected &&
        g.members.length === 2 &&
        g.members.some((m) => !m.is_me && normName(m.name) === key),
    )?.group.id

    if (!groupId) {
      const { id } = await createGroup(contactName.trim(), [{ name: contactName.trim() }])
      groupId = id
    }

    // Stamp orphan loans of this contact (by id — no more name-match reliance).
    const orphans = legacy.loans.filter((l) => l.group_id == null && normName(l.name) === key)
    for (const l of orphans) {
      await supabase.from('loans').update({ group_id: groupId }).eq('id', l.id)
    }
    if (orphans.length > 0) await fetchAll()
    return groupId
  }

  /**
   * Settle EVERYTHING with the direct contact of a group in one action:
   * computes the combined net (loans + splits) and runs addSettlement,
   * whose waterfall pays open loans oldest-first and records the leftover
   * as a settlement. Throws if there is nothing to settle.
   */
  async function settleAllWithContact(
    groupId: string,
    opts?: { accountId?: string | null; note?: string | null },
  ) {
    if (!user) throw new Error('Not authenticated')
    const g = computed.find((x) => x.group.id === groupId)
    if (!g) throw new Error('Grupo no encontrado')
    const me = g.members.find((m) => memberIsMe(m, user.id))
    const contact = g.members.find((m) => !memberIsMe(m, user.id))
    if (!me || !contact) throw new Error('El grupo no tiene un contacto directo')

    const myNet = g.nets.get(me.id) ?? 0
    if (Math.abs(myNet) < 0.005) throw new Error('No hay saldo pendiente con esta persona')

    await addSettlement(groupId, {
      // net > 0 ⇒ they owe me ⇒ contact pays me; net < 0 ⇒ I pay them.
      fromMemberId: myNet > 0 ? contact.id : me.id,
      toMemberId: myNet > 0 ? me.id : contact.id,
      amount: Math.abs(myNet),
      accountId: opts?.accountId ?? null,
      note: opts?.note ?? 'Saldar todo',
    })
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
    recentContacts,
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
    updateGroup,
    addExpense,
    updateExpense,
    deleteExpense,
    addSettlement,
    deleteSettlement,
    deleteGroup,
    leaveGroup,
    ensureDirectGroup,
    settleAllWithContact,
    refetch: fetchAll,
  }
}
