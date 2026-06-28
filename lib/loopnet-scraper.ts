/**
 * LoopNet vacancy data layer
 *
 * Listings arrive via Power Automate (daily LoopNet alert emails → /api/loopnet-ingest).
 * This module provides the DB query helpers used by the weekly cron newsletters.
 */

import { sql } from "@/lib/sql";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LoopNetListing {
  address: string;
  propertyName?: string;
  size?: string;           // total building SF
  availableSpace?: string; // available SF
  price?: string;          // asking rent or price
  propertyType?: string;
  url?: string;
  description?: string;
  receivedAt?: Date;
}

// ── Permian corridor filter ───────────────────────────────────────────────────

// Matches any of the seven specified roads in an address or description string.
const PERMIAN_ROAD_PATTERNS: RegExp[] = [
  /\bhwy\.?\s*191\b/i,
  /\bhighway\s*191\b/i,
  /\bus[- ]?191\b/i,
  /\bi[- ]?20\b/i,
  /\binterstate\s*20\b/i,
  /\bbus(?:iness)?\.?\s*(?:route\s*)?20\b/i,
  /\bfm[-\s]?1788\b/i,
  /\bfarm[-\s]to[-\s]market\s*(?:road\s*)?1788\b/i,
  /\bhwy\.?\s*158\b/i,
  /\bhighway\s*158\b/i,
  /\bmurphy\s*st(?:reet)?\b/i,
  /\bindustrial\s*ave(?:nue)?\b/i,
];

export function isOnPermianCorridor(listing: LoopNetListing): boolean {
  const text = `${listing.address} ${listing.description ?? ""}`;
  return PERMIAN_ROAD_PATTERNS.some((re) => re.test(text));
}

// ── DB queries ────────────────────────────────────────────────────────────────

/**
 * Returns all listings for a market received in the past 7 days,
 * ordered newest-first. Used by the weekly cron newsletters.
 */
export async function fetchLoopNetListings(params: {
  market: "brevard" | "permian";
  maxListings?: number;
}): Promise<LoopNetListing[]> {
  const { market, maxListings = 60 } = params;
  try {
    const { rows } = await sql`
      SELECT
        address, property_name, size, available_space,
        price, property_type, url, description, received_at
      FROM loopnet_listings
      WHERE market = ${market}
        AND received_at > NOW() - INTERVAL '7 days'
      ORDER BY received_at DESC
      LIMIT ${maxListings}
    `;
    return rows.map((r) => ({
      address: r.address,
      propertyName: r.property_name ?? undefined,
      size: r.size ?? undefined,
      availableSpace: r.available_space ?? undefined,
      price: r.price ?? undefined,
      propertyType: r.property_type ?? undefined,
      url: r.url ?? undefined,
      description: r.description ?? undefined,
      receivedAt: r.received_at ? new Date(r.received_at) : undefined,
    }));
  } catch (err) {
    console.error(`[loopnet-scraper] DB query failed for ${market}:`, err);
    return [];
  }
}

/**
 * Inserts one or more parsed listings into the DB.
 * Called by /api/loopnet-ingest after Claude extracts listings from the alert email.
 */
export async function storeLoopNetListings(params: {
  market: "brevard" | "permian";
  listings: LoopNetListing[];
  sourceSubject: string;
}): Promise<number> {
  const { market, listings, sourceSubject } = params;
  let inserted = 0;
  for (const l of listings) {
    if (!l.address?.trim()) continue;
    try {
      await sql`
        INSERT INTO loopnet_listings
          (market, address, property_name, size, available_space,
           price, property_type, url, description, source_email_subject)
        VALUES
          (${market}, ${l.address}, ${l.propertyName ?? null}, ${l.size ?? null},
           ${l.availableSpace ?? null}, ${l.price ?? null}, ${l.propertyType ?? null},
           ${l.url ?? null}, ${l.description ?? null}, ${sourceSubject})
        ON CONFLICT DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.error("[loopnet-scraper] insert failed:", err);
    }
  }
  return inserted;
}
