import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // `pg` is a Node-only package; keep it out of the bundle so it loads at runtime.
  serverExternalPackages: ['pg'],
}

export default nextConfig
