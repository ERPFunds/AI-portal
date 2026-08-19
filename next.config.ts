import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Node-only packages kept out of the bundle so they load natively at runtime.
  // @sparticuz/chromium + puppeteer-core power the self-hosted headless render in the market scan.
  serverExternalPackages: ['pg', '@sparticuz/chromium', 'puppeteer-core'],
}

export default nextConfig
