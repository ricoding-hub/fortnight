/**
 * POST /api/split/invite
 *
 * Body: { groupId: string, email: string, memberId?: string }
 *
 * Invites a person to a split group by email. Runs with the service role:
 * verifies the caller is a member, creates (or reuses) the local member
 * slot, stores the invite token, notifies in-app if the email already
 * belongs to a Fortnight user, and sends the invitation email via Resend.
 * The token never reaches any client except through the emailed link.
 */

import { isResponse, json, requireUser } from '../_lib/auth.js'

export async function POST(req: Request): Promise<Response> {
  try {
    const { user, admin } = await requireUser(req)
    const body = (await req.json().catch(() => ({}))) as {
      groupId?: string
      email?: string
      memberId?: string
    }
    const groupId = body.groupId
    const email = body.email?.trim().toLowerCase()
    if (!groupId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: 'invalid_request' }, 400)
    }

    // Caller must be a member (owner or linked) of the group.
    const [{ data: group }, { data: callerMember }] = await Promise.all([
      admin.from('split_groups').select('id, name, user_id').eq('id', groupId).maybeSingle(),
      admin
        .from('split_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('member_user_id', user.id)
        .maybeSingle(),
    ])
    if (!group) return json({ error: 'group_not_found' }, 404)
    if (group.user_id !== user.id && !callerMember) return json({ error: 'forbidden' }, 403)

    // Reuse the given local member slot, or create one named after the email.
    let memberId = body.memberId ?? null
    if (memberId) {
      const { data: slot } = await admin
        .from('split_members')
        .select('id, member_user_id')
        .eq('id', memberId)
        .eq('group_id', groupId)
        .maybeSingle()
      if (!slot) return json({ error: 'member_not_found' }, 404)
      if (slot.member_user_id) return json({ error: 'member_already_linked' }, 409)
    } else {
      const localName = email.split('@')[0]
      const { data: created, error: mErr } = await admin
        .from('split_members')
        .insert({ group_id: groupId, user_id: user.id, name: localName, is_me: false })
        .select('id')
        .single()
      if (mErr || !created) {
        // Unique name collision → suffix with a short discriminator.
        const { data: retry, error: rErr } = await admin
          .from('split_members')
          .insert({
            group_id: groupId,
            user_id: user.id,
            name: `${localName} (${email.slice(0, 2)})`,
            is_me: false,
          })
          .select('id')
          .single()
        if (rErr || !retry) return json({ error: 'member_create_failed' }, 500)
        memberId = retry.id as string
      } else {
        memberId = created.id as string
      }
    }

    // Revoke any prior pending invite for this member slot, then create one.
    await admin
      .from('split_invites')
      .update({ status: 'revoked', responded_at: new Date().toISOString() })
      .eq('invited_member_id', memberId)
      .eq('status', 'pending')

    const { data: invite, error: iErr } = await admin
      .from('split_invites')
      .insert({
        group_id: groupId,
        inviter_user_id: user.id,
        invited_member_id: memberId,
        email,
      })
      .select('id, token')
      .single()
    if (iErr || !invite) return json({ error: 'invite_create_failed' }, 500)

    // Activity entry (explicit — the actor is known here, triggers can't see it).
    const { data: inviterProfile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()
    const inviterName = inviterProfile?.display_name ?? 'Alguien'
    await admin.from('split_activity').insert({
      group_id: groupId,
      actor_user_id: user.id,
      actor_name: inviterName,
      verb: 'invite_sent',
      subject: email,
    })

    const origin = process.env.APP_ORIGIN ?? 'https://fortnight.app'
    const inviteLink = `${origin}/invite/${invite.token}`

    // If the email already belongs to a Fortnight user, notify in-app.
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existing) {
      await admin.from('notifications').insert({
        user_id: existing.id,
        type: 'split',
        title: group.name,
        body: `${inviterName} te invitó a compartir gastos en "${group.name}"`,
        dedup_key: `invite:${invite.id}`,
        link: `/invite/${invite.token}`,
      })
    }

    // Email via Resend (same pattern as payment-alerts). Non-fatal on failure
    // when the recipient already got the in-app notification.
    const resendKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.FROM_EMAIL ?? 'Richeto <onboarding@resend.dev>'
    let emailSent = false
    if (resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resendKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: email,
          subject: `${inviterName} te invitó a "${group.name}" en Fortnight`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="color:#1A1F36">Te invitaron a compartir gastos</h2>
              <p style="color:#5A5F73;font-size:15px;line-height:1.5">
                <strong>${inviterName}</strong> te invitó al grupo
                <strong>"${group.name}"</strong> en Fortnight para dividir gastos
                y llevar las cuentas claras.
              </p>
              <a href="${inviteLink}"
                 style="display:inline-block;background:#2A4BFF;color:#fff;font-weight:700;
                        padding:12px 24px;border-radius:12px;text-decoration:none;margin:16px 0">
                Aceptar invitación
              </a>
              <p style="color:#8E91A4;font-size:12px">
                Si no esperabas esta invitación puedes ignorar este correo.
              </p>
            </div>`,
        }),
      })
      emailSent = res.ok
    }

    return json({ ok: true, inviteId: invite.id, memberId, emailSent, notifiedInApp: !!existing })
  } catch (err) {
    if (isResponse(err)) return err
    const message = err instanceof Error ? err.message : 'invite_failed'
    return json({ error: 'invite_failed', message }, 500)
  }
}
