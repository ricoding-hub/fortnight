import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAccounts } from '@/hooks/useAccounts'
import type { Goal } from '@/types'

export interface NewGoal {
  name: string
  icon?: string | null
  color?: string | null
  target: number
  saved?: number
  monthly: number
  deadline?: string | null
  is_debt?: boolean
  started_at?: string
}

const EMPTY: Goal[] = []

/**
 * Fetches the user's goals. If the user has credit debt > 0 and no goals at
 * all, seeds a "Liberar tarjetas" debt-freedom goal with a 6-month payoff.
 *
 * Vive detrás de un provider a propósito. El efecto de siembra se guarda con un
 * `seedingRef`, y un ref es por instancia: con el hook llamado suelto, cada
 * componente que lo usaba traía su propia copia del efecto y su propio ref, así
 * que un usuario nuevo con deuda podía acabar con varias filas de "Liberar
 * tarjetas" insertadas a la vez. Una sola instancia elimina la carrera, y de
 * paso deja un único canal de realtime en vez de uno por consumidor.
 */
function useGoalsState() {
  const { user } = useAuth()
  const { data: accounts } = useAccounts()
  const [data, setData] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | Error | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())
  // Guarda el id del usuario al que ya se le intentó sembrar. Latched a
  // propósito: ver el comentario del efecto de siembra.
  const sembradoPara = useRef<string | null>(null)

  const fetchGoals = useCallback(async () => {
    if (!user) return
    const [goalsRes, linksRes] = await Promise.all([
      supabase.from('goals').select('*').order('created_at', { ascending: true }),
      supabase.from('goal_accounts').select('goal_id, account_id'),
    ])
    if (goalsRes.error) {
      setError(goalsRes.error)
      setLoading(false)
      return
    }
    setError(null)

    // Build goal_id -> account_ids[] map
    const linkMap = new Map<string, string[]>()
    for (const link of linksRes.data ?? []) {
      const existing = linkMap.get(link.goal_id) ?? []
      existing.push(link.account_id)
      linkMap.set(link.goal_id, existing)
    }

    // Derive `saved` from linked account balances when present.
    // Savings: saved = Σ balances. Debt: saved = max(0, target − Σ balances).
    const accountBalance = new Map(accounts.map((a) => [a.id, Number(a.balance)]))

    const enriched = (goalsRes.data ?? []).map((g) => {
      const linkedIds = linkMap.get(g.id) ?? []
      const target = Number(g.target)
      let derivedSaved = Number(g.saved)
      if (linkedIds.length > 0) {
        const sumBal = linkedIds.reduce((s, id) => s + (accountBalance.get(id) ?? 0), 0)
        derivedSaved = g.is_debt ? Math.max(0, target - sumBal) : sumBal
      }
      return {
        ...g,
        target,
        saved: derivedSaved,
        monthly: Number(g.monthly),
        is_primary: Boolean(g.is_primary),
        linked_account_ids: linkedIds,
      } as Goal
    })

    // Sort primary first, then by creation order — so every consumer of
    // useGoals().data sees the user's principal goal at the top of the list.
    enriched.sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
      return a.created_at.localeCompare(b.created_at)
    })

    setData(enriched)
    setLoading(false)
  }, [user, accounts])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchGoals()

    const channel = supabase
      .channel(`goals:${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${user.id}` },
        () => void fetchGoals(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'goal_accounts', filter: `user_id=eq.${user.id}` },
        () => void fetchGoals(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchGoals])

  /**
   * Seed the debt-freedom goal once when user has credit debt and no goals.
   *
   * La marca se pone y NO se quita. Antes se liberaba al terminar el insert, y
   * como `data` es un arreglo nuevo en cada `fetchGoals`, el efecto se volvía a
   * disparar; si la inserción no acababa produciendo una fila — RLS, un
   * conflicto, la red — el ciclo era: sembrar, refrescar, seguir sin metas,
   * sembrar otra vez. Un bucle infinito de peticiones que deja la pestaña
   * clavada. Un solo intento por usuario, y si falla se ve el error.
   */
  useEffect(() => {
    if (!user || loading || data.length > 0) return
    if (sembradoPara.current === user.id) return
    const creditDebt = accounts
      .filter((a) => a.type === 'credit')
      .reduce((s, a) => s + a.balance, 0)
    if (creditDebt <= 0) return

    sembradoPara.current = user.id
    const desiredMonths = 6
    const interestBuffer = 1.05
    const monthly = Math.round((creditDebt * interestBuffer) / desiredMonths)
    const today = new Date()
    const deadline = new Date(today.getFullYear(), today.getMonth() + desiredMonths, today.getDate())

    void supabase
      .from('goals')
      .insert({
        user_id: user.id,
        name: 'Liberar tarjetas',
        icon: 'flame',
        color: '#FF5A5F',
        target: creditDebt,
        saved: 0,
        monthly,
        deadline: deadline.toISOString().slice(0, 10),
        is_debt: true,
        started_at: today.toISOString().slice(0, 10),
      })
      .then(({ error: insErr }) => {
        if (insErr) setError(insErr)
        void fetchGoals()
      })
  }, [user, loading, data, accounts, fetchGoals])

  async function create(g: NewGoal): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const optimistic: Goal = {
      id: tempId,
      user_id: user.id,
      saved: 0,
      is_debt: false,
      is_primary: false,
      linked_account_ids: [],
      created_at: now,
      started_at: today,
      deadline: g.deadline ?? null,
      icon: g.icon ?? null,
      color: g.color ?? null,
      monthly: g.monthly,
      target: g.target,
      name: g.name,
    }
    setData((prev) => [...prev, optimistic])
    const { error: err } = await supabase.from('goals').insert({
      user_id: user.id,
      saved: 0,
      is_debt: false,
      started_at: today,
      ...g,
    })
    if (err) {
      setData((prev) => prev.filter((goal) => goal.id !== tempId))
      throw err
    }
  }

  async function update(id: string, patch: Partial<NewGoal>): Promise<void> {
    const prev = data.find((g) => g.id === id)
    setData((cur) => cur.map((g) => (g.id === id ? { ...g, ...patch } : g)))
    const { error: err } = await supabase.from('goals').update(patch).eq('id', id)
    if (err) {
      if (prev) setData((cur) => cur.map((g) => (g.id === id ? prev : g)))
      throw err
    }
  }

  async function remove(id: string): Promise<void> {
    const prev = data.find((g) => g.id === id)
    setData((cur) => cur.filter((g) => g.id !== id))
    const { error: err } = await supabase.from('goals').delete().eq('id', id)
    if (err) {
      if (prev) setData((cur) => [...cur, prev])
      throw err
    }
  }

  async function linkAccount(goalId: string, accountId: string): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    const { error: err } = await supabase
      .from('goal_accounts')
      .insert({ goal_id: goalId, account_id: accountId, user_id: user.id })
    if (err) throw err
    await fetchGoals()
  }

  async function unlinkAccount(goalId: string, accountId: string): Promise<void> {
    const { error: err } = await supabase
      .from('goal_accounts')
      .delete()
      .eq('goal_id', goalId)
      .eq('account_id', accountId)
    if (err) throw err
    await fetchGoals()
  }

  /**
   * Mark one goal as the user's principal goal. Clears the previous primary
   * first so the partial unique index never sees two primaries at once;
   * realtime will smooth the transition for other tabs.
   */
  async function setPrimary(goalId: string): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    // Optimistic local sort so the tap feels instant.
    setData((prev) =>
      [...prev]
        .map((g) => ({ ...g, is_primary: g.id === goalId }))
        .sort((a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
          return a.created_at.localeCompare(b.created_at)
        }),
    )
    await supabase
      .from('goals')
      .update({ is_primary: false })
      .eq('user_id', user.id)
      .eq('is_primary', true)
    const { error: err } = await supabase
      .from('goals')
      .update({ is_primary: true })
      .eq('id', goalId)
    if (err) throw err
  }

  async function setLinkedAccounts(goalId: string, accountIds: string[]): Promise<void> {
    if (!user) throw new Error('Not authenticated')
    await supabase.from('goal_accounts').delete().eq('goal_id', goalId)
    if (accountIds.length > 0) {
      await supabase.from('goal_accounts').insert(
        accountIds.map((aid) => ({ goal_id: goalId, account_id: aid, user_id: user.id })),
      )
    }
    await fetchGoals()
  }

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
    create,
    update,
    remove,
    linkAccount,
    unlinkAccount,
    setLinkedAccounts,
    setPrimary,
  }
}

type GoalsValue = ReturnType<typeof useGoalsState>

const GoalsContext = createContext<GoalsValue | undefined>(undefined)

export function GoalsProvider({ children }: { children: ReactNode }) {
  const value = useGoalsState()
  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>
}

// Mismo caso que useAuth: el fichero exporta el provider y el hook que lo lee.
// Separarlos sólo para contentar a fast refresh partiría en dos un módulo que
// se entiende de una pieza.
// eslint-disable-next-line react-refresh/only-export-components
export function useGoals(): GoalsValue {
  const ctx = useContext(GoalsContext)
  if (!ctx) throw new Error('useGoals debe usarse dentro de GoalsProvider')
  return ctx
}
