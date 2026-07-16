// 極簡 Service Worker：讓 App 可安裝（Android 安裝提示需要），請求一律直接走網路（不快取，避免內容過期）
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => { /* pass-through：不攔截，維持即時最新資料 */ })
