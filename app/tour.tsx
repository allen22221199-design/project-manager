'use client'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

export type TourStep = {
  view?: string            // 這一步要切到哪一頁
  target?: string          // 要框起來的元素（CSS selector）；沒有就把卡片放正中央
  chapter?: string         // 章節名；歡迎卡與結尾卡沒有
  title: string
  body: string | string[]  // 一段話，或條列
  numbered?: boolean       // 條列要不要編號（講操作順序時用）
  example?: string         // 「例如」可以輸入什麼，顯示在卡片裡
  tip?: string             // 補充提醒
  demo?: { type: 'click' | 'drag' | 'type'; text?: string }   // 電腦版的滑鼠示範；手機改成在重點區域中央閃一下
}

// 看過或按過「先自己摸索」就記在這台裝置上，之後不再自動跳出。
// 中途關掉則記住看到第幾步，下次打開可以接著看。
const DONE_KEY = 'hs_tour_done'
const STEP_KEY = 'hs_tour_step'
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k) } catch {} },
}
export const tourSeen = () => ls.get(DONE_KEY) === '1'

type Box = { top: number; left: number; width: number; height: number }
type Chapter = { name: string; first: number; count: number }
type Side = 'right' | 'bottom' | 'top' | 'left' | 'none'

// 連續同名的步驟算同一章
function chaptersOf(steps: TourStep[]): Chapter[] {
  const out: Chapter[] = []
  steps.forEach((s, i) => {
    if (!s.chapter) return
    const last = out[out.length - 1]
    if (last && last.name === s.chapter) last.count += 1
    else out.push({ name: s.chapter, first: i, count: 1 })
  })
  return out
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi))
const isFixed = (el: HTMLElement | null) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === 'fixed') return true
  return false
}

const CARD_W = 380
const GAP = 14   // 卡片與重點區域之間留給箭頭的距離
const EDGE = 16  // 卡片離畫面邊緣至少這麼多

// 新手教學：背景變暗、框住重點區域、一步一步講。
// 電腦版是貼在重點旁邊、帶箭頭的卡片；手機版是從底部（或頂部）滑出來的面板，不蓋住重點。
export default function Tour({ steps, step, onNext, onPrev, onJump, onClose, onGo }: {
  steps: TourStep[]
  step: number
  onNext: () => void
  onPrev: () => void
  onJump: (n: number) => void
  onClose: () => void
  onGo?: (view: string) => void   // 結尾卡的「接下來試試看」：關掉教學並切到那一頁
}) {
  const cur = steps[step]
  const total = steps.length
  const isFirst = step === 0
  const isLast = step === total - 1
  const chapters = chaptersOf(steps)
  const curChapter = chapters.find(c => step >= c.first && step < c.first + c.count)

  const [box, setBox] = useState<Box | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number; down: boolean } | null>(null)
  const [cardH, setCardH] = useState(320)   // 卡片實際高度（每步文字長短不一），定位時才能保證整張卡含按鈕都在畫面內
  const [vp, setVp] = useState({ w: 1440, h: 900 })
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  // 上次中途關掉時看到第幾步；只在剛打開時讀一次
  const [resumeAt] = useState(() => { const n = parseInt(ls.get(STEP_KEY) || '', 10); return n > 0 && n < total - 1 ? n : 0 })

  const finish = () => { ls.set(DONE_KEY, '1'); ls.del(STEP_KEY); onClose() }
  const skip = () => { ls.set(DONE_KEY, '1'); onClose() }
  const go = (v: string) => { finish(); onGo?.(v) }

  useEffect(() => { if (step > 0 && step < total - 1) ls.set(STEP_KEY, String(step)) }, [step, total])

  useEffect(() => {
    const upd = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    upd()
    window.addEventListener('resize', upd)
    return () => window.removeEventListener('resize', upd)
  }, [])

  // 鍵盤：→ 下一步、← 上一步、Esc 關閉（每次 render 重綁，才拿得到最新的 step）
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); skip() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (isLast) finish(); else onNext() }
      else if (e.key === 'ArrowLeft' && !isFirst) { e.preventDefault(); onPrev() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  useEffect(() => { primaryRef.current?.focus({ preventScroll: true }) }, [step])

  // 量重點區域的位置。手機要把它捲到畫面上半部（卡片在下半部）；電腦捲到中間。
  // 固定在畫面上的東西（底部導覽列、右下角圓鈕）捲了也不會動，跳過不捲。
  useEffect(() => {
    if (!cur) return
    const measure = (mayScroll: boolean) => {
      if (!cur.target) { setBox(null); return }
      const els = Array.from(document.querySelectorAll(cur.target)) as HTMLElement[]
      // 同一個 target 可能有電腦版側欄與手機版底部列兩個 → 挑看得到（有實際大小）的那個
      const el = els.find(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 }) || els[0]
      if (!el) { setBox(null); return }
      if (mayScroll && !isFixed(el)) {
        const vh = window.innerHeight
        const r0 = el.getBoundingClientRect()
        const instant = 'instant' as ScrollBehavior   // 頁面有 scroll-behavior: smooth，用 auto 會變成動畫、量到一半的位置
        if (window.innerWidth < 768) {
          if (r0.top < 64 || r0.bottom > vh * 0.5) {
            el.scrollIntoView({ block: 'start', behavior: instant })
            window.scrollBy({ top: -72, behavior: instant })   // 讓開手機版的頂部列
          }
        } else if (r0.top < 8 || r0.bottom > vh - 8) {
          el.scrollIntoView({ block: 'center', behavior: instant })
        }
      }
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) { setBox(null); return }
      const pad = 8
      setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 })
    }
    // 切頁／資料載入後再量幾次
    const raf = requestAnimationFrame(() => measure(true))
    const t1 = setTimeout(() => measure(true), 120)
    const t2 = setTimeout(() => measure(true), 400)
    const onMove = () => measure(false)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [step, cur])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [step, box, vp])

  const mobile = vp.w < 768

  // 電腦版的滑鼠示範：游標滑到重點上按一下（或按住拖一段），循環播放
  useEffect(() => {
    const demo = cur?.demo
    if (!demo || !box || mobile || demo.type === 'type') { setCursor(null); return }
    const b = box
    let timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    const clearAll = () => { timers.forEach(clearTimeout); timers = [] }
    const run = () => {
      clearAll()
      if (demo.type === 'click') {
        setCursor({ x: b.left + b.width * 0.78, y: b.top - 38, down: false })
        at(80, () => setCursor({ x: b.left + b.width / 2, y: b.top + b.height / 2, down: false }))
        at(820, () => setCursor(c => c && { ...c, down: true }))
        at(1040, () => setCursor(c => c && { ...c, down: false }))
        at(2600, run)
      } else {
        const y = b.top + Math.min(b.height * 0.5, b.height - 30)
        const x0 = b.left + b.width * 0.18
        const x1 = b.left + b.width * 0.62
        setCursor({ x: b.left + b.width * 0.5, y: b.top - 30, down: false })
        at(80, () => setCursor({ x: x0, y, down: false }))
        at(760, () => setCursor({ x: x0, y, down: true }))
        at(1000, () => setCursor({ x: x1, y, down: true }))
        at(1900, () => setCursor({ x: x1, y, down: false }))
        at(3000, run)
      }
    }
    run()
    return clearAll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, box, mobile])

  if (!cur) return null

  // ── 卡片放哪裡 ──────────────────────────────────────────────
  const th = Math.min(cardH, vp.h - 24)
  let cardW = CARD_W
  let pos: { left: number; top: number } | null = null
  let side: Side = 'none'
  let sheet: 'bottom' | 'top' | 'center' = 'center'
  let innerMax: number | undefined   // 手機面板的內容高度：只用重點以外的空間；不夠就讓內容在面板裡捲，面板不蓋到重點
  if (mobile) {
    if (box) {
      const below = vp.h - (box.top + box.height) - 16
      const above = box.top - 16
      // 整頁高的重點（整張表單）怎麼擺都放不下：固定貼底部、面板縮到最小，露出重點的開頭（表單的開頭比結尾重要）
      const tall = box.height > vp.h - 276
      sheet = tall || below >= 260 || below >= above ? 'bottom' : 'top'
      innerMax = tall ? 220 : clamp((sheet === 'bottom' ? below : above) - 16, 220, vp.h * 0.6)
    }
  } else if (box) {
    // 右 → 下 → 上 → 左，第一個完全不會蓋到重點的位置就用。左右兩邊空間不夠寬時卡片可以縮到 300。
    // 重點太大（整張表單）時哪一邊都會蓋到，就挑蓋到最少的那一邊，而且不畫箭頭（會指到卡片自己身上）。
    const right = box.left + box.width
    const bottom = box.top + box.height
    const wR = clamp(vp.w - EDGE - (right + GAP), 300, CARD_W)
    const wL = clamp(box.left - GAP - EDGE, 300, CARD_W)
    const cands: { side: Side; left: number; top: number; w: number }[] = [
      { side: 'right', left: right + GAP, top: box.top, w: wR },
      { side: 'bottom', left: box.left, top: bottom + GAP, w: CARD_W },
      { side: 'top', left: box.left, top: box.top - GAP - th, w: CARD_W },
      { side: 'left', left: box.left - GAP - wL, top: box.top, w: wL },
    ]
    let best = { side: 'none' as Side, left: EDGE, top: EDGE, w: CARD_W, area: Infinity }
    for (const c of cands) {
      const left = clamp(c.left, EDGE, vp.w - c.w - EDGE)
      const top = clamp(c.top, EDGE, vp.h - th - EDGE)
      const ox = Math.max(0, Math.min(left + c.w, right) - Math.max(left, box.left))
      const oy = Math.max(0, Math.min(top + th, bottom) - Math.max(top, box.top))
      const area = ox * oy
      if (area < best.area) best = { side: c.side, left, top, w: c.w, area }
      if (area === 0) break
    }
    pos = { left: best.left, top: best.top }
    cardW = best.w
    side = best.area === 0 ? best.side : 'none'
  } else {
    pos = { left: (vp.w - CARD_W) / 2, top: (vp.h - th) / 2 }
  }
  // 箭頭對準重點區域的中心
  let arrow: CSSProperties | null = null
  if (box && pos && side !== 'none') {
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    if (side === 'right') arrow = { left: -8, top: clamp(cy - pos.top, 24, th - 24) }
    else if (side === 'left') arrow = { right: -8, top: clamp(cy - pos.top, 24, th - 24) }
    else if (side === 'bottom') arrow = { top: -8, left: clamp(cx - pos.left, 24, cardW - 24) }
    else arrow = { bottom: -8, left: clamp(cx - pos.left, 24, cardW - 24) }
  }

  const contentIdx = step            // 第幾步（不含歡迎卡）
  const contentTotal = total - 2     // 共幾步（不含歡迎、結尾）
  const pct = (step / (total - 1)) * 100

  const bodyEl = Array.isArray(cur.body)
    ? (cur.numbered
      ? <ol className="tour-list num">{cur.body.map((t, i) => <li key={i}>{t}</li>)}</ol>
      : <ul className="tour-list">{cur.body.map((t, i) => <li key={i}>{t}</li>)}</ul>)
    : <p className="tour-p">{cur.body}</p>

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="新手教學">
      {/* 全螢幕點擊攔截：導覽中不會誤觸底下的頁面 */}
      <div className="tour-block" onClick={e => e.stopPropagation()} />

      {/* 背景變暗；有重點區域就挖一個洞露出來 */}
      {box
        ? <div className="tour-spot" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
        : <div className="tour-dim" />}

      {/* 手機沒有滑鼠：在重點中央一圈一圈擴散，提示「按這裡」 */}
      {mobile && box && cur.demo && cur.demo.type !== 'type' && (
        <span className="tour-ripple" style={{ left: box.left + box.width / 2, top: box.top + box.height / 2 }} />
      )}

      {cursor && (
        <>
          {cursor.down && cur.demo?.type === 'click' && (
            <span className="tour-ripple" style={{ left: cursor.x + 2, top: cursor.y + 2 }} />
          )}
          <svg className="tour-cursor" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"
            style={{ left: cursor.x, top: cursor.y, transform: cursor.down ? 'scale(.82)' : 'scale(1)' }}>
            <path d="M4 2 L4 19 L8.5 14.6 L11.7 21.5 L14.2 20.4 L11 13.7 L17.5 13.7 Z" fill="#ffffff" stroke="#2b2f3a" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </>
      )}

      {/* 說明卡片 */}
      <div ref={cardRef} onClick={e => e.stopPropagation()}
        className={`tour-card ${mobile ? `sheet-${sheet}` : ''}`}
        style={mobile ? undefined : { left: pos!.left, top: pos!.top, width: cardW }}>
        {arrow && <span className={`tour-arrow ${side}`} style={arrow} />}
        {mobile && sheet !== 'center' && <span className="tour-handle" aria-hidden="true" />}
        <div className="tour-inner" style={innerMax ? { maxHeight: innerMax } : undefined}>
          <div key={step} className="tour-body">
            <div className="tour-head">
              <span className="tour-chip">{isFirst ? '歡迎' : isLast ? '完成' : curChapter?.name}</span>
              {!isFirst && !isLast && <span className="tour-count">第 {contentIdx} 步，共 {contentTotal} 步</span>}
              <button className="tour-x" onClick={skip} aria-label="關閉教學" title="關閉（Esc）">✕</button>
            </div>
            <div className="tour-bar" aria-hidden="true"><div className="tour-bar-fill" style={{ width: `${pct}%` }} /></div>

            {!isFirst && !isLast && chapters.length > 1 && (
              <div className="tour-chapters" aria-label="章節">
                {chapters.map(c => {
                  const state = curChapter?.name === c.name ? 'cur' : step >= c.first + c.count ? 'done' : ''
                  return (
                    <button key={c.name} className={`tour-chap ${state}`} onClick={() => onJump(c.first)} title={`跳到「${c.name}」`}>
                      {state === 'done' ? '✓ ' : ''}{c.name}
                    </button>
                  )
                })}
              </div>
            )}

            <h2 className="tour-title">{cur.title}</h2>
            {bodyEl}
            {cur.example && (
              <div className="tour-example"><span className="tour-example-k">例如</span><span className="tour-example-v">{cur.example}</span></div>
            )}
            {cur.tip && <p className="tour-tip">💡 {cur.tip}</p>}

            {isFirst && (
              <>
                <ol className="tour-toc">
                  {chapters.map((c, i) => (
                    <li key={c.name}>
                      <span className="tour-toc-n">{i + 1}</span>
                      <span className="tour-toc-name">{c.name}</span>
                      <span className="tour-toc-cnt">{c.count} 步</span>
                      <button className="tour-toc-go" onClick={() => onJump(c.first)}>看這章 ›</button>
                    </li>
                  ))}
                </ol>
                {resumeAt > 0 && (
                  <button className="tour-resume" onClick={() => onJump(resumeAt)}>
                    ▶ 從上次看到的第 {resumeAt} 步（{steps[resumeAt].chapter}）繼續
                  </button>
                )}
              </>
            )}

            {isLast && onGo && (
              <div className="tour-go">
                <p className="tour-go-label">接下來試試看：</p>
                <button onClick={() => go('daily')}>✅ 打開今日工作</button>
                <button onClick={() => go('list')}>📋 看案件清單</button>
                <button onClick={() => go('chat')}>💬 問 AI 助理</button>
              </div>
            )}

            {/* 按鈕黏在卡片底部：內容太長要捲的時候，「下一步」也一直看得到 */}
            <div className="tour-footer">
              <div className="tour-foot">
                {!isFirst && <button className="tour-btn ghost" onClick={onPrev}>← 上一步</button>}
                <button ref={primaryRef} className="tour-btn primary" onClick={isLast ? finish : onNext}>
                  {isFirst ? '開始導覽（約 3 分鐘）' : isLast ? '完成' : '下一步 →'}
                </button>
              </div>
              {isFirst && <button className="tour-later" onClick={skip}>先自己摸索，之後再看</button>}
              {!mobile && !isFirst && <p className="tour-keys">鍵盤 ← → 可翻頁，Esc 關閉</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
