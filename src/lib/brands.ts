export interface Brand {
  id: string
  name: string
  color: string
  type: 'bank' | 'subscription' | 'other'
  initials: string
  /** Dominio del que sale el logo. null = sólo iniciales de color. */
  domain?: string | null
  /**
   * Cómo la escribe la gente de verdad. "Claude Pro", "Spotify Familiar",
   * "Plan Telcel" tienen que encontrar su marca igual que el nombre exacto.
   */
  aliases?: string[]
}

/**
 * Marcas con logo.
 *
 * Los dominios importan: sin ellos `RecurringLogo` no tiene nada que cargar y
 * cae a un cuadro de color con iniciales. En la lista de recurrentes eso hacía
 * que Telcel y Claude Pro salieran en gris mientras Spotify salía en verde, sin
 * más motivo que si alguien había tocado el selector de marca.
 */
export const BRANDS: Brand[] = [
  // ── Bancos y fintechs mexicanas ──────────────────────────────────────────
  { id: 'nu',          name: 'Nu',            color: '#820AD1', type: 'bank', initials: 'Nu', domain: 'nu.com.mx' },
  { id: 'bbva',        name: 'BBVA',          color: '#0066CC', type: 'bank', initials: 'B',  domain: 'bbva.mx' },
  { id: 'santander',   name: 'Santander',     color: '#EC0000', type: 'bank', initials: 'S',  domain: 'santander.com.mx' },
  { id: 'banamex',     name: 'Banamex',       color: '#CC0000', type: 'bank', initials: 'Bx', domain: 'banamex.com' },
  { id: 'banorte',     name: 'Banorte',       color: '#003087', type: 'bank', initials: 'Bn', domain: 'banorte.com' },
  { id: 'hsbc',        name: 'HSBC',          color: '#DB0011', type: 'bank', initials: 'H',  domain: 'hsbc.com.mx' },
  { id: 'klar',        name: 'Klar',          color: '#7C3AED', type: 'bank', initials: 'K',  domain: 'klar.mx' },
  { id: 'plata',       name: 'Plata',         color: '#1E40AF', type: 'bank', initials: 'P',  domain: 'platacard.mx' },
  { id: 'hey',         name: 'Hey Banco',     color: '#00BFB3', type: 'bank', initials: 'Hy', domain: 'heybanco.com' },
  { id: 'stori',       name: 'Stori',         color: '#5B21B6', type: 'bank', initials: 'St', domain: 'storicard.com' },
  { id: 'spin',        name: 'Spin',          color: '#059669', type: 'bank', initials: 'Sp', domain: 'spinbyoxxo.com' },
  { id: 'mercadopago', name: 'Mercado Pago',  color: '#009EE3', type: 'bank', initials: 'MP', domain: 'mercadopago.com.mx', aliases: ['mercado pago', 'mercadopago'] },
  { id: 'scotiabank',  name: 'Scotiabank',    color: '#EC111A', type: 'bank', initials: 'Sc', domain: 'scotiabank.com.mx' },
  { id: 'inbursa',     name: 'Inbursa',       color: '#003A7A', type: 'bank', initials: 'In', domain: 'inbursa.com' },
  { id: 'azteca',      name: 'Banco Azteca',  color: '#F97316', type: 'bank', initials: 'Az', domain: 'bancoazteca.com.mx' },
  { id: 'rappicard',   name: 'RappiCard',     color: '#FE2D55', type: 'bank', initials: 'R',  domain: 'rappi.com.mx', aliases: ['rappi card'] },

  // ── Streaming ────────────────────────────────────────────────────────────
  { id: 'netflix',     name: 'Netflix',       color: '#E50914', type: 'subscription', initials: 'N',  domain: 'netflix.com' },
  { id: 'spotify',     name: 'Spotify',       color: '#1DB954', type: 'subscription', initials: 'S',  domain: 'spotify.com' },
  { id: 'disney',      name: 'Disney+',       color: '#0063E5', type: 'subscription', initials: 'D+', domain: 'disneyplus.com', aliases: ['disney plus', 'disney'] },
  { id: 'hbo',         name: 'HBO Max',       color: '#0B0CFF', type: 'subscription', initials: 'M',  domain: 'max.com', aliases: ['hbo', 'max'] },
  { id: 'prime',       name: 'Amazon Prime',  color: '#00A8E1', type: 'subscription', initials: 'P',  domain: 'amazon.com.mx', aliases: ['prime video', 'amazon', 'prime'] },
  { id: 'appletv',     name: 'Apple TV+',     color: '#000000', type: 'subscription', initials: 'TV', domain: 'apple.com', aliases: ['apple tv'] },
  { id: 'youtube',     name: 'YouTube Premium', color: '#FF0000', type: 'subscription', initials: 'YT', domain: 'youtube.com', aliases: ['youtube'] },
  { id: 'vix',         name: 'ViX',           color: '#FF4E00', type: 'subscription', initials: 'V',  domain: 'vix.com' },
  { id: 'paramount',   name: 'Paramount+',    color: '#0064FF', type: 'subscription', initials: 'P+', domain: 'paramountplus.com', aliases: ['paramount'] },
  { id: 'crunchyroll', name: 'Crunchyroll',   color: '#F47521', type: 'subscription', initials: 'CR', domain: 'crunchyroll.com' },

  // ── Música y audio ───────────────────────────────────────────────────────
  { id: 'applemusic',  name: 'Apple Music',   color: '#FA243C', type: 'subscription', initials: 'AM', domain: 'apple.com' },
  { id: 'audible',     name: 'Audible',       color: '#F8991C', type: 'subscription', initials: 'Au', domain: 'audible.com' },

  // ── IA y productividad ───────────────────────────────────────────────────
  { id: 'claude',      name: 'Claude',        color: '#D97757', type: 'subscription', initials: 'C',  domain: 'claude.ai', aliases: ['claude pro', 'claude max', 'anthropic'] },
  { id: 'chatgpt',     name: 'ChatGPT',       color: '#10A37F', type: 'subscription', initials: 'AI', domain: 'openai.com', aliases: ['chatgpt plus', 'openai', 'gpt'] },
  { id: 'gemini',      name: 'Gemini',        color: '#4285F4', type: 'subscription', initials: 'G',  domain: 'gemini.google.com', aliases: ['google ai', 'gemini advanced'] },
  { id: 'notion',      name: 'Notion',        color: '#000000', type: 'subscription', initials: 'N',  domain: 'notion.so' },
  { id: 'canva',       name: 'Canva',         color: '#00C4CC', type: 'subscription', initials: 'C',  domain: 'canva.com', aliases: ['canva pro'] },
  { id: 'microsoft',   name: 'Microsoft 365', color: '#D83B01', type: 'subscription', initials: 'M',  domain: 'microsoft.com', aliases: ['office', 'office 365', 'microsoft'] },
  { id: 'adobe',       name: 'Adobe',         color: '#FF0000', type: 'subscription', initials: 'A',  domain: 'adobe.com', aliases: ['adobe cc', 'creative cloud', 'photoshop'] },
  { id: 'github',      name: 'GitHub',        color: '#181717', type: 'subscription', initials: 'GH', domain: 'github.com', aliases: ['github copilot', 'copilot'] },
  { id: 'duolingo',    name: 'Duolingo',      color: '#58CC02', type: 'subscription', initials: 'D',  domain: 'duolingo.com' },

  // ── Nube ─────────────────────────────────────────────────────────────────
  { id: 'icloud',      name: 'iCloud',        color: '#1C6EF2', type: 'subscription', initials: 'iC', domain: 'icloud.com', aliases: ['icloud+', 'apple one', 'apple'] },
  { id: 'googleone',   name: 'Google One',    color: '#4285F4', type: 'subscription', initials: 'G1', domain: 'one.google.com', aliases: ['google drive', 'google one'] },
  { id: 'dropbox',     name: 'Dropbox',       color: '#0061FF', type: 'subscription', initials: 'Db', domain: 'dropbox.com' },

  // ── Telefonía (también se paga como suscripción) ─────────────────────────
  { id: 'telcel',      name: 'Telcel',        color: '#0072CE', type: 'subscription', initials: 'T',  domain: 'telcel.com', aliases: ['plan telcel', 'telcel max'] },
  { id: 'att',         name: 'AT&T',          color: '#00A8E0', type: 'subscription', initials: 'AT', domain: 'att.com.mx', aliases: ['att'] },
  { id: 'movistar',    name: 'Movistar',      color: '#019DF4', type: 'subscription', initials: 'Mo', domain: 'movistar.com.mx' },
  { id: 'bait',        name: 'Bait',          color: '#0071CE', type: 'subscription', initials: 'Ba', domain: 'bait.mx' },

  // ── Juegos ───────────────────────────────────────────────────────────────
  { id: 'xbox',        name: 'Xbox Game Pass', color: '#107C10', type: 'subscription', initials: 'X', domain: 'xbox.com', aliases: ['game pass', 'xbox'] },
  { id: 'psplus',      name: 'PS Plus',       color: '#003791', type: 'subscription', initials: 'PS', domain: 'playstation.com', aliases: ['playstation', 'ps plus'] },
  { id: 'nintendo',    name: 'Nintendo Switch Online', color: '#E60012', type: 'subscription', initials: 'NS', domain: 'nintendo.com', aliases: ['nintendo'] },

  // ── Entregas y movilidad ─────────────────────────────────────────────────
  { id: 'uberone',     name: 'Uber One',      color: '#000000', type: 'subscription', initials: 'U',  domain: 'uber.com', aliases: ['uber'] },
  { id: 'rappiprime',  name: 'Rappi Prime',   color: '#FE2D55', type: 'subscription', initials: 'RP', domain: 'rappi.com.mx', aliases: ['rappi'] },
  { id: 'didi',        name: 'DiDi',          color: '#FF7D41', type: 'subscription', initials: 'DD', domain: 'didiglobal.com' },

  // ── Gimnasios ────────────────────────────────────────────────────────────
  { id: 'smartfit',    name: 'Smart Fit',     color: '#F5E400', type: 'subscription', initials: 'SF', domain: 'smartfit.com.mx', aliases: ['smartfit'] },
  { id: 'gym',         name: 'Gimnasio',      color: '#F97316', type: 'subscription', initials: 'GY', domain: null },
]

export const BANK_BRANDS = BRANDS.filter((b) => b.type === 'bank')
export const SUBSCRIPTION_BRANDS = BRANDS.filter((b) => b.type === 'subscription')

/** Minúsculas y sin acentos, para que "Telcél" y "TELCEL" sean lo mismo. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Encuentra la marca de un id o de un nombre escrito a mano.
 *
 * La versión anterior comparaba al revés — preguntaba si el nombre de la marca
 * contenía lo tecleado — así que "Claude Pro" no encontraba a Claude y "HBO Max"
 * no encontraba a Max. Por eso en la lista de recurrentes salían cuadros grises
 * con iniciales mientras Spotify, elegido desde el selector, salía en verde.
 *
 * Ahora se busca al derecho, con alias, y gana la coincidencia más larga: sin
 * eso, "Apple Music" podría quedarse con "Apple" de iCloud. Se exige que la
 * coincidencia empiece en frontera de palabra para que "Max" no se lleve
 * "Telcel Max" ni "Climax".
 */
export function findBrand(nameOrId: string | null | undefined): Brand | undefined {
  if (!nameOrId) return undefined
  const q = normalizar(nameOrId)
  if (!q) return undefined

  const porId = BRANDS.find((b) => b.id === q)
  if (porId) return porId

  const exacta = BRANDS.find((b) => normalizar(b.name) === q)
  if (exacta) return exacta

  let mejor: Brand | undefined
  let largo = 0
  for (const b of BRANDS) {
    for (const cand of [b.name, ...(b.aliases ?? [])]) {
      const c = normalizar(cand)
      if (!c) continue
      // Frontera de palabra a ambos lados: "max" casa en "hbo max" pero no en
      // "climax", y "uber" no se lleva "uberto".
      const re = new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
      if (re.test(q) && c.length > largo) {
        mejor = b
        largo = c.length
      }
    }
  }
  return mejor
}
