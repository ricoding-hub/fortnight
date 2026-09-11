import { describe, expect, it } from 'vitest'
import { isCountInput, isMoneyInput, moneyOr, parseCountInput, parseMoneyInput } from '@/lib/money'

describe('parseMoneyInput', () => {
  it('acepta el caso del reporte: un solo decimal', () => {
    // "Escribe un valor válido. Los dos valores válidos más cercanos son 574 y 575."
    expect(parseMoneyInput('574.5')).toBe(574.5)
    expect(parseMoneyInput('574,5')).toBe(574.5)
  })

  it('acepta centavos con punto o con coma', () => {
    expect(parseMoneyInput('143.63')).toBe(143.63)
    expect(parseMoneyInput('143,63')).toBe(143.63)
  })

  it('entiende separador de miles y decimal juntos', () => {
    expect(parseMoneyInput('1,234.50')).toBe(1234.5)
    expect(parseMoneyInput('1.234,50')).toBe(1234.5)
    expect(parseMoneyInput('12,206.00')).toBe(12206)
    expect(parseMoneyInput('1,234,567.89')).toBe(1234567.89)
  })

  it('resuelve el separador ambiguo por el carácter, no por la longitud', () => {
    expect(parseMoneyInput('1,234')).toBe(1234)   // coma = miles
    expect(parseMoneyInput('1,23')).toBe(1.23)    // coma + 2 dígitos = centavos
    expect(parseMoneyInput('1.234')).toBe(1.234)  // punto = decimal, siempre
    expect(parseMoneyInput('1.5')).toBe(1.5)
  })

  it('tolera el símbolo y los espacios que la gente pega', () => {
    expect(parseMoneyInput('$1,326.00')).toBe(1326)
    expect(parseMoneyInput(' 2 976.19 ')).toBe(2976.19)
    expect(parseMoneyInput('$ 1 234,5')).toBe(1234.5)
  })

  it('conserva más de dos decimales en vez de recortarlos', () => {
    expect(parseMoneyInput('143.625')).toBe(143.625)
  })

  it('acepta formas incompletas mientras se escribe', () => {
    expect(parseMoneyInput('.5')).toBe(0.5)
    expect(parseMoneyInput('574.')).toBe(574)
  })

  it('rechaza lo que no es un importe', () => {
    for (const bad of ['', '   ', 'abc', '12a', '1.2.3', '1,2,3.4.5', '--5', '$', '-', '1..2']) {
      expect(parseMoneyInput(bad)).toBeNull()
    }
  })

  it('lee el signo negativo sin juzgarlo', () => {
    expect(parseMoneyInput('-500')).toBe(-500)
  })
})

describe('isMoneyInput', () => {
  it('exige positivo por omisión', () => {
    expect(isMoneyInput('574.5')).toBe(true)
    expect(isMoneyInput('0')).toBe(false)
    expect(isMoneyInput('-5')).toBe(false)
    expect(isMoneyInput('')).toBe(false)
  })

  it('deja pasar el cero cuando el campo lo admite', () => {
    // Un saldo de tarjeta recién pagada es cero legítimo.
    expect(isMoneyInput('0', { allowZero: true })).toBe(true)
    expect(isMoneyInput('0.00', { allowZero: true })).toBe(true)
  })

  it('deja pasar negativos sólo si se piden', () => {
    expect(isMoneyInput('-5', { allowNegative: true })).toBe(true)
  })
})

describe('moneyOr', () => {
  it('cae al valor de respaldo cuando el texto no sirve', () => {
    expect(moneyOr('574,5', 0)).toBe(574.5)
    expect(moneyOr('', 0)).toBe(0)
    expect(moneyOr(undefined, 12)).toBe(12)
    expect(moneyOr('abc', 7)).toBe(7)
  })
})

describe('parseCountInput / isCountInput', () => {
  it('acepta enteros y rechaza decimales', () => {
    expect(parseCountInput('18')).toBe(18)
    expect(parseCountInput('3.5')).toBeNull()
    expect(parseCountInput('3,5')).toBeNull()
    expect(parseCountInput('')).toBeNull()
  })

  it('respeta los límites', () => {
    expect(isCountInput('12', 1, 120)).toBe(true)
    expect(isCountInput('0', 1, 120)).toBe(false)
    expect(isCountInput('121', 1, 120)).toBe(false)
    expect(isCountInput('-1', 0, 120)).toBe(false)
  })
})

describe('casos que el código viejo resolvía mal', () => {
  it('ya no multiplica por diez al quitar la coma (GoalWizard)', () => {
    // Number('574,5'.replace(/,/g, '')) daba 5745.
    expect(moneyOr('574,5', 0)).toBe(574.5)
  })

  it('ya no colapsa los decimales con coma (BucketCard)', () => {
    // Number('1,5'.replace(/[^0-9.]/g, '')) daba 15.
    expect(moneyOr('1,5', 0)).toBe(1.5)
  })

  it('el sueldo con centavos deja de ser inválido (Profile step=100)', () => {
    expect(isMoneyInput('12206.50')).toBe(true)
    expect(isMoneyInput('12,206.50')).toBe(true)
  })
})
