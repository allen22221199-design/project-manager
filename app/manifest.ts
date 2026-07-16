import type { MetadataRoute } from 'next'

// PWA manifest：讓網頁可以「加到主畫面」變成手機 App（全螢幕、獨立圖示）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '煌盛專案進度管理',
    short_name: '煌盛專案',
    description: '施工進度回報、任務管理與 AI 助理',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4F46E5',
    orientation: 'portrait',
    lang: 'zh-TW',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
