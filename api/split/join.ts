/**
 * POST /api/split/join
 *
 * Body: { code: string, action: 'preview' | 'claim' | 'new', memberId?, name? }
 *
 * Consumes a group invite link (Splitwise model). Runs with the service
 * role because the caller is not yet a member and RLS hides the group.
 *
 * - preview: resolve the code → group name + member slots, so the joiner
 *   can pick "I am X" (an unlinked local member) or join as a new person.
 * - claim:   link an unlinked member slot to the caller's account.
 * - new:     add the caller as a brand-new linked member.
 *
 * The owner's own slot (`is_me`) is never claimable: groups created before the
 * multi-user migration have it with `member_user_id` null, which made it look
 * free. A 2-person group is a 1:1 connection: whoever opens its link IS the
 * other person, so `new` is refused there — it used to turn the connection
 * into a 3-person group.
 */

import { isResponse, json, requireUser } from '../_lib/auth.js'
import { syncLoansIntoGroup } from '../_lib/splitSync.js'

export async function POST(req: Request): Promise<Response> {
  try {
    const { user, admin } = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as {
      code?: string
      action?: string
      memberId?: string
      name?: string
    }
    const code = body.code?.trim()
    const action = body.action
    if (!code || !action || !['preview', 'claim', 'new'].includes(action)) {
      return json({ error: 'invalid_request' }, 400)
    }

    const { data: group } = await admin
      .from('split_groups')
      .select('id, name, user_id, archived_at')
      .eq('invite_code', code)
      .maybeSingle()
    if (!group || group.archived_at) return json({ error: 'group_not_found' }, 404)

    const { data: members } = await admin
      .from('split_members')
      .select('id, name, member_user_id, left_at, is_me')
      .eq('group_id', group.id)
    const activeMembers = (members ?? []).filter((m) => m.left_at == null)
    const alreadyMember =
      group.user_id === user.id || activeMembers.some((m) => m.member_user_id === user.id)
    const libre = (m: { member_user_id: string | null; is_me: boolean | null }) =>
      m.member_user_id == null && !m.is_me
    const esConexion = activeMembers.length === 2

    if (action === 'preview') {
      return json({
        ok: true,
        groupId: group.id,
        name: group.name,
        alreadyMember,
        members: activeMembers.map((m) => ({
          id: m.id,
          name: m.name,
          linked: !libre(m),
        })),
      })
    }

    // claim / new are idempotent for existing members.
    if (alreadyMember) return json({ ok: true, groupId: group.id, alreadyMember: true })

    if (action === 'claim') {
      const slot = activeMembers.find((m) => m.id === body.memberId)
      if (!slot) return json({ error: 'member_not_found' }, 404)
      if (!libre(slot)) return json({ error: 'member_already_linked' }, 409)
      const { error: uErr } = await admin
        .from('split_members')
        .update({ member_user_id: user.id })
        .eq('id', slot.id)
      if (uErr) return json({ error: 'link_failed' }, 500)
      // The member UPDATE trigger emits member_linked → notifications fan out.
      // 1:1 coherence: convert the owner's open loans with this contact into
      // shared expenses so both sides see the same balance from day one.
      await syncLoansIntoGroup(admin, group.id).catch(() => {})
      return json({ ok: true, groupId: group.id })
    }

    // action === 'new'
    if (esConexion) {
      return json(
        { error: activeMembers.some(libre) ? 'claim_required' : 'connection_full' },
        409,
      )
    }
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, email')
      .eq('id', user.id)
      .maybeSingle()
    const baseName =
      body.name?.trim() ||
      profile?.display_name ||
      profile?.email?.split('@')[0] ||
      'Invitado'

    const insertMember = (name: string) =>
      admin
        .from('split_members')
        .insert({
          group_id: group.id,
          user_id: user.id,
          name,
          is_me: false,
          member_user_id: user.id,
        })
        .select('id')
        .single()

    let { error: cErr } = await insertMember(baseName)
    if (cErr) {
      // Unique name collision → short discriminator, same pattern as invites.
      const retry = await insertMember(`${baseName} (${user.id.slice(0, 4)})`)
      cErr = retry.error
    }
    if (cErr) return json({ error: 'join_failed' }, 500)

    await syncLoansIntoGroup(admin, group.id).catch(() => {})
    return json({ ok: true, groupId: group.id })
  } catch (err) {
    if (isResponse(err)) return err
    const message = err instanceof Error ? err.message : 'join_failed'
    return json({ error: 'join_failed', message }, 500)
  }
}
