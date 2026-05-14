import type { RoleKey } from './roles'

export interface InboxItem {
  from: string
  agent: string
  agentBadge: string
  subject: string
  time: string
  status: 'active-thread' | 'pending' | 'handled' | 'needs-review'
}

export const INBOX_DATA: Record<RoleKey, InboxItem[]> = {
  micheleP: [],
  meghanb:  [],
  william:  [],
  brennan:  [],
  michele:  [],
  liz:      [],
  hannah:   [],
  sylvia:   [],
  pippi:    [],
  kasandra: [],
}

export const INBOX_AGENTS: Record<RoleKey, string[]> = {
  micheleP: [],
  meghanb:  [],
  william:  [],
  brennan:  [],
  michele:  [],
  liz:      [],
  hannah:   [],
  sylvia:   [],
  pippi:    [],
  kasandra: [],
}