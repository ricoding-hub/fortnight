/**
 * Parsing for money the way people actually type it.
 *
 * `<input type="number">` looked like the obvious control for an amount and
 * isn't: with the default `step` of 1 the browser rejects "574.5" outright
 * ("los dos valores válidos más cercanos son 574 y 575"), and it discards a
 * decimal comma before the value ever reaches us — which is how half of
 * Mexico writes cents. Amounts are therefore plain text inputs validated
 * here, where we can be generous about the shape and strict about the value.
 *
 * Accepted: "574.5", "574,5", "1,234.50", "1.234,50", "$ 1 234.5", "12206".
 */

/** Currency symbol and any flavour of space (NBSP, narrow, thin): noise, not data. */
const NOISE = /[\s\u00A0\u202F\u2009$]/g

/**
 * Normalises a typed amount to a JS number, or null when it isn't one.
 *
 * The separator rules follow what the string itself shows rather than a
 * locale guess:
 *  · both `.` and `,` present → whichever comes last is the decimal point
 *  · only commas → thousands when the last group is exactly 3 digits
 *    ("1,234" is 1234), decimal otherwise ("574,5" is 574.5)
 *  · only dots → same test, so "1.234" is 1234 and "574.5" is 574.5
 */
export function parseMoneyInput(raw: string): number | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(NOISE, '')
  if (s === '') return null

  // A leading minus is the one sign we accept; amounts that must be positive
  // are rejected later by the caller, not here.
  const negative = s.startsWith('-')
  const body = negative ? s.slice(1) : s
  if (body === '' || !/^[\d.,]+$/.test(body)) return null

  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')

  let decimalAt = -1
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma)
  } else if (lastComma >= 0) {
    // Only commas. In es-MX the comma groups thousands, so a single one with
    // exactly three digits behind it is "1,234" = 1234. Any other shape is
    // someone writing cents the European way: "574,5".
    const digitsAfter = body.length - lastComma - 1
    const separators = (body.match(/,/g) ?? []).length
    if (!(digitsAfter === 3 && separators === 1)) decimalAt = lastComma
  } else if (lastDot >= 0) {
    // Only dots. The dot is the decimal point here, so "143.625" is three
    // decimals and not a thousands group — that ambiguity is what a
    // length-based guess gets wrong.
    decimalAt = lastDot
  }

  const rawInt = decimalAt >= 0 ? body.slice(0, decimalAt) : body
  const fracPart = decimalAt >= 0 ? body.slice(decimalAt + 1) : ''

  // Everything left of the decimal point must be plain digits or well-formed
  // thousands groups. Without this check "1.2.3" would quietly become 12.3.
  const groupedOk = /^$|^\d+$|^\d{1,3}([.,]\d{3})+$/.test(rawInt)
  if (!groupedOk) return null
  if (!/^\d*$/.test(fracPart)) return null

  const intPart = rawInt.replace(/[.,]/g, '')
  if (intPart === '' && fracPart === '') return null

  const n = Number(`${intPart || '0'}.${fracPart || '0'}`)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

interface MoneyRule {
  /** Accept 0. Off by default: an amount of zero is almost always a mistake. */
  allowZero?: boolean
  /** Accept negatives. Off by default. */
  allowNegative?: boolean
}

/** Validator for a typed amount, for use inside a zod `refine`. */
export function isMoneyInput(raw: string, rule: MoneyRule = {}): boolean {
  const n = parseMoneyInput(raw)
  if (n == null) return false
  if (!rule.allowNegative && n < 0) return false
  if (!rule.allowZero && n === 0) return false
  return true
}

/** Parse for submit. Returns `fallback` when the text isn't a valid amount. */
export function moneyOr(raw: string | undefined | null, fallback: number): number {
  if (raw == null) return fallback
  const n = parseMoneyInput(raw)
  return n == null ? fallback : n
}

/** Whole-number field (months, day of month). Rejects "3.5" and "3,5". */
export function parseCountInput(raw: string): number | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(NOISE, '')
  if (!/^-?\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) ? n : null
}

/** Validator for a whole-number field with inclusive bounds. */
export function isCountInput(raw: string, min: number, max: number): boolean {
  const n = parseCountInput(raw)
  return n != null && n >= min && n <= max
}

/**
 * Drop-in replacement for `Number(text)` on an amount field: same NaN-on-
 * garbage contract, but it understands a decimal comma and a thousands
 * separator. Lets existing `isFinite` / `> 0` guards keep working unchanged.
 */
export function moneyNum(raw: string | undefined | null): number {
  if (raw == null) return NaN
  const n = parseMoneyInput(raw)
  return n == null ? NaN : n
}
