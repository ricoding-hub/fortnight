import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Category } from '@/types'

const EMPTY: Category[] = []

export function useCategories() {
  const { user } = useAuth()
  const [data, setData] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchCategories = useCallback(async () => {
    if (!user) return
    const { data: rows, error: err } = await supabase
      .from('categories')
      .select('*')
      .order('kind', { ascending: true })
      .order('name', { ascending: true })
    if (err) setError(err)
    else {
      setError(null)
      setData((rows ?? []) as Category[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // fetchCategories only calls setState after an await — not a synchronous effect setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCategories()

    const channel = supabase
      .channel(`categories:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchCategories(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchCategories])

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
  }
}
