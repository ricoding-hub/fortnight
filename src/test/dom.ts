/**
 * Lo que jsdom no trae y la app sí usa.
 *
 * Nada de esto es un fallo de la app: son API del navegador que jsdom no
 * implementa. Se rellenan con lo mínimo para que el árbol se pueda dibujar,
 * nunca para tapar un error de verdad — si algo de aquí faltara, el test se
 * caería con un TypeError que no dice nada sobre el código que se quiere probar.
 */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }

  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class {
      root = null
      rootMargin = ''
      thresholds: number[] = []
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    } as unknown as typeof IntersectionObserver
  }

  window.scrollTo = window.scrollTo ?? (() => {})
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {})
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})

  // Los hooks usan crypto.randomUUID para la clave del canal de realtime.
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...globalThis.crypto, randomUUID: () => `uuid-${Math.random().toString(16).slice(2)}` },
      configurable: true,
    })
  }
}
