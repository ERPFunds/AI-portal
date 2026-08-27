'use client'

import EntityDirectory, { type DirConfig } from './EntityDirectory'

const TYPES = ['Bank', 'Agency (Fannie/Freddie)', 'Debt Fund', 'Bridge', 'CMBS', 'Life Company', 'Credit Union', 'SBA', 'Other']
const STATUSES = ['Preferred', 'Active', 'Inactive', 'Past']

const config: DirConfig = {
  eyebrow: 'Property',
  title: 'Lenders',
  subtitle: 'Debt & financing relationships',
  api: '/api/lenders',
  addLabel: '+ Add Lender',
  accent: '#26324a',
  typeKey: 'lender_type',
  typeOptions: TYPES,
  statusKey: 'status',
  searchKeys: ['name', 'contact', 'lender_type', 'products', 'markets'],
  defaults: { lender_type: 'Bank', status: 'Active' },
  columns: [
    { key: 'name', label: 'Lender', kind: 'name' },
    { key: 'lender_type', label: 'Type' },
    { key: 'contact', label: 'Contact', kind: 'contact' },
    { key: 'status', label: 'Status', kind: 'status' },
    { key: 'products', label: 'Products' },
    { key: 'markets', label: 'Markets' },
  ],
  fields: [
    { key: 'name', label: 'Lender Name', full: true },
    { key: 'lender_type', label: 'Type', kind: 'select', options: TYPES },
    { key: 'status', label: 'Status', kind: 'select', options: STATUSES },
    { key: 'contact', label: 'Primary Contact' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'products', label: 'Loan Products / Terms', full: true },
    { key: 'markets', label: 'Markets / Coverage' },
    { key: 'notes', label: 'Notes', kind: 'textarea', full: true },
  ],
}

export default function LendersView() { return <EntityDirectory config={config} /> }
