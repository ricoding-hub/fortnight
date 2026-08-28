/**
 * Which "module" a route belongs to, for deciding when Richeto speaks up.
 *
 * The companion used to pop open on every single route change, which turned a
 * helpful hint into noise. Now it introduces itself once per module and then
 * stays quiet until tapped. Routes that would show the same message share a
 * key, so the user never gets the identical hint twice.
 */
export type RichetoModule = 'home' | 'plan' | 'movimientos' | 'prestamos' | 'cuentas' | 'otros'

export function moduleKey(pathname: string): RichetoModule {
  if (pathname.startsWith('/cuentas/movimientos')) return 'movimientos'
  if (pathname.startsWith('/cuentas/prestamos')) return 'prestamos'
  if (pathname.startsWith('/cuentas')) return 'cuentas'
  if (pathname.startsWith('/plan')) return 'plan'
  if (pathname === '/') return 'home'
  return 'otros'
}

const MESSAGES: Record<RichetoModule, string> = {
  home: '¿En qué te ayudo hoy?',
  plan: 'Ajusta los porcentajes a tu vida — el 50/30/20 es solo el punto de partida.',
  movimientos: 'Cada peso contado es uno controlado.',
  prestamos: 'Aquí ves de un vistazo quién te debe y a quién le debes.',
  cuentas: 'Mantén tus cuentas al día; un par de segundos por aquí evita sorpresas.',
  otros: '¿En qué te ayudo?',
}

export function moduleMessage(pathname: string): string {
  return MESSAGES[moduleKey(pathname)]
}

/** localStorage key, namespaced per user so a shared device doesn't leak state. */
export function seenStorageKey(userId: string | undefined): string {
  return userId ? `fortnight:richeto-seen:${userId}` : 'fortnight:richeto-seen'
}

export function readSeen(userId: string | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(seenStorageKey(userId))
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === 'string')) : new Set()
  } catch {
    // Private mode or corrupted value: behave as if nothing was seen.
    return new Set()
  }
}

export function markSeen(userId: string | undefined, key: RichetoModule): void {
  try {
    const seen = readSeen(userId)
    seen.add(key)
    localStorage.setItem(seenStorageKey(userId), JSON.stringify([...seen]))
  } catch {
    // Storage denied: the hint simply shows again next time.
  }
}
