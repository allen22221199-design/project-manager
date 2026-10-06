// 互動小特效：做完一件事時的彩帶、寫入成功的提示。
// 全部用瀏覽器內建的 DOM＋Web Animations 做，不加任何外掛，網頁不會因此變慢。
// 手機開了「減少動態效果」：彩帶和彈跳都不放，提示文字照樣出現（那是在告訴你「存好了」，不是裝飾）。

const reduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// 平的色塊、不發光，跟清晰模式的配色一致
const COLORS = ['#1D9E75', '#EF9F27', '#378ADD', '#D85A30', '#7F77DD', '#639922']

// 從某個元素的中心噴一小把彩帶。彩帶掛在 body 上、用 position: fixed，
// 不然會被卡片或捲動區的 overflow 切掉一半。
export function confettiFrom(el: Element | null | undefined, count = 22) {
  if (!el || reduced() || typeof document === 'undefined') return
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span')
    const w = 7 + Math.random() * 5
    p.style.cssText = `position:fixed;left:${cx - w / 2}px;top:${cy - w / 2}px;width:${w}px;height:${w * 0.6}px;`
      + `background:${COLORS[i % COLORS.length]};border-radius:2px;pointer-events:none;z-index:130`
    document.body.appendChild(p)
    const a = Math.random() * Math.PI * 2
    const d = 45 + Math.random() * 60
    const dx = Math.cos(a) * d
    const dy = Math.sin(a) * d - 30
    const rot = Math.random() * 540
    // 先往外噴、再往下掉、邊掉邊淡掉，一秒左右結束
    const anim = p.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx * 1.15}px,${dy + 60}px) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' })
    anim.onfinish = () => p.remove()
  }
}

// 讓元素放大再回來，像「啵」一下
export function popEl(el: Element | null | undefined) {
  if (!el || reduced() || typeof (el as HTMLElement).animate !== 'function') return
  ;(el as HTMLElement).animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
    { duration: 320, easing: 'ease-out' },
  )
}

// 完成一件事：按鈕彈一下＋彩帶
export function celebrate(el: Element | null | undefined) {
  popEl(el)
  confettiFrom(el)
}

// 畫面下方跳出一行「✓ 已經存好了」，兩秒多自己消失。同一時間只留一個。
let current: HTMLDivElement | null = null
export function toast(text: string) {
  if (typeof document === 'undefined') return
  current?.remove()
  const t = document.createElement('div')
  t.className = 'fx-toast'
  t.setAttribute('role', 'status')
  t.textContent = '✓ ' + text
  document.body.appendChild(t)
  current = t
  const frames = reduced()
    ? [{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }]
    : [
        { opacity: 0, transform: 'translate(-50%, 14px)' },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.12 },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.88 },
        { opacity: 0, transform: 'translate(-50%, -6px)' },
      ]
  const anim = t.animate(frames, { duration: 2400, easing: 'ease-out' })
  anim.onfinish = () => {
    t.remove()
    if (current === t) current = null
  }
}
