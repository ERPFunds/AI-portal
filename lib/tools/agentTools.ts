import type { Tool } from '@anthropic-ai/sdk/resources/messages'

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const TOOLS: Tool[] = [
  {
    name: 'get_rent_roll',
    description:
      'Get the current rent roll showing all tenants across the portfolio — lease dates, monthly rent, payment status, and upcoming expirations. Use when asked about tenants, occupancy, rent collections, lease expirations, or anything related to the property rent roll.',
    input_schema: {
      type: 'object',
      properties: {
        property: {
          type: 'string',
          description: 'Filter by property name (e.g. "Ridgeline", "Sunbelt"). Omit for full portfolio.',
        },
        status: {
          type: 'string',
          enum: ['all', 'current', 'past_due', 'expiring_soon'],
          description: 'Filter by payment or lease status.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_lp_directory',
    description:
      'Get the LP (limited partner) investor directory with contact info, capital commitments, funded amounts, and relationship status. Use when asked about investors, LPs, capital commitments, or investor relationships.',
    input_schema: {
      type: 'object',
      properties: {
        fund: {
          type: 'string',
          description: 'Filter by fund (e.g. "Fund IV"). Omit for all funds.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_capital_calls',
    description:
      'Get capital call history and status for Fund IV — amounts called, funded dates, and outstanding balances by LP. Use when asked about capital calls, LP funding, or deployment status.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_leasing_pipeline',
    description:
      'Get the active leasing pipeline including new prospects, proposals out, LOIs, and lease renewals with their current stage and expected close dates. Use when asked about leasing activity, prospects, proposals, or pipeline.',
    input_schema: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          enum: ['all', 'prospect', 'proposal', 'loi', 'renewal', 'executed'],
          description: 'Filter by pipeline stage.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_work_orders',
    description:
      'Get open work orders across the portfolio with priority, assigned vendor, SLA status, and estimated completion. Use when asked about maintenance, repairs, work orders, or vendor activity.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'open', 'in_progress', 'overdue'],
          description: 'Filter by work order status.',
        },
        priority: {
          type: 'string',
          enum: ['all', 'emergency', 'high', 'medium', 'low'],
        },
      },
      required: [],
    },
  },
  {
    name: 'get_fund_performance',
    description:
      'Get Fund IV performance metrics — total raise target, capital deployed, property count, projected IRR, equity multiple, and portfolio summary. Use when asked about fund performance, deployment, or returns.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_flagged_items',
    description:
      'Get items flagged by the Financial Controls agent requiring review — invoices above approval threshold, GL anomalies, budget variances, and unapproved commitments. Use when asked about flagged items, approvals needed, financial exceptions, or controls.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['all', 'invoice', 'gl_anomaly', 'budget_variance', 'unapproved'],
        },
      },
      required: [],
    },
  },
]

// ─── Tool Labels (shown in UI during execution) ───────────────────────────────

export const TOOL_LABELS: Record<string, string> = {
  get_rent_roll:       'Checking rent roll…',
  get_lp_directory:    'Looking up LP directory…',
  get_capital_calls:   'Pulling capital call data…',
  get_leasing_pipeline:'Checking leasing pipeline…',
  get_work_orders:     'Reviewing work orders…',
  get_fund_performance:'Loading fund performance…',
  get_flagged_items:   'Fetching flagged items…',
}

// ─── Stub Data ────────────────────────────────────────────────────────────────

function stubRentRoll(input: Record<string, string>) {
  const rows = [
    { property: 'Ridgeline Distribution',   tenant: 'Acme Logistics',       sf: 48_500, monthly_rent: 38_800, lease_start: '2022-03-01', lease_end: '2026-02-28', status: 'Current',   days_past_due: 0  },
    { property: 'Ridgeline Distribution',   tenant: 'FastFreight LLC',      sf: 24_200, monthly_rent: 19_400, lease_start: '2021-06-01', lease_end: '2025-05-31', status: 'Past Due',  days_past_due: 32 },
    { property: 'Sunbelt Flex I',           tenant: 'Precision Parts Co.',  sf: 18_000, monthly_rent: 15_300, lease_start: '2023-01-01', lease_end: '2026-12-31', status: 'Current',   days_past_due: 0  },
    { property: 'Sunbelt Flex I',           tenant: 'Southwest Mfg',        sf: 12_500, monthly_rent: 10_625, lease_start: '2020-09-01', lease_end: '2025-08-31', status: 'Current',   days_past_due: 0  },
    { property: 'Mesa Industrial',          tenant: 'ProTech Supply Chain', sf: 62_000, monthly_rent: 47_740, lease_start: '2022-11-01', lease_end: '2027-10-31', status: 'Current',   days_past_due: 0  },
    { property: 'Mesa Industrial',          tenant: 'Vacant',               sf: 14_200, monthly_rent: 0,      lease_start: null,         lease_end: null,         status: 'Vacant',    days_past_due: 0  },
    { property: 'Centerpoint Warehouse',    tenant: 'Global Parts Inc.',    sf: 85_000, monthly_rent: 63_750, lease_start: '2021-04-01', lease_end: '2025-03-31', status: 'Expiring',  days_past_due: 0  },
    { property: 'Centerpoint Warehouse',    tenant: 'Valley Cold Storage',  sf: 41_000, monthly_rent: 33_210, lease_start: '2023-07-01', lease_end: '2028-06-30', status: 'Current',   days_past_due: 0  },
    { property: 'Horizon Logistics Center', tenant: 'Trans-West Freight',   sf: 110_000, monthly_rent: 82_500, lease_start: '2023-02-01', lease_end: '2028-01-31', status: 'Current',  days_past_due: 0  },
    { property: 'Lakeside Commerce Park',   tenant: 'National Distributors', sf: 54_000, monthly_rent: 43_200, lease_start: '2022-08-01', lease_end: '2025-07-31', status: 'Past Due', days_past_due: 18 },
  ]

  let filtered = rows
  if (input.property) {
    filtered = filtered.filter((r) => r.property.toLowerCase().includes(input.property.toLowerCase()))
  }
  if (input.status === 'past_due') filtered = filtered.filter((r) => r.status === 'Past Due')
  if (input.status === 'expiring_soon') filtered = filtered.filter((r) => r.status === 'Expiring' || (r.lease_end && new Date(r.lease_end) < new Date(Date.now() + 180 * 86400000)))
  if (input.status === 'current') filtered = filtered.filter((r) => r.status === 'Current')

  const totalSF = filtered.reduce((s, r) => s + r.sf, 0)
  const totalRent = filtered.reduce((s, r) => s + r.monthly_rent, 0)
  const pastDue = filtered.filter((r) => r.status === 'Past Due')

  return { tenants: filtered, summary: { total_sf: totalSF, total_monthly_rent: totalRent, past_due_count: pastDue.length, past_due_rent: pastDue.reduce((s, r) => s + r.monthly_rent, 0) } }
}

function stubLPDirectory(input: Record<string, string>) {
  const lps = [
    { name: 'Meridian Capital Partners', contact: 'James Whitfield',   email: 'jwhitfield@meridiancap.com', commitment: 8_000_000,  funded: 5_920_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Pinnacle Family Office',    contact: 'Sandra Okonkwo',    email: 'sokonkwo@pinnaclefamily.com', commitment: 5_000_000,  funded: 3_700_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Broadstone Advisors',       contact: 'Robert Shea',       email: 'rshea@broadstone.com',        commitment: 10_000_000, funded: 7_400_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Keystone REIT Fund',        contact: 'Maria Torres',      email: 'mtorres@keystonereit.com',    commitment: 6_500_000,  funded: 4_810_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Harbor Wealth Mgmt',        contact: 'Dennis Park',       email: 'dpark@harborwealth.com',      commitment: 4_000_000,  funded: 2_960_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Cascade Industrial Fund',   contact: 'Ellen Marsh',       email: 'emarsh@cascadeind.com',       commitment: 7_500_000,  funded: 5_550_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Summit Equity Group',       contact: 'Frank Lombardi',    email: 'flombardi@summiteq.com',      commitment: 3_000_000,  funded: 2_220_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Venture Realty Trust',      contact: 'Priya Nair',        email: 'pnair@venturerealty.com',     commitment: 5_000_000,  funded: 3_700_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Arcadia Pension Fund',      contact: 'Carl Henriksen',    email: 'chenriksen@arcadiapension.com', commitment: 12_000_000, funded: 8_880_000, fund: 'Fund IV', status: 'Active' },
    { name: 'Westfield Family Trust',    contact: 'Diane Westfield',   email: 'dwestfield@westfieldtrust.com', commitment: 4_000_000, funded: 2_960_000, fund: 'Fund IV', status: 'Active' },
  ]
  const filtered = input.fund ? lps.filter((l) => l.fund === input.fund) : lps
  const totalCommitted = filtered.reduce((s, l) => s + l.commitment, 0)
  const totalFunded = filtered.reduce((s, l) => s + l.funded, 0)
  return { lps: filtered, summary: { total_committed: totalCommitted, total_funded: totalFunded, lp_count: filtered.length } }
}

function stubCapitalCalls() {
  return {
    fund: 'Fund IV',
    target: 65_000_000,
    total_committed: 65_000_000,
    total_called: 48_200_000,
    remaining_uncalled: 16_800_000,
    calls: [
      { call_number: 1, date: '2024-01-15', amount: 13_000_000, purpose: 'Initial deployment — Ridgeline & Sunbelt acquisitions', status: 'Funded' },
      { call_number: 2, date: '2024-06-03', amount: 12_500_000, purpose: 'Mesa Industrial acquisition + capex reserves', status: 'Funded' },
      { call_number: 3, date: '2024-10-22', amount: 11_200_000, purpose: 'Centerpoint Warehouse acquisition', status: 'Funded' },
      { call_number: 4, date: '2025-02-14', amount: 11_500_000, purpose: 'Horizon Logistics Center acquisition', status: 'Funded' },
      { call_number: 5, date: '2025-04-01', amount: 5_800_000,  purpose: 'Lakeside Commerce Park — partial deployment', status: 'Partially Funded', funded_to_date: 3_200_000 },
      { call_number: 6, date: '2025-07-01', amount: 10_000_000, purpose: 'Planned: 2 acquisition targets in pipeline', status: 'Upcoming' },
    ],
  }
}

function stubLeasingPipeline(input: Record<string, string>) {
  const pipeline = [
    { id: 'L-001', company: 'NexGen Logistics',      property: 'Mesa Industrial',          sf: 14_200, stage: 'Proposal',  asking_rent_psf: 12.50, probability: 65, expected_close: '2025-06-15', rep: 'Brennan' },
    { id: 'L-002', company: 'Apex Distribution',     property: 'Centerpoint Warehouse',    sf: 85_000, stage: 'LOI',       asking_rent_psf: 9.00,  probability: 85, expected_close: '2025-05-30', rep: 'Hannah'  },
    { id: 'L-003', company: 'Redwood Supply Co.',    property: 'Sunbelt Flex I',           sf: 12_500, stage: 'Renewal',   asking_rent_psf: 11.00, probability: 90, expected_close: '2025-07-01', rep: 'Hannah'  },
    { id: 'L-004', company: 'Pacific Parts Group',   property: 'Ridgeline Distribution',   sf: 24_200, stage: 'Prospect',  asking_rent_psf: 9.80,  probability: 30, expected_close: '2025-08-01', rep: 'Brennan' },
    { id: 'L-005', company: 'Lakeside Cold Chain',   property: 'Lakeside Commerce Park',   sf: 54_000, stage: 'Renewal',   asking_rent_psf: 10.20, probability: 75, expected_close: '2025-06-01', rep: 'Hannah'  },
    { id: 'L-006', company: 'IronBridge Fabrication',property: 'Horizon Logistics Center', sf: 28_000, stage: 'Proposal',  asking_rent_psf: 8.50,  probability: 50, expected_close: '2025-07-15', rep: 'Brennan' },
  ]
  const filtered = input.stage && input.stage !== 'all'
    ? pipeline.filter((p) => p.stage.toLowerCase() === input.stage.toLowerCase())
    : pipeline
  return { pipeline: filtered, summary: { total_deals: filtered.length, weighted_sf: Math.round(filtered.reduce((s, p) => s + p.sf * (p.probability / 100), 0)) } }
}

function stubWorkOrders(input: Record<string, string>) {
  const orders = [
    { id: 'WO-2241', property: 'Ridgeline Distribution',   description: 'HVAC unit 3 compressor failure',     priority: 'Emergency', status: 'In Progress', vendor: 'AirPro HVAC',          assigned: '2025-04-28', sla_hours: 4,  hours_elapsed: 72, sla_breached: true  },
    { id: 'WO-2238', property: 'Mesa Industrial',           description: 'Dock leveler hydraulic leak #4',    priority: 'High',      status: 'Open',        vendor: 'Southwest Dock Svc',   assigned: '2025-04-30', sla_hours: 24, hours_elapsed: 48, sla_breached: true  },
    { id: 'WO-2235', property: 'Centerpoint Warehouse',     description: 'Parking lot light pole replacement', priority: 'Medium',    status: 'Scheduled',   vendor: 'Valley Electric',      assigned: '2025-05-01', sla_hours: 72, hours_elapsed: 24, sla_breached: false },
    { id: 'WO-2230', property: 'Sunbelt Flex I',            description: 'Roof drain inspection & cleaning',  priority: 'Low',       status: 'Open',        vendor: 'Desert Roofing Co.',   assigned: '2025-04-25', sla_hours: 168,hours_elapsed: 96, sla_breached: false },
    { id: 'WO-2228', property: 'Horizon Logistics Center',  description: 'Fire suppression annual inspection', priority: 'High',      status: 'In Progress', vendor: 'FireSafe Systems',     assigned: '2025-04-29', sla_hours: 24, hours_elapsed: 36, sla_breached: true  },
    { id: 'WO-2220', property: 'Lakeside Commerce Park',    description: 'Exterior signage repair — tenant',  priority: 'Low',       status: 'Open',        vendor: 'Metro Sign Co.',       assigned: '2025-04-22', sla_hours: 168,hours_elapsed: 240,sla_breached: true  },
  ]
  let filtered = orders
  if (input.status === 'overdue') filtered = orders.filter((o) => o.sla_breached)
  else if (input.status === 'open') filtered = orders.filter((o) => o.status === 'Open')
  else if (input.status === 'in_progress') filtered = orders.filter((o) => o.status === 'In Progress')
  if (input.priority && input.priority !== 'all') filtered = filtered.filter((o) => o.priority.toLowerCase() === input.priority.toLowerCase())
  return { work_orders: filtered, summary: { total: filtered.length, sla_breached: filtered.filter((o) => o.sla_breached).length } }
}

function stubFundPerformance() {
  return {
    fund: 'Fund IV',
    vintage: 2024,
    target_raise: 65_000_000,
    committed: 65_000_000,
    deployed: 48_200_000,
    deployment_pct: 74.2,
    remaining_dry_powder: 16_800_000,
    properties: 6,
    total_sf: 395_400,
    occupancy_pct: 94.1,
    projected_irr: '14–17%',
    projected_equity_multiple: '1.8–2.1x',
    avg_hold_period_years: 5,
    noi_ytd: 2_840_000,
    distributions_paid: 1_200_000,
    next_distribution_date: '2025-07-01',
  }
}

function stubFlaggedItems(input: Record<string, string>) {
  const items = [
    { id: 'FC-0412', type: 'Invoice',          description: 'AirPro HVAC — Emergency repair invoice $34,800 (above $25k threshold)', amount: 34_800, vendor: 'AirPro HVAC',       status: 'Pending Approval', property: 'Ridgeline Distribution',   flagged_date: '2025-05-01' },
    { id: 'FC-0411', type: 'Invoice',          description: 'FireSafe Systems — Annual inspection $28,450 (above $25k threshold)',    amount: 28_450, vendor: 'FireSafe Systems',   status: 'Pending Approval', property: 'Horizon Logistics Center',  flagged_date: '2025-04-30' },
    { id: 'FC-0409', type: 'GL Anomaly',       description: 'Duplicate entry detected — Repair & Maintenance GL 5400, Centerpoint', amount: 4_200,  vendor: null,                 status: 'Needs Review',     property: 'Centerpoint Warehouse',    flagged_date: '2025-04-28' },
    { id: 'FC-0408', type: 'Budget Variance',  description: 'Landscaping budget 38% over YTD budget — Mesa Industrial',             amount: 6_100,  vendor: 'GreenScape LLC',     status: 'Acknowledged',     property: 'Mesa Industrial',          flagged_date: '2025-04-25' },
    { id: 'FC-0405', type: 'Unapproved',       description: 'PO issued without approval — dock repair parts $12,300',               amount: 12_300, vendor: 'Southwest Dock Svc', status: 'Needs Review',     property: 'Mesa Industrial',          flagged_date: '2025-04-22' },
  ]
  const filtered = input.type && input.type !== 'all'
    ? items.filter((i) => i.type.toLowerCase().replace(' ', '_') === input.type)
    : items
  return { flagged_items: filtered, summary: { total: filtered.length, pending_approval: filtered.filter((i) => i.status === 'Pending Approval').length, total_amount: filtered.reduce((s, i) => s + i.amount, 0) } }
}

// ─── Tool Executor ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(name: string, input: Record<string, any>): Promise<unknown> {
  switch (name) {
    case 'get_rent_roll':        return stubRentRoll(input)
    case 'get_lp_directory':     return stubLPDirectory(input)
    case 'get_capital_calls':    return stubCapitalCalls()
    case 'get_leasing_pipeline': return stubLeasingPipeline(input)
    case 'get_work_orders':      return stubWorkOrders(input)
    case 'get_fund_performance': return stubFundPerformance()
    case 'get_flagged_items':    return stubFlaggedItems(input)
    default:
      return { error: `Unknown tool: ${name}` }
  }
}
