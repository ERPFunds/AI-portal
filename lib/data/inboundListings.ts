// Inbound listings — broker-supplied prospective deals captured for triage (Acquisition EA
// Workflow #9). Currently sample data; swap INBOUND_LISTINGS for the live inbox/Crexi/LoopNet
// source when wired. Shared by InboundListingIntake (triage UI) and the Deal Pipeline live
// tracker + /api/deal-pipeline/import-listings (the auto-add-to-pipeline mechanism).

export type Fit = 'fit' | 'borderline' | 'no-fit'
export type Source = 'Crexi' | 'LoopNet' | 'Broker email' | 'OM attachment'

export type Listing = {
  id: string
  address: string
  submarket: string
  state: 'TX' | 'FL'
  askingPrice: number
  sf: number
  inPlaceNoi: number      // broker-supplied in-place NOI
  compPsf: number         // recent-comp $/SF for the quick-score
  broker: string
  brokerFirm: string
  source: Source
  received: string
  fit: Fit
  reason: string
  score: number           // 0–100 first-pass quick-score
  deduped?: string        // set when it matches an existing record
}

// The illustrative Buy Box these are screened against.
export const BUY_BOX = { markets: 'TX & FL', assetClass: 'Industrial / IOS', sf: '15k–120k SF', psf: '$50–$120/SF', capFloor: '6.5%', dealSize: '≤ $8M' }

export const INBOUND_LISTINGS: Listing[] = [
  { id: 'l1', address: '4200 W Industrial Ave, Odessa, TX', submarket: 'Permian Basin', state: 'TX', askingPrice: 3200000, sf: 42000, inPlaceNoi: 237000, compPsf: 81, broker: 'Jake Georgiades', brokerFirm: 'Colliers', source: 'Crexi', received: '2026-07-13', fit: 'fit', reason: 'In-market industrial; 7.4% cap ≥ 6.5% floor; $76/SF and $3.2M within bands.', score: 84 },
  { id: 'l2', address: '1450 Aerospace Pkwy, Titusville, FL', submarket: 'Space Coast', state: 'FL', askingPrice: 2600000, sf: 28500, inPlaceNoi: 179000, compPsf: 89, broker: 'Kristian Brown', brokerFirm: 'Cushman & Wakefield', source: 'OM attachment', received: '2026-07-12', fit: 'fit', reason: 'Target Space Coast IOS; 6.9% cap, size and price/SF all within Buy Box.', score: 78 },
  { id: 'l3', address: '8800 CR 1290, Midland, TX', submarket: 'Permian Basin', state: 'TX', askingPrice: 5900000, sf: 95000, inPlaceNoi: 360000, compPsf: 66, broker: 'Matt Berres', brokerFirm: 'Newmark', source: 'LoopNet', received: '2026-07-11', fit: 'borderline', reason: '6.1% cap is below the 6.5% floor; SF near top of range — worth a look but off-box on yield.', score: 62 },
  { id: 'l4', address: '1200 Logistics Way, Dallas, TX', submarket: 'DFW (Great SW)', state: 'TX', askingPrice: 12000000, sf: 180000, inPlaceNoi: 648000, compPsf: 71, broker: 'S. Alvarez', brokerFirm: 'CBRE', source: 'Crexi', received: '2026-07-11', fit: 'no-fit', reason: 'Outside target submarkets (DFW); $12M exceeds ≤$8M limit; 5.4% cap below floor.', score: 38 },
  { id: 'l5', address: '300 Retail Plaza, Melbourne, FL', submarket: 'Space Coast', state: 'FL', askingPrice: 1800000, sf: 12000, inPlaceNoi: 112000, compPsf: 150, broker: 'D. Feldman', brokerFirm: 'Marcus & Millichap', source: 'Broker email', received: '2026-07-10', fit: 'no-fit', reason: 'Retail, not industrial/IOS; 12k SF below 15k floor; $150/SF above band.', score: 31 },
  { id: 'l6', address: '9105 I-20, Midland, TX', submarket: 'Permian Basin', state: 'TX', askingPrice: 2900000, sf: 44000, inPlaceNoi: 205000, compPsf: 68, broker: 'C. Watts', brokerFirm: 'Invest Texas', source: 'Broker email', received: '2026-07-09', fit: 'fit', reason: 'Matches an existing deal record.', score: 80, deduped: 'Already in Deal Pipeline — Closing' },
]

export const PIPELINE_MARKETS = ['Permian Basin', 'Brevard / Space Coast', 'Other'] as const

export function marketForState(s: Listing['state']): string {
  return s === 'TX' ? 'Permian Basin' : s === 'FL' ? 'Brevard / Space Coast' : 'Other'
}

// A listing is auto-addable to the pipeline when it clears triage (fit) and isn't already deduped
// against an existing record.
export function isPipelineCandidate(l: Listing): boolean {
  return l.fit === 'fit' && !l.deduped
}

// Map an inbound listing onto a deal_pipeline insert payload (the fields /api/deal-pipeline accepts).
export function listingToDeal(l: Listing): {
  deal_name: string; market: string; stage: string; purchase_price: number;
  next_action: string; notes: string
} {
  const capPct = l.askingPrice ? (l.inPlaceNoi / l.askingPrice) * 100 : 0
  const psf = l.sf ? Math.round(l.askingPrice / l.sf) : 0
  return {
    deal_name: l.address,
    market: marketForState(l.state),
    stage: 'Sourcing',
    purchase_price: l.askingPrice,
    next_action: 'Screen & underwrite inbound listing',
    notes:
      `Auto-added from inbound listing (${l.source}, received ${l.received}). ` +
      `Broker: ${l.broker} · ${l.brokerFirm}. ` +
      `In-place cap ${capPct.toFixed(1)}% · $${psf}/SF · ${l.sf.toLocaleString('en-US')} SF. ` +
      l.reason,
  }
}
