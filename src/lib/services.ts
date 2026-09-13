/**
 * Catálogo de proveedores de gastos fijos en México.
 *
 * Misma forma que `BANK_PRESETS`: un dominio del que sale el logo y un color de
 * marca. Lo que no tiene proveedor — la renta, una colegiatura, una tanda —
 * lleva icono en vez de logo, porque no hay nada que cargar.
 *
 * El orden importa: es el que se ve en el selector, y va de lo que más gente
 * paga a lo que menos.
 */
import type { Icon } from '@tabler/icons-react'
import {
  IconBolt, IconDroplet, IconFlame, IconWifi, IconDeviceTv, IconPhone,
  IconHome, IconSchool, IconShieldHalf, IconBarbell, IconBuildingBank,
  IconReceiptTax, IconCategory,
} from '@tabler/icons-react'

export interface ServicePreset {
  id: string
  name: string
  /** Dominio del que sale el logo. null = no hay marca, se usa el icono. */
  domain: string | null
  color: string
  icon: Icon
  /** Categoría sugerida al elegirlo, por nombre. */
  categoria: string
}

export const SERVICE_PRESETS: ServicePreset[] = [
  // Luz, agua, gas
  { id: 'cfe',        name: 'CFE',           domain: 'cfe.mx',              color: '#008E5A', icon: IconBolt,        categoria: 'Servicios' },
  { id: 'agua',       name: 'Agua',          domain: null,                  color: '#0EA5E9', icon: IconDroplet,     categoria: 'Servicios' },
  { id: 'naturgy',    name: 'Naturgy',       domain: 'naturgy.com.mx',      color: '#FF6B00', icon: IconFlame,       categoria: 'Servicios' },
  { id: 'gaslp',      name: 'Gas LP',        domain: null,                  color: '#F97316', icon: IconFlame,       categoria: 'Servicios' },
  // Internet, TV, teléfono
  { id: 'telmex',     name: 'Telmex',        domain: 'telmex.com',          color: '#0057B8', icon: IconWifi,        categoria: 'Servicios' },
  { id: 'totalplay',  name: 'Totalplay',     domain: 'totalplay.com.mx',    color: '#E4002B', icon: IconWifi,        categoria: 'Servicios' },
  { id: 'izzi',       name: 'izzi',          domain: 'izzi.mx',             color: '#00A0DF', icon: IconWifi,        categoria: 'Servicios' },
  { id: 'megacable',  name: 'Megacable',     domain: 'megacable.com.mx',    color: '#E3000F', icon: IconWifi,        categoria: 'Servicios' },
  { id: 'sky',        name: 'Sky',           domain: 'sky.com.mx',          color: '#0B3B8C', icon: IconDeviceTv,    categoria: 'Servicios' },
  { id: 'telcel',     name: 'Telcel',        domain: 'telcel.com',          color: '#0072CE', icon: IconPhone,       categoria: 'Servicios' },
  { id: 'att',        name: 'AT&T',          domain: 'att.com.mx',          color: '#00A8E0', icon: IconPhone,       categoria: 'Servicios' },
  // Vivienda
  { id: 'renta',      name: 'Renta',         domain: null,                  color: '#2A4BFF', icon: IconHome,        categoria: 'Renta' },
  { id: 'infonavit',  name: 'Infonavit',     domain: 'infonavit.org.mx',    color: '#B3282D', icon: IconBuildingBank, categoria: 'Renta' },
  { id: 'fovissste',  name: 'Fovissste',     domain: 'fovissste.gob.mx',    color: '#691C32', icon: IconBuildingBank, categoria: 'Renta' },
  { id: 'predial',    name: 'Predial',       domain: null,                  color: '#6B7194', icon: IconReceiptTax,  categoria: 'Servicios' },
  // Otros fijos
  { id: 'colegiatura',name: 'Colegiatura',   domain: null,                  color: '#9B7BFF', icon: IconSchool,      categoria: 'Salud' },
  { id: 'seguro',     name: 'Seguro',        domain: null,                  color: '#2BB673', icon: IconShieldHalf,  categoria: 'Salud' },
  { id: 'gimnasio',   name: 'Gimnasio',      domain: null,                  color: '#F97316', icon: IconBarbell,     categoria: 'Salud' },
]

const BY_ID = new Map(SERVICE_PRESETS.map((s) => [s.id, s]))

export function servicePreset(id: string | null | undefined): ServicePreset | undefined {
  if (!id) return undefined
  return BY_ID.get(id)
}

/** Icono de reserva cuando no hay preset ni logo. */
export const ICONO_GENERICO: Icon = IconCategory
