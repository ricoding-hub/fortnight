import type { Category } from '@/types'

/**
 * Auto-categorization for shared expenses. Reuses the user's existing
 * `categories` taxonomy — we don't invent a parallel enum. A strong keyword
 * dictionary maps many words to each canonical category name; `guessCategory`
 * returns the best-matching category the user actually has (or null).
 *
 * The user always sees the suggestion and can override or clear it, so the
 * matcher errs toward a confident guess rather than staying silent.
 */

/** Lowercase, strip accents, drop punctuation → space-separated tokens. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * canonical category name (normalized) → keywords. One category ↔ many words.
 * Keys match the default seeded categories (Comida, Transporte, Social, Salud,
 * Servicios, Suscripciones, Renta). "ropa" is included for completeness but only
 * resolves if the user actually has a matching category.
 */
const KEYWORDS: Record<string, string[]> = {
  comida: [
    'comida', 'alimento', 'alimentos', 'super', 'supermercado', 'despensa', 'mandado',
    'tacos', 'taco', 'alitas', 'miches', 'pizza', 'sushi', 'hamburguesa', 'burger',
    'cena', 'desayuno', 'almuerzo', 'lunch', 'restaurante', 'resto', 'fonda', 'antojitos',
    'pollo', 'carne', 'mariscos', 'postre', 'pan', 'cafe', 'cafeteria', 'starbucks',
    'oxxo', 'tienda', 'frutas', 'verduras', 'mercado', 'comer', 'itacate', 'torta', 'tortas',
  ],
  transporte: [
    'transporte', 'uber', 'didi', 'cabify', 'taxi', 'gasolina', 'gas', 'combustible',
    'estacionamiento', 'parking', 'pension', 'metro', 'metrobus', 'camion', 'pasaje',
    'pesero', 'autobus', 'bus', 'caseta', 'peaje', 'tag', 'vuelo', 'avion', 'tren',
    'bici', 'scooter', 'transbordo', 'combi',
  ],
  social: [
    'social', 'bar', 'cantina', 'antro', 'disco', 'cerveza', 'chela', 'chelas',
    'michelada', 'miche', 'trago', 'tragos', 'copa', 'copas', 'licor', 'alcohol', 'vino',
    'tequila', 'mezcal', 'whisky', 'fiesta', 'reunion', 'cine', 'pelicula', 'concierto',
    'boletos', 'boleto', 'entradas', 'entrada', 'evento', 'festival', 'teatro', 'museo',
    'billar', 'apuesta', 'salida',
  ],
  salud: [
    'salud', 'farmacia', 'medicina', 'medicamento', 'doctor', 'medico', 'consulta',
    'dentista', 'hospital', 'clinica', 'laboratorio', 'analisis', 'gym', 'gimnasio',
    'vitaminas', 'psicologo', 'terapia', 'nutriologo',
  ],
  servicios: [
    'servicio', 'servicios', 'luz', 'cfe', 'agua', 'internet', 'telefono', 'celular',
    'recarga', 'cable', 'recibo', 'wifi',
  ],
  suscripciones: [
    'suscripcion', 'suscripciones', 'netflix', 'spotify', 'disney', 'hbo', 'max', 'prime',
    'youtube', 'icloud', 'membresia',
  ],
  renta: [
    'renta', 'alquiler', 'depa', 'departamento', 'airbnb', 'hospedaje', 'hotel', 'cabaña',
  ],
  ropa: [
    'ropa', 'zapatos', 'tenis', 'zara', 'bershka', 'playera', 'pantalon', 'vestido',
    'chamarra', 'calzado', 'shein',
  ],
}

/** True when `keyword` appears in the tokenized description (whole-word for
 *  single words so "gas" doesn't match "gasto"; substring for multiword). */
function keywordHits(tokens: Set<string>, joined: string, keyword: string): boolean {
  return keyword.includes(' ') ? joined.includes(keyword) : tokens.has(keyword)
}

/**
 * Best category for a free-text description, chosen from the user's own
 * categories. Longer keyword matches win (more specific); ties break toward
 * the category order passed in. Returns null when nothing matches confidently.
 */
export function guessCategory(description: string, categories: Category[]): Category | null {
  const joined = normalize(description)
  if (!joined) return null
  const tokens = new Set(joined.split(' '))

  let best: Category | null = null
  let bestScore = 0

  for (const cat of categories) {
    const key = normalize(cat.name)
    const words = KEYWORDS[key]
    if (!words) continue
    let score = 0
    for (const kw of words) {
      if (keywordHits(tokens, joined, kw)) score = Math.max(score, kw.length)
    }
    // The category's own name is also a keyword.
    if (keywordHits(tokens, joined, key)) score = Math.max(score, key.length)
    if (score > bestScore) {
      bestScore = score
      best = cat
    }
  }

  return best
}
