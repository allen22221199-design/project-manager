import type { Metadata, Viewport } from 'next'
import './globals.css'
import PwaRegister from './pwa-register'

export const metadata: Metadata = {
  title: '專案進度管理',
  description: '施工進度回報系統',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '煌盛專案',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  )
}
