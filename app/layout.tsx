import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ERP Industrials — AI Agent Portal',
  description: 'Internal AI Agent Portal for ERP Industrials',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body style={{ fontFamily: 'var(--font-montserrat), "Gotham", system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
