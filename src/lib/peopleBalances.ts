import { loanRemaining, loanActivityKey, memberIsMe } from '@/lib/loanFormat'
import type { GroupComputed } from '@/hooks/useSplitGroups'
import type { Loan, LoanPayment, Profile, SplitMember } from '@/types'

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

  // Direct 2-person groups keyed by the OTHER member's local name.
  const directByContact = new Map<string, GroupComputed>()
  for (const g of splitGroups) {
    if (g.activeMembers.length !== 2) continue
    const contact = g.activeMembers.find((m) => !memberIsMe(m, userId))
    if (contact) directByContact.set(norm(contact.name), g)
  }

  const entries: BalanceEntry[] = []
  const coveredContactKeys = new Set<string>()

  /** Every contact that has any loan at all, open or settled. */
  const contactKeys = new Set([...loansByContact.keys(), ...paidByContact.keys()])

  // 1) People with loans (combined loan + split-only net).
  for (const key of contactKeys) {
    const loans = (loansByContact.get(key) ?? []).slice().sort(byActivityDesc)
    const paidLoans = (paidByContact.get(key) ?? []).slice().sort(byActivityDesc)
    const direct = directByContact.get(key)
    const loansNet = loans.reduce((s, l) => {
      const rem = loanRemaining(l, paymentsOf(l))
      return l.direction === 'owed_to_me' ? s + rem : s - rem
    }, 0)
    const net = loansNet + (direct?.mySplitNet ?? 0)
    const contactMember = direct?.activeMembers.find((m) => !memberIsMe(m, userId))
    const anyLoan = loans[0] ?? paidLoans[0]
    entries.push({
      key: `person:${key}`,
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
    })
    coveredContactKeys.add(key)
  }

  // 2) Connected 1:1 relationships without loans of their own.
  for (const g of splitGroups) {
    if (g.activeMembers.length !== 2 || !g.isConnected) continue
    const contact = g.activeMembers.find((m) => !memberIsMe(m, userId))
    if (!contact || coveredContactKeys.has(norm(contact.name))) continue
    entries.push({
      key: `person:${norm(contact.name)}`,
      kind: 'person',
      name: displayName(contact),
      avatarUrl: contact.member_user_id
        ? profiles.get(contact.member_user_id)?.avatar_url ?? undefined
        : undefined,
      net: g.mySplitNet,
      groupId: g.group.id,
      contactName: contact.name,
      count: 1,
      loans: NO_LOANS,
      paidLoans: NO_LOANS,
    })
    coveredContactKeys.add(norm(contact.name))
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
