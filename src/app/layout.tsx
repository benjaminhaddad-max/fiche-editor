import type { Metadata } from 'next'
import { Fraunces, Inter, Poppins, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { BRANDS, deploymentBrandId } from '@/lib/brand'
import { CouleursMarque } from '@/components/brand/CouleursMarque'

// Les trois familles de Diploma Lab : Inter pour le texte, Fraunces pour les
// titres, Space Grotesk pour les intitulés en capitales.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
})
// Poppins : la plus proche du lettrage officiel Diploma Santé — même
// construction géométrique, même « a » d'un seul étage. Réservée à la marque.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-brand',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-label',
  display: 'swap',
})

// Le layout racine couvre aussi les pages rendues sans requête — /_not-found,
// l'écran de connexion. Il prend donc la marque du déploiement, qui est
// connue à la compilation. Le titre suit la marque choisie un cran plus bas,
// dans le layout de l'application, où une session existe toujours.
const racine = BRANDS[deploymentBrandId()]

export const metadata: Metadata = {
  title: racine.appTitle,
  description: racine.description,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${fraunces.variable} ${spaceGrotesk.variable} ${poppins.variable}`}
    >
      <body className="font-sans antialiased">
        {/* Les couleurs du déploiement, pour l'écran de connexion et les
            pages publiques. Une fois connecté, le layout de l'application
            les repeint selon la marque affichée. */}
        <CouleursMarque marque={racine} />
        {children}
      </body>
    </html>
  )
}
