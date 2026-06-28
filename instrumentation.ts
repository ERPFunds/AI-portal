/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * Schema is no longer migrated here. Startup DDL required a raw Postgres
 * connection (`pg`), which cannot be bundled for the Edge runtime that this
 * file is also compiled into. Database schema now lives in `supabase/migrations/`
 * and is applied through the Supabase migration workflow (the standard approach
 * for this project's Supabase-hosted database).
 */
export async function register() {
  // No-op. See supabase/migrations/ for the schema.
}
