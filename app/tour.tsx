'use client'
import { useEffect, useState } from 'react'

export type TourStep = { view?: string; target?: string; title: string; body: string; demo?: { type: 'type' | 'click' | 'drag'; text?: string } }

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
  const [typed, setTyped] = useState('')
  const [cursor, setCursor] = useState<{ x: number; y: number; down: boolean } | null>(null)
  const [paint, setPaint] = useState(0)   // 拖曳塗色示範：目前塗了幾格
  const cur = steps[step]

  // 打字示範：一個字一個字打出，打完停一下再重來
  useEffect(() => {
    const demo = cur?.demo
    if (!demo || demo.type !== 'type' || !demo.text) { setTyped(''); return }
    const full = demo.text
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (i <= full.length) { setTyped(full.slice(0, i)); i += 1; timer = setTimeout(tick, 115) }
      else { timer = setTimeout(() => { i = 0; setTyped(''); timer = setTimeout(tick, 350) }, 1500) }
    }
    tick()
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cur])

  // 滑鼠箭頭示範：游標移動 →（點擊 / 打字 / 拖曳塗色），循環播放，讓觀看者看到實際操作
  useEffect(() => {
    const demo = cur?.demo
    if (!demo || !box) { setCursor(null); setPaint(0); return }
    const b = box
    let timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    const clearAll = () => { timers.forEach(clearTimeout); timers = [] }
    const run = () => {
      clearAll()
      if (demo.type === 'click') {
        setCursor({ x: b.left + b.width * 0.78, y: b.top - 38, down: false })
        at(80, () => setCursor({ x: b.left + b.width / 2, y: b.top + b.height / 2, down: false }))  // 游標滑向目標
        at(820, () => setCursor(c => c && { ...c, down: true }))   // 按下
        at(1040, () => setCursor(c => c && { ...c, down: false }))
        at(2400, run)  // 循環
      } else if (demo.type === 'type') {
        const inputY = b.top + (b.height > 120 ? 66 : b.height / 2)
        setCursor({ x: b.left + b.width * 0.62, y: b.top - 26, down: false })
        at(80, () => setCursor({ x: b.left + 40, y: inputY, down: false }))  // 滑到輸入框
        at(760, () => setCursor(c => c && { ...c, down: true }))   // 點進去
        at(940, () => setCursor(c => c && { ...c, down: false }))
        // 之後打字由 typed 動畫接手；游標停在輸入框附近
      } else if (demo.type === 'drag') {
        const y = b.top + Math.min(b.height * 0.5, b.height - 70)
        const x0 = b.left + b.width * 0.14
        const x1 = b.left + b.width * 0.42
        setPaint(0)
        setCursor({ x: b.left + b.width * 0.5, y: b.top - 30, down: false })
        at(80, () => setCursor({ x: x0, y, down: false }))         // 滑到起點
        at(760, () => { setCursor(c => c && { ...c, down: true }); setPaint(1) })  // 按住
        at(1020, () => { setCursor({ x: x0 + (x1 - x0) * 0.35, y, down: true }); setPaint(2) })  // 拖…塗色
        at(1300, () => { setCursor({ x: x0 + (x1 - x0) * 0.7, y, down: true }); setPaint(3) })
        at(1580, () => { setCursor({ x: x1, y, down: true }); setPaint(4) })
        at(1860, () => setCursor(c => c && { ...c, down: false }))  // 放開
        at(2900, () => { setPaint(0); run() })  // 重來
      }
    }
    run()
    return clearAll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, box])

  useEffect(() => {
    if (!cur) return
    let raf = 0
    const measure = () => {
      if (!cur.target) { setBox(null); return }
      // 同一個 target 可能有電腦版側欄與手機版底部列兩個 → 挑「看得到」(有實際大小)的那個
      const els = Array.from(document.querySelectorAll(cur.target)) as HTMLElement[]
      const el = els.find(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 }) || els[0]
      if (!el) { setBox(null); return }
      // 若重點區域不在畫面內（頁面下方），先「立即」捲進畫面（用 auto 避免動畫造成量測偏差）
      const r0 = el.getBoundingClientRect()
      if (r0.top < 8 || r0.bottom > window.innerHeight - 8) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' })
      }
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) { setBox(null); return }
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

      {/* 拖曳塗色示範：沿路塗出的格子 */}
      {box && cur.demo?.type === 'drag' && Array.from({ length: paint }).map((_, i) => {
        const y = box.top + Math.min(box.height * 0.5, box.height - 70)
        const cw = box.width * 0.066
        return <div key={i} style={{
          position: 'absolute', left: box.left + box.width * 0.14 + i * (box.width * 0.072), top: y - 15,
          width: cw, height: 30, borderRadius: 6,
          background: 'rgba(110,168,254,0.5)', border: '1.5px solid rgba(110,168,254,0.95)',
          transition: 'opacity .2s', pointerEvents: 'none',
        }} />
      })}

      {/* 打字示範：範例字一個一個打出（配合游標移到輸入框）*/}
      {box && cur.demo?.type === 'type' && typed && (
        <div className="tour-type" style={{
          left: box.left + 18,
          top: box.top + (box.height > 120 ? 60 : Math.max(10, box.height / 2 - 15)),
          maxWidth: box.width - 40,
        }}>
          {typed}<span className="tour-caret" style={{ height: 16 }}>&nbsp;</span>
        </div>
      )}

      {/* 模擬滑鼠箭頭：會移動、按下、拖曳，讓觀看者看到實際操作 */}
      {cursor && (
        <>
          {cursor.down && cur.demo?.type === 'click' && (
            <span className="tour-ripple" style={{ position: 'absolute', left: cursor.x + 2, top: cursor.y + 2 }} />
          )}
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"
            style={{
              position: 'absolute', left: cursor.x, top: cursor.y, zIndex: 3, pointerEvents: 'none',
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
              transition: 'left .55s cubic-bezier(.4,0,.2,1), top .55s cubic-bezier(.4,0,.2,1), transform .12s',
              transform: cursor.down ? 'scale(.82)' : 'scale(1)',
            }}>
            <path d="M4 2 L4 19 L8.5 14.6 L11.7 21.5 L14.2 20.4 L11 13.7 L17.5 13.7 Z" fill="#ffffff" stroke="#2b2f3a" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </>
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
