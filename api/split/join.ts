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
 */

import { isResponse, json, requireUser } from '../_lib/auth.js'

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
      .select('id, name, member_user_id, left_at')
      .eq('group_id', group.id)
    const activeMembers = (members ?? []).filter((m) => m.left_at == null)
    const alreadyMember = activeMembers.some((m) => m.member_user_id === user.id)

    if (action === 'preview') {
      return json({
        ok: true,
        groupId: group.id,
        name: group.name,
        alreadyMember,
        members: activeMembers.map((m) => ({
          id: m.id,
          name: m.name,
          linked: m.member_user_id != null,
        })),
      })
    }

    // claim / new are idempotent for existing members.
    if (alreadyMember) return json({ ok: true, groupId: group.id, alreadyMember: true })

    if (action === 'claim') {
      const slot = activeMembers.find((m) => m.id === body.memberId)
      if (!slot) return json({ error: 'member_not_found' }, 404)
      if (slot.member_user_id) return json({ error: 'member_already_linked' }, 409)
      const { error: uErr } = await admin
        .from('split_members')
        .update({ member_user_id: user.id })
        .eq('id', slot.id)
      if (uErr) return json({ error: 'link_failed' }, 500)
      // The member UPDATE trigger emits member_linked → notifications fan out.
      return json({ ok: true, groupId: group.id })
    }

    // action === 'new'
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

    return json({ ok: true, groupId: group.id })
  } catch (err) {
    if (isResponse(err)) return err
    const message = err instanceof Error ? err.message : 'join_failed'
    return json({ error: 'join_failed', message }, 500)
  }
}
