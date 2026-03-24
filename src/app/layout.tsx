import type { Metadata } from 'next'
import './globals.css'
import { AppProviders } from './providers'

export const metadata: Metadata = {
  title: 'IrrigaAgro — Irrigação de Precisão',
  description: 'Sistema de manejo de irrigação baseado em balanço hídrico FAO-56',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
