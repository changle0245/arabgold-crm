// Phase 3: admin client (formerly Supabase service_role) now backed by Neon via pg.
// API-compatible with the small subset of supabase-js used in this codebase
// (see ./compat.ts for the supported surface).
import { makeSbClient } from './compat'

export function createAdminClient() {
  return makeSbClient()
}
