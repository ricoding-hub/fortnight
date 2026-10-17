import { supabase } from '@/lib/supabase'
import type { Account } from '@/types'

/**
 * El tipo de una cuenta por id, para guardar un movimiento con el signo
 * correcto (`montoEnCuenta`): préstamos y gastos compartidos no traen la cuenta
 * completa, sólo su id. Sin respuesta no se adivina: suponer débito en una
 * tarjeta bajaba su deuda en vez de subirla.
 */
export async function tipoDeCuenta(accountId: string): Promise<Pick<Account, 'type'>> {
  const { data, error } = await supabase.from('accounts').select('type').eq('id', accountId).maybeSingle()
  const fila = data as Pick<Account, 'type'> | null
  if (error || !fila) throw new Error('No se pudo leer la cuenta. Revisa tu conexión e inténtalo de nuevo.')
  return fila
}
