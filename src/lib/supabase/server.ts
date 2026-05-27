// Phase 3: server client (formerly @supabase/ssr) now backed by Neon via pg.
// Auth has moved to NextAuth (see @/lib/auth). Any code that used to call
// `supabase.auth.getUser()` should call `auth()` from '@/lib/auth' instead.
// This function returns a Neon-backed client with the same `.from(...)` surface.
import { makeSbClient } from './compat'

export async function createClient() {
  return makeSbClient()
}
