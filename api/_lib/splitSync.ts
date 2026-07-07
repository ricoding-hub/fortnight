import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Convert the group owner's open 1:1 loans with a contact into shared
 * group expenses, so both users see the same numbers once the contact
 * connects ("al relacionar, relacionar también los registros").
 *
 * Each open loan with remaining R becomes an 'exact' expense:
 *   owed_to_me → paid by the owner's member, debtor share = R
 *   i_owe      → paid by the contact's member, owner share = R
 * The loan is then closed with paid_at and a sync note — WITHOUT a
 * payment row, because no money moved (keeps "recovered" stats honest).
 * The DB triggers (expense_added + loan_settled) record the full trail.
 */
export async function syncLoansIntoGroup(
  admin: SupabaseClient,
  groupId: string,
): Promise<{ migrated: number }> {
  const { data: members } = await admin
    .from('split_members')
    .select('id, name, member_user_id, is_me, user_id, left_at')
    .eq('group_id', groupId)
  const active = (members ?? []).filter((m) => m.left_at == null)
  if (active.length !== 2) return { migrated: 0 }

  const { data: group } = await admin
    .from('split_groups')
    .select('id, user_id')
    .eq('id', groupId)
    .maybeSingle()
  if (!group) return { migrated: 0 }

  const ownerMember = active.find((m) => m.member_user_id === group.user_id)
  const contactMember = active.find((m) => m.member_user_id !== group.user_id)
  if (!ownerMember || !contactMember) return { migrated: 0 }

  const { data: loans } = await admin
    .from('loans')
    .select('*, loan_payments(*)')
    .eq('user_id', group.user_id)
    .is('paid_at', null)
  const contactKey = contactMember.name.trim().toLowerCase()
  const openLoans = (loans ?? []).filter(
    (l) =>
      l.group_id === groupId ||
      (l.group_id == null && String(l.name).trim().toLowerCase() === contactKey),
  )

  let migrated = 0
  for (const loan of openLoans) {
    const paid = (loan.loan_payments ?? []).reduce(
      (s: number, p: { amount: number }) => s + Number(p.amount),
      0,
    )
    const remaining = Math.round(Math.max(0, Number(loan.amount) - paid) * 100) / 100
    if (remaining <= 0) {
      await admin
        .from('loans')
        .update({ paid_at: new Date().toISOString() })
        .eq('id', loan.id)
      continue
    }

    const owedToOwner = loan.direction === 'owed_to_me'
    const payer = owedToOwner ? ownerMember : contactMember
    const debtor = owedToOwner ? contactMember : ownerMember

    const { data: expense, error: eErr } = await admin
      .from('split_expenses')
      .insert({
        group_id: groupId,
        user_id: group.user_id,
        description: loan.notes?.trim() || 'Préstamo',
        amount: remaining,
        paid_by_member_id: payer.id,
        split_method: 'exact',
        account_id: null,
        expense_date: String(loan.created_at).slice(0, 10),
      })
      .select('id')
      .single()
    if (eErr || !expense) continue

    const { error: sErr } = await admin.from('split_expense_shares').insert([
      { expense_id: expense.id, member_id: debtor.id, user_id: group.user_id, amount: remaining, weight: null, group_id: groupId },
      { expense_id: expense.id, member_id: payer.id, user_id: group.user_id, amount: 0, weight: null, group_id: groupId },
    ])
    if (sErr) {
      await admin.from('split_expenses').delete().eq('id', expense.id)
      continue
    }

    await admin
      .from('loans')
      .update({
        paid_at: new Date().toISOString(),
        notes: 'Sincronizado al grupo',
        group_id: groupId,
      })
      .eq('id', loan.id)
    migrated++
  }

  return { migrated }
}
