import { useCallback, useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  disconnectCredential,
  registerCredential,
  syncCredential as syncCredentialApi,
  type SyncSummary,
} from '@/lib/syncfy/api'
import type { SyncfyCredential } from '@/types'

const EMPTY: SyncfyCredential[] = []

/**
 * Lists the current user's connected bank credentials and exposes the
 * actions that mutate them. Realtime keeps the list fresh whenever the
 * server route updates a row (status, last_synced_at, etc.).
 */
export function useSyncedCredentials() {
  const { user } = useAuth()
  const [data, setData] = useState<SyncfyCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [channelKey] = useState(() => crypto.randomUUID())

  const fetchCredentials = useCallback(async () => {
    if (!user) return
    const { data: rows, error: err } = await supabase
      .from('syncfy_credentials')
      .select('*')
      .order('created_at', { ascending: true })
    if (err) setError(err)
    else {
      setError(null)
      setData((rows ?? []) as SyncfyCredential[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    // fetchCredentials only calls setState after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCredentials()

    const channel = supabase
      .channel(`syncfy_credentials:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'syncfy_credentials',
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchCredentials(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, channelKey, fetchCredentials])

  /** Called by ConnectBankModal after the widget hands back an id_credential. */
  async function register(params: {
    id_credential: string
    id_site?: string | null
    institution_name: string
  }): Promise<SyncSummary> {
    return registerCredential(params)
  }

  async function sync(credentialId: string): Promise<SyncSummary> {
    return syncCredentialApi(credentialId)
  }

  async function disconnect(credentialId: string): Promise<void> {
    await disconnectCredential(credentialId)
  }

  return {
    data: user ? data : EMPTY,
    loading: user ? loading : false,
    error,
    register,
    sync,
    disconnect,
  }
}
