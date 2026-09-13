/**
 * Logo de una marca a partir de su dominio.
 *
 * Vivía en `lib/banks.ts` como `bankLogoUrl`, pero de bancos no tiene nada: es
 * el favicon de un dominio. Los servicios — CFE, Telmex, Totalplay — lo usan
 * igual, así que se saca de ahí en vez de duplicarlo o de importar "banks"
 * desde donde no hay bancos.
 *
 * Nota de privacidad: esto pide la imagen a un tercero, así que ese tercero se
 * entera de qué marcas usa quien abre la app. Ya era así para los bancos, que
 * es lo más delicado. La alternativa es empaquetar los logos como archivos
 * locales; está anotado como decisión pendiente, no como olvido.
 */
export function logoUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`
}
