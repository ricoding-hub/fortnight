import { memberIsMe } from '@/lib/loanFormat'
import type { Profile, SplitMember } from '@/types'

/**
 * Una conexión 1:1 no es un grupo.
 *
 * Se guarda como un grupo de dos personas, pero el nombre del grupo y las
 * etiquetas de los miembros las pone quien la crea, desde SU lado: Toño crea la
 * conexión, la llama «Richy» y su propia fila queda como «Yo». Cuando Richy la
 * abre, ninguna de esas dos etiquetas sirve: lo que tiene que ver es «Toño».
 * Aquí vive esa regla, para que ninguna pantalla vuelva a usar el nombre del
 * grupo en una conexión.
 */

interface ConMiembros {
  activeMembers: readonly SplitMember[]
}

/** Dos miembros activos: una conexión, no un grupo. */
export function esConexion(g: ConMiembros): boolean {
  return g.activeMembers.length === 2
}

/** La otra persona de una conexión (o `undefined` si es un grupo). */
export function contactoDe(g: ConMiembros, userId: string | undefined): SplitMember | undefined {
  return esConexion(g) ? g.activeMembers.find((m) => !memberIsMe(m, userId)) : undefined
}

/** Cómo se llama la relación: la otra persona en una conexión, el grupo si no. */
export function nombreDeRelacion(
  g: ConMiembros & { group: { name: string } },
  userId: string | undefined,
  nombre: (m: SplitMember) => string,
): string {
  const c = contactoDe(g, userId)
  return c ? nombre(c) : g.group.name
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

/** Etiquetas que alguien se pone a sí mismo. Nunca son el nombre de otra persona. */
const PROPIAS = new Set(['yo', 'tu', 'mi', 'me'])

export function esEtiquetaPropia(nombre: string): boolean {
  return PROPIAS.has(normalizar(nombre))
}

/**
 * El nombre que se muestra de un miembro:
 *  1. el nombre de su perfil, si tiene cuenta;
 *  2. si no, la etiqueta local — salvo que sea «Yo»/«Tú» de otra persona;
 *  3. y entonces, lo de antes de la @ de su correo, o «Tu contacto».
 */
export function nombreVisible(
  m: SplitMember,
  perfil: Pick<Profile, 'display_name' | 'email'> | undefined,
  userId: string | undefined,
): string {
  const delPerfil = perfil?.display_name?.trim()
  if (m.member_user_id && delPerfil) return delPerfil
  const local = m.name.trim()
  if (local && (memberIsMe(m, userId) || !esEtiquetaPropia(local))) return local
  const correo = perfil?.email?.split('@')[0]?.trim()
  return correo || 'Tu contacto'
}

/**
 * Por qué nombres se puede reconocer a la otra persona al ligar tus préstamos
 * con la conexión: su etiqueta local y su nombre visible. Quien NO creó la
 * conexión ve la etiqueta «Yo» de la otra persona, que no sirve para nada.
 */
export function clavesDeContacto(m: SplitMember, visible: string): string[] {
  const claves = new Set<string>()
  if (m.name.trim() && !esEtiquetaPropia(m.name)) claves.add(m.name.trim().toLowerCase())
  if (visible.trim()) claves.add(visible.trim().toLowerCase())
  return [...claves]
}
