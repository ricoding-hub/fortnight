import { fechaCorta } from '@/lib/movementDates'
import type { InstallmentVivo } from '@/lib/msi'

/** Qué pasa con la mensualidad en curso, en una línea. */
export function lineaDeEstado(inst: InstallmentVivo): { texto: string; tono: 'normal' | 'alerta' | 'listo' } {
  const { actual, terminado, termina } = inst.msi
  if (terminado || !actual) return { texto: `Pagado completo · terminó el ${fechaCorta(termina)}`, tono: 'listo' }
  if (actual.estado === 'vencida') return { texto: `Vencida desde el ${fechaCorta(actual.vence)}`, tono: 'alerta' }
  if (actual.estado === 'por-pagar') {
    return { texto: `En tu estado de cuenta · vence el ${fechaCorta(actual.vence)}`, tono: 'normal' }
  }
  return {
    texto: actual.corte
      ? `Entra en tu corte del ${fechaCorta(actual.corte)} · vence el ${fechaCorta(actual.vence)}`
      : `Vence el ${fechaCorta(actual.vence)}`,
    tono: 'normal',
  }
}
