import { describe, expect, it } from 'vitest'
import { canOfferInstall, detectInstallMethod, type InstallEnv } from '@/lib/install'

/** User agents copiados de dispositivos reales, no inventados. */
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15',
  iphoneWhatsApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/466.0]',
  iphoneInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.3.28.104',
  // iPadOS 13+ se hace pasar por Mac; sólo los puntos táctiles lo delatan.
  ipadSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ipadLegacy:
    'Mozilla/5.0 (iPad; CPU OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  macSafari17:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macSafari16:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  windowsFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  androidFirefox:
    'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
}

const env = (over: Partial<InstallEnv> = {}): InstallEnv => ({
  hasPromptEvent: false,
  standalone: false,
  ua: UA.windowsChrome,
  maxTouchPoints: 0,
  ...over,
})

describe('detectInstallMethod — ya instalada', () => {
  it('calla en cuanto corre como app, venga de donde venga', () => {
    for (const ua of Object.values(UA)) {
      expect(detectInstallMethod(env({ ua, standalone: true }))).toBe('installed')
    }
  })

  it('calla aunque el navegador todavía ofrezca el evento', () => {
    expect(detectInstallMethod(env({ standalone: true, hasPromptEvent: true }))).toBe('installed')
  })
})

describe('detectInstallMethod — botón real', () => {
  it('usa el evento del navegador cuando existe', () => {
    for (const ua of [UA.windowsChrome, UA.windowsEdge, UA.androidChrome, UA.androidSamsung, UA.macChrome]) {
      expect(detectInstallMethod(env({ ua, hasPromptEvent: true }))).toBe('prompt')
    }
  })
})

describe('detectInstallMethod — iOS', () => {
  it('guía a Safari en iPhone', () => {
    expect(detectInstallMethod(env({ ua: UA.iphoneSafari }))).toBe('ios-safari')
  })

  it('reconoce el iPad moderno pese a que se declara Macintosh', () => {
    expect(detectInstallMethod(env({ ua: UA.ipadSafari, maxTouchPoints: 5 }))).toBe('ipad-safari')
    expect(detectInstallMethod(env({ ua: UA.ipadLegacy }))).toBe('ipad-safari')
  })

  it('no promete el menú de Safari en navegadores que no lo tienen', () => {
    // Aquí es donde la versión anterior mentía: mostraba "Compartir → Añadir
    // a pantalla de inicio" dentro de Chrome, de Instagram y de WhatsApp.
    for (const ua of [UA.iphoneChrome, UA.iphoneFirefox, UA.iphoneWhatsApp, UA.iphoneInstagram]) {
      expect(detectInstallMethod(env({ ua }))).toBe('ios-elsewhere')
    }
  })
})

describe('detectInstallMethod — escritorio', () => {
  it('ofrece el Dock sólo desde Safari 17', () => {
    expect(detectInstallMethod(env({ ua: UA.macSafari17 }))).toBe('macos-safari')
    expect(detectInstallMethod(env({ ua: UA.macSafari16 }))).toBe('none')
  })

  it('no confunde un Mac con un iPad', () => {
    expect(detectInstallMethod(env({ ua: UA.macSafari17, maxTouchPoints: 0 }))).toBe('macos-safari')
  })

  it('calla en Firefox de escritorio, que no puede instalar', () => {
    expect(detectInstallMethod(env({ ua: UA.windowsFirefox }))).toBe('none')
  })

  it('calla en Chrome sin evento: o ya está instalada o el navegador dijo que no', () => {
    expect(detectInstallMethod(env({ ua: UA.windowsChrome }))).toBe('none')
    expect(detectInstallMethod(env({ ua: UA.androidChrome }))).toBe('none')
  })
})

describe('detectInstallMethod — Android', () => {
  it('explica el menú de Firefox, que nunca dispara el evento', () => {
    expect(detectInstallMethod(env({ ua: UA.androidFirefox }))).toBe('android-firefox')
  })
})

describe('canOfferInstall', () => {
  it('sólo deja hablar cuando hay algo que hacer', () => {
    expect(canOfferInstall('none')).toBe(false)
    expect(canOfferInstall('installed')).toBe(false)
    for (const m of ['prompt', 'ios-safari', 'ipad-safari', 'macos-safari', 'android-firefox', 'ios-elsewhere'] as const) {
      expect(canOfferInstall(m)).toBe(true)
    }
  })
})
