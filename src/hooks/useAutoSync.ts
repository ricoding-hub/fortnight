import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { syncCredential } from '@/lib/syncfy/api'

const STALE_HOURS = 6
const STALE_MS = STALE_HOURS * 60 * 60 * 1000

/**
 * Silent background sync run once per app session. For each active
 * credential whose `last_synced_at` is older than STALE_HOURS, fires a
 * fire-and-forget sync request. Errors are NOT toasted — the credential's
 * status pill in Perfil reflects the failure for the user to see.
 *
 * Mount this near the root (App.tsx, inside ProtectedRoute) so it runs
 * once per session and doesn't re-fire on every navigation.
 */
export function useAutoSync(): void {
  const { user } = useAuth()
  const firedRef = useRef(false)

  useEffect(() => {
    if (!user) {
      firedRef.current = false
      return
    }
    if (firedRef.current) return
    firedRef.current = true

    void (async () => {
      const { data, error } = await supabase
        .from('syncfy_credentials')
        .select('id,status,last_synced_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
      if (error || !data) return

      const now = Date.now()
      const stale = data.filter((row) => {
        const last = row.last_synced_at as string | null
        if (!last) return true
        return now - new Date(last).getTime() > STALE_MS
      })

      // Run sequentially to avoid hammering Syncfy with parallel requests.
      for (const row of stale) {
        try {
          await syncCredential(row.id as string)
        } catch {
          // Status pill surfaces the error; stay quiet here.
        }
      }
    })()
  }, [user])
}
