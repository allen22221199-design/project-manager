import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '專案進度管理',
  description: '施工進度回報系統',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}
