import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @react-pdf/renderer embarque des binaires de police : il doit rester
  // externe au bundle serveur pour fonctionner en production.
  serverExternalPackages: ['@react-pdf/renderer'],
}

export default nextConfig
