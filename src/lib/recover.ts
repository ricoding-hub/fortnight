/**
 * Recuperación de un arranque roto.
 *
 * Aquí vive sólo la parte que se puede usar desde dentro de la app: limpiar y
 * recargar, que es lo que ofrece el botón del ErrorBoundary, y borrar la marca
 * cuando el arranque sale bien.
 *
 * La detección del bundle roto NO está aquí, está en línea en `index.html`, y
 * no por gusto: si el service worker sirve un armazón que apunta a un archivo
 * que ya no existe, el bundle da 404 y nada de este módulo se ejecuta. Ese fue
 * el fallo de v1.7.5 y es el único del que no teníamos ninguna salida.
 */

/**
 * Marca en sessionStorage: sobrevive a la recarga, muere al cerrar la pestaña.
 * La pone la red de arranque de `index.html` — tiene que estar ahí, en línea,
 * porque cuando el bundle no carga este módulo no llega a ejecutarse.
 */
const YA_INTENTADO = 'fortnight:recuperado'

/**
 * Desregistra los service workers y borra las cachés.
 *
 * No lanza: si el navegador no deja (modo privado, permisos), se sigue adelante,
 * porque recargar sin caché limpia todavía puede funcionar.
 */
export async function limpiarCaches(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((regs ?? []).map((r) => r.unregister()))
  } catch {
    // Sin service worker, o el navegador no lo permite.
  }
  try {
    const keys = await caches?.keys?.()
    await Promise.all((keys ?? []).map((k) => caches.delete(k)))
  } catch {
    // Sin CacheStorage disponible.
  }
}

/** Limpia y recarga. Lo que ofrece el botón «limpia la caché» del ErrorBoundary. */
export async function reiniciarApp(): Promise<void> {
  await limpiarCaches()
  window.location.reload()
}

/**
 * Al llegar vivo, se borra la marca.
 *
 * Sin esto, una recuperación en esta pestaña dejaría la marca puesta y la
 * siguiente actualización que fallara ya no se podría curar.
 */
export function marcarArranqueSano(): void {
  try {
    sessionStorage.removeItem(YA_INTENTADO)
  } catch {
    // Da igual: la marca sólo existe si sessionStorage funciona.
  }
}
