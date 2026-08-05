'use client'
import React from 'react'

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

export default function RichText({ text }: { text: string }) {
  const lines = (text ?? '').split('\n')
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
