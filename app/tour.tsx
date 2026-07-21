'use client'
import { useEffect, useState } from 'react'

export type TourStep = { view?: string; target?: string; title: string; body: string }

// 新手引導：背景變暗、框住(spotlight)重點區域、一步步說明每項功能
export default function Tour({
  steps, step, onNext, onPrev, onClose,
}: {
  steps: TourStep[]
  step: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const cur = steps[step]

  useEffect(() => {
    if (!cur) return
    let raf = 0
    const measure = () => {
      if (!cur.target) { setBox(null); return }
      const el = document.querySelector(cur.target) as HTMLElement | null
      if (!el) { setBox(null); return }
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      const r = el.getBoundingClientRect()
      const pad = 8
      setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 })
    }
    // 等切換頁面／資料載入後再量一次位置
    const t1 = setTimeout(measure, 80)
    const t2 = setTimeout(measure, 320)
    raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, cur])

  if (!cur) return null
  const isFirst = step === 0
  const isLast = step === steps.length - 1
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const TW = 340
  const TH = 210

  // 決定說明框位置：右→下→上→左，選第一個放得下的；沒有 target 就置中
  let tip = { left: (vw - TW) / 2, top: (vh - TH) / 2 }
  if (box) {
    if (box.left + box.width + 16 + TW <= vw) tip = { left: box.left + box.width + 16, top: box.top }
    else if (box.top + box.height + 16 + TH <= vh) tip = { left: box.left, top: box.top + box.height + 16 }
    else if (box.top - 16 - TH >= 0) tip = { left: box.left, top: box.top - 16 - TH }
    else tip = { left: box.left - 16 - TW, top: box.top }
    tip.left = Math.max(16, Math.min(tip.left, vw - TW - 16))
    tip.top = Math.max(16, Math.min(tip.top, vh - TH - 16))
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 100 }}>
      {/* 全螢幕點擊攔截（透明，避免導覽中誤觸頁面）*/}
      <div className="absolute inset-0" onClick={e => e.stopPropagation()} />
      {/* 背景變暗 + 重點區域挖空(spotlight) */}
      {box ? (
        <div style={{
          position: 'absolute', top: box.top, left: box.left, width: box.width, height: box.height,
          borderRadius: 14, boxShadow: '0 0 0 9999px rgba(13,16,28,0.66)', pointerEvents: 'none',
          transition: 'top .25s ease, left .25s ease, width .25s ease, height .25s ease',
          outline: '2px solid rgba(146,168,255,0.9)', outlineOffset: 0,
        }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,16,28,0.66)' }} />
      )}

      {/* 說明卡片 */}
      <div onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', left: tip.left, top: tip.top, width: TW, transition: 'left .25s ease, top .25s ease' }}
        className="rounded-2xl p-5 shadow-2xl"
      >
        <div style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)', borderRadius: 16 }} className="p-5 border border-white/90">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: '#4a7fd6' }}>步驟 {step + 1} / {steps.length}</span>
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">跳過 ✕</button>
          </div>
          <p className="text-lg font-extrabold text-gray-900 mb-1.5">{cur.title}</p>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{cur.body}</p>
          {/* 進度點 */}
          <div className="flex items-center gap-1.5 mb-4">
            {steps.map((_, i) => (
              <span key={i} style={{ width: i === step ? 18 : 6, height: 6, borderRadius: 999, background: i === step ? 'linear-gradient(90deg,#6ea8fe,#a86efe)' : 'rgba(120,130,170,0.28)', transition: 'width .2s' }} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button onClick={onPrev} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2 rounded-lg border border-gray-200">上一步</button>
            )}
            <button onClick={isLast ? onClose : onNext}
              className="flex-1 aurora-grad text-white rounded-lg py-2.5 text-sm font-bold hover:brightness-105">
              {isLast ? '開始使用 🎉' : '下一步 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
