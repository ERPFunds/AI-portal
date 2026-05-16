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

  // ── Submarket Watch ──────────────────────────────────────────────────────────
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
  {
    id: 'submarket-watch-brevard',
    name: 'Submarket Watch — Brevard County',
    market: 'brevard',
    marketFull: 'Brevard County, FL (Space Coast / Melbourne-Titusville) industrial CRE',
    schedule: '1st of each month',
    frequency: 'Monthly',
    reportType: 'submarket-intelligence',
    endpoint: '/api/send-brief  →  {"market":"brevard","reportType":"submarket-intelligence"}',
    recipients: ['Michele Parad (mparad@erpfunds.com)', 'Meghan Berry (mberry@erpfunds.com)', 'William Meyer (wmeyer@erpfunds.com)'],
    sources: [
      'Web search — Claude web_search tool (up to 5 queries)',
      'CoStar submarket reports (Melbourne, Palm Bay, Titusville, Cocoa industrial)',
      'CBRE / JLL / Cushman Florida market stats',
      'Space Coast EDC development pipeline reports',
      'Florida Department of Economic Opportunity data',
      'Trade press: GlobeSt, Florida Realtors, RE Business Online',
      'Brevard County Property Appraiser for comp verification',
      'LoopNet / Crexi for active supply and lease listings',
    ],
    researchQuery:
      'Monthly submarket intelligence deep dive for Brevard County, FL (Space Coast / Melbourne-Titusville) industrial CRE: vacancy rates by submarket, net absorption trends, new supply pipeline and deliveries, rent trends (NNN rate $/SF, triple net, rent escalations), notable lease signings and sales, development activity and land constraints.',
    systemPrompt:
      'You are a senior CRE submarket analyst for ERP Funds, producing monthly deep-dive intelligence reports. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary Sunbelt markets.\n\nProduce LP-grade submarket intelligence: specific data points, named assets and transactions, trend analysis, and clear investment implications. Be precise, data-dense, and direct.',
    outputSections: [
      { title: 'Key Metrics (4 stats)', description: 'Overall vacancy rate, net absorption MTD, avg NNN rent/SF, SF under construction — each with MoM comparison' },
      { title: '§1 — Vacancy & Absorption', description: 'Narrative + submarket table: Melbourne, Palm Bay, Titusville — vacancy %, net absorption SF, trend' },
      { title: '§2 — New Supply Pipeline', description: 'Narrative + project cards: name/address, size, developer, delivery date, preleased %' },
      { title: '§3 — Rent Trends', description: 'Narrative + asset-type table: asking rent, effective rent, YoY change, cap rate' },
      { title: '§4 — Notable Leases & Sales', description: 'Named transactions: tenant/buyer, address, size, terms, ERP relevance' },
      { title: '§5 — Development Activity', description: 'Active projects: status, land constraints, developer, completion estimate' },
      { title: '§6 — Investment Outlook', description: 'Narrative + "Watch this month" bullets for ERP investment thesis in Brevard County' },
    ],
  },

  // ── Fund Landscape Brief ─────────────────────────────────────────────────────
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
      'SEC EDGAR — 10-Q, 8-K filings for industrial REITs',
      'PE fundraise announcements: PitchBook news, PE Hub, The Real Deal',
      'Limited partner appetite: Preqin, PERE news, National Real Estate Investor',
      'Trade press: CoStar Group, NAIOP, GlobeSt, Real Capital Analytics',
      'Conference coverage: ICSC, IMN industrial conferences, NAIOP annual',
    ],
    researchQuery:
      'Competitor intelligence for industrial CRE market in Permian: institutional fundraises, major acquisitions, public REIT performance (EastGroup, Prologis, Rexford, Terreno, STAG, First Industrial), regional PE peers active in Permian, private competitors, comparable fund structures (management fee, carry, term, target IRR).',
    systemPrompt:
      'You are a senior industrial CRE strategist and competitive analyst for ERP Funds. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary markets (Midland-Odessa, Tampa/Brevard County FL, secondary Texas).\n\nYour job: produce a richly detailed, LP-grade competitor intelligence brief for internal use. Be specific, data-dense, and direct. Every section must contain real named entities, figures, and actionable observations. No filler.',
    outputSections: [
      { title: '§1 — Capital Flowing', description: 'Institutional fundraises, acquisitions, major deals — amounts, parties, significance to ERP' },
      { title: '§2 — Public Industrial REIT Benchmark', description: 'Table: EGP, PLD, REXR, TRNO, STAG, FR — price, YTD, FFO yield, div yield, notes. Narrative on comp context.' },
      { title: '§3 — Regional PE Peers', description: 'Table: firm name, strategy focus, AUM estimate, Permian Basin activity' },
      { title: '§4 — Private Competitors', description: 'Named operators and local buyers: description, assets, market interest' },
      { title: '§5 — Comparable Fund Structures', description: 'Table: fund name, mgmt fee %, carry %, term (years), target IRR %' },
      { title: '§6 — Differentiation Narrative', description: 'ERP positioning angles for LP decks — angle title + 1-2 sentence narrative each. Plus "Watch for next month."' },
    ],
  },
  {
    id: 'fund-landscape-brevard',
    name: 'Fund Landscape Brief — Brevard County',
    market: 'brevard',
    marketFull: 'Brevard County / Space Coast industrial CRE',
    schedule: '1st of each month',
    frequency: 'Monthly',
    reportType: 'competitor-intelligence',
    endpoint: '/api/send-brief  →  {"market":"brevard","reportType":"competitor-intelligence"}',
    recipients: ['Michele Parad (mparad@erpfunds.com)', 'Meghan Berry (mberry@erpfunds.com)', 'William Meyer (wmeyer@erpfunds.com)'],
    sources: [
      'Web search — Claude web_search tool (up to 5 queries)',
      'Public REIT filings: EastGroup (EGP), Prologis (PLD), Rexford (REXR), Terreno (TRNO), STAG, First Industrial (FR)',
      'SEC EDGAR — 10-Q, 8-K filings for industrial REITs',
      'PE fundraise announcements: PitchBook news, PE Hub, The Real Deal',
      'Limited partner appetite: Preqin, PERE news, National Real Estate Investor',
      'Trade press: CoStar Group, NAIOP, GlobeSt, Real Capital Analytics, Florida Business Observer',
    ],
    researchQuery:
      'Competitor intelligence for industrial CRE market in Brevard County / Space Coast FL: institutional fundraises, major acquisitions, public REIT performance (EastGroup, Prologis, Rexford, Terreno, STAG, First Industrial), regional PE peers active in Florida, private competitors, comparable fund structures (management fee, carry, term, target IRR).',
    systemPrompt:
      'You are a senior industrial CRE strategist and competitive analyst for ERP Funds. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary markets (Midland-Odessa, Tampa/Brevard County FL, secondary Texas).\n\nYour job: produce a richly detailed, LP-grade competitor intelligence brief for internal use. Be specific, data-dense, and direct. Every section must contain real named entities, figures, and actionable observations. No filler.',
    outputSections: [
      { title: '§1 — Capital Flowing', description: 'Institutional fundraises, acquisitions, major deals — amounts, parties, significance to ERP' },
      { title: '§2 — Public Industrial REIT Benchmark', description: 'Table: EGP, PLD, REXR, TRNO, STAG, FR — price, YTD, FFO yield, div yield, notes. Narrative on comp context.' },
      { title: '§3 — Regional PE Peers', description: 'Table: firm name, Florida strategy focus, AUM estimate, Brevard/Space Coast activity' },
      { title: '§4 — Private Competitors', description: 'Named operators and local buyers: description, assets, market interest' },
      { title: '§5 — Comparable Fund Structures', description: 'Table: fund name, mgmt fee %, carry %, term (years), target IRR %' },
      { title: '§6 — Differentiation Narrative', description: 'ERP positioning angles for LP decks — angle title + 1-2 sentence narrative each. Plus "Watch for next month."' },
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

export const MARKET_DATA_SOURCES: MarketDataSource[] = [
  {
    market: 'permian',
    marketFull: 'Permian Basin — Midland-Odessa, TX',
    icon: '🛢️',
    blsPage: 'https://www.bls.gov/eag/eag.tx_midland_msa.htm',
    fredPage: 'https://fred.stlouisfed.org/series/MIDL248NA',
    series: [
      // ── Midland MSA ──
      { id: 'MIDL248NA',  label: 'Midland — Total Nonfarm Employment',         description: 'All employees, thousands, not seasonally adjusted',     url: 'https://fred.stlouisfed.org/series/MIDL248NA',              source: 'FRED' },
      { id: 'MIDL248UR',  label: 'Midland — Unemployment Rate (SA)',            description: 'Seasonally adjusted monthly unemployment rate',         url: 'https://fred.stlouisfed.org/series/MIDL248UR',              source: 'FRED' },
      { id: 'MIDL248URN', label: 'Midland — Unemployment Rate (NSA)',           description: 'Not seasonally adjusted monthly unemployment rate',     url: 'https://fred.stlouisfed.org/series/MIDL248URN',             source: 'FRED' },
      // ── Odessa MSA ──
      { id: 'ODES248UR',  label: 'Odessa — Unemployment Rate (SA)',             description: 'Seasonally adjusted monthly unemployment rate',         url: 'https://fred.stlouisfed.org/series/ODES248UR',              source: 'FRED' },
      { id: 'ODES248URN', label: 'Odessa — Unemployment Rate (NSA)',            description: 'Not seasonally adjusted monthly unemployment rate',     url: 'https://fred.stlouisfed.org/series/ODES248URN',             source: 'FRED' },
      // ── BLS ──
      { id: 'SMU4832900001',        label: 'Midland — Nonfarm Employment (BLS SAE)', description: 'BLS State and Metro Area Employment series',       url: 'https://www.bls.gov/eag/eag.tx_midland_msa.htm',            source: 'BLS' },
      { id: 'LAUMT483326000000003A',label: 'Midland — Unemployment Rate (BLS LAUS)', description: 'BLS Local Area Unemployment Statistics annual',    url: 'https://fred.stlouisfed.org/series/LAUMT483326000000003A',  source: 'BLS' },
      { id: 'SMU4836220001',        label: 'Odessa — Nonfarm Employment (BLS SAE)',  description: 'BLS State and Metro Area Employment series',       url: 'https://www.bls.gov/eag/eag.tx_odessa_msa.htm',             source: 'BLS' },
      { id: 'LAUMT483622000000003A',label: 'Odessa — Unemployment Rate (BLS LAUS)',  description: 'BLS Local Area Unemployment Statistics annual',    url: 'https://fred.stlouisfed.org/series/LAUMT483622000000003A',  source: 'BLS' },
    ],
  },
  {
    market: 'brevard',
    marketFull: 'Brevard County — Palm Bay-Melbourne-Titusville, FL',
    icon: '🚀',
    blsPage: 'https://www.bls.gov/eag/eag.fl_palmbay_msa.htm',
    fredPage: 'https://fred.stlouisfed.org/series/PALM312NA',
    series: [
      // ── Palm Bay-Melbourne-Titusville MSA ──
      { id: 'PALM312NA',  label: 'Palm Bay MSA — Total Nonfarm Employment',     description: 'All employees, thousands, not seasonally adjusted',     url: 'https://fred.stlouisfed.org/series/PALM312NA',              source: 'FRED' },
      { id: 'PALM312UR',  label: 'Palm Bay MSA — Unemployment Rate (SA)',       description: 'Seasonally adjusted monthly unemployment rate',         url: 'https://fred.stlouisfed.org/series/PALM312UR',              source: 'FRED' },
      { id: 'PALM312URN', label: 'Palm Bay MSA — Unemployment Rate (NSA)',      description: 'Not seasonally adjusted monthly unemployment rate',     url: 'https://fred.stlouisfed.org/series/PALM312URN',             source: 'FRED' },
      { id: 'FLBREV3URN', label: 'Brevard County — Unemployment Rate (NSA)',    description: 'County-level, not seasonally adjusted',                 url: 'https://fred.stlouisfed.org/series/FLBREV3URN',             source: 'FRED' },
      { id: 'PALM312PBSV',label: 'Palm Bay MSA — Prof & Business Services',     description: 'Employment in professional & business services sector', url: 'https://fred.stlouisfed.org/series/PALM312PBSV',            source: 'FRED' },
      // ── BLS ──
      { id: 'SMU1237340001',        label: 'Palm Bay MSA — Nonfarm Employment (BLS SAE)', description: 'BLS State and Metro Area Employment series', url: 'https://www.bls.gov/eag/eag.fl_palmbay_msa.htm',            source: 'BLS' },
      { id: 'LAUMT123734000000003A',label: 'Palm Bay MSA — Unemployment Rate (BLS LAUS)', description: 'BLS Local Area Unemployment Statistics annual', url: 'https://fred.stlouisfed.org/series/LAUMT123734000000003A', source: 'BLS' },
    ],
  },
]
