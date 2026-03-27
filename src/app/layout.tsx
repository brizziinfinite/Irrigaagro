import type { Metadata } from 'next'
import './globals.css'
import { AppProviders } from './providers'
import { DM_Serif_Display } from 'next/font/google'

const dmSerif = DM_Serif_Display({ weight: '400', subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'Gotejo — Irrigação Inteligente',
  description: 'Gotejo é um sistema de gestão de irrigação inteligente que combina dados climáticos, solo e cultura para dizer ao agricultor exatamente quando irrigar.',
  openGraph: {
    title: 'Gotejo — Irrigação Inteligente',
    siteName: 'Gotejo',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={dmSerif.className}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
