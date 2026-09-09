/** Name of the Workbox runtime cache holding Supabase reads (see vite.config). */
export const DATA_CACHE = 'supabase-data-cache'

/** Remembers whose data is sitting in the cache right now. */
const OWNER_KEY = 'fortnight:data-cache-owner'
/** Set once a session existed, so an offline reload isn't mistaken for logout. */
const HAD_SESSION_KEY = 'fortnight:had-session'

/**
 * Offline reads are cached by URL, and Supabase puts the user in a header, not
 * the URL — so two accounts on one browser would hit the SAME cache entries.
 * Everything here exists to make sure a cache only ever holds one user's data.
 */
export async function purgeDataCache(): Promise<void> {
  try {
    if ('caches' in globalThis) await caches.delete(DATA_CACHE)
  } catch {
    // Storage denied: there is nothing cached to leak either.
  }
  try {
    localStorage.removeItem(OWNER_KEY)
  } catch {
    /* private mode */
  }
}

/** Drops the cache when the signed-in user is not the one it was built for. */
export async function ensureCacheOwner(userId: string | undefined): Promise<void> {
  if (!userId) return
  let owner: string | null
  try {
    owner = localStorage.getItem(OWNER_KEY)
  } catch {
    return // No storage: we can't tell whose cache it is, so leave it alone.
  }
  if (owner === userId) return
  if (owner) await purgeDataCache()
  try {
    localStorage.setItem(OWNER_KEY, userId)
  } catch {
    /* private mode */
  }
}

export function rememberHadSession(had: boolean): void {
  try {
    if (had) localStorage.setItem(HAD_SESSION_KEY, '1')
    else localStorage.removeItem(HAD_SESSION_KEY)
  } catch {
    /* private mode */
  }
}

/**
 * True when this browser was signed in before. Offline, `getSession()` can come
 * back null because the token refresh needs the network — without this the app
 * would bounce a returning user to the login screen and the whole offline read
 * feature would be pointless.
 */
export function hadSession(): boolean {
  try {
    return localStorage.getItem(HAD_SESSION_KEY) === '1'
  } catch {
    return false
  }
}
