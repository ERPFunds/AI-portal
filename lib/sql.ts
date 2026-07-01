/**
 * Postgres access for the server-side data layer (lib/db.ts, lib/loopnet-scraper.ts,
 * instrumentation.ts).
 *
 * Replaces `@vercel/postgres`, whose Neon driver cannot talk to this app's Supabase
 * database (its configured host did not even resolve), so every query through it
 * failed. This is a thin `pg`-backed tagged-template that mirrors the one API those
 * modules use: ``sql`SELECT ... ${value}` `` returning `{ rows }`.
 *
 * Connection string comes from SUPABASE_DB_URL (preferred) or the legacy POSTGRES_URL.
 * Use the Supabase pooler connection string in serverless environments.
 */
import { Pool, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  let connectionString =
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "No database connection string configured. Set SUPABASE_DB_URL to the Supabase Postgres connection string."
    );
  }
  // Drop any sslmode/ssl query params so our explicit `ssl` config below governs. Newer `pg`
  // treats sslmode=require/verify-ca as verify-full, which validates the chain and fails with
  // "self-signed certificate in certificate chain" against Supabase's pooler cert.
  try {
    const u = new URL(connectionString);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    connectionString = u.toString();
  } catch {
    connectionString = connectionString.replace(/([?&])sslmode=[^&]*/gi, "$1").replace(/[?&]$/, "");
  }
  pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Supabase requires TLS; its pooler cert is not in the default CA bundle, so don't verify it.
    ssl: { rejectUnauthorized: false },
  });
  return pool;
}

/**
 * Tagged-template query helper compatible with the `@vercel/postgres` `sql` usage in
 * this codebase. Interpolated values become parameterized placeholders ($1, $2, …),
 * so this is not vulnerable to SQL injection.
 */
export function sql<T extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<QueryResult<T>> {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) {
    text += `$${i + 1}` + strings[i + 1];
  }
  return getPool().query<T>(text, values as unknown[]);
}
