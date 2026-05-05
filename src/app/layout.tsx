import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppProviders } from './providers'
import { DM_Serif_Display } from 'next/font/google'
import { ConnectionIndicator } from '@/components/ConnectionIndicator'

const dmSerif = DM_Serif_Display({ weight: '400', subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'IrrigaAgro — Irrigação Inteligente',
  description: 'IrrigaAgro é um sistema de gestão de irrigação inteligente que combina dados climáticos, solo e cultura para dizer ao agricultor exatamente quando irrigar.',
  openGraph: {
    title: 'IrrigaAgro — Irrigação Inteligente',
    siteName: 'IrrigaAgro',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'IrrigaAgro',
  },
  icons: {
    apple: [
      { url: '/icons/apple-touch-icon.png',     sizes: '180x180' },
      { url: '/icons/apple-touch-icon-167.png',  sizes: '167x167' },
      { url: '/icons/apple-touch-icon-152.png',  sizes: '152x152' },
      { url: '/icons/apple-touch-icon-120.png',  sizes: '120x120' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0093D0',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={dmSerif.className}>
      <head>
        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    reg.addEventListener('updatefound', function() {
                      var newSW = reg.installing;
                      if (newSW) {
                        newSW.addEventListener('statechange', function() {
                          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                            if (window.__showSwUpdateToast) window.__showSwUpdateToast();
                          }
                        });
                      }
                    });
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <AppProviders>
          <ConnectionIndicator />
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
