export type RoleKey = 'meghan' | 'meghanb' | 'william' | 'brennan' | 'michele' | 'liz' | 'hannah' | 'sylvia' | 'pippi' | 'kasandra'

export interface Role {
  name: string
  title: string
  avatar: string
  bg: string
  color: string
  access: string
  sidebar: string
  email: string
}

export const ROLES: Record<RoleKey, Role> = {
  meghan:   { name: 'Michele Parad',     title: 'CIO / Principal',                 avatar: 'MP', bg: '#2A2210', color: '#C9A84C', access: 'Admin',    sidebar: 'all',        email: 'mparad@erpfunds.com' },
  meghanb:  { name: 'Meghan Berry',      title: 'CIO / Principal',                 avatar: 'MB', bg: '#2A2210', color: '#C9A84C', access: 'Admin',    sidebar: 'all',        email: 'mberry@erpfunds.com' },
  william:  { name: 'William',           title: 'Founder',                         avatar: 'W',  bg: '#1E1235', color: '#9B72E0', access: 'Standard', sidebar: 'executive',  email: 'william@erpfunds.com' },
  brennan:  { name: 'Brennan Berry',     title: 'COO / Head of Leasing',           avatar: 'BB', bg: '#0A1F22', color: '#3EB5C4', access: 'Manager',   sidebar: 'property',   email: 'bberry@erpfunds.com' },
  michele:  { name: 'Michele Simpkins',  title: 'Controller',                      avatar: 'MS', bg: '#0D1F35', color: '#5B9BD5', access: 'Manager',   sidebar: 'finance',    email: 'msimpkins@erpfunds.com' },
  liz:      { name: 'Liz Cordova',       title: 'Project Manager',                 avatar: 'LC', bg: '#0D2218', color: '#3DAE7A', access: 'Standard',  sidebar: 'ops',        email: 'lcordova@erpfunds.com' },
  hannah:   { name: 'Hannah',            title: 'Leasing Coordinator',             avatar: 'H',  bg: '#0A1F22', color: '#3EB5C4', access: 'Standard', sidebar: 'leasing',    email: 'hannah@erpfunds.com' },
  sylvia:   { name: 'Sylvia Montoya',    title: 'Senior Accountant',               avatar: 'SM', bg: '#0D1F35', color: '#5B9BD5', access: 'Standard',  sidebar: 'accounting', email: 'smontoya@erpfunds.com' },
  pippi:    { name: 'Pippi Espinoza',    title: 'Investor & Tenant Relations',      avatar: 'PE', bg: '#1F1535', color: '#B07FE0', access: 'Standard',  sidebar: 'property',   email: 'pespinoza@erpfunds.com' },
  kasandra: { name: 'Kasandra Cordova',  title: 'Industrial Accounting Analyst',   avatar: 'KC', bg: '#0D1F35', color: '#5B9BD5', access: 'Standard',  sidebar: 'accounting', email: 'kcordova@erpfunds.com' },
}

export const ROLE_CARDS: Array<{ key: RoleKey; description: string; accessLabel: string; accessBg: string; accessColor: string }> = [
  { key: 'meghan',   description: 'CIO / Principal — Michele Parad', accessLabel: 'Full Access',        accessBg: '#2A2210', accessColor: '#C9A84C' },
  { key: 'meghanb',  description: 'CIO / Principal — Meghan Berry', accessLabel: 'Full Access',        accessBg: '#2A2210', accessColor: '#C9A84C' },
  { key: 'william',  description: 'Founder',                        accessLabel: 'Standard',           accessBg: '#1E1235', accessColor: '#9B72E0' },
  { key: 'brennan',  description: 'COO / Head of Leasing',         accessLabel: 'Property + People',  accessBg: '#0A1F22', accessColor: '#3EB5C4' },
  { key: 'michele',  description: 'Controller',                    accessLabel: 'Finance',            accessBg: '#0D1F35', accessColor: '#5B9BD5' },
  { key: 'liz',      description: 'Project Manager',               accessLabel: 'Operations',         accessBg: '#0D2218', accessColor: '#3DAE7A' },
  { key: 'hannah',   description: 'Leasing Coordinator',           accessLabel: 'Leasing',            accessBg: '#0A1F22', accessColor: '#3EB5C4' },
  { key: 'sylvia',   description: 'Senior Accountant',             accessLabel: 'Accounting',         accessBg: '#0D1F35', accessColor: '#5B9BD5' },
  { key: 'pippi',    description: 'Investor & Tenant Relations',   accessLabel: 'Property',           accessBg: '#1F1535', accessColor: '#B07FE0' },
  { key: 'kasandra', description: 'Industrial Accounting Analyst', accessLabel: 'Accounting',         accessBg: '#0D1F35', accessColor: '#5B9BD5' },
]
