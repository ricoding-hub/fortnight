/**
 * Curated catalog of Mexican banks + fintechs for the logo picker.
 * Domains feed Google's favicon API which returns the bank's icon
 * (most banks use their logo as their favicon).
 */

export interface BankPreset {
  /** Stable identifier — used as the option value. */
  id: string
  /** Human label shown in the picker. */
  name: string
  /** Domain used to fetch the favicon. */
  domain: string
  /** Accent color that ships with the preset (matches the bank's brand). */
  color: string
}

export const BANK_PRESETS: BankPreset[] = [
  { id: 'nu',         name: 'Nu',           domain: 'nu.com.mx',           color: '#8200FF' },
  { id: 'bbva',       name: 'BBVA',         domain: 'bbva.mx',             color: '#072146' },
  { id: 'santander',  name: 'Santander',    domain: 'santander.com.mx',    color: '#EC0000' },
  { id: 'banorte',    name: 'Banorte',      domain: 'banorte.com',         color: '#EB0028' },
  { id: 'banamex',    name: 'Banamex',      domain: 'banamex.com',         color: '#005EB8' },
  { id: 'hsbc',       name: 'HSBC',         domain: 'hsbc.com.mx',         color: '#DB0011' },
  { id: 'scotiabank', name: 'Scotiabank',   domain: 'scotiabank.com.mx',   color: '#EC111A' },
  { id: 'inbursa',    name: 'Inbursa',      domain: 'inbursa.com',         color: '#0072CE' },
  { id: 'banregio',   name: 'Banregio',     domain: 'banregio.com',        color: '#F58220' },
  { id: 'azteca',     name: 'Azteca',       domain: 'bancoazteca.com.mx',  color: '#009A44' },
  { id: 'bancoppel',  name: 'BanCoppel',    domain: 'bancoppel.com',       color: '#005CB9' },
  { id: 'klar',       name: 'Klar',         domain: 'klar.mx',             color: '#FF4757' },
  { id: 'plata',      name: 'Plata',        domain: 'platacard.mx',        color: '#0066FF' },
  { id: 'stori',      name: 'Stori',        domain: 'storicard.com',       color: '#FFD800' },
  { id: 'hey',        name: 'Hey Banco',    domain: 'heybanco.com',        color: '#000000' },
  { id: 'rappi',      name: 'RappiCard',    domain: 'rappi.com.mx',        color: '#FE2D55' },
  { id: 'mercado',    name: 'Mercado Pago', domain: 'mercadopago.com.mx',  color: '#00B1EA' },
  { id: 'cuenca',     name: 'Cuenca',       domain: 'cuenca.com',          color: '#000000' },
  { id: 'uala',       name: 'Ualá',         domain: 'uala.com.mx',         color: '#22ECC4' },
  { id: 'finsus',     name: 'Finsus',       domain: 'finsus.mx',           color: '#0046FF' },
]

/** Returns the favicon URL for a domain. */
export function bankLogoUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`
}

const BY_DOMAIN = new Map(BANK_PRESETS.map((b) => [b.domain, b]))
export function presetForDomain(domain: string | null | undefined): BankPreset | undefined {
  if (!domain) return undefined
  return BY_DOMAIN.get(domain)
}

/**
 * Best-effort lookup by institution name (case-insensitive substring match).
 * Used to render a logo for synced credentials when only the bank name is known.
 */
export function presetForInstitutionName(
  name: string | null | undefined,
): BankPreset | undefined {
  if (!name) return undefined
  const lower = name.toLowerCase()
  return BANK_PRESETS.find((b) => lower.includes(b.name.toLowerCase()))
}
