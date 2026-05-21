export interface NewsletterPrompt {
  id: string
  name: string
  market: string
  marketFull: string
  schedule: string
  frequency: string
  reportType: string
  endpoint: string
  recipients: string[]
  sources: string[]
  researchQuery: string
  systemPrompt: string
  outputSections: { title: string; description: string }[]
}

export const NEWSLETTER_PROMPTS: NewsletterPrompt[] = [
  // ── Monday Brief ────────────────────────────────────────────────────────────
  {
    id: 'monday-brief-permian',
    name: 'Monday Brief — Permian Basin',
    market: 'permian',
    marketFull: 'Permian Basin (Midland-Odessa, TX) industrial CRE',
    schedule: 'Every Monday',
    frequency: 'Weekly',
    reportType: 'weekly-market-update',
    endpoint: '/api/send-brief  →  {"market":"permian","reportType":"weekly-market-update"}',
    recipients: ['Michele Parad (mparad@erpfunds.com)', 'Meghan Berry (mberry@erpfunds.com)', 'William Meyer (wmeyer@erpfunds.com)'],
    sources: [
      'Web search — Claude web_search tool (up to 5 queries)',
      'CoStar news & market reports',
      'CBRE / JLL / Cushman & Wakefield broker reports',
      'NAIOP & ULI research publications',
      'Public SEC filings (EastGroup, Prologis, STAG, etc.)',
      'Trade press: RE Business Online, Bisnow, GlobeSt, CoStar Group',
      'Permian Basin–specific: Midland Reporter-Telegram, Permian Basin Royalty Trust filings, EIA oil & gas data',
    ],
    researchQuery:
      'Weekly market update for Permian Basin (Midland-Odessa, TX) industrial CRE: recent industrial transactions, macro indicators (oil price, logistics indices, employment), supply/demand signals (vacancy rate, absorption, new deliveries), notable news or lease signings.',
    systemPrompt:
      'You are a CRE market analyst for ERP Funds, producing concise weekly market update briefs for the investment team. ERP Funds is an industrial CRE firm focused on service yards, IOS, flex industrial, logistics, and cold storage in the Permian Basin and secondary markets including Brevard County FL.\n\nTone: professional, punchy, data-first. Weekly cadence means shorter and more focused than a monthly report — prioritize the most actionable signals. No filler.',
    outputSections: [
      { title: 'Key Stats (3 metrics)', description: 'Industrial vacancy rate, avg NNN rent/SF, net absorption — each with WoW change and direction' },
      { title: '§1 — Recent Transactions', description: 'Named deals with address, size, buyer/seller, price/PSF, and ERP significance' },
      { title: '§2 — Macro Indicators', description: 'Oil price, logistics indices, employment — current reading, trend, and market relevance' },
      { title: '§3 — Supply & Demand Signals', description: 'Narrative + bullets: vacancy, absorption trend, pipeline pressure' },
      { title: '§4 — Notable News', description: 'Headlines with summary and ERP relevance' },
      { title: 'Bottom Line', description: 'One sentence: most actionable takeaway for ERP this week' },
    ],
  },
  {
    id: 'monday-brief-brevard',
    name: 'Monday Brief — Brevard County',
    market: 'brevard',
    marketFull: 'Brevard County, FL (Space Coast) industrial CRE',
    schedule: 'Every Monday',
    frequency: 'Weekly',
    reportType: 'weekly-market-update',
    endpoint: '/api/send-brief  →  {"market":"brevard","reportType":"weekly-market-update"}',
    recipients: ['Michele Parad (mparad@erpfunds.com)', 'Meghan Berry (mberry@erpfunds.com)', 'William Meyer (wmeyer@erpfunds.com)'],
    sources: [
      'Web search — Claude web_search tool (up to 5 queries)',
      'CoStar news & market reports',
      'CBRE / JLL / Cushman & Wakefield broker reports',
      'NAIOP & ULI research publications',
      'Public SEC filings (EastGroup, Prologis, STAG, etc.)',
      'Trade press: RE Business Online, Bisnow, GlobeSt, Florida Realtors',
      'Brevard-specific: Florida Today, Space Coast EDC reports, Kennedy Space Center tenant activity',
    ],
    researchQuery:
      'Weekly market update for Brevard County, FL (Space Coast) industrial CRE: recent industrial transactions, macro indicators (aerospace/defense activity, logistics indices, employment), supply/demand signals (vacancy rate, absorption, new deliveries), notable news or lease signings.',
    systemPrompt:
      'You are a CRE market analyst for ERP Funds, producing concise weekly market update briefs for the investment team. ERP Funds is an industrial CRE firm focused on service yards, IOS, flex industrial, logistics, and cold storage in the Permian Basin and secondary markets including Brevard County FL.\n\nTone: professional, punchy, data-first. Weekly cadence means shorter and more focused than a monthly report — prioritize the most actionable signals. No filler.',
    outputSections: [
      { title: 'Key Stats (3 metrics)', description: 'Industrial vacancy rate, avg NNN rent/SF, net absorption — each with WoW change and direction' },
      { title: '§1 — Recent Transactions', description: 'Named deals with address, size, buyer/seller, price/PSF, and ERP significance' },
      { title: '§2 — Macro Indicators', description: 'Aerospace/defense activity, logistics indices, employment — current reading, trend, and market relevance' },
      { title: '§3 — Supply & Demand Signals', description: 'Narrative + bullets: vacancy, absorption trend, pipeline pressure' },
      { title: '§4 — Notable News', description: 'Headlines with summary and ERP relevance' },
      { title: 'Bottom Line', description: 'One sentence: most actionable takeaway for ERP this week' },
    ],
  },

  // ── Submarket Watch (Permian — monthly) ────────────────────────────────────
  {
    id: 'submarket-watch-permian',
    name: 'Submarket Watch — Permian Basin',
    market: 'permian',
    marketFull: 'Permian Basin (Midland-Odessa, TX) industrial CRE',
    schedule: '1st of each month',
    frequency: 'Monthly',
    reportType: 'submarket-intelligence',
    endpoint: '/api/send-brief  →  {"market":"permian","reportType":"submarket-intelligence"}',
    recipients: ['Michele Parad (mparad@erpfunds.com)', 'Meghan Berry (mberry@erpfunds.com)', 'William Meyer (wmeyer@erpfunds.com)'],
    sources: [
      'Web search — Claude web_search tool (up to 5 queries)',
      'CoStar submarket reports (Midland, Odessa, Permian Basin industrial)',
      'CBRE / JLL / Cushman Permian Basin market stats',
      'NAIOP research on net absorption and pipeline',
      'Public filings and press releases from active developers',
      'Trade press: CoStar Group, RE Business Online, Texas Real Estate Business',
      'County assessor / deed records for comp verification',
      'LoopNet / Crexi listings for active supply data',
    ],
    researchQuery:
      'Monthly submarket intelligence deep dive for Permian Basin (Midland-Odessa, TX) industrial CRE: vacancy rates by submarket, net absorption trends, new supply pipeline and deliveries, rent trends (NNN rate $/SF, triple net, rent escalations), notable lease signings and sales, development activity and land constraints.',
    systemPrompt:
      'You are a senior CRE submarket analyst for ERP Funds, producing monthly deep-dive intelligence reports. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary Sunbelt markets.\n\nProduce LP-grade submarket intelligence: specific data points, named assets and transactions, trend analysis, and clear investment implications. Be precise, data-dense, and direct.',
    outputSections: [
      { title: 'Key Metrics (4 stats)', description: 'Overall vacancy rate, net absorption MTD, avg NNN rent/SF, SF under construction — each with MoM comparison' },
      { title: '§1 — Vacancy & Absorption', description: 'Narrative + submarket table: name, vacancy %, net absorption SF, trend (tightening/rising/stable)' },
      { title: '§2 — New Supply Pipeline', description: 'Narrative + project cards: name/address, size, developer, delivery date, preleased %' },
      { title: '§3 — Rent Trends', description: 'Narrative + asset-type table: asking rent, effective rent, YoY change, cap rate' },
      { title: '§4 — Notable Leases & Sales', description: 'Named transactions: tenant/buyer, address, size, terms, ERP relevance' },
      { title: '§5 — Development Activity', description: 'Active projects: status, land constraints, developer, completion estimate' },
      { title: '§6 — Investment Outlook', description: 'Narrative + "Watch this month" bullets for ERP investment thesis in this submarket' },
    ],
  },

  // ── Brevard weekly briefs (3 total) ─────────────────────────────────────────
  {
    id: 'submarket-brief-brevard',
    name: 'Submarket Brief — Brevard / Space Coast',
    market: 'brevard',
    marketFull: 'Brevard County, FL (Space Coast / Melbourne-Titusville) industrial CRE',
    schedule: 'Every Monday',
    frequency: 'Weekly',
    reportType: 'submarket-brief',
    endpoint: '/api/cron/brevard-brief  (automated) — preview via submarket-intelligence',
    recipients: ['Michele Parad (mparad@erpfunds.com)', 'Meghan Berry (mberry@erpfunds.com)', 'William Meyer (wmeyer@erpfunds.com)'],
    sources: [
      'Research agent — runSubmarketIntelligence (§1–§8 deep dive)',
      'RSS feeds: GlobeSt, Commercial Observer, CRE Daily, Bisnow South FL, Connect CRE',
      'Apify Google News — Brevard County, Space Coast, Melbourne FL, Kennedy Space Center queries',
      'CoStar submarket reports (Melbourne, Palm Bay, Titusville, Cocoa industrial)',
      'Space Coast EDC development pipeline reports',
      'Brevard County Property Appraiser (bcpao.us) for comp verification',
      'LoopNet / Crexi for active supply and lease listings',
    ],
    researchQuery:
      'Weekly submarket intelligence for Brevard County, FL (Space Coast / Melbourne-Titusville) industrial CRE: vacancy rates by submarket, net absorption, new supply pipeline, rent trends (NNN $/SF), notable lease signings and sales, development activity, local developer permit activity.',
    systemPrompt:
      'You are a senior CRE submarket analyst for ERP Funds. This brief merges a deep-dive research report (§1–§8: baseline metrics, pipeline table, tenant watch, deals closed, corridor deliveries, rent premium vs Orlando, regulatory/infrastructure, submarket priority) with a weekly news digest of named Space Coast articles. Every stat must include source and date.',
    outputSections: [
      { title: '§1 — Submarket Baseline', description: 'Table: vacancy, absorption, avg rent, pipeline SF — with data vintage on every figure' },
      { title: '§2 — Rent Trends', description: 'Rent by asset type, YoY trend, cap rate comps' },
      { title: '§3 — Development Pipeline', description: 'Table: project, developer, SF, delivery date, pre-leased %' },
      { title: '§4 — Tenant Watch', description: 'Named aerospace, defense, logistics tenants — specific moves with SF and dates' },
      { title: '§5 — Deals Closed', description: 'Table: buyer, seller, property, SF, price, $/SF, date — anchor comp section' },
      { title: '§5b — Corridor Deliveries', description: 'Table: corridor, projects delivered, pre-leasing status' },
      { title: '§5c — Rent Premium vs Orlando', description: 'Brevard avg vs Orlando avg, spread, trend' },
      { title: '§6 — Tourism & Hospitality', description: 'Space Coast tourism/hospitality headline + bullets affecting industrial demand' },
      { title: '§7 — Regulatory & Infrastructure', description: 'Permit activity, infrastructure updates relevant to industrial' },
      { title: '§8 — Submarket Priority', description: 'Investment assessment by submarket for ERP thesis' },
      { title: 'This Week\'s News', description: 'Narrative summary + source articles from the past 7 days' },
    ],
  },
  {
    id: 'fund-competitor-brief-brevard',
    name: 'Competitive & Fund Brief — Brevard / Space Coast',
    market: 'brevard',
    marketFull: 'Brevard County / Space Coast industrial CRE',
    schedule: 'Every Monday',
    frequency: 'Weekly',
    reportType: 'fund-competitor-brief',
    endpoint: '/api/cron/brevard-brief  (automated) — preview via competitor-intelligence',
    recipients: ['Michele Parad (mparad@erpfunds.com)', 'Meghan Berry (mberry@erpfunds.com)', 'William Meyer (wmeyer@erpfunds.com)'],
    sources: [
      'Research agent — runCompetitorIntelligence (§1–§10 structured sections)',
      'RSS feeds: GlobeSt, PERE, PR Newswire, Business Wire, The Real Deal',
      'Apify Google News — Florida industrial fund, Space Coast investment, Rockefeller Group FL queries',
      'Public REIT filings: EastGroup (EGP), Prologis, Rexford, Terreno, STAG, First Industrial',
      'SEC EDGAR — Form D filings for industrial CRE fund raises',
      'PE fundraise announcements: PitchBook, PE Hub, The Real Deal',
      'Brevard County deed records (bcpao.us) for Orlando/Tampa buyer spillover signal',
    ],
    researchQuery:
      'Weekly competitor and fund landscape intelligence for Brevard County / Space Coast FL: national flex/R&D competitor activity (Rockefeller Group, Exeter, Cabot/Centerbridge, GreenPointe), I-4 corridor cap rate vs Brevard spread, local developer permit activity (Cuhaci & Peterson, Bravar Industrial), aerospace REIT benchmarks (Digital Realty, Equinix), Florida industrial fund raises and LP appetite.',
    systemPrompt:
      'You are a senior industrial CRE competitive analyst for ERP Funds. This brief merges a structured competitor intelligence report (§1–§10: capital flowing, REIT benchmark, PE peers, private competitors, fund structures, LP differentiation, national flex tracker, I-4 spillover signal, local permits, aerospace REIT comps) with a weekly fund landscape news digest for Florida industrial. Frame fund section for Meghan preparing LP meetings.',
    outputSections: [
      { title: '§1 — Capital Flowing', description: 'Institutional fundraises, acquisitions, major deals with dates' },
      { title: '§2 — Public REIT Benchmark', description: 'EastGroup deep table + LP narrative + other industrial REITs' },
      { title: '§3 — Florida / Sunbelt PE Peers', description: 'Rockefeller Group, Exeter, Cabot/Centerbridge, GreenPointe, others' },
      { title: '§4 — Private Competitors', description: 'Named Florida industrial operators and local buyers' },
      { title: '§5 — Comparable Fund Structures', description: 'Industry ranges: mgmt fee, carry, term, target IRR' },
      { title: '§6 — LP Differentiation Angles', description: '3 verified positioning angles with data points for ERP LP decks' },
      { title: '§7 — National Flex/R&D Tracker', description: 'Rockefeller, Exeter, Cabot/Centerbridge, GreenPointe — Brevard/FL activity' },
      { title: '§8 — I-4 Spillover Signal', description: 'Cap rate spread (I-4 vs Brevard) + Orlando/Tampa buyers in deed records' },
      { title: '§9 — Local Developer Permits', description: 'Cuhaci & Peterson, Bravar Industrial, family offices — past 12 months' },
      { title: '§10 — Aerospace REIT Benchmarks', description: 'Digital Realty, Equinix, Iron Mountain cap rate trends near launch corridors' },
      { title: 'This Week\'s Fund News', description: 'Florida industrial fund landscape news digest + LP-focused narrative' },
    ],
  },

  // ── Fund Landscape Brief (Permian — monthly) ──────────────────────────────
  {
    id: 'fund-landscape-permian',
    name: 'Fund Landscape Brief — Permian Basin',
    market: 'permian',
    marketFull: 'Permian Basin industrial CRE',
    schedule: '1st of each month',
    frequency: 'Monthly',
    reportType: 'competitor-intelligence',
    endpoint: '/api/send-brief  →  {"market":"permian","reportType":"competitor-intelligence"}',
    recipients: ['Michele Parad (mparad@erpfunds.com)', 'Meghan Berry (mberry@erpfunds.com)', 'William Meyer (wmeyer@erpfunds.com)'],
    sources: [
      'Web search — Claude web_search tool (up to 5 queries)',
      'Public REIT filings: EastGroup (EGP), Prologis (PLD), Rexford (REXR), Terreno (TRNO), STAG, First Industrial (FR)',
      'SEC EDGAR — 10-Q, 8-K filings and Form D fund raises',
      'PE fundraise announcements: PitchBook news, PE Hub, The Real Deal',
      'Limited partner appetite: Preqin, PERE news, National Real Estate Investor',
      'Trade press: CoStar Group, NAIOP, GlobeSt, Real Capital Analytics',
      'Conference coverage: ICSC, IMN industrial conferences, NAIOP annual',
    ],
    researchQuery:
      'Competitor intelligence for industrial CRE market in Permian: institutional fundraises, major acquisitions, public REIT performance (EastGroup, Prologis, Rexford, Terreno, STAG, First Industrial), regional PE peers active in Permian, private competitors, IOS/service yard deal tracker, comparable fund structures (management fee, carry, term, target IRR).',
    systemPrompt:
      'You are a senior industrial CRE strategist and competitive analyst for ERP Funds. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary markets.\n\nProduce a richly detailed, LP-grade competitor intelligence brief. Be specific, data-dense, and direct. Every section must contain real named entities, figures, and actionable observations. Every stat must include source and date.',
    outputSections: [
      { title: '§1 — Capital Flowing', description: 'Institutional fundraises, acquisitions, major deals — amounts, parties, significance to ERP' },
      { title: '§2 — Public Industrial REIT Benchmark', description: 'EastGroup deep table + LP narrative + other industrial REITs' },
      { title: '§3 — Texas / Sunbelt PE Peers', description: 'Stonelake Capital, Harbor Capital, Investcorp, Circle Industrial and others' },
      { title: '§4 — Private Competitors', description: 'Hillwood, Stream Realty, Crow Holdings, Lincoln Property — Permian interest' },
      { title: '§5 — Comparable Fund Structures', description: 'Industry ranges: mgmt fee, carry, term, target IRR' },
      { title: '§6 — LP Differentiation Angles', description: '3 verified positioning angles with data points for ERP LP decks' },
      { title: '§7 — IOS / Service Yard Tracker', description: 'Stonemont, Titan Industrial, InSite, Broadstone, Zenith IOS — deal announcements' },
      { title: '§8 — SEC EDGAR Form D', description: 'New $50M+ industrial CRE fund raises — 30-60 day advance competitive signal' },
    ],
  },
]

// ── Market Data Sources ───────────────────────────────────────────────────────

export interface DataSeries {
  id: string
  label: string
  description: string
  url: string
  source: 'BLS' | 'FRED'
  note?: string
}

export interface MarketDataSource {
  market: string
  marketFull: string
  icon: string
  blsPage: string
  fredPage: string
  series: DataSeries[]
}

export const MARKET_DATA_SOURCES: MarketDataSource[] = []
