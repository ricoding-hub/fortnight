import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Notification } from '@/types'

const EMPTY: Notification[] = []

export function useNotifications() {
  const { user } = useAuth()
  const [data, setData] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | Error | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchNotifications = useCallback(async () => {
    if (!user) return
    const { data: rows, error: err } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (err) {
      setError(err)
    } else {
      setError(null)
      setData((rows ?? []) as Notification[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchNotifications()

    const channel = supabase
      .channel(`notifications:${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => void fetchNotifications(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchNotifications])

  async function markRead(id: string): Promise<void> {
    setData((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    const { error: err } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
    if (err) {
      setError(err)
      void fetchNotifications()
    }
  }

  async function markAllRead(): Promise<void> {
    if (!user) return
    setData((prev) => prev.map((n) => ({ ...n, read: true })))
    const { error: err } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    if (err) {
      setError(err)
      void fetchNotifications()
    }
  }

  async function dismiss(id: string): Promise<void> {
    setData((prev) => prev.filter((n) => n.id !== id))
    const { error: err } = await supabase.from('notifications').delete().eq('id', id)
    if (err) {
      setError(err)
      void fetchNotifications()
    }
  }

  const unreadCount = data.filter((n) => !n.read).length

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
    unreadCount,
    markRead,
    markAllRead,
    dismiss,
  }
}
