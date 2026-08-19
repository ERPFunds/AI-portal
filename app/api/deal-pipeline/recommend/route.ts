import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic();

const REC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "rationale"],
  properties: {
    verdict: { type: "string", enum: ["Pursue", "Watch", "Pass"] },
    rationale: { type: "string", description: "one or two sentences justifying the verdict against the buy box" },
  },
} as const;

// Build a compact buy-box brief for the deal's market.
function buyBoxBrief(box: Record<string, unknown> | undefined): string {
  if (!box) return "No buy box on file for this market.";
  const b = box as Record<string, number | string | null>;
  const parts: string[] = [];
  if (b.markets) parts.push(`Markets: ${b.markets}`);
  if (b.asset_class) parts.push(`Asset: ${b.asset_class}`);
  if (b.sf_min || b.sf_max) parts.push(`Size: ${b.sf_min ?? "?"}–${b.sf_max ?? "?"} SF`);
  if (b.price_per_sf_min || b.price_per_sf_max) parts.push(`$/SF: $${b.price_per_sf_min ?? "?"}–$${b.price_per_sf_max ?? "?"}`);
  if (b.cap_rate_floor) parts.push(`Cap floor: ${b.cap_rate_floor}%`);
  if (b.deal_size_min || b.deal_size_max) parts.push(`Deal size: $${b.deal_size_min ?? "?"}–$${b.deal_size_max ?? "?"}`);
  if (b.notes) parts.push(`Notes: ${b.notes}`);
  return parts.join(" · ");
}

export async function POST(req: Request) {
  let body: { deal?: Record<string, unknown>; market?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const deal = body.deal ?? {};
  const market = body.market === "FL" ? "FL" : "TX";

  const admin = createAdminClient();
  const { data: boxes } = await admin
    .from("buy_box")
    .select("market, markets, asset_class, sf_min, sf_max, price_per_sf_min, price_per_sf_max, cap_rate_floor, deal_size_min, deal_size_max, notes")
    .eq("market", market);
  const brief = buyBoxBrief((boxes ?? [])[0] as Record<string, unknown> | undefined);

  // Only pass through the fields that describe the deal (skip UI/internal keys).
  const KEYS = ["location", "address", "name", "owner", "tenant", "source", "propertyType", "price", "pricePsf", "psf", "yield", "capRate", "occupancy", "units", "acreage", "acres", "sqft", "yearBuilt", "status", "section", "nextSteps", "notes"];
  const dealText = KEYS.filter((k) => deal[k] != null && deal[k] !== "").map((k) => `${k}: ${deal[k]}`).join("\n") || "(sparse listing — few fields provided)";

  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 500,
      output_config: { format: { type: "json_schema", schema: REC_SCHEMA } },
      system: [{ type: "text" as const, text:
`You are an acquisitions analyst for ERP, a private-equity industrial real estate firm (${market === "TX" ? "Permian Basin, TX" : "Brevard / Space Coast, FL"}). Given one pipeline deal and the buy box, give a crisp acquisition recommendation: verdict is "Pursue" (fits the box and worth advancing), "Watch" (partial fit or missing data — monitor / dig deeper), or "Pass" (clearly outside the box). Weigh market, asset type, size, $/SF, cap/yield, deal size, tenancy, and any notes. IMPORTANT: do NOT penalize a deal for missing data (e.g. no SF or $/SF) — treat it as unknown and lean "Watch" rather than "Pass" when key facts are simply absent. Keep the rationale to one or two plain sentences a principal can skim.

Buy box: ${brief}` }],
      messages: [{ role: "user", content: `Deal:\n${dealText}` }],
    });
    const block = msg.content.find((c) => c.type === "text") as { text: string } | undefined;
    const parsed = JSON.parse(block?.text ?? "{}");
    return NextResponse.json({ verdict: parsed.verdict, rationale: parsed.rationale });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
