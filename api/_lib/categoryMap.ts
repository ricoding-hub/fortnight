/**
 * Server-side keyword → category mapping used during Syncfy sync.
 *
 * Order matters — first match wins. Lookup is case-insensitive and accent-
 * insensitive (NFD normalization in matchCategory). Categories must exist
 * in the user's pre-seeded set (see migration 001_initial.sql).
 *
 * User overrides survive future syncs: the transactions upsert uses
 * `ignoreDuplicates: true`, so a re-categorized synced row is never
 * overwritten when its external_id reappears.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface KeywordRule {
  category: string
  needles: string[]
}

export const KEYWORD_RULES: ReadonlyArray<KeywordRule> = [
  // ---------------- Income ----------------
  { category: 'Salario',       needles: ['nomina', 'nomina ', 'payroll', 'salario'] },
  { category: 'Vales',         needles: ['edenred', 'sodexo', 'si vale', 'vale despensa', 'broxel'] },

  // ---------------- Fixed -----------------
  { category: 'Renta',         needles: ['renta', 'arrendamiento', 'rentas'] },
  { category: 'Servicios',     needles: ['cfe', 'comision federal', 'telmex', 'izzi', 'totalplay', 'agua', 'sacmex', 'gas natural', 'naturgy'] },
  { category: 'Suscripciones', needles: ['netflix', 'spotify', 'disney', 'hbo', 'amazon prime', 'youtube premium', 'icloud', 'apple.com/bill', 'apple music'] },

  // ---------------- Variable --------------
  { category: 'Comida',        needles: ['oxxo', '7-eleven', 'walmart', 'soriana', 'chedraui', 'starbucks', 'rappi', 'uber eats', 'didi food', 'toks', 'sanborns', 'mcdonalds', 'kfc', 'burger king', 'la chilaquiza', 'comida'] },
  { category: 'Social',        needles: ['cinepolis', 'cinemex', 'bar ', 'restaurante', 'cerveceria', 'spotify family'] },
  { category: 'Transporte',    needles: ['uber', 'didi', 'cabify', 'gasolinera', 'pemex', 'g500', 'shell', 'mobil', 'metro', 'metrobus', 'estacionamiento'] },
  { category: 'Salud',         needles: ['farmacia', 'doctor', 'hospital', 'clinica', 'farma', 'mediproteccion'] },
]

/**
 * Normalize a string for matching: lowercase + strip diacritics + collapse
 * whitespace. "TÓKS REFORMA" → "toks reforma".
 */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolves a transaction description to a category_id for the given user.
 * Returns null when no rule matches (UI shows the row as uncategorized).
 *
 * Caller pre-loads the user's category map (name → id) so we don't hit the
 * DB per transaction.
 */
export function matchCategory(
  description: string | null | undefined,
  categoriesByName: Map<string, string>,
): string | null {
  if (!description) return null
  const desc = normalize(description)
  for (const rule of KEYWORD_RULES) {
    if (rule.needles.some((n) => desc.includes(n))) {
      return categoriesByName.get(rule.category) ?? null
    }
  }
  return null
}

/**
 * Loads the user's categories into a name → id map, once per sync run.
 * Keyword rules reference seeded category names (Renta, Comida, etc.) so
 * we look them up exactly.
 */
export async function loadCategoryMap(
  admin: SupabaseClient,
  userId: string,
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from('categories')
    .select('id,name')
    .eq('user_id', userId)
  if (error) throw error
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    map.set(row.name as string, row.id as string)
  }
  return map
}
