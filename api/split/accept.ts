/**
 * POST /api/split/accept
 *
 * Body: { token: string, action: 'accept' | 'decline' }
 *
 * Consumes an invitation token. Accept links the invited member slot to
 * the caller's real user id (idempotent: already-a-member marks the invite
 * accepted without duplicating). The split_members UPDATE trigger emits a
 * `member_linked` activity row, which fans out notifications to the group.
 */

import { isResponse, json, requireUser } from '../_lib/auth.js'
import { syncLoansIntoGroup } from '../_lib/splitSync.js'

export async function POST(req: Request): Promise<Response> {
  try {
    const { user, admin } = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as {
      token?: string
      action?: string
    }
    const token = body.token?.trim()
    const action = body.action === 'decline' ? 'decline' : 'accept'
    if (!token) return json({ error: 'invalid_request' }, 400)

    const { data: invite } = await admin
      .from('split_invites')
      .select('id, group_id, inviter_user_id, invited_member_id, status')
      .eq('token', token)
      .maybeSingle()
    if (!invite) return json({ error: 'invite_not_found' }, 404)
    if (invite.status !== 'pending') {
      // Idempotent success if this same user already accepted it.
      if (invite.status === 'accepted' && action === 'accept') {
        return json({ ok: true, groupId: invite.group_id, alreadyAccepted: true })
      }
      return json({ error: 'invite_not_pending', status: invite.status }, 409)
    }

    const now = new Date().toISOString()

    if (action === 'decline') {
      await admin
        .from('split_invites')
        .update({ status: 'declined', responded_at: now })
        .eq('id', invite.id)
      const { data: decliner } = await admin
        .from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      await admin.from('notifications').insert({
        user_id: invite.inviter_user_id,
        type: 'split',
        title: 'Invitación rechazada',
        body: `${decliner?.display_name ?? 'Alguien'} rechazó tu invitación al grupo`,
        dedup_key: `invite-declined:${invite.id}`,
        link: `/cuentas/prestamos/${invite.group_id}`,
      })
      return json({ ok: true, declined: true })
    }

    // Already a linked member of this group? Just mark the invite accepted.
    const { data: existingMember } = await admin
      .from('split_members')
      .select('id')
      .eq('group_id', invite.group_id)
      .eq('member_user_id', user.id)
      .maybeSingle()

    if (!existingMember) {
      if (invite.invited_member_id) {
        const { data: slot } = await admin
          .from('split_members')
          .select('id, member_user_id')
          .eq('id', invite.invited_member_id)
          .maybeSingle()
        if (slot && !slot.member_user_id) {
          const { error: uErr } = await admin
            .from('split_members')
            .update({ member_user_id: user.id, left_at: null })
            .eq('id', slot.id)
          if (uErr) return json({ error: 'link_failed' }, 500)
        } else if (!slot) {
          // Slot was deleted — create a fresh member row for the accepter.
          const { data: profile } = await admin
            .from('profiles').select('display_name, email').eq('id', user.id).maybeSingle()
          const { error: cErr } = await admin.from('split_members').insert({
            group_id: invite.group_id,
            user_id: invite.inviter_user_id,
            name: profile?.display_name ?? profile?.email?.split('@')[0] ?? 'Invitado',
            is_me: false,
            member_user_id: user.id,
          })
          if (cErr) return json({ error: 'link_failed' }, 500)
        } else {
          return json({ error: 'member_already_linked' }, 409)
        }
      } else {
        return json({ error: 'invite_missing_member' }, 500)
      }
    }

    await admin
      .from('split_invites')
      .update({ status: 'accepted', responded_at: now })
      .eq('id', invite.id)

    // 1:1 coherence: convert the owner's open loans with this contact into
    // shared expenses so both sides see the same balance.
    await syncLoansIntoGroup(admin, invite.group_id).catch(() => {})

    return json({ ok: true, groupId: invite.group_id })
  } catch (err) {
    if (isResponse(err)) return err
    const message = err instanceof Error ? err.message : 'accept_failed'
    return json({ error: 'accept_failed', message }, 500)
  }
}
