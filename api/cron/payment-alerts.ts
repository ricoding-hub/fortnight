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

  // La notificación en la app no depende del correo: antes sólo se creaba si
  // también estaba activado el correo.
  const { data: configs } = await sb
    .from('user_config')
    .select('user_id, notif_due_card, notif_email')
    .eq('notif_due_card', true)

  // El día de hoy en México, no en el reloj del servidor (UTC).
  const hoy = hoyEnMexico()
  let processed = 0
  let skipped = 0

  for (const cfg of configs ?? []) {
    const { data: accounts } = await sb
      .from('accounts')
      .select('id, name, balance, cut_day, payment_due_day, payment_grace_days')
      .eq('user_id', cfg.user_id)
      .eq('type', 'credit')

    for (const account of accounts ?? []) {
      const pago = proximoPago(account, hoy)
      if (!pago) continue
      const days = diasEntre(hoy, pago.vence)
      if (days > 1) continue
      // Sin deuda no hay nada que avisar.
      if (!(Number(account.balance) > 0.005)) {
        skipped++
        continue
      }

      // ¿Ya está pagado el estado de cuenta? Lo que se movió en la tarjeta desde
      // el corte dice cuánto se abonó. Con la cifra del banco (migración 038) se
      // sabe exacto; sin ella, sólo se calla si se pagó todo el saldo al corte.
      let falta: number | null = null
      if (pago.corte) {
        const { data: movs } = await sb
          .from('transactions')
          .select('amount')
          .eq('account_id', account.id)
          .gt('date', pago.corte)
        const despues = (movs ?? []).map((m) => Number(m.amount) || 0)
        const pagado = despues.filter((m) => m < 0).reduce((s, m) => s - m, 0)
        const saldoAlCorte = Number(account.balance) - despues.reduce((s, m) => s + m, 0)
        const { data: correccion, error: errCorr } = await sb
          .from('card_statements')
          .select('no_interest_amount')
          .eq('account_id', account.id)
          .eq('cut_date', pago.corte)
          .maybeSingle()
        const banco = !errCorr && correccion?.no_interest_amount != null ? Number(correccion.no_interest_amount) : null
        if (banco != null) {
          falta = Math.max(0, banco - pagado)
          if (falta <= 0.005) {
            skipped++
            continue
          }
        } else if (pagado >= saldoAlCorte - 0.005) {
          skipped++
          continue
        }
      }

      // Una vez por fecha de pago (antes era una por mes calendario, y el aviso
      // de «hoy» chocaba con el de «mañana»).
      const dedupKey = `payment_due:${String(account.id)}:${pago.vence}:${days}`

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

      const name = String(account.name)
      const title = days <= 0 ? `Hoy vence: ${name}` : `Mañana vence: ${name}`
      const cuanto = falta != null ? ` Te faltan ${formatoMXN(falta)} según tu estado de cuenta.` : ' Abre Fortnight para ver cuánto te falta.'
      const body = (days <= 0 ? `Hoy vence el pago de tu tarjeta ${name}.` : `Mañana vence el pago de tu tarjeta ${name}.`) + cuanto

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
      processed++

      if (!cfg.notif_email) continue
      const { data: authData } = await sb.auth.admin.getUserById(String(cfg.user_id))
      const email = authData?.user?.email
      if (!email) continue

      const emailOk = await sendEmail(email, name, falta, days)
      if (emailOk) {
        await sb
          .from('notifications')
          .update({ email_sent: true })
          .eq('user_id', cfg.user_id)
          .eq('dedup_key', dedupKey)
      }
    }
  }

  return Response.json({ ok: true, processed, skipped })
}

function hoyEnMexico(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
}

function formatoMXN(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

function aFecha(k: string): Date {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function aClave(d: Date): string {
  return d.toISOString().slice(0, 10) // fechas construidas en UTC a propósito
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000)
}

function dia(y: number, m: number, d: number): Date {
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d, ultimo)))
}

/**
 * La próxima fecha de pago (hoy o después) y el corte de ese estado de cuenta.
 * Copia de src/lib/cardCycle.ts (esta función no puede importar de src/).
 */
function proximoPago(a: AccountRow, hoy: string): { vence: string; corte: string | null } | null {
  const h = aFecha(hoy)
  const cut = a.cut_day != null ? Number(a.cut_day) : null
  const grace = a.payment_grace_days != null ? Number(a.payment_grace_days) : null
  const due = a.payment_due_day != null ? Number(a.payment_due_day) : null
  if (cut != null && grace != null) {
    const atras = Math.ceil(grace / 28) + 1
    for (let i = -atras; i <= 13; i++) {
      const c = dia(h.getUTCFullYear(), h.getUTCMonth() + i, cut)
      const v = new Date(c.getTime() + grace * 86_400_000)
      if (aClave(v) >= hoy) return { vence: aClave(v), corte: aClave(c) }
    }
    return null
  }
  if (due == null) return null
  for (let i = 0; i <= 13; i++) {
    const v = dia(h.getUTCFullYear(), h.getUTCMonth() + i, due)
    if (aClave(v) < hoy) continue
    if (cut == null) return { vence: aClave(v), corte: null }
    // El corte del estado que se paga: el último antes de esa fecha.
    let c = dia(v.getUTCFullYear(), v.getUTCMonth(), cut)
    if (aClave(c) >= aClave(v)) c = dia(v.getUTCFullYear(), v.getUTCMonth() - 1, cut)
    return { vence: aClave(v), corte: aClave(c) }
  }
  return null
}

// ---------------------------------------------------------------------------
// Date logic (mirrored from src/lib/dates.ts)
// ---------------------------------------------------------------------------

interface AccountRow {
  cut_day: number | null
  payment_due_day: number | null
  payment_grace_days: number | null
}


// ---------------------------------------------------------------------------
// Email via Resend
// ---------------------------------------------------------------------------

async function sendEmail(
  to: string,
  accountName: string,
  falta: number | null,
  days: number,
): Promise<boolean> {
  const urgencyLabel = days <= 0 ? 'hoy' : 'mañana'
  // Sólo se dice un monto si viene del estado de cuenta del banco. El saldo
  // completo incluye mensualidades MSI que aún no se cobran: no es lo que toca.
  const montoHtml = falta != null
    ? `Te faltan <strong style="color:#EF4444">${formatoMXN(falta)}</strong> para no generar intereses.`
    : 'Abre Fortnight para ver cuánto te falta para no generar intereses.'

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
        ${montoHtml}
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
