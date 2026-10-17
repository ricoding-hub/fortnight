import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { avisarCambioEnTarjetas } from '@/lib/avisoTarjetas'
import { toKey } from '@/lib/localDate'
import { tieneEsquemaPagos } from '@/lib/esquema'
import type { Transaction } from '@/types'

export interface PagoTarjeta {
  card: { id: string; name: string }
  amount: number
  /** La cuenta de débito de la que salió el dinero; null = no registrar la salida. */
  from: { id: string; name: string } | null
  date: string
  nota?: string | null
}

/**
 * Pagar una tarjeta.
 *
 * Un pago son dos renglones del mismo dinero: la tarjeta baja su deuda (−X) y
 * la cuenta de la que salió baja su saldo (−X). Van en UN solo insert, así que
 * se guardan los dos o ninguno, y comparten `transfer_id` para borrarse juntos.
 * No son ingreso ni gasto.
 *
 * Sin la migración 038 no existe el tipo `transfer`: se guardan como dos ajustes
 * de saldo (que tampoco cuentan como ingreso ni gasto).
 */
export function usePagarTarjeta() {
  const { user } = useAuth()

  async function pagar(p: PagoTarjeta): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const monto = Math.round(Math.abs(p.amount) * 100) / 100
    if (!(monto > 0)) throw new Error('Escribe un monto mayor a 0')
    if (p.date > toKey(new Date())) throw new Error('La fecha del pago no puede ser futura')
    const conTransfer = await tieneEsquemaPagos()
    const transferId = crypto.randomUUID()
    const nota = p.nota?.trim() || null
    const comun = {
      user_id: user.id,
      date: p.date,
      category_id: null,
      type: conTransfer ? ('transfer' as const) : ('adjustment' as const),
      ...(conTransfer ? { transfer_id: transferId } : {}),
    }
    const filas = [
      {
        ...comun,
        account_id: p.card.id,
        amount: -monto,
        description: nota ?? (p.from ? `Pago desde ${p.from.name}` : 'Pago de tarjeta'),
      },
      ...(p.from
        ? [{ ...comun, account_id: p.from.id, amount: -monto, description: nota ?? `Pago a ${p.card.name}` }]
        : []),
    ]
    const { error } = await supabase.from('transactions').insert(filas)
    if (error) throw error
    avisarCambioEnTarjetas()
  }

  /** Borra un pago completo: las dos partes si están unidas. */
  async function borrarPago(tx: Pick<Transaction, 'id' | 'transfer_id'>): Promise<void> {
    const q = supabase.from('transactions').delete()
    const { error } = tx.transfer_id ? await q.eq('transfer_id', tx.transfer_id) : await q.eq('id', tx.id)
    if (error) throw error
    avisarCambioEnTarjetas()
  }

  /** Guarda la cifra del estado de cuenta del banco para un corte. */
  async function corregirEstado(
    accountId: string,
    cutDate: string,
    v: { pngi: number | null; minimo: number | null },
  ): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const { error } = await supabase.from('card_statements').upsert(
      {
        user_id: user.id,
        account_id: accountId,
        cut_date: cutDate,
        no_interest_amount: v.pngi,
        min_amount: v.minimo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,cut_date' },
    )
    if (error) throw error
    avisarCambioEnTarjetas()
  }

  async function quitarCorreccion(accountId: string, cutDate: string): Promise<void> {
    const { error } = await supabase.from('card_statements').delete().eq('account_id', accountId).eq('cut_date', cutDate)
    if (error) throw error
    avisarCambioEnTarjetas()
  }

  return { pagar, borrarPago, corregirEstado, quitarCorreccion }
}
