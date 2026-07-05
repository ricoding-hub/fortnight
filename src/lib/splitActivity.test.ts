import { describe, expect, it } from 'vitest'
import { activityLabel } from '@/lib/splitActivity'
import type { SplitActivity } from '@/types'

function act(overrides: Partial<SplitActivity>): SplitActivity {
  return {
    id: 'a1',
    group_id: 'g1',
    actor_user_id: 'u1',
    actor_name: 'Ale',
    verb: 'expense_added',
    subject: 'Leña',
    amount: 100,
    meta: {},
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

describe('activityLabel', () => {
  it('renders expense_added with my live share', () => {
    const line = activityLabel(act({}), 'm1', 17.5)
    expect(line.text).toBe('Ale añadió "Leña"')
    expect(line.impact).toBe('Debes $17.50')
    expect(line.struck).toBe(false)
  })

  it('omits impact when my share is zero or unknown', () => {
    expect(activityLabel(act({}), 'm1', 0).impact).toBeNull()
    expect(activityLabel(act({}), 'm1', null).impact).toBeNull()
  })

  it('renders expense_deleted struck-through with snapshot share', () => {
    const line = activityLabel(
      act({
        verb: 'expense_deleted',
        meta: { shares: [{ member_id: 'm1', amount: 17.5 }, { member_id: 'm2', amount: 82.5 }] },
      }),
      'm1',
    )
    expect(line.text).toBe('Ale eliminó "Leña"')
    expect(line.impact).toBe('Debías $17.50')
    expect(line.struck).toBe(true)
  })

  it('deleted expense without my share has no impact', () => {
    const line = activityLabel(
      act({ verb: 'expense_deleted', meta: { shares: [{ member_id: 'm2', amount: 100 }] } }),
      'm1',
    )
    expect(line.impact).toBeNull()
  })

  it('renders member and settlement verbs', () => {
    expect(activityLabel(act({ verb: 'member_linked' }), null).text).toBe('Ale se unió al grupo')
    expect(activityLabel(act({ verb: 'member_left', subject: 'Fátima' }), null).text).toBe(
      'Fátima salió del grupo',
    )
    const settle = activityLabel(
      act({ verb: 'settlement_added', subject: 'Bruno → Ale', amount: 120 }),
      null,
    )
    expect(settle.text).toBe('Ale registró un pago: Bruno → Ale')
    expect(settle.impact).toBe('$120.00')
    expect(activityLabel(act({ verb: 'invite_sent', subject: 'ana@mail.com' }), null).text).toBe(
      'Ale invitó a ana@mail.com',
    )
  })

  it('formats thousands with es-MX separators', () => {
    const line = activityLabel(act({}), 'm1', 1570)
    expect(line.impact).toBe('Debes $1,570.00')
  })
})
