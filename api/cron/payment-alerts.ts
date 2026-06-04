import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'Fortnight <notificaciones@fortnight.app>'

export async function GET(req: Request): Promise<Response> {
  // Vercel injects Authorization: Bearer <CRON_SECRET> for cron routes.
  const auth = req.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!RESEND_API_KEY) {
    return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: configs } = await sb
    .from('user_config')
    .select('user_id, notif_due_card, notif_email')
    .eq('notif_due_card', true)
    .eq('notif_email', true)

  let processed = 0
  let skipped = 0

  for (const cfg of configs ?? []) {
    const { data: accounts } = await sb
      .from('accounts')
      .select('id, name, balance, cut_day, payment_due_day, payment_grace_days')
      .eq('user_id', cfg.user_id)
      .eq('type', 'credit')

    for (const account of accounts ?? []) {
      const days = computeDaysUntilPayment(account)
      if (days == null || days > 1) continue

      const now = new Date()
      const cycleKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const dedupKey = `payment_due:${String(account.id)}:${cycleKey}`

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

      const { data: authData } = await sb.auth.admin.getUserById(String(cfg.user_id))
      const email = authData?.user?.email
      if (!email) continue

      const name = String(account.name)
      const title = days === 0 ? `Hoy vence: ${name}` : `Mañana vence: ${name}`
      const body = days === 0
        ? `Hoy vence el pago de tu tarjeta ${name}.`
        : `Mañana vence el pago de tu tarjeta ${name}.`

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

      const emailOk = await sendEmail(email, name, Number(account.balance), days)

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

  return Response.json({ ok: true, processed, skipped })
}

// ---------------------------------------------------------------------------
// Date logic (mirrored from src/lib/dates.ts)
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
// Email via Resend
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

  const r = await fetch('https://api.resend.com/emails', {
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

  return r.ok
}
