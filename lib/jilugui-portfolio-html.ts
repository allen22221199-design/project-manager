import type { Portfolio, ShareProject, ShareRecord, ShareFile } from './jilugui-share'

// 紀錄櫃「作品集網頁」：給人看的唯讀版本。資料跟「分享給 AI」同一份（buildPortfolio），只是排成網頁。
// 網址 /portfolio/<金鑰>（首頁）與 /portfolio/<金鑰>/<專案 id>（專案頁）。檔案與縮圖連結帶 7 天簽章。

const CATEGORY_ORDER = ['系統開發', '行銷', '工程', '行政', '業務', '會議', '採購', '其他']
const CAT_COLOR: Record<string, string> = { '系統開發': '#2563eb', '行銷': '#d97706', '工程': '#0f766e', '行政': '#6b7280', '業務': '#16a34a', '會議': '#7c3aed', '採購': '#ea580c', '其他': '#64748b' }
const COMPANY = '煌盛興業 EGRRA'
const OWNER = '呂理論（Alen）'
const INTRO = '煌盛興業股份有限公司是 PrinTex™ 數位紋理技術與藝格板的製造商。這裡整理總經理呂理論近年主導或親手完成的工作：系統開發、行銷內容、工程打樣與內部教育訓練。每個專案都附上成果檔案、工作紀錄，以及客戶回饋、媒體露出、平台數字這類第三方留痕。'

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const catColor = (c: string) => CAT_COLOR[c] || '#64748b'
const tw = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
const isVideo = (name: string) => /\.(mp4|mov|webm|m4v)$/i.test(name || '')
const isImage = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name || '')

// 行內：**粗體** 與網址
function inline(s: string): string {
  let t = esc(s)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(https?:\/\/[^\s<）」】]+)/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`)
  return t
}

const RT_SEP = /^\|?\s*:?-{3,}/
const RT_BLOCK = /^(#{1,3}\s|【[^】]+】|[-•]\s|\d+[.、]\s*)/
// App 的簡易排版 → HTML：| 表格 |、## 或【小標】、- 清單、1. 清單、其餘是段落（跟 app.js 的 richText 一樣的規則）
export function noteHtml(note: string): string {
  const lines = String(note || '').split(/\r?\n/).map(x => x.trim())
  const out: string[] = []
  let i = 0
  let m: RegExpExecArray | null
  while (i < lines.length) {
    const l = lines[i]
    if (!l) { i++; continue }
    if (l[0] === '|') {
      let head = true
      const rows: string[] = []
      while (i < lines.length && lines[i][0] === '|') {
        const row = lines[i++]
        if (RT_SEP.test(row)) continue
        const tag = head ? 'th' : 'td'
        const cells = row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => `<${tag}>${inline(c.trim())}</${tag}>`)
        rows.push(`<tr>${cells.join('')}</tr>`)
        head = false
      }
      out.push(`<div class="tbl"><table>${rows.join('')}</table></div>`)
      continue
    }
    if ((m = /^#{1,3}\s+(.+)$/.exec(l))) { out.push(`<h4>${inline(m[1])}</h4>`); i++; continue }
    if ((m = /^【([^】]+)】\s*(.*)$/.exec(l))) { out.push(`<h4>${inline(m[1])}</h4>`); if (m[2]) lines[i] = m[2]; else i++; continue }
    if (/^[-•]\s/.test(l)) {
      const li: string[] = []
      while (i < lines.length && /^[-•]\s/.test(lines[i])) li.push(`<li>${inline(lines[i++].replace(/^[-•]\s+/, ''))}</li>`)
      out.push(`<ul>${li.join('')}</ul>`)
      continue
    }
    if (/^\d+[.、]\s*/.test(l)) {
      const li: string[] = []
      while (i < lines.length && /^\d+[.、]\s*/.test(lines[i])) li.push(`<li>${inline(lines[i++].replace(/^\d+[.、]\s*/, ''))}</li>`)
      out.push(`<ol>${li.join('')}</ol>`)
      continue
    }
    const ps: string[] = []
    while (i < lines.length && lines[i] && lines[i][0] !== '|' && !RT_BLOCK.test(lines[i])) ps.push(inline(lines[i++]))
    if (!ps.length) { i++; continue }   // 保險：像「# 」這種只有標記的行，跳過不卡住
    out.push(`<p>${ps.join('<br>')}</p>`)
  }
  return out.join('\n')
}

const CSS = `
:root{--bg:#f6f3ee;--paper:#fff;--ink:#1f1d1a;--ink2:#5c574f;--line:#e6e0d6;--acc:#0f766e;--soft:rgba(0,0,0,.04)}
@media(prefers-color-scheme:dark){:root{--bg:#141311;--paper:#1e1c19;--ink:#f1ede6;--ink2:#b8b1a6;--line:#2e2b26;--acc:#5eead4;--soft:rgba(255,255,255,.06)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,"Segoe UI","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--acc)}.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
header.top{padding:40px 0 18px}.brand{font-size:13px;letter-spacing:.08em;color:var(--ink2)}.brand a{color:inherit;text-decoration:none}
h1{font-size:clamp(26px,4vw,38px);margin:8px 0 10px;line-height:1.25}.intro{max-width:780px;color:var(--ink2);margin:0 0 18px}
.stats{display:flex;gap:22px;flex-wrap:wrap;margin:0 0 18px}.stat b{font-size:24px;display:block;line-height:1.1}.stat span{font-size:13px;color:var(--ink2)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 6px}.chip{border:1px solid var(--line);background:var(--paper);border-radius:999px;padding:5px 14px;font-size:14px;cursor:pointer;color:var(--ink2);font-family:inherit}.chip.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
section.cat{margin:26px 0}section.cat h2{font-size:18px;margin:0 0 12px;display:flex;align-items:center;gap:10px}.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column;transition:transform .15s,box-shadow .15s}.card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.1)}
.cover{aspect-ratio:16/10;background:#e9e4dc;display:flex;align-items:center;justify-content:center;overflow:hidden}.cover img{width:100%;height:100%;object-fit:cover;display:block}.cover .ph{font-size:40px;color:#b9b0a3}
.card .body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px}.meta{font-size:12px;color:var(--ink2);display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tag{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;color:#fff}.st{border:1px solid var(--line);border-radius:999px;padding:0 8px}
.card h3{font-size:16px;margin:2px 0;line-height:1.4}.sum{font-size:14px;color:var(--ink2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
footer{padding:40px 0;color:var(--ink2);font-size:13px}
.back{display:inline-block;margin:24px 0 12px;font-size:14px}.hero{border-radius:16px;overflow:hidden;background:#e9e4dc;max-height:440px}.hero img{width:100%;max-height:440px;object-fit:cover;display:block}
.ph1{margin:18px 0 6px}.pmeta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:14px;color:var(--ink2);margin:0 0 14px}.btn{display:inline-block;border:1px solid var(--line);background:var(--paper);border-radius:999px;padding:4px 14px;font-size:14px;text-decoration:none;color:var(--ink)}
.rich{max-width:900px}.rich table{border-collapse:collapse;width:100%;font-size:14px}.rich th,.rich td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}.rich th{background:var(--soft)}.tbl{overflow-x:auto;margin:10px 0}.rich h4{margin:16px 0 6px;font-size:15px}.rich p{margin:8px 0}.rich ul,.rich ol{margin:6px 0 6px 22px}
h2.sec{font-size:20px;margin:34px 0 12px;padding-top:18px;border-top:1px solid var(--line)}
.files{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.file{background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}.file .cover{aspect-ratio:4/3}.file .cover img{object-fit:contain;background:var(--soft)}.file .body{padding:10px 12px;font-size:14px;display:flex;flex-direction:column;gap:4px}.file .name{font-weight:600;word-break:break-all;line-height:1.4}.file .note{font-size:13px;color:var(--ink2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.file .acts{display:flex;gap:12px;font-size:13px;margin-top:4px}video{width:100%;background:#000;display:block;aspect-ratio:16/9}
.rec{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 14px}.rec .date{font-size:13px;color:var(--ink2)}.rec h3{margin:2px 0 6px;font-size:17px;line-height:1.4}.fchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.fchips span{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:1px 9px;color:var(--ink2)}
.empty{color:var(--ink2);font-size:14px}
`

function page(opt: { title: string; desc: string; body: string; ogImage?: string; url?: string }): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opt.title)}</title>
<meta name="description" content="${esc(opt.desc)}">
<meta name="robots" content="noindex,nofollow">
<meta property="og:title" content="${esc(opt.title)}">
<meta property="og:description" content="${esc(opt.desc)}">
${opt.ogImage ? `<meta property="og:image" content="${esc(opt.ogImage)}">` : ''}
${opt.url ? `<meta property="og:url" content="${esc(opt.url)}">` : ''}
<meta property="og:type" content="website">
<style>${CSS}</style>
</head>
<body>${opt.body}</body>
</html>`
}

function cardHtml(p: ShareProject, key: string): string {
  const cover = p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : `<span class="ph">${esc((p.name || '＃').slice(0, 1))}</span>`
  const meta = [`紀錄 ${p.records.length}`, `檔案 ${p.files.length}`, p.lastDate ? `最近 ${p.lastDate}` : ''].filter(Boolean).join('・')
  return `<a class="card" href="/portfolio/${esc(key)}/${esc(p.id)}">
  <div class="cover">${cover}</div>
  <div class="body">
    <div class="meta"><span class="tag" style="background:${catColor(p.category)}">${esc(p.category || '其他')}</span><span class="st">${esc(p.status || '—')}</span></div>
    <h3>${esc(p.name)}</h3>
    <div class="sum">${esc(p.summary)}</div>
    <div class="meta">${esc(meta)}</div>
  </div>
</a>`
}

export function portfolioIndexHtml(p: Portfolio, key: string): string {
  const cats = CATEGORY_ORDER.filter(c => p.projects.some(x => (x.category || '其他') === c))
  const extra = Array.from(new Set(p.projects.map(x => x.category || '其他'))).filter(c => !cats.includes(c))
  const allCats = [...cats, ...extra]
  const sections = allCats.map(c => {
    const items = p.projects.filter(x => (x.category || '其他') === c)
    return `<section class="cat" data-cat="${esc(c)}"><h2><span class="dot" style="background:${catColor(c)}"></span>${esc(c)}<span class="meta">${items.length} 個專案</span></h2><div class="grid">${items.map(x => cardHtml(x, key)).join('\n')}</div></section>`
  }).join('\n')
  const chips = ['全部', ...allCats].map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('')
  const body = `<div class="wrap">
<header class="top">
  <div class="brand">${esc(COMPANY)}｜PrinTex™ 數位紋理・藝格板</div>
  <h1>${esc(OWNER)} 工作作品集</h1>
  <p class="intro">${esc(INTRO)}</p>
  <div class="stats"><div class="stat"><b>${p.stats.projects}</b><span>專案</span></div><div class="stat"><b>${p.stats.records}</b><span>工作紀錄</span></div><div class="stat"><b>${p.stats.files}</b><span>檔案</span></div></div>
  <div class="chips" id="chips">${chips}</div>
</header>
${sections}
<footer>此頁由紀錄櫃 App 在 ${esc(tw(p.generatedAt))}（台北）產生，資料來自 Notion「紀錄櫃」；檔案與縮圖連結到 ${esc(tw(p.linkExpiresAt))} 前有效，之後重新整理即可。</footer>
</div>
<script>
(function(){var chips=document.querySelectorAll('#chips .chip'),secs=document.querySelectorAll('section.cat');
chips.forEach(function(c){c.addEventListener('click',function(){chips.forEach(function(x){x.classList.remove('on')});c.classList.add('on');var v=c.getAttribute('data-cat');secs.forEach(function(s){s.style.display=(v==='全部'||s.getAttribute('data-cat')===v)?'':'none'})})})})();
</script>`
  const og = p.projects.find(x => x.cover)?.cover
  return page({ title: `${OWNER} 工作作品集｜${COMPANY}`, desc: INTRO, body, ogImage: og, url: `${p.origin}/portfolio/${key}` })
}

function fileHtml(f: ShareFile): string {
  let media: string
  if (f.url && isVideo(f.name)) media = `<video controls preload="metadata"${f.thumb ? ` poster="${esc(f.thumb)}"` : ''} src="${esc(f.url)}"></video>`
  else if (f.thumb) media = `<a class="cover" href="${esc(f.url || '#')}" target="_blank" rel="noopener"><img src="${esc(f.thumb)}" alt="" loading="lazy"></a>`
  else media = `<div class="cover"><span class="ph">${esc((f.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4))}</span></div>`
  const acts = f.url ? `<div class="acts"><a href="${esc(f.url)}" target="_blank" rel="noopener">開啟</a><a href="${esc(f.download)}">下載</a></div>` : ''
  return `<div class="file">${media}<div class="body"><div class="name">${esc(f.name)}</div><div class="meta">${f.category ? `<span class="st">${esc(f.category)}</span>` : ''}${f.date ? `<span>${esc(f.date)}</span>` : ''}</div>${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}${acts}</div></div>`
}

function recordHtml(r: ShareRecord): string {
  const meta = [r.status ? `<span class="st">${esc(r.status)}</span>` : '', r.category ? `<span class="tag" style="background:${catColor(r.category)}">${esc(r.category)}</span>` : '', ...r.tags.map(t => `<span class="st">${esc(t)}</span>`), r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">連結 ↗</a>` : ''].filter(Boolean).join('')
  const files = r.files.length ? `<div class="fchips">${r.files.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''
  const att = r.attachments.length ? `<div class="fchips">${r.attachments.map(a => `<a class="st" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join('')}</div>` : ''
  return `<article class="rec"><div class="date">${esc(r.date || '（無日期）')}</div><h3>${esc(r.title)}</h3><div class="meta">${meta}</div>${r.note ? `<div class="rich">${noteHtml(r.note)}</div>` : ''}${files}${att}</article>`
}

export function projectHtml(p: Portfolio, pr: ShareProject, key: string): string {
  const files = pr.files
  const visual = files.filter(f => f.thumb || isVideo(f.name) || isImage(f.name))
  const others = files.filter(f => !visual.includes(f))
  const body = `<div class="wrap">
<a class="back" href="/portfolio/${esc(key)}">← 回作品集</a>
<div class="brand"><a href="/portfolio/${esc(key)}">${esc(COMPANY)}｜${esc(OWNER)} 工作作品集</a></div>
${pr.cover ? `<div class="hero" style="margin-top:12px"><img src="${esc(pr.cover)}" alt=""></div>` : ''}
<h1 class="ph1">${esc(pr.name)}</h1>
<div class="pmeta"><span class="tag" style="background:${catColor(pr.category)}">${esc(pr.category || '其他')}</span><span class="st">${esc(pr.status || '—')}</span>${pr.lastDate ? `<span>最近 ${esc(pr.lastDate)}</span>` : ''}<span>紀錄 ${pr.records.length}・檔案 ${pr.files.length}</span>${pr.link ? `<a class="btn" href="${esc(pr.link)}" target="_blank" rel="noopener">開啟連結 ↗</a>` : ''}</div>
${pr.note ? `<div class="rich">${noteHtml(pr.note)}</div>` : ''}
<h2 class="sec">成果檔案（${files.length}）</h2>
${files.length ? `<div class="files">${[...visual, ...others].map(fileHtml).join('\n')}</div>` : '<p class="empty">這個專案沒有放檔案（例如 SOP、說明書類只留紀錄）。</p>'}
<h2 class="sec">工作紀錄（${pr.records.length}）</h2>
${pr.records.length ? pr.records.map(recordHtml).join('\n') : '<p class="empty">沒有紀錄。</p>'}
<footer>此頁由紀錄櫃 App 在 ${esc(tw(p.generatedAt))}（台北）產生；檔案與縮圖連結到 ${esc(tw(p.linkExpiresAt))} 前有效。</footer>
</div>`
  return page({ title: `${pr.name}｜${OWNER} 工作作品集`, desc: pr.summary || INTRO, body, ogImage: pr.cover || undefined, url: `${p.origin}/portfolio/${key}/${pr.id}` })
}
