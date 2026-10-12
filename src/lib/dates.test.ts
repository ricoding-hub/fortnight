import { describe, expect, it } from 'vitest'
import { daysUntilPayment } from './dates'
import type { Account } from '@/types'

describe('daysUntilPayment — modo gracia, regresión del ciclo saltado', () => {
  it('corte 10 + gracia 20, el 5 oct faltan 25 días (30 oct), no 56', () => {
    const acc = { type: 'credit', cut_day: 10, payment_grace_days: 20, payment_due_day: null } as unknown as Account
    expect(daysUntilPayment(acc, new Date(2026, 9, 5, 12))).toBe(25)
  })
})
