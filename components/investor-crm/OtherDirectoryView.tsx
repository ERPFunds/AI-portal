'use client'

import EntityDirectory, { type DirConfig } from '../directories/EntityDirectory'

// Non-investor relationships that arrive alongside investor exports — lenders, law firms,
// vendors and anything else that isn't a prospect or an LP.

const CATEGORIES = ['Lender', 'Law Firm', 'Vendor', 'Other']

const config: DirConfig = {
  eyebrow: 'Investor CRM',
  title: 'Other',
  subtitle: 'Lenders, law firms and vendors captured alongside investor records',
  api: '/api/crm-other',
  addLabel: '+ Add Record',
  accent: '#26324a',
  typeKey: 'category',
  typeOptions: CATEGORIES,
  searchKeys: ['name', 'contact', 'category', 'email', 'title', 'notes'],
  defaults: { category: 'Other' },
  columns: [
    { key: 'name', label: 'Firm / Account', kind: 'name' },
    { key: 'category', label: 'Category' },
    { key: 'contact', label: 'Contact', kind: 'contact' },
    { key: 'title', label: 'Title' },
    { key: 'owner', label: 'Lead' },
    { key: 'notes', label: 'Notes' },
  ],
  fields: [
    { key: 'name', label: 'Firm / Account', full: true },
    { key: 'category', label: 'Category', kind: 'select', options: CATEGORIES },
    { key: 'owner', label: 'Lead' },
    { key: 'contact', label: 'Contact' },
    { key: 'title', label: 'Title' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Office Phone' },
    { key: 'phone_cell', label: 'Cell Phone' },
    { key: 'address', label: 'Address', full: true },
    { key: 'notes', label: 'Notes', kind: 'textarea', full: true },
  ],
}

export default function OtherDirectoryView() { return <EntityDirectory config={config} /> }
