'use client'

import EntityDirectory, { type DirConfig } from './EntityDirectory'

const TRADES = ['General Contractor', 'Electrical', 'Plumbing', 'HVAC', 'Roofing', 'Concrete/Paving', 'Landscaping', 'Fire/Life-Safety', 'Environmental', 'Other']
const STATUSES = ['Preferred', 'Active', 'Inactive']

const config: DirConfig = {
  eyebrow: 'Property',
  title: 'Contractors',
  subtitle: 'Property construction & maintenance contractors',
  api: '/api/contractors',
  addLabel: '+ Add Contractor',
  accent: '#26324a',
  typeKey: 'trade',
  typeOptions: TRADES,
  statusKey: 'status',
  searchKeys: ['name', 'contact', 'trade', 'markets'],
  defaults: { trade: 'General Contractor', status: 'Active' },
  columns: [
    { key: 'name', label: 'Contractor', kind: 'name' },
    { key: 'trade', label: 'Trade' },
    { key: 'contact', label: 'Contact', kind: 'contact' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'markets', label: 'Markets' },
    { key: 'insurance_expiry', label: 'Insurance Exp', kind: 'date' },
  ],
  fields: [
    { key: 'name', label: 'Contractor Name', full: true },
    { key: 'trade', label: 'Trade', kind: 'select', options: TRADES },
    { key: 'status', label: 'Status', kind: 'select', options: STATUSES },
    { key: 'contact', label: 'Primary Contact' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'markets', label: 'Markets / Coverage' },
    { key: 'license_no', label: 'License #' },
    { key: 'insurance_expiry', label: 'Insurance Expiry', kind: 'date' },
    { key: 'notes', label: 'Notes', kind: 'textarea', full: true },
  ],
}

export default function ContractorsView() { return <EntityDirectory config={config} /> }
