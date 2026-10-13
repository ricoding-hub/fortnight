import { loanRemaining, loanActivityKey, memberIsMe } from '@/lib/loanFormat'
import { impactoLiquidacion, impactoPersonal } from '@/lib/split'
import { clavesDeContacto, contactoDe } from '@/lib/conexion'
import type { GroupComputed } from '@/hooks/useSplitGroups'
import type { Loan, LoanPayment, Profile, SplitExpense, SplitMember, SplitSettlement } from '@/types'

/**
 * A shared expense or settlement behind a balance. Structurally identical to
 * `SplitMovement` so it can be handed straight to `SplitMovementRow`, but
 * declared here to keep this module free of component imports.
 */
export interface BalanceMovement {
  kind: 'expense' | 'settlement'
  id: string
  description: string
  payerName: string
  date: string
  /** Contribution to my net: + they owe me, − I owe. */
  myEffect: number
  expense?: SplitExpense
  settlement?: SplitSettlement
}

/** One person or group balance, unified across legacy loans + split groups. */
export interface BalanceEntry {
  key: string
  kind: 'person' | 'group'
  name: string
  /** Person photo (linked profile). */
  avatarUrl?: string
  /** Group photo. */
  imageUrl?: string
  /** Net in pesos; positive = they owe me, negative = I owe. */
  net: number
  /** Direct split-group id when one exists (deep-link target). */
  groupId?: string
  /** Local contact name — needed to `ensureDirectGroup` when there's no group yet. */
  contactName?: string
  /** Loans count (person) or active members (group). */
  count: number
  /** Open loans with this person, most recent activity first. */
  loans: Loan[]
  /** Settled loans with this person, most recently settled first. */
  paidLoans: Loan[]
  /** Shared expenses/settlements behind the balance, newest first. Often the
   *  ONLY thing behind it — a connected contact's loans get synced away. */
  movements: BalanceMovement[]
  /** Per-member balances for a 3+ group (Splitwise "recupera/debe en total"). */
  memberBalances?: Array<{ id: string; name: string; avatarUrl?: string; net: number }>
  /** Suggested pairwise transfers ("A debe X a B") for a group. */
  edges?: Array<{ fromMemberId: string; toMemberId: string; amount: number }>
}

export interface BalancesInput {
  /** Active (unpaid) legacy loans. */
  active: Loan[]
  /** Settled loans — so a contact whose loans are all paid still has a card. */
  paid?: Loan[]
  paymentsByLoan: Record<string, LoanPayment[]>
  /** Computed split groups from `useSplitGroups`. */
  splitGroups: GroupComputed[]
  profiles: Map<string, Profile>
  displayName: (m: SplitMember) => string
  userId: string | undefined
}

export interface PeopleBalances {
  /** All balances, creditors (they owe me) first. */
  entries: BalanceEntry[]
  totalCobrar: number
  totalPagar: number
  netoTotal: number
  peopleOwingMe: number
  peopleIOwe: number
}

const EMPTY: PeopleBalances = {
  entries: [], totalCobrar: 0, totalPagar: 0, netoTotal: 0, peopleOwingMe: 0, peopleIOwe: 0,
}
const NO_LOANS: Loan[] = []
const NO_MOVEMENTS: BalanceMovement[] = []

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Pure derivation behind `usePeopleBalances`. Kept out of the hook so the
 * balance maths — which decides what every screen shows — is unit-testable.
 */
export function derivePeopleBalances(input: BalancesInput): PeopleBalances {
  const { active, paid, paymentsByLoan, splitGroups, profiles, displayName, userId } = input

  if (!userId) return EMPTY

  const paymentsOf = (l: Loan) => paymentsByLoan[l.id] ?? []
  const byActivityDesc = (a: Loan, b: Loan) =>
    loanActivityKey(b, paymentsOf(b)).localeCompare(loanActivityKey(a, paymentsOf(a)))

  // Legacy loans grouped by contact name, open and settled kept apart.
  const loansByContact = new Map<string, Loan[]>()
  for (const l of active) {
    const key = norm(l.name)
    loansByContact.set(key, [...(loansByContact.get(key) ?? []), l])
  }
  const paidByContact = new Map<string, Loan[]>()
  for (const l of paid ?? []) {
    const key = norm(l.name)
    paidByContact.set(key, [...(paidByContact.get(key) ?? []), l])
  }

  // Direct 2-person groups keyed by every name the OTHER member goes by: the
  // local label and the visible name. Whoever didn't create the connection sees
  // the other person labeled «Yo», which matches none of their loans.
  //
  // Si dos conexiones comparten un nombre, gana la etiqueta local (la que tú
  // escribiste) sobre el nombre visible: primero se registran todas las
  // etiquetas y después sólo los nombres visibles que quedaron libres.
  const directByContact = new Map<string, GroupComputed>()
  const conexiones = splitGroups
    .map((g) => ({ g, contact: contactoDe(g, userId) }))
    .filter((x): x is { g: GroupComputed; contact: SplitMember } => x.contact != null)
  for (const { g, contact } of conexiones) {
    const [etiqueta] = clavesDeContacto(contact, '')
    if (etiqueta && !directByContact.has(etiqueta)) directByContact.set(etiqueta, g)
  }
  for (const { g, contact } of conexiones) {
    for (const k of clavesDeContacto(contact, displayName(contact))) {
      if (!directByContact.has(k)) directByContact.set(k, g)
    }
  }

  /** Shared expenses + settlements of a group, from my point of view. */
  function movementsOf(g: GroupComputed | undefined): BalanceMovement[] {
    if (!g) return NO_MOVEMENTS
    const meMember = g.activeMembers.find((m) => memberIsMe(m, userId))
    if (!meMember) return NO_MOVEMENTS
    const out: BalanceMovement[] = []
    for (const e of g.expenses) {
      const payer = g.members.find((m) => m.id === e.paid_by_member_id)
      out.push({
        kind: 'expense',
        id: e.id,
        description: e.description,
        payerName: payer ? displayName(payer) : '—',
        date: e.expense_date,
        // Una sola definición, en lib/split junto a memberNets, para que la
        // lista de personas y la del grupo no puedan decir cosas distintas del
        // mismo gasto.
        myEffect: impactoPersonal(
          e.amount,
          e.paid_by_member_id,
          g.sharesByExpense.get(e.id) ?? [],
          meMember.id,
        ).neto,
        expense: e,
      })
    }
    for (const st of g.settlements) {
      const received = st.to_member_id === meMember.id
      out.push({
        kind: 'settlement',
        id: st.id,
        description: received ? 'Recibiste un pago' : 'Pagaste',
        payerName: '',
        date: st.created_at,
        myEffect: impactoLiquidacion(st.amount, st.from_member_id, meMember.id),
        settlement: st,
      })
    }
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }

  const entries: BalanceEntry[] = []
  /** Conexiones que ya tienen tarjeta, por id: un nombre no basta para saberlo. */
  const coveredGroupIds = new Set<string>()

  /** Every contact that has any loan at all, open or settled. */
  const contactKeys = new Set([...loansByContact.keys(), ...paidByContact.keys()])

  // 1) People with loans (combined loan + split-only net). Varios nombres pueden
  //    ser la MISMA persona («Ale» y «Alesita Palomino», ligados a la misma
  //    conexión): se juntan en una sola tarjeta y su saldo compartido cuenta una
  //    vez. Antes salía una tarjeta por nombre, cada una con el saldo completo.
  const relaciones = new Map<string, { claves: string[]; direct: GroupComputed | undefined }>()
  for (const key of contactKeys) {
    const direct = directByContact.get(key)
    const id = direct ? `g:${direct.group.id}` : `k:${key}`
    const r = relaciones.get(id)
    if (r) r.claves.push(key)
    else relaciones.set(id, { claves: [key], direct })
  }

  for (const { claves, direct } of relaciones.values()) {
    const loans = claves.flatMap((k) => loansByContact.get(k) ?? []).sort(byActivityDesc)
    const paidLoans = claves.flatMap((k) => paidByContact.get(k) ?? []).sort(byActivityDesc)
    const loansNet = loans.reduce((s, l) => {
      const rem = loanRemaining(l, paymentsOf(l))
      return l.direction === 'owed_to_me' ? s + rem : s - rem
    }, 0)
    const net = loansNet + (direct?.mySplitNet ?? 0)
    const contactMember = direct ? contactoDe(direct, userId) : undefined
    const anyLoan = loans[0] ?? paidLoans[0]
    entries.push({
      key: direct ? `person:g:${direct.group.id}` : `person:${claves[0]}`,
      kind: 'person',
      name: contactMember ? displayName(contactMember) : anyLoan.name,
      avatarUrl: contactMember?.member_user_id
        ? profiles.get(contactMember.member_user_id)?.avatar_url ?? undefined
        : undefined,
      net,
      groupId: direct?.group.id,
      contactName: anyLoan.name,
      count: loans.length,
      loans,
      paidLoans,
      movements: movementsOf(direct),
    })
    if (direct) coveredGroupIds.add(direct.group.id)
  }

  // 2) 1:1 relationships without loans of their own — connected or not. An
  //    unconnected one used to be skipped, so a connection created to invite
  //    someone vanished from the list (and its invite link with it) as soon as
  //    you left its screen.
  for (const g of splitGroups) {
    const contact = contactoDe(g, userId)
    if (!contact || coveredGroupIds.has(g.group.id)) continue
    const visible = displayName(contact)
    entries.push({
      key: `person:g:${g.group.id}`,
      kind: 'person',
      name: displayName(contact),
      avatarUrl: contact.member_user_id
        ? profiles.get(contact.member_user_id)?.avatar_url ?? undefined
        : undefined,
      net: g.mySplitNet,
      groupId: g.group.id,
      // El nombre que tú ves: la etiqueta local de la otra persona puede ser su
      // «Yo», y con eso «Saldar todo» no encontraba a nadie.
      contactName: visible,
      count: 1,
      loans: NO_LOANS,
      paidLoans: NO_LOANS,
      movements: movementsOf(g),
    })
    coveredGroupIds.add(g.group.id)
  }

  // 3) Real multi-person groups (3+ members).
  for (const g of splitGroups) {
    if (g.activeMembers.length <= 2) continue
    const me = g.activeMembers.find((m) => memberIsMe(m, userId))
    const net = me ? g.nets.get(me.id) ?? 0 : 0
    entries.push({
      key: `group:${g.group.id}`,
      kind: 'group',
      name: g.group.name,
      imageUrl: g.group.image_url ?? undefined,
      net,
      groupId: g.group.id,
      count: g.activeMembers.length,
      loans: NO_LOANS,
      paidLoans: NO_LOANS,
      movements: movementsOf(g),
      memberBalances: g.activeMembers.map((m) => ({
        id: m.id,
        name: displayName(m),
        avatarUrl: m.member_user_id ? profiles.get(m.member_user_id)?.avatar_url ?? undefined : undefined,
        net: g.nets.get(m.id) ?? 0,
      })),
      edges: g.suggestions,
    })
  }

  // Creditors (positive) first, largest magnitude first within each side.
  entries.sort((a, b) => {
    if ((a.net >= 0) !== (b.net >= 0)) return a.net >= 0 ? -1 : 1
    return Math.abs(b.net) - Math.abs(a.net)
  })

  const totalCobrar = entries.reduce((s, e) => (e.net > 0 ? s + e.net : s), 0)
  const totalPagar = entries.reduce((s, e) => (e.net < 0 ? s - e.net : s), 0)
  return {
    entries,
    totalCobrar,
    totalPagar,
    netoTotal: totalCobrar - totalPagar,
    peopleOwingMe: entries.filter((e) => e.net > 0.005).length,
    peopleIOwe: entries.filter((e) => e.net < -0.005).length,
  }
}
