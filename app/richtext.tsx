'use client'
import React from 'react'

export type Media = { source: string; url: string; caption: string; kind?: 'image' | 'video' | 'embed' }

// 圖片／影片卡片：內文中插入與最後附上都用同一個元件，樣式才一致
export function MediaCard({ item, inline = false }: { item: Media; inline?: boolean }) {
  const title = item.caption || item.source
  const bar = (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white">
      <p className="text-xs font-semibold text-gray-700 truncate" title={`${item.source}${item.caption ? '｜' + item.caption : ''}`}>
        {item.kind === 'image' ? '🖼️' : '🎬'} {title}
      </p>
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline shrink-0 no-underline">
        放大觀看 ↗
      </a>
    </div>
  )
  const wrap = `rounded-xl overflow-hidden border shadow-sm ${inline ? 'my-3 border-indigo-200' : 'border-gray-200'}`
  if (item.kind === 'embed') {
    return (
      <div className={`${wrap} bg-black`}>
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe src={item.url} title={title} loading="lazy" allowFullScreen
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            className="absolute inset-0 w-full h-full border-0" />
        </div>
        {bar}
      </div>
    )
  }
  if (item.kind === 'video') {
    return (
      <div className={`${wrap} bg-black`}>
        <video src={item.url} controls playsInline preload="metadata"
          className="w-full bg-black block" style={{ maxHeight: '70vh' }} />
        {bar}
      </div>
    )
  }
  return (
    <div className={`${wrap} bg-gray-50`}>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block no-underline">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt={title} loading="lazy"
          className="w-full object-contain bg-white" style={{ maxHeight: inline ? '60vh' : '28vh' }} />
      </a>
      {bar}
    </div>
  )
}

// 同一列（同一個來源）有多張圖時，排成一排一起顯示。
// 一列放好幾張通常是「同一件事的不同角度」，分開一張一張直式堆疊會佔掉整個畫面、
// 也看不出它們是一組的。圖多就自動縮小、換行排。
export function MediaGroup({ items, inline = false }: { items: Media[]; inline?: boolean }) {
  if (items.length === 0) return null
  // 影片跟嵌入不縮小排版，維持原本一支一支顯示
  const pics = items.filter(m => m.kind === 'image')
  const rest = items.filter(m => m.kind !== 'image')
  if (pics.length <= 1) {
    return <>{items.map((m, i) => <MediaCard key={i} item={m} inline={inline} />)}</>
  }
  const g = items[0]
  // 2 張各佔一半、3 張以上就三欄；縮圖高度隨張數遞減，整組不超過原本一張的高度
  const cols = pics.length === 2 ? 2 : 3
  const h = pics.length === 2 ? '22vh' : '16vh'
  return (
    <>
      <div className={`rounded-xl overflow-hidden border shadow-sm bg-gray-50 ${inline ? 'my-3 border-indigo-200' : 'border-gray-200'}`}>
        <div className="grid gap-0.5 bg-gray-200" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {pics.map((m, i) => (
            <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="block no-underline bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.caption || m.source} loading="lazy"
                className="w-full object-contain bg-white" style={{ maxHeight: h }} />
            </a>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white">
          <p className="text-xs font-semibold text-gray-700 truncate" title={`${g.source}｜${g.caption ?? ''}`}>
            🖼️ {g.caption || g.source}
            <span className="ml-1 font-normal text-gray-400">（{pics.length} 張）</span>
          </p>
        </div>
      </div>
      {rest.map((m, i) => <MediaCard key={`r${i}`} item={m} inline={inline} />)}
    </>
  )
}

// AI 回答的輕量排版器（不裝任何套件，避免建置風險）。
// 只處理三種最常見的格式：**粗體**、條列（* - ・）、編號清單（1. 2.），
// 其餘一律照原樣輸出。目的是讓現場師傅在手機上看得清楚，不要看到一堆星號。

// 行內：把 **粗體** 轉成實際的粗體
function inline(text: string, kp: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<strong key={`${kp}b${i++}`} className="font-bold text-gray-900">{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out.length ? out : [text]
}

type Item = { ordered: boolean; text: string }

export default function RichText({ text, media = [] }: { text: string; media?: Media[] }) {
  // AI 偶爾會把 [[MEDIA:n]] 寫在句尾而不是獨立一行 → 先斷行，讓下面只需處理「整行就是標記」的情況，
  // 免得使用者看到 "[[MEDIA:2]]" 這串字
  const lines = (text ?? '')
    .replace(/[ \t]*\[\[MEDIA:(\d{1,2})\]\]/gi, '\n[[MEDIA:$1]]\n')
    .split('\n')
  const blocks: React.ReactNode[] = []
  let buf: Item[] = []
  let k = 0

  // 把累積的清單項目輸出成一個區塊
  const flush = () => {
    if (buf.length === 0) return
    const items = buf
    buf = []
    const ordered = items[0].ordered
    blocks.push(
      <div key={`l${k++}`} className="my-2 space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className={`shrink-0 ${ordered ? 'font-bold text-indigo-600 min-w-[1.4em]' : 'text-indigo-500'}`}>
              {ordered ? `${i + 1}.` : '・'}
            </span>
            <span className="flex-1 leading-relaxed">{inline(it.text, `i${k}-${i}-`)}</span>
          </div>
        ))}
      </div>
    )
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const t = line.trim()

    // [[MEDIA:n]] → 把那張圖／那支影片直接插在這個位置（AI 判斷它屬於前一個步驟）
    const mk = t.match(/^\[\[MEDIA:(\d{1,2})\]\]$/i)
    if (mk) {
      flush()
      const item = media[Number(mk[1]) - 1]
      if (item) {
        // AI 只會標一個編號，但同一個來源（Notion 同一列）常常放了好幾張。
        // 標到其中一張就把「整組」一起插在這個步驟旁邊，不要把一組拆成
        // 一張在內文、其餘掉到頁尾——那樣師傅根本看不出它們是同一件事。
        const group = item.kind === 'image'
          ? media.filter(m => m.kind === 'image' && m.source === item.source)
          : [item]
        blocks.push(<MediaGroup key={`m${k++}`} items={group} inline />)
      }
      continue
    }

    // 資料來源頁尾：用分隔線和淡色小字，跟內文分開
    if (/^(?:──+|-{3,}|—{2,})$/.test(t)) { flush(); continue }
    if (/^📎/.test(t)) {
      flush()
      blocks.push(
        <p key={`s${k++}`} className="mt-3 pt-2 border-t border-gray-200 text-xs text-gray-500 leading-relaxed">
          {t}
        </p>
      )
      continue
    }

    // 標題（### 或 ## ）→ 獨立一行的粗體
    const h = t.match(/^#{2,4}\s+(.*)$/)
    if (h) {
      flush()
      blocks.push(<p key={`h${k++}`} className="mt-3 mb-1 font-bold text-gray-900">{inline(h[1], `h${k}-`)}</p>)
      continue
    }

    // 編號清單：1. / 1) / １．
    const ol = t.match(/^(\d{1,2})[.)、]\s+(.*)$/)
    if (ol) {
      if (buf.length && !buf[0].ordered) flush()
      buf.push({ ordered: true, text: ol[2] })
      continue
    }

    // 項目符號：* - • ・
    const ul = t.match(/^[*\-•・]\s+(.*)$/)
    if (ul) {
      if (buf.length && buf[0].ordered) flush()
      buf.push({ ordered: false, text: ul[1] })
      continue
    }

    flush()
    if (t === '') {
      blocks.push(<div key={`sp${k++}`} className="h-2" />)
    } else {
      blocks.push(<p key={`p${k++}`} className="leading-relaxed">{inline(line, `p${k}-`)}</p>)
    }
  }
  flush()

  return <div>{blocks}</div>
}
