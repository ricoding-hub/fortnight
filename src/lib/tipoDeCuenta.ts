import { supabase } from '@/lib/supabase'
import type { Account } from '@/types'

/**
 * El tipo de una cuenta por id, para guardar un movimiento con el signo
 * correcto (`montoEnCuenta`): préstamos y gastos compartidos no traen la cuenta
 * completa, sólo su id. Sin respuesta, se asume débito (el signo de siempre).
 */
export async function tipoDeCuenta(accountId: string): Promise<Pick<Account, 'type'> | null> {
  const { data } = await supabase.from('accounts').select('type').eq('id', accountId).maybeSingle()
  return (data as Pick<Account, 'type'> | null) ?? null
}
