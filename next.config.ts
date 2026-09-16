import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @react-pdf/renderer embarque des binaires de police : il doit rester
  // externe au bundle serveur pour fonctionner en production.
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    // Les factures PDF passent par des actions serveur : la limite par défaut
    // (1 Mo) refusait la plupart des factures scannées. Vercel plafonne de
    // toute façon le corps d'une requête à 4,5 Mo.
    serverActions: { bodySizeLimit: '4.5mb' },
  },
}

export default nextConfig
