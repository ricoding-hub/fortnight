import { describe, expect, it } from 'vitest'
import { buildEditInputs } from '@/lib/splitEdit'

describe('buildEditInputs', () => {
  it('equal: participants are the members with share rows, no inputs', () => {
    const state = buildEditInputs({ split_method: 'equal' }, [
      { member_id: 'a', amount: 33.34, weight: null },
      { member_id: 'b', amount: 33.33, weight: null },
    ])
    expect(state.method).toBe('equal')
    expect(state.participantIds).toEqual(['a', 'b'])
    expect(state.inputs).toEqual({})
  })

  it('percentage: inputs come from stored weights', () => {
    const state = buildEditInputs({ split_method: 'percentage' }, [
      { member_id: 'a', amount: 70, weight: 70 },
      { member_id: 'b', amount: 30, weight: 30 },
    ])
    expect(state.inputs).toEqual({ a: '70', b: '30' })
  })

  it('shares: inputs come from stored weights (parts)', () => {
    const state = buildEditInputs({ split_method: 'shares' }, [
      { member_id: 'a', amount: 16.67, weight: 1 },
      { member_id: 'b', amount: 83.33, weight: 5 },
    ])
    expect(state.inputs).toEqual({ a: '1', b: '5' })
  })

  it('exact: inputs come from share amounts in pesos', () => {
    const state = buildEditInputs({ split_method: 'exact' }, [
      { member_id: 'a', amount: 550, weight: null },
      { member_id: 'b', amount: 1020, weight: null },
    ])
    expect(state.inputs).toEqual({ a: '550', b: '1020' })
  })

  it('numeric-string amounts from PostgREST are normalized', () => {
    const state = buildEditInputs({ split_method: 'exact' }, [
      { member_id: 'a', amount: '550.00' as unknown as number, weight: null },
    ])
    expect(state.inputs).toEqual({ a: '550' })
  })
})
