import { clavesDeContacto, contactoDe, esEtiquetaPropia } from '@/lib/conexion'
import type { Loan, SplitMember } from '@/types'

/**
 * Quién es quién al crear un préstamo.
 *
 * Vivía dentro de `MisPrestamos.tsx`. Se saca porque ahora hay DOS sitios que
 * crean préstamos — la pantalla de Préstamos y el «Agregar» global — y los dos
 * tienen que decidir lo mismo: un préstamo a alguien con quien ya existe una
 * conexión 1:1 sin conectar se estampa en ese grupo. Si el segundo sitio no lo
 * hiciera, el préstamo quedaría "despegado" de la relación a la que pertenece y
 * sus saldos no cuadrarían (justo lo que advertía el comentario original).
 */

/** Nombres que ya aparecieron en tus préstamos, sin repetir y en orden. */
export function nombresDeContactos(loans: readonly Pick<Loan, 'name'>[]): string[] {
  const nombres = new Set(loans.map((l) => l.name.trim()).filter(Boolean))
  return Array.from(nombres).sort((a, b) => a.localeCompare(b, 'es'))
}

interface GrupoConMiembros {
  activeMembers: readonly SplitMember[]
}

/**
 * La conexión 1:1 (dos personas) de cada contacto, por nombre en minúsculas:
 * por su etiqueta local y por su nombre visible. Quien no creó la conexión ve
 * a la otra persona etiquetada «Yo», que no coincide con ningún préstamo.
 */
export function grupoDirectoPorContacto<G extends GrupoConMiembros>(
  grupos: readonly G[],
  userId: string | undefined,
  nombre: (m: SplitMember) => string = (m) => m.name,
): Map<string, G> {
  const mapa = new Map<string, G>()
  for (const g of grupos) {
    const contacto = contactoDe(g, userId)
    if (!contacto) continue
    for (const k of clavesDeContacto(contacto, nombre(contacto))) mapa.set(k, g)
  }
  return mapa
}

/**
 * El grupo en el que hay que estampar un préstamo nuevo, o null.
 *
 * Sólo si la conexión existe y NO está conectada: en una conexión conectada los
 * préstamos quedan privados (se sincronizan aparte, con confirmación), y
 * estamparlos ahí los metería en el saldo compartido sin que el otro lo sepa.
 */
export function grupoParaPrestamo<G extends GrupoConMiembros & { isConnected: boolean; group: { id: string } }>(
  nombre: string,
  mapa: ReadonlyMap<string, G>,
): string | null {
  const directo = mapa.get(nombre.trim().toLowerCase())
  return directo && !directo.isConnected ? directo.group.id : null
}

/**
 * Con quién tienes una conexión 1:1, aunque todavía no haya ningún préstamo.
 *
 * Al registrar un préstamo, esa persona tiene que aparecer en la lista: la
 * relación ya existe, y escribir su nombre a mano arriesga una variante
 * ("Ale" / "Alesita") que no se enlaza con ella.
 */
export function nombresDeConexiones(
  grupos: readonly GrupoConMiembros[],
  userId: string | undefined,
  nombre: (m: SplitMember) => string = (m) => m.name,
): string[] {
  const out: string[] = []
  for (const g of grupos) {
    const contacto = contactoDe(g, userId)
    // El nombre que ves, nunca la etiqueta «Yo» que la otra persona se puso.
    const visible = contacto ? nombre(contacto).trim() : ''
    if (visible && !esEtiquetaPropia(visible)) out.push(visible)
  }
  return out
}

/** Une listas de nombres sin repetir (sin distinguir mayúsculas) y en orden. */
export function unirNombres(...listas: readonly (readonly string[])[]): string[] {
  const vistos = new Map<string, string>()
  for (const lista of listas) {
    for (const n of lista) {
      const clave = n.trim().toLowerCase()
      if (clave && !vistos.has(clave)) vistos.set(clave, n.trim())
    }
  }
  return Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, 'es'))
}
