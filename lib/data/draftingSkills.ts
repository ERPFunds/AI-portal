// Per-type "skillsets" for the Drafting Workspace.
//
// Single source of truth shared by the UI (components/DraftingWorkspaceView.tsx)
// and the generation route (app/api/drafting/route.ts). Each type carries its own
// instructions, section outline, default KB grounding, and output length — so
// "OM Section" and "LP Memo" behave like specialists rather than one generic box.

export type DocType =
  | 'freeform'
  | 'om-section'
  | 'lp-memo'
  | 'deal-summary'
  | 'email-draft'
  | 'market-brief'
  | 'newsletter'

export interface DraftingSkill {
  id: DocType
  label: string
  icon: string
  placeholder: string
  /** System instructions for this document type. */
  systemPrompt: string
  /** Suggested sections — powers the outline picker; passed back as the writing scaffold. */
  outline?: string[]
  /** KB categories to auto-select (pre-checks matching files in the KB picker). */
  defaultKbCategories?: string[]
  /** Max output tokens for this type (falls back to a shared default). */
  maxTokens?: number
  /** Quality reminders folded into the system prompt. */
  checklist?: string[]
}

export const DEFAULT_MAX_TOKENS = 4000

const FIRM =
  'ERP Industrials, a private equity industrial real estate fund manager focused on the Permian Basin (West Texas) and Brevard County / Space Coast (Florida) markets'

export const DRAFTING_SKILLS: DraftingSkill[] = [
  {
    id: 'freeform',
    label: 'Freeform',
    icon: '💬',
    placeholder: 'Research a market, summarize a topic, draft anything...',
    systemPrompt: `You are a research and writing assistant for ${FIRM}. Help with research, writing, and analysis. Be specific, data-driven, and actionable. Write and stop — do not ask follow-up questions or offer options.`,
  },
  {
    id: 'om-section',
    label: 'OM Section',
    icon: '📄',
    placeholder: 'Write the market overview section for a 45,000 SF industrial property in Midland, TX...',
    systemPrompt: `You are a professional OM (Offering Memorandum) writer for ${FIRM}. Write polished, institutional-quality OM sections for industrial properties. Use industry-standard CRE language with concrete data points ($/SF, cap rate, clear height, dock/grade doors, acreage, power). Ground every claim in the source material provided; where a specific figure is required but not supplied, insert a clearly marked placeholder like [CAP RATE] rather than inventing it. Be specific about market fundamentals, demand drivers, and investment thesis. Write and stop — do not ask follow-up questions.`,
    outline: ['Executive Summary', 'Market Overview', 'Property Description', 'Tenancy & Lease Summary', 'Financial Highlights', 'Investment Thesis', 'Risk Factors'],
    defaultKbCategories: ['Acquisition KB', 'Analytics KB', 'Capital KB'],
    maxTokens: 8000,
    checklist: ['concrete metrics (SF, cap rate, $/SF, clear height) where relevant', 'named demand drivers and comparable transactions', 'a clear, evidence-backed investment thesis', 'balanced, honest risk factors', 'placeholders for any figure not in the source material'],
  },
  {
    id: 'lp-memo',
    label: 'LP Memo',
    icon: '📊',
    placeholder: 'Draft a Q2 LP update covering fund performance, recent acquisitions, and market conditions...',
    systemPrompt: `You are a fund communications writer for ${FIRM} preparing LP memos and investor updates. Tone: professional, confident, transparent. Focus on fund performance, market positioning, deal pipeline, and strategic context. Write for a sophisticated LP audience. Quote figures exactly as given in the source material and attribute them; never state an unqualified forward-looking claim. Write and stop — do not ask follow-up questions.`,
    outline: ['Executive Summary', 'Fund Performance', 'Recent Acquisitions', 'Market Conditions', 'Pipeline & Outlook', 'Capital & Distributions'],
    defaultKbCategories: ['Investor Relations (SharePoint)', 'Capital KB'],
    maxTokens: 6000,
    checklist: ['figures cited to their source where possible', 'no unqualified forward-looking statements', 'a confident but transparent tone appropriate for LPs'],
  },
  {
    id: 'deal-summary',
    label: 'Deal Summary',
    icon: '🏭',
    placeholder: 'Summarize the 23-acre service yard acquisition in Odessa: $2.1M, 100% occupied by oil field services tenant, 7.2% cap rate...',
    systemPrompt: `You are a deal analyst for ${FIRM}. Write clear, concise deal summaries. Lead with the numbers, keep it skimmable, and use a structured section format. Use only figures provided; mark anything missing with a placeholder. Write and stop — do not ask follow-up questions.`,
    outline: ['Property Description', 'Location & Submarket', 'Pricing & Returns', 'Tenancy & Occupancy', 'Investment Highlights', 'Risks', "ERP's Thesis"],
    defaultKbCategories: ['Acquisition KB', 'Analytics KB'],
    maxTokens: 3000,
    checklist: ['pricing metrics ($/SF, cap rate, price/acre)', 'tenant and occupancy detail', 'explicit risks and ERP thesis'],
  },
  {
    id: 'email-draft',
    label: 'Email Draft',
    icon: '✉️',
    placeholder: 'Draft a follow-up email to an LP who attended our Q2 update and asked about our Brevard deal pipeline...',
    systemPrompt: `You are an IR/communications assistant for ${FIRM}. Draft professional emails. LP emails: formal and warm. Broker emails: direct and professional. Internal emails: concise. Write only the email body (include a Subject: line at top). Write and stop — do not ask follow-up questions.`,
    defaultKbCategories: ['Investor Relations (SharePoint)'],
  },
  {
    id: 'market-brief',
    label: 'Market Brief',
    icon: '📈',
    placeholder: 'Write a brief on current industrial market conditions in Brevard County, focusing on vacancy trends and aerospace demand drivers...',
    systemPrompt: `You are a CRE market analyst for ${FIRM}. Write concise market briefs covering industrial fundamentals. Focus on the Permian Basin and/or Brevard County / Space Coast. Be specific and data-driven. Write and stop — do not ask follow-up questions.`,
    outline: ['Market Snapshot', 'Vacancy & Absorption', 'Asking Rents', 'Notable Transactions', 'Development Pipeline', 'Demand Drivers', 'Outlook'],
    defaultKbCategories: ['Analytics KB'],
    checklist: ['vacancy, absorption, and asking-rent figures where available', 'named notable transactions and demand drivers'],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    icon: '📰',
    placeholder: 'Edit the market narrative, rewrite the intro paragraph, summarize key takeaways, or draft a follow-up edition...',
    systemPrompt: `You are a market intelligence editor for ${FIRM}. You may be given a previously sent newsletter as base context. Help edit, update, rewrite sections, summarize key points, or draft a follow-up edition. Be specific and data-driven. Write and stop — do not ask follow-up questions.`,
  },
]

export function getSkill(id: string): DraftingSkill {
  return DRAFTING_SKILLS.find((s) => s.id === id) ?? DRAFTING_SKILLS[0]
}
