import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { resizeImage } from '@/lib/image'
import { errorMessage } from '@/lib/errorMessage'
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
  const tablesReadyRef = useRef(false)

  const fetchAll = useCallback(async () => {
    if (!user) return
    const [g, m, e, s, st] = await Promise.all([
      supabase.from('split_groups').select('*').is('archived_at', null).order('created_at', { ascending: false }),
      supabase.from('split_members').select('*').order('created_at', { ascending: true }),
      supabase.from('split_expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('split_expense_shares').select('*'),
      supabase.from('split_settlements').select('*').order('created_at', { ascending: false }),
    ])
    if (g.error || m.error || e.error || s.error || st.error) {
      // Only surface errors on the INITIAL load ("migration not applied yet").
      // A transient network failure during a realtime-driven refetch used to
      // nuke an already-loaded screen into a full error state — keep the
      // previous data instead.
      if (!tablesReadyRef.current) {
        setError(g.error ?? m.error ?? e.error ?? s.error ?? st.error)
      }
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
    tablesReadyRef.current = true
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

  // Initial fetch — its own effect so the subscription below never re-fires it.
  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()
  }, [user, fetchAll])

  // ONE stable realtime subscription. Handlers attach unconditionally — the
  // old tablesReady/multiUserReady deps flipped during the first fetch and
  // tore down / recreated the channel ~3 times per mount (with extra
  // fetchAll runs each time). A channel referencing a not-yet-migrated
  // table just never emits; the app still works without realtime.
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel(`split:${channelKey}`)
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
    ch.subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user, channelKey, fetchAll])

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
   * REAL Fortnight users I've shared any group with (linked accounts only —
   * local name-only members are excluded on purpose), deduped by user id,
   * most-recent group first. Used by the "Recientes" chips.
   */
  const recentContacts = useMemo(() => {
    if (!user) return [] as Array<{ name: string; memberUserId: string | null }>
    const seen = new Set<string>()
    const out: Array<{ name: string; memberUserId: string | null }> = []
    for (const g of computed) {
      for (const m of g.members) {
        if (memberIsMe(m, user.id)) continue
        if (!m.member_user_id) continue
        if (seen.has(m.member_user_id)) continue
        seen.add(m.member_user_id)
        const p = profiles.get(m.member_user_id)
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
    if (gErr || !g) {
      console.error('createGroup: split_groups insert failed', gErr)
      throw new Error(errorMessage(gErr ?? 'No se pudo crear el grupo'))
    }

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
      console.error('createGroup: split_members insert failed', mErr)
      await supabase.from('split_groups').delete().eq('id', g.id)
      throw new Error(errorMessage(mErr))
    }
    await fetchAll()
    return { id: g.id as string, members: (created ?? []) as SplitMember[] }
  }

  async function addMember(groupId: string, name: string, memberUserId?: string | null) {
    if (!user) throw new Error('Not authenticated')
    // Do NOT add `.select()`/RETURNING here for a non-owner path: split_members'
    // SELECT policy is is_group_member(group_id), a STABLE SECURITY DEFINER
    // function that can't see the membership row being inserted in the same
    // command — the same RLS-snapshot trap that caused the 42501 on split_groups
    // (fixed in migration 029). A bare INSERT (no RETURNING) is safe.
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

  /** Update a group (any member): rename and/or set its photo. */
  async function updateGroup(groupId: string, patch: { name?: string; image_url?: string | null }) {
    const update: Record<string, unknown> = {}
    if (patch.name !== undefined) update.name = patch.name.trim()
    if (patch.image_url !== undefined) update.image_url = patch.image_url
    const { error: err } = await supabase.from('split_groups').update(update).eq('id', groupId)
    if (err) throw err
    await fetchAll()
  }

  /**
   * Upload a group photo (any member). Reuses the 'avatars' bucket; the path
   * is prefixed with the uploader's uid so the per-user-folder RLS passes.
   */
  async function uploadGroupImage(groupId: string, file: Blob): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const blob = await resizeImage(file, 400)
    const path = `${user.id}/group-${groupId}-${Date.now()}.webp`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/webp' })
    if (upErr) throw upErr
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    await updateGroup(groupId, { image_url: urlData.publicUrl })
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
    let gMembers = members.filter((m) => m.group_id === groupId)
    if (!gMembers.some((m) => m.id === s.fromMemberId) || !gMembers.some((m) => m.id === s.toMemberId)) {
      // State can be stale right after the group was created — fetch fresh.
      const { data: fresh } = await supabase
        .from('split_members')
        .select('*')
        .eq('group_id', groupId)
      gMembers = (fresh ?? []) as SplitMember[]
    }
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
    // Loans that were AUTO-synced into this group were closed (paid_at) WITHOUT
    // a real payment and re-represented as shared expenses. Deleting the group
    // cascades those expenses away — so first REOPEN those loans, otherwise the
    // debt would vanish from both the loan ledger and the split math.
    const { error: reopenErr } = await supabase
      .from('loans')
      .update({ paid_at: null })
      .eq('group_id', groupId)
      .eq('notes', 'Sincronizado al grupo')
      .not('paid_at', 'is', null)
    if (reopenErr) throw reopenErr
    // Remaining legacy loans keep living (FK is on delete set null) — only split data cascades.
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

    // Match connected groups too — excluding them here used to spawn a
    // DUPLICATE group for a contact that had already linked their account.
    let groupId = computed.find(
      (g) =>
        g.activeMembers.length === 2 &&
        g.activeMembers.some((m) => !memberIsMe(m, user.id) && normName(m.name) === key),
    )?.group.id

    if (!groupId) {
      // Fresh DB check before creating — `computed` can be stale right after
      // a mutation, which used to spawn duplicate empty groups. RLS already
      // scopes this to MY groups (owned + ones I'm a member of), so we must
      // NOT filter by user_id (the contact may own the connection) and must
      // match the contact by linked account OR name, INCLUDING already-linked
      // slots (`member_user_id` set) — both were blind spots that spawned dupes.
      const { data: myGroups, error: checkErr } = await supabase
        .from('split_groups')
        .select('id, split_members(name, member_user_id, left_at)')
        .is('archived_at', null)
      if (checkErr) console.error('ensureDirectGroup: fresh check failed', checkErr)
      const existing = ((myGroups ?? []) as Array<{
        id: string
        split_members: Array<{ name: string; member_user_id: string | null; left_at: string | null }>
      }>).find((g) => {
        const active = g.split_members.filter((m) => m.left_at == null)
        if (active.length !== 2) return false
        // The "other" member is the one that isn't me.
        return active.some(
          (m) => m.member_user_id !== user.id && normName(m.name) === key,
        )
      })
      if (existing) {
        groupId = existing.id
      } else {
        const { id } = await createGroup(contactName.trim(), [{ name: contactName.trim() }])
        groupId = id
      }
    }

    // Stamp orphan loans of this contact (by id — no more name-match reliance).
    const orphans = legacy.loans.filter((l) => l.group_id == null && normName(l.name) === key)
    for (const l of orphans) {
      const { error: sErr } = await supabase.from('loans').update({ group_id: groupId }).eq('id', l.id)
      if (sErr) {
        console.error('ensureDirectGroup: loan stamp failed', sErr)
        throw new Error(errorMessage(sErr)) // don't corrupt silently
      }
    }
    if (orphans.length > 0) await fetchAll()
    return groupId
  }

  /**
   * Convert MY open loans with the group's direct contact into shared
   * expenses (same math, visible to both users) and close the originals
   * WITHOUT payments — no money moved, so "recovered" stats stay honest.
   * Client-side twin of the server-side sync that runs when someone joins;
   * used retroactively for groups that connected before this existed.
   */
  async function syncLoansIntoGroup(groupId: string): Promise<number> {
    if (!user) throw new Error('Not authenticated')
    const { data: freshMembers, error: mErr } = await supabase
      .from('split_members')
      .select('*')
      .eq('group_id', groupId)
    if (mErr) throw mErr
    const gMembers = ((freshMembers ?? []) as SplitMember[]).filter((m) => m.left_at == null)
    const me = gMembers.find((m) => memberIsMe(m, user.id))
    const contact = gMembers.find((m) => !memberIsMe(m, user.id))
    if (!me || !contact) throw new Error('El grupo no tiene un contacto directo')

    // Read loans FRESH: the server-side sync (runs when the contact accepts the
    // invite) may have already closed + converted these loans. Using the stale
    // `legacy.loans` prop here raced that sync and inserted a DUPLICATE expense
    // for the same loan. A fresh `paid_at is null` read closes the window.
    const { data: freshLoans, error: flErr } = await supabase
      .from('loans')
      .select('*, loan_payments(*)')
      .is('paid_at', null)
      .order('created_at', { ascending: true })
    if (flErr) throw flErr
    const openLoans = ((freshLoans ?? []) as Array<Loan & { loan_payments: LoanPayment[] }>).filter(
      (l) =>
        l.notes !== 'Sincronizado al grupo' &&
        (l.group_id === groupId ||
          (l.group_id == null && normName(l.name) === normName(contact.name))),
    )

    let migrated = 0
    for (const loan of openLoans) {
      const paid = (loan.loan_payments ?? []).reduce(
        (s, p) => s + Number(p.amount),
        0,
      )
      const remaining = fromCents(Math.max(0, toCents(Number(loan.amount)) - toCents(paid)))
      if (remaining <= 0) {
        await supabase.from('loans').update({ paid_at: new Date().toISOString() }).eq('id', loan.id)
        continue
      }
      const owedToMe = loan.direction === 'owed_to_me'
      const payer = owedToMe ? me : contact
      const debtor = owedToMe ? contact : me

      const { data: exp, error: eErr } = await supabase
        .from('split_expenses')
        .insert({
          group_id: groupId,
          user_id: user.id,
          description: loan.notes?.trim() || 'Préstamo',
          amount: remaining,
          paid_by_member_id: payer.id,
          split_method: 'exact',
          account_id: null,
          expense_date: loan.created_at.slice(0, 10),
        })
        .select('id')
        .single()
      if (eErr || !exp) throw eErr ?? new Error('No se pudo sincronizar')

      const { error: sErr } = await supabase.from('split_expense_shares').insert([
        { expense_id: exp.id, member_id: debtor.id, user_id: user.id, amount: remaining, weight: null, group_id: groupId },
        { expense_id: exp.id, member_id: payer.id, user_id: user.id, amount: 0, weight: null, group_id: groupId },
      ])
      if (sErr) {
        await supabase.from('split_expenses').delete().eq('id', exp.id)
        throw sErr
      }

      await supabase
        .from('loans')
        .update({ paid_at: new Date().toISOString(), notes: 'Sincronizado al grupo', group_id: groupId })
        .eq('id', loan.id)
      migrated++
    }
    await fetchAll()
    return migrated
  }

  /**
   * Settle EVERYTHING with the direct contact of a group in one action.
   * Closes EVERY open loan in BOTH directions (full-remaining payment +
   * paid_at — the old net-only waterfall left opposing loans open with
   * cancelling residues), settles the split-only net with a settlement
   * row, and records ONE optional account transaction for the combined
   * net. Members and loans are read fresh (never from a stale closure).
   */
  async function settleAllWithContact(
    groupId: string,
    opts?: { accountId?: string | null; note?: string | null },
  ) {
    if (!user) throw new Error('Not authenticated')
    const { data: freshMembers, error: mErr } = await supabase
      .from('split_members')
      .select('*')
      .eq('group_id', groupId)
    if (mErr) throw mErr
    const gMembers = ((freshMembers ?? []) as SplitMember[]).filter((m) => m.left_at == null)
    const me = gMembers.find((m) => memberIsMe(m, user.id))
    const contact = gMembers.find((m) => !memberIsMe(m, user.id))
    if (!me || !contact) throw new Error('El grupo no tiene un contacto directo')

    // Fresh open loans with this contact, BOTH directions.
    const { data: loanRows, error: lErr } = await supabase
      .from('loans')
      .select('*, loan_payments(*)')
      .is('paid_at', null)
      .order('created_at', { ascending: true })
    if (lErr) throw lErr
    const openLoans = ((loanRows ?? []) as Array<Loan & { loan_payments: LoanPayment[] }>).filter(
      (l) =>
        l.group_id === groupId ||
        (l.group_id == null && normName(l.name) === normName(contact.name)),
    )

    let loansNetCents = 0
    for (const loan of openLoans) {
      const paid = (loan.loan_payments ?? []).reduce((s, p) => s + toCents(Number(p.amount)), 0)
      const remaining = Math.max(0, toCents(Number(loan.amount)) - paid)
      if (remaining <= 0) {
        await supabase.from('loans').update({ paid_at: new Date().toISOString() }).eq('id', loan.id)
        continue
      }
      loansNetCents += loan.direction === 'owed_to_me' ? remaining : -remaining
      // Full-remaining payment closes the loan for real (money moved).
      const { error: pErr } = await supabase.from('loan_payments').insert({
        loan_id: loan.id,
        user_id: user.id,
        amount: fromCents(remaining),
        note: opts?.note ?? 'Saldar todo',
      })
      if (pErr) throw pErr
      await supabase.from('loans').update({ paid_at: new Date().toISOString() }).eq('id', loan.id)
    }

    // Split-only net read FRESH from the DB (not from possibly-stale state):
    // settling right after adding an expense used to compute a net that missed
    // it, leaving residual debt and a short account transaction.
    const [freshExp, freshShares, freshSettle] = await Promise.all([
      supabase.from('split_expenses').select('*').eq('group_id', groupId),
      supabase.from('split_expense_shares').select('*').eq('group_id', groupId),
      supabase.from('split_settlements').select('*').eq('group_id', groupId),
    ])
    if (freshExp.error) throw freshExp.error
    if (freshShares.error) throw freshShares.error
    if (freshSettle.error) throw freshSettle.error
    const gExpenses = (freshExp.data ?? []) as SplitExpense[]
    const gShares = (freshShares.data ?? []) as SplitExpenseShare[]
    const gSettlements = (freshSettle.data ?? []) as SplitSettlement[]
    const netsCents = memberNets(
      gMembers.map((m) => m.id),
      gExpenses.map((e) => ({
        paidByMemberId: e.paid_by_member_id,
        totalCents: toCents(Number(e.amount)),
        shares: new Map(
          gShares
            .filter((sh) => sh.expense_id === e.id)
            .map((sh) => [sh.member_id, toCents(Number(sh.amount))]),
        ),
      })),
      gSettlements.map((s) => ({
        fromMemberId: s.from_member_id,
        toMemberId: s.to_member_id,
        amountCents: toCents(Number(s.amount)),
      })),
    )
    const splitNetCents = netsCents.get(me.id) ?? 0
    if (splitNetCents !== 0) {
      const { error: stErr } = await supabase.from('split_settlements').insert({
        group_id: groupId,
        user_id: user.id,
        from_member_id: splitNetCents > 0 ? contact.id : me.id,
        to_member_id: splitNetCents > 0 ? me.id : contact.id,
        amount: fromCents(Math.abs(splitNetCents)),
        note: opts?.note ?? 'Saldar todo',
        account_id: opts?.accountId ?? null,
      })
      if (stErr) throw stErr
    }

    const combinedNetCents = loansNetCents + splitNetCents
    if (combinedNetCents === 0 && openLoans.length === 0) {
      throw new Error('No hay saldo pendiente con esta persona')
    }

    // ONE account transaction for the real money that changed hands (the net).
    if (opts?.accountId && combinedNetCents !== 0) {
      const groupName = groups.find((g) => g.id === groupId)?.name ?? ''
      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: opts.accountId,
        amount: fromCents(combinedNetCents), // + I receive, − I pay
        type: 'transaction',
        description: `Saldar todo: ${contact.name}${groupName && groupName !== contact.name ? ` · ${groupName}` : ''}`,
        date: new Date().toISOString().slice(0, 10),
      })
    }
    await fetchAll()
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
    uploadGroupImage,
    addExpense,
    updateExpense,
    deleteExpense,
    addSettlement,
    deleteSettlement,
    deleteGroup,
    leaveGroup,
    ensureDirectGroup,
    settleAllWithContact,
    syncLoansIntoGroup,
    refetch: fetchAll,
  }
}
