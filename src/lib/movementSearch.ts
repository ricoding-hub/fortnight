/**
 * Búsqueda de movimientos.
 *
 * Pura y sin React a propósito: es lo que hace que una caja de búsqueda sea
 * confiable, y lo que se puede probar sin montar una pantalla de 1,200 líneas.
 */

/** Minúsculas, sin acentos, espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** ¿Este token es un monto («$1,000», «270.50»)? */
function esMonto(token: string): boolean {
  return /^[$\d.,]+$/.test(token) && /\d/.test(token)
}

/**
 * Las formas en que un monto puede escribirse: 1000 · 1000.00 · 1,000.00.
 * Quien busca «1000» y quien busca «1,000» tienen que encontrar el mismo gasto.
 */
export function textoDeMonto(n: number): string {
  const abs = Math.abs(n)
  const fijo = abs.toFixed(2)
  const [entero, dec] = fijo.split('.')
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return [String(abs), fijo, `${miles}.${dec}`, miles].join(' ')
}

/** Junta lo buscable de una fila en un solo texto normalizado. */
export function construirTexto(
  partes: ReadonlyArray<string | number | null | undefined>,
  montos: readonly number[] = [],
  fechas: readonly string[] = [],
): string {
  const palabras = partes.filter((p): p is string | number => p != null && p !== '').map(String)
  return normalizar([...palabras, ...montos.map(textoDeMonto), ...fechas].join(' '))
}

/**
 * ¿La fila cumple la consulta?
 *
 * Varias palabras = TODAS tienen que aparecer (en cualquier orden), así «wings
 * army» y «army wings» encuentran lo mismo. Un monto escrito con «$» o comas se
 * compara sin ellos.
 *
 * Cada palabra se compara por su INICIO, no como subcadena. Era subcadena y
 * «gas» — gasolina, gas LP — devolvía todo lo que pagaste tú, porque «gas» está
 * dentro de «pa-gas-te». Por inicio de palabra, «gas» encuentra «gas» y
 * «gasolina» pero no «pagaste»; «270» encuentra «270.00» pero no «1270.00».
 */
export function coincide(texto: string, consulta: string): boolean {
  const q = normalizar(consulta)
  if (!q) return true
  const palabras = texto.split(' ')
  return q.split(' ').every((token) => {
    const t = esMonto(token) ? token.replace(/[$,]/g, '') : token
    return t === '' || palabras.some((w) => w.startsWith(t))
  })
}
