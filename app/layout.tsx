import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ERP Industrials — AI Agent Portal',
  description: 'Internal AI Agent Portal for ERP Industrials',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
