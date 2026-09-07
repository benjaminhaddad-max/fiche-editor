import type { Metadata } from 'next'
import { Fraunces, Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

// Les trois familles de Diploma Lab : Inter pour le texte, Fraunces pour les
// titres, Space Grotesk pour les intitulés en capitales.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
})
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-label',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Diploma Invoice',
  description:
    'Déclaration des prestations, validation et facturation des prestataires Diploma Santé.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${fraunces.variable} ${spaceGrotesk.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
