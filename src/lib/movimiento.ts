import type { Account, Category, Transaction } from '@/types'

/**
 * Qué es un movimiento, según su tipo y la cuenta en la que está.
 *
 * El signo solo no alcanza: en débito, negativo es un gasto; en una tarjeta,
 * negativo es un pago (o un reembolso) y positivo es una compra. Hasta v1.16
 * varias pantallas sumaban por signo crudo, y una compra con tarjeta contaba
 * como ingreso y un pago como gasto. Toda la app decide aquí.
 */
export type ClaseMovimiento =
  | 'ingreso'
  | 'gasto'
  | 'reembolso'
  | 'pago-tarjeta'
  | 'transferencia'
  | 'ajuste'
  | 'cargo-msi'

type Mov = Pick<Transaction, 'amount' | 'type'> & { transfer_id?: string | null }

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function clasificar(
  tx: Mov,
  cuenta?: Pick<Account, 'type'> | null,
  categoria?: Pick<Category, 'kind'> | null,
): ClaseMovimiento {
  if (tx.type === 'adjustment') return 'ajuste'
  if (tx.type === 'installment') return 'cargo-msi'
  const credito = cuenta?.type === 'credit'
  if (tx.type === 'transfer') return credito ? 'pago-tarjeta' : 'transferencia'
  const monto = num(tx.amount)
  if (credito) {
    if (monto > 0) return 'gasto'
    // Antes, la única forma de pagar la tarjeta era un «Ingreso» con categoría
    // de ingreso (Salario, Vales…). Eso, o sin categoría, es un pago. Con una
    // categoría de gasto es una devolución de una compra.
    return !categoria || categoria.kind === 'income' ? 'pago-tarjeta' : 'reembolso'
  }
  return monto < 0 ? 'gasto' : 'ingreso'
}

/** Cuánto cambia tu patrimonio con este movimiento (una deuda que sube lo baja). */
export function efectoEnPatrimonio(tx: Pick<Transaction, 'amount'>, cuenta?: Pick<Account, 'type'> | null): number {
  const monto = num(tx.amount)
  return cuenta?.type === 'credit' ? -monto : monto
}

/**
 * El monto a guardar en una cuenta para que el dinero salga o entre. En una
 * tarjeta, pagar con ella SUBE su deuda (positivo) y recibir la baja: los
 * préstamos y gastos compartidos usaban el signo de débito y una compra con
 * tarjeta bajaba la deuda.
 */
export function montoEnCuenta(cuenta: Pick<Account, 'type'> | null | undefined, sentido: 'sale' | 'entra', monto: number): number {
  const m = Math.abs(monto)
  if (cuenta?.type === 'credit') return sentido === 'sale' ? m : -m
  return sentido === 'sale' ? -m : m
}

export interface ResumenMovimientos {
  ingresos: number
  gastos: number
  pagosTarjeta: number
  cambioPatrimonio: number
  /** Ingresos, gastos y reembolsos: lo que cuenta como «registrar movimientos». */
  registros: number
}

/**
 * Ingresos, gastos y pagos de tarjeta desde `desde` (inclusive). Un pago de
 * tarjeta cuenta una vez aunque tenga dos partes. Los reembolsos restan gasto.
 */
export function resumenDeMovimientos(
  txs: readonly (Mov & Pick<Transaction, 'date' | 'account_id' | 'category_id'>)[],
  cuentas: ReadonlyMap<string, Pick<Account, 'type'>>,
  categorias: ReadonlyMap<string, Pick<Category, 'kind'>>,
  desde?: string,
): ResumenMovimientos {
  let ingresos = 0
  let gastos = 0
  let pagosTarjeta = 0
  let cambioPatrimonio = 0
  let registros = 0
  for (const tx of txs) {
    if (desde && tx.date < desde) continue
    const cuenta = cuentas.get(tx.account_id)
    const cat = tx.category_id ? categorias.get(tx.category_id) : null
    const clase = clasificar(tx, cuenta, cat)
    const monto = Math.abs(num(tx.amount))
    cambioPatrimonio += efectoEnPatrimonio(tx, cuenta)
    if (clase === 'ingreso') {
      ingresos += monto
      registros++
    } else if (clase === 'gasto') {
      gastos += monto
      registros++
    } else if (clase === 'reembolso') {
      gastos -= monto
      registros++
    } else if (clase === 'pago-tarjeta') {
      pagosTarjeta += monto
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    ingresos: r2(ingresos),
    gastos: r2(Math.max(0, gastos)),
    pagosTarjeta: r2(pagosTarjeta),
    cambioPatrimonio: r2(cambioPatrimonio),
    registros,
  }
}

/** Texto corto para una clase, para filas y detalles. */
export const ETIQUETA_CLASE: Record<ClaseMovimiento, string> = {
  ingreso: 'Ingreso',
  gasto: 'Gasto',
  reembolso: 'Reembolso',
  'pago-tarjeta': 'Pago de tarjeta',
  transferencia: 'Pago de tarjeta',
  ajuste: 'Ajuste de saldo',
  'cargo-msi': 'Compra a meses',
}
