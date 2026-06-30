import { createClient } from '@supabase/supabase-js'

// Service-role client for server-side jobs (crons) that need to write past RLS.
// Requires SUPABASE_SERVICE_ROLE_KEY to be set in the environment (Vercel project settings).
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
