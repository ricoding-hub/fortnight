// Fortnight — Edge Function: send-payment-alerts
// Checks all credit accounts nearing their payment due date and sends
// a Richeto-branded email via Resend. Deduplicates by billing cycle.
//
// Setup:
//   1. In Supabase Dashboard > Edge Functions > Secrets, add:
//      - RESEND_API_KEY  (from resend.com — free tier: 100 emails/day)
//      - FROM_EMAIL      (e.g. "Richeto <no-reply@yourdomain.com>")
//        For testing without a domain: use "onboarding@resend.dev"
//   2. Schedule via Dashboard > Edge Functions > send-payment-alerts > Schedule
//      Cron: "0 15 * * *"  (daily at 15:00 UTC = 09:00 Mexico City time)
//      Or use the pg_cron block at the bottom of 007_gamification.sql.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Fortnight <notificaciones@fortnight.app>'

serve(async (_req) => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
    })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // 1. Users with both in-app and email notifications enabled for payment due
  const { data: configs } = await sb
    .from('user_config')
    .select('user_id, notif_due_card, notif_email')
    .eq('notif_due_card', true)
    .eq('notif_email', true)

  let processed = 0
  let skipped = 0

  for (const cfg of configs ?? []) {
    // 2. Credit accounts for this user
    const { data: accounts } = await sb
      .from('accounts')
      .select('id, name, balance, cut_day, payment_due_day, payment_grace_days')
      .eq('user_id', cfg.user_id)
      .eq('type', 'credit')

    for (const account of accounts ?? []) {
      const days = computeDaysUntilPayment(account)
      if (days == null || days > 1) continue

      // 3. Dedup: one notification per account per calendar month
      const now = new Date()
      const cycleKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const dedupKey = `payment_due:${account.id}:${cycleKey}`

      const { data: existing } = await sb
        .from('notifications')
        .select('id')
        .eq('user_id', cfg.user_id)
        .eq('dedup_key', dedupKey)
        .maybeSingle()

      if (existing) {
        skipped++
        continue
      }

      // 4. User email via service role
      const { data: authData } = await sb.auth.admin.getUserById(cfg.user_id)
      const email = authData?.user?.email
      if (!email) continue

      const title = days === 0
        ? `Hoy vence: ${account.name}`
        : `Mañana vence: ${account.name}`
      const body = days === 0
        ? `Hoy vence el pago de tu tarjeta ${account.name}.`
        : `Mañana vence el pago de tu tarjeta ${account.name}.`

      // 5. Insert notification row first (before email, so the inbox shows it even if email fails)
      await sb.from('notifications').insert({
        user_id: cfg.user_id,
        type: 'payment_due',
        title,
        body,
        account_id: account.id,
        dedup_key: dedupKey,
        email_sent: false,
        read: false,
      })

      // 6. Send email via Resend
      const emailOk = await sendEmail(email, account.name, Number(account.balance), days)

      if (emailOk) {
        await sb
          .from('notifications')
          .update({ email_sent: true })
          .eq('user_id', cfg.user_id)
          .eq('dedup_key', dedupKey)
        processed++
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// ---------------------------------------------------------------------------
// Date logic (mirrored from src/lib/dates.ts — no frontend deps in Deno)
// ---------------------------------------------------------------------------

interface AccountRow {
  cut_day: number | null
  payment_due_day: number | null
  payment_grace_days: number | null
}

function computeDaysUntilPayment(account: AccountRow): number | null {
  const { cut_day, payment_grace_days, payment_due_day } = account
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (payment_grace_days != null && cut_day != null) {
    const clamp = (y: number, m: number) => {
      const last = new Date(y, m + 1, 0).getDate()
      return new Date(y, m, Math.min(cut_day, last))
    }
    let lastCut = clamp(today.getFullYear(), today.getMonth())
    if (lastCut > today) {
      lastCut =
        today.getMonth() === 0
          ? clamp(today.getFullYear() - 1, 11)
          : clamp(today.getFullYear(), today.getMonth() - 1)
    }
    const due = new Date(lastCut)
    due.setDate(due.getDate() + payment_grace_days)
    if (due < today) {
      const nextCut = clamp(today.getFullYear(), today.getMonth() + 1)
      const nextDue = new Date(nextCut)
      nextDue.setDate(nextDue.getDate() + payment_grace_days)
      return Math.round((nextDue.getTime() - today.getTime()) / 86_400_000)
    }
    return Math.round((due.getTime() - today.getTime()) / 86_400_000)
  }

  if (payment_due_day != null) {
    const clamp = (y: number, m: number) => {
      const last = new Date(y, m + 1, 0).getDate()
      return new Date(y, m, Math.min(payment_due_day, last))
    }
    let target = clamp(today.getFullYear(), today.getMonth())
    if (target < today) target = clamp(today.getFullYear(), today.getMonth() + 1)
    return Math.round((target.getTime() - today.getTime()) / 86_400_000)
  }

  return null
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

async function sendEmail(
  to: string,
  accountName: string,
  balance: number,
  days: number,
): Promise<boolean> {
  const urgencyLabel = days === 0 ? 'hoy' : 'mañana'
  const balanceFmt = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(balance)

  const html = `<!DOCTYPE html>
<html lang="es">
<body style="font-family:system-ui,-apple-system,sans-serif;background:#F7F4ED;margin:0;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 4px 20px rgba(26,31,54,.08)">
    <div style="background:linear-gradient(135deg,#6366F1,#9B7BFF);border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
      <p style="font-size:40px;margin:0;line-height:1">🐹</p>
      <p style="color:rgba(255,255,255,.8);font-size:11px;margin:8px 0 2px;text-transform:uppercase;letter-spacing:.12em;font-weight:700">Richeto</p>
      <p style="color:#fff;font-size:20px;font-weight:800;margin:0">Tu compañero financiero</p>
    </div>

    <p style="color:#1A1F36;font-size:15px;margin:0 0 12px">
      Vence <strong>${urgencyLabel}</strong> el pago de tu tarjeta:
    </p>

    <div style="background:#F0F1F8;border-radius:10px;padding:14px 18px;margin-bottom:12px">
      <p style="margin:0;font-size:18px;font-weight:800;color:#0F0D2E">${accountName}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#6B7194">
        Saldo pendiente: <strong style="color:#EF4444">${balanceFmt}</strong>
      </p>
    </div>

    <a href="https://fortnight.app/cuentas"
       style="display:block;background:#6366F1;color:#fff;text-align:center;padding:14px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;margin-bottom:20px">
      Ver mis cuentas →
    </a>

    <p style="color:#9CA3AF;font-size:11px;text-align:center;margin:0;line-height:1.5">
      Para dejar de recibir estos correos, desactiva "Correo electrónico" en<br>
      Perfil → Notificaciones dentro de la app.
    </p>
  </div>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject: `Richeto: pago de ${accountName} vence ${urgencyLabel}`,
      html,
    }),
  })

  return res.ok
}
