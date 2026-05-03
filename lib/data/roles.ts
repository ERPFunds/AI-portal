export type RoleKey = 'meghan' | 'william' | 'brennan' | 'michele' | 'liz' | 'hannah' | 'sylvia'

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
  meghan:  { name: 'Michele Parad',   title: 'CIO / Principal',       avatar: 'MP', bg: '#2A2210', color: '#C9A84C', access: 'Admin',     sidebar: 'all',        email: 'michele.parad@gmail.com' },
  william: { name: 'William',         title: 'Founder',               avatar: 'W',  bg: '#1E1235', color: '#9B72E0', access: 'Read Only', sidebar: 'executive',  email: 'william@erpindustrials.com' },
  brennan: { name: 'Brennan Berry',   title: 'COO / Head of Leasing', avatar: 'BB', bg: '#0A1F22', color: '#3EB5C4', access: 'Manager',   sidebar: 'property',   email: 'bberry@erpindustrials.com' },
  michele: { name: 'Michele Simpkins',title: 'Controller',            avatar: 'MS', bg: '#0D1F35', color: '#5B9BD5', access: 'Manager',   sidebar: 'finance',    email: 'msimpkins@erpindustrials.com' },
  liz:     { name: 'Liz Cordova',     title: 'Project Manager',       avatar: 'LC', bg: '#0D2218', color: '#3DAE7A', access: 'Standard',  sidebar: 'ops',        email: 'lcordova@erpindustrials.com' },
  hannah:  { name: 'Hannah',          title: 'Leasing Coordinator',   avatar: 'H',  bg: '#0A1F22', color: '#3EB5C4', access: 'Standard',  sidebar: 'leasing',    email: 'hannah@erpindustrials.com' },
  sylvia:  { name: 'Sylvia Montoya',  title: 'Senior Accountant',     avatar: 'SM', bg: '#0D1F35', color: '#5B9BD5', access: 'Standard',  sidebar: 'accounting', email: 'smontoya@erpindustrials.com' },
}

export const ROLE_CARDS: Array<{ key: RoleKey; description: string; accessLabel: string; accessBg: string; accessColor: string }> = [
  { key: 'meghan',  description: 'CIO / Principal',       accessLabel: 'Full Access',        accessBg: '#2A2210', accessColor: '#C9A84C' },
  { key: 'william', description: 'Founder',               accessLabel: 'Executive',          accessBg: '#1E1235', accessColor: '#9B72E0' },
  { key: 'brennan', description: 'COO / Head of Leasing', accessLabel: 'Property + People',  accessBg: '#0A1F22', accessColor: '#3EB5C4' },
  { key: 'michele', description: 'Controller',            accessLabel: 'Finance',            accessBg: '#0D1F35', accessColor: '#5B9BD5' },
  { key: 'liz',     description: 'Project Manager',       accessLabel: 'Operations',         accessBg: '#0D2218', accessColor: '#3DAE7A' },
  { key: 'hannah',  description: 'Leasing Coordinator',   accessLabel: 'Leasing',            accessBg: '#0A1F22', accessColor: '#3EB5C4' },
  { key: 'sylvia',  description: 'Senior Accountant',     accessLabel: 'Accounting',         accessBg: '#0D1F35', accessColor: '#5B9BD5' },
]
