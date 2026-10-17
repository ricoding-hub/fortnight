/**
 * Algo cambió en las tarjetas desde esta pestaña (un pago, un borrado, una
 * corrección del banco): todos los estados de cuenta abiertos se recalculan.
 *
 * Cada pantalla tiene su propia copia de `useInstallments`, y el tiempo real no
 * basta para avisarles: un DELETE con filtro no siempre llega.
 */
const EVENTO = 'fortnight:tarjetas'

export function avisarCambioEnTarjetas(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO))
}

export function alCambiarTarjetas(f: () => void): () => void {
  window.addEventListener(EVENTO, f)
  return () => window.removeEventListener(EVENTO, f)
}
