'use client'
import { useEffect } from 'react'

// 註冊 Service Worker（讓 App 可安裝到手機主畫面）
export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* 忽略註冊失敗 */ })
    }
  }, [])
  return null
}
