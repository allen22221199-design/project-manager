import type { Portfolio, ShareProject, ShareRecord, ShareFile } from './jilugui-share'

// 紀錄櫃「作品集網頁」：給人看的唯讀版本。資料跟「分享給 AI」同一份（buildPortfolio），只是排成網頁。
// 網址 /portfolio/<金鑰>（首頁）、/portfolio/<金鑰>/<專案 id>（專案頁）、/portfolio/<金鑰>?all=1（列印版）。
// 視覺跟官網同一套：深色大面積、暖石色紙面、香檳金點綴、襯線標題（Noto Serif TC）。

const CATEGORY_ORDER = ['系統開發', '行銷', '工程', '行政', '業務', '會議', '採購', '其他']
const CAT_EN: Record<string, string> = { '系統開發': 'SYSTEMS', '行銷': 'MARKETING', '工程': 'ENGINEERING', '行政': 'OPERATIONS', '業務': 'SALES', '會議': 'MEETINGS', '採購': 'PROCUREMENT', '其他': 'OTHERS' }
const COMPANY = '煌盛興業 EGRRA'
const OWNER = '呂理論'
const OWNER_EN = 'Alen Lu'
const INTRO = '煌盛興業是 PrinTex™ 數位紋理技術與藝格板的製造商，四十多年金屬板製造與大理石紋開發經驗。這裡整理總經理呂理論近年主導或親手完成的工作：系統開發、行銷內容、工程打樣與內部教育訓練。每個專案都附上成果檔案、工作紀錄，以及客戶回饋、媒體露出、平台數字這類第三方留痕。'

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const catEn = (c: string) => CAT_EN[c] || 'OTHERS'
const tw = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
const isVideo = (name: string) => /\.(mp4|mov|webm|m4v)$/i.test(name || '')
const isImage = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name || '')
const extOf = (name: string) => (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4)
const year = (d: string) => (d || '').slice(0, 4)

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

// 細噪點（SVG），鋪在深色區塊上做出紙與石材的質感
const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`

const CSS = `
:root{--bg:#f4f1ec;--paper:#fffdfa;--ink:#1b1a18;--muted:#6f6962;--line:#e4ddd2;--gold:#a8884f;--gold-2:#d8bd8a;--dark:#15171a;--dark-2:#1f2126;--shadow:0 1px 2px rgba(20,16,10,.04),0 18px 40px -24px rgba(20,16,10,.35)}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 "Noto Sans TC","PingFang TC","Microsoft JhengHei",-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
.serif{font-family:"Noto Serif TC","Songti TC","PMingLiU",serif}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.eyebrow{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold-2);font-weight:500}
/* 首頁大圖區 */
.hero{position:relative;overflow:hidden;background:var(--dark);color:#f4efe6;isolation:isolate}
.hero:before{content:"";position:absolute;inset:0;z-index:-2;background:radial-gradient(1100px 520px at 8% -10%,rgba(216,189,138,.22),transparent 60%),radial-gradient(900px 480px at 100% 110%,rgba(168,136,79,.2),transparent 60%),linear-gradient(135deg,#1c1e22 0%,#121416 55%,#1a1814 100%)}
.hero:after{content:"";position:absolute;inset:0;z-index:-1;background-image:${NOISE};opacity:.14;mix-blend-mode:overlay}
.hero .wrap{padding:72px 20px 56px}
.hero h1{font-family:"Noto Serif TC","Songti TC","PMingLiU",serif;font-weight:700;font-size:clamp(34px,5.2vw,58px);line-height:1.15;margin:14px 0 6px;letter-spacing:.01em}
.hero .sub{font-family:"Noto Serif TC",serif;font-size:clamp(15px,1.6vw,19px);color:var(--gold-2);letter-spacing:.12em;margin:0 0 22px}
.hero .intro{max-width:720px;font-size:15.5px;line-height:1.9;color:#d9d2c6;margin:0 0 30px}
.rule{width:56px;height:2px;background:linear-gradient(90deg,var(--gold-2),transparent);margin:0 0 20px}
.stats{display:flex;gap:40px;flex-wrap:wrap;margin:0 0 26px}
.stat b{font-family:"Noto Serif TC",serif;font-size:40px;line-height:1;display:block;color:#fff}.stat span{font-size:12px;letter-spacing:.14em;color:var(--gold-2)}
.layers{display:flex;gap:10px;flex-wrap:wrap}.layers span{font-size:12px;letter-spacing:.08em;color:#cfc6b7;border:1px solid rgba(216,189,138,.35);border-radius:999px;padding:5px 12px}
/* 分類列（黏在上方） */
.catnav{position:sticky;top:0;z-index:20;background:rgba(244,241,236,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.catnav .wrap{display:flex;gap:8px;overflow-x:auto;padding:10px 20px;scrollbar-width:none}.catnav .wrap::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;border:1px solid var(--line);background:var(--paper);border-radius:999px;padding:6px 16px;font-size:13.5px;cursor:pointer;color:var(--muted);font-family:inherit;letter-spacing:.04em;transition:all .15s}.chip:hover{border-color:var(--gold)}.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
/* 區塊 */
section.cat{padding:38px 0 6px}.sec-head{display:flex;align-items:baseline;gap:14px;margin:0 0 18px}
.sec-head h2{font-family:"Noto Serif TC",serif;font-size:26px;margin:0;font-weight:700}.sec-head .en{font-size:11px;letter-spacing:.24em;color:var(--gold);font-weight:600}.sec-head .n{font-size:13px;color:var(--muted);margin-left:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
.featured{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.featured .card{border-top:3px solid var(--gold)}.featured .card h3{font-size:20px}
@media(max-width:899px){.featured{grid-template-columns:1fr}}
.card{position:relative;background:var(--paper);border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column;box-shadow:var(--shadow);transition:transform .25s ease,box-shadow .25s ease}
.card:hover{transform:translateY(-4px);box-shadow:0 2px 4px rgba(20,16,10,.05),0 30px 50px -24px rgba(20,16,10,.45);text-decoration:none}
.cover{aspect-ratio:3/2;background:linear-gradient(135deg,#e7e0d4,#d6ccbc);overflow:hidden;position:relative}
.cover img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s ease}.card:hover .cover img{transform:scale(1.04)}
.cover .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:"Noto Serif TC",serif;font-size:56px;color:rgba(80,64,40,.25)}
.card .body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:6px;flex:1}
.kicker{display:flex;justify-content:space-between;align-items:center;font-size:11px;letter-spacing:.2em;color:var(--gold);font-weight:600}.kicker .st{color:var(--muted);letter-spacing:.04em;font-weight:400;font-size:12px}
.card h3{font-family:"Noto Serif TC",serif;font-size:18px;margin:0;line-height:1.45;font-weight:700}
.sum{font-size:14px;color:var(--muted);line-height:1.7;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .meta{margin-top:auto;padding-top:10px;font-size:12px;color:var(--muted);display:flex;gap:12px;border-top:1px solid var(--line)}
/* 專案頁 */
.phead{position:relative;background:var(--dark);color:#f4efe6;overflow:hidden;isolation:isolate}
.phead .bg{position:absolute;inset:0;z-index:-2;background-size:cover;background-position:center;filter:saturate(.9)}
.phead .veil{position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(18,20,22,.55) 0%,rgba(18,20,22,.72) 60%,rgba(18,20,22,.96) 100%)}
.phead .wrap{padding:28px 20px 44px;min-height:380px;display:flex;flex-direction:column;justify-content:flex-end}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:auto;padding-bottom:40px;font-size:13px}.topbar a{color:#e8dfcf;letter-spacing:.06em}.topbar a:hover{color:#fff}
.phead h1{font-family:"Noto Serif TC",serif;font-size:clamp(28px,4.2vw,46px);line-height:1.2;margin:10px 0 14px;font-weight:700}
.pmeta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px;color:#d9d2c6}.pmeta .tag{border:1px solid rgba(216,189,138,.6);color:var(--gold-2);border-radius:999px;padding:3px 12px;letter-spacing:.1em;font-size:11px}
.pmeta .st{border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:3px 12px}
.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:36px;padding:36px 0 60px}
@media(min-width:960px){.layout{grid-template-columns:minmax(0,1fr) 300px}}
.side{align-self:start;position:sticky;top:60px}
.facts{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow)}
.facts dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:14px}.facts dt{color:var(--muted);font-size:12px;letter-spacing:.1em;padding-top:2px}.facts dd{margin:0}
.facts .btn{margin-top:14px;display:inline-block;background:var(--ink);color:#fff;border-radius:999px;padding:8px 18px;font-size:14px}.facts .btn:hover{background:var(--gold);text-decoration:none}
h2.sec{font-family:"Noto Serif TC",serif;font-size:24px;margin:40px 0 16px;display:flex;align-items:baseline;gap:12px}h2.sec:first-child{margin-top:0}h2.sec .en{font-size:11px;letter-spacing:.24em;color:var(--gold);font-family:"Noto Sans TC",sans-serif;font-weight:600}
.rich{max-width:860px}.rich p{margin:10px 0}.rich h4{font-family:"Noto Serif TC",serif;margin:22px 0 8px;font-size:17px}.rich ul,.rich ol{margin:8px 0 8px 24px}
.tbl{overflow-x:auto;margin:14px 0}.rich table{border-collapse:separate;border-spacing:0;width:100%;font-size:14px;background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.rich th{font-size:11px;letter-spacing:.14em;color:var(--muted);font-weight:600;text-align:left;padding:10px 14px;background:#f6f1e9;border-bottom:1px solid var(--line)}
.rich td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.7}.rich tr:last-child td{border-bottom:0}
.rich td:first-child{color:var(--gold);font-weight:600;white-space:nowrap;width:1%}
/* 成果檔案 */
.files{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
.file{background:var(--paper);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow)}
.file .cover{aspect-ratio:4/3;background:#ece6dc}.file .cover img{object-fit:contain;background:#efe9df}.file .cover .ph{font-size:22px;letter-spacing:.2em;color:rgba(80,64,40,.45)}
.file .body{padding:12px 14px 14px;font-size:14px;display:flex;flex-direction:column;gap:5px;flex:1}
.file .name{font-weight:600;line-height:1.45;word-break:break-all}.file .fmeta{font-size:12px;color:var(--muted);display:flex;gap:10px}.file .note{font-size:13px;color:var(--muted);line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.file .acts{margin-top:auto;padding-top:8px;display:flex;gap:14px;font-size:13px}
video{width:100%;background:#000;display:block;aspect-ratio:16/9}
/* 工作紀錄：時間軸 */
.tl{position:relative;padding-left:30px}.tl:before{content:"";position:absolute;left:9px;top:8px;bottom:8px;width:2px;background:linear-gradient(var(--gold-2),var(--line))}
.rec{position:relative;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px 22px;margin:0 0 18px;box-shadow:var(--shadow)}
.rec:before{content:"";position:absolute;left:-27px;top:22px;width:12px;height:12px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 4px var(--bg)}
.rec .date{font-size:12px;letter-spacing:.14em;color:var(--gold);font-weight:600}.rec h3{font-family:"Noto Serif TC",serif;margin:4px 0 8px;font-size:19px;line-height:1.45;font-weight:700}
.rec .meta{display:flex;flex-wrap:wrap;gap:6px;font-size:12px;color:var(--muted);margin-bottom:6px}.rec .meta span,.rec .meta a{border:1px solid var(--line);border-radius:999px;padding:1px 10px}
.fchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.fchips span,.fchips a{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:2px 10px;color:var(--muted);background:#faf7f2}
.empty{color:var(--muted);font-size:14px}
/* 頁尾 */
.foot{background:var(--dark);color:#b9b2a7;padding:44px 0;margin-top:40px;font-size:13px;position:relative;isolation:isolate}
.foot:after{content:"";position:absolute;inset:0;z-index:-1;background-image:${NOISE};opacity:.1;mix-blend-mode:overlay}
.foot .wrap{display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:flex-start}
.foot b{font-family:"Noto Serif TC",serif;color:#f4efe6;font-size:16px;display:block;margin-bottom:4px}.foot a{color:#e3d7c1}.foot .links{display:flex;gap:16px;flex-wrap:wrap}
.tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--muted);margin-top:18px}.tools a.btn{border:1px solid rgba(216,189,138,.6);color:var(--gold-2);border-radius:999px;padding:6px 16px}
/* 列印版 */
.cover-page{padding:60px 0 30px}.cover-page h1{font-family:"Noto Serif TC",serif;font-size:40px;margin:14px 0 8px}
.toc table{border-collapse:collapse;width:100%;font-size:13px}.toc th,.toc td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}.toc th{background:#f6f1e9;font-size:11px;letter-spacing:.12em}
section.proj{page-break-before:always;break-before:page;padding-top:14px}
section.proj .hero-img{border-radius:14px;overflow:hidden;max-height:300px;margin:12px 0}section.proj .hero-img img{width:100%;max-height:300px;object-fit:cover;display:block}
section.proj h1{font-family:"Noto Serif TC",serif;font-size:28px;margin:10px 0 8px}
section.proj .pmeta{color:var(--muted)}section.proj .pmeta .tag{border-color:var(--gold);color:var(--gold)}section.proj .pmeta .st{border-color:var(--line)}
@media print{
  :root{--bg:#fff;--paper:#fff;--line:#d5cfc6;--shadow:none}
  body{font-size:12px;line-height:1.55}.wrap{max-width:none;padding:0}
  .catnav,.tools,.topbar,.foot,.side .btn{display:none!important}
  .hero,.phead{background:#fff;color:var(--ink)}.hero:before,.hero:after,.phead .bg,.phead .veil{display:none}.hero .intro{color:var(--muted)}.stat b{color:var(--ink)}
  .card,.rec,.file,.tbl,.hero-img{break-inside:avoid;page-break-inside:avoid;box-shadow:none!important;transform:none!important;border:1px solid var(--line)}
  .sum,.file .note{display:block;-webkit-line-clamp:unset;overflow:visible}
  .grid,.featured{grid-template-columns:repeat(3,1fr);gap:10px}.files{grid-template-columns:repeat(3,1fr);gap:10px}
  .featured .card:first-child{grid-column:auto;grid-row:auto}
  video{display:none}a{color:inherit}
  h2.sec{margin-top:18px;break-after:avoid-page;page-break-after:avoid}.hero-img,section.proj h1,.pmeta{break-after:avoid-page;page-break-after:avoid}
  .cover-page{page-break-after:always;break-after:page}.layout{display:block}.side{position:static}
}
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
<meta name="theme-color" content="#15171a">
<meta property="og:title" content="${esc(opt.title)}">
<meta property="og:description" content="${esc(opt.desc)}">
${opt.ogImage ? `<meta property="og:image" content="${esc(opt.ogImage)}">` : ''}
${opt.url ? `<meta property="og:url" content="${esc(opt.url)}">` : ''}
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>${opt.body}</body>
</html>`
}

function cardHtml(p: ShareProject, key: string): string {
  const cover = p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : `<span class="ph">${esc((p.name || '＃').slice(0, 1))}</span>`
  const meta = [p.lastDate ? year(p.lastDate) : '', `紀錄 ${p.records.length}`, `檔案 ${p.files.length}`].filter(Boolean)
  return `<a class="card" href="/portfolio/${esc(key)}/${esc(p.id)}">
  <div class="cover">${cover}</div>
  <div class="body">
    <div class="kicker"><span>${esc(catEn(p.category))}・${esc(p.category || '其他')}</span><span class="st">${esc(p.status || '')}</span></div>
    <h3>${esc(p.name)}</h3>
    <div class="sum">${esc(p.summary)}</div>
    <div class="meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>
  </div>
</a>`
}

function footHtml(p: Portfolio): string {
  return `<footer class="foot"><div class="wrap">
  <div><b>${esc(COMPANY)}</b>PrinTex™ 數位紋理・藝格板｜${esc(OWNER)}（${esc(OWNER_EN)}）工作作品集</div>
  <div class="links"><a href="https://egrra.vercel.app/" target="_blank" rel="noopener">官方網站</a><a href="https://www.tiktok.com/@marblemetal" target="_blank" rel="noopener">TikTok 大理石魔術師呂哥</a><a href="https://www.youtube.com/@marblemetal" target="_blank" rel="noopener">YouTube</a><a href="https://www.instagram.com/egrra1199/" target="_blank" rel="noopener">Instagram</a></div>
  <div style="flex-basis:100%;font-size:12px;color:#8e877c">此頁由紀錄櫃 App 在 ${esc(tw(p.generatedAt))}（台北）產生；檔案與縮圖連結到 ${esc(tw(p.linkExpiresAt))} 前有效，之後重新整理即可。</div>
</div></footer>`
}

export function portfolioIndexHtml(p: Portfolio, key: string): string {
  const cats = CATEGORY_ORDER.filter(c => p.projects.some(x => (x.category || '其他') === c))
  const extra = Array.from(new Set(p.projects.map(x => x.category || '其他'))).filter(c => !cats.includes(c))
  const allCats = [...cats, ...extra]
  // 精選：有封面與檔案，優先挑有第三方留痕（媒體露出、客戶回饋、平台數字）的，再看檔案與紀錄多寡
  const evidence = (x: ShareProject) => /媒體露出|客戶回饋|第三方|佐證|使用數據/.test(x.note || '') ? 8 : 0
  const score = (x: ShareProject) => (x.cover ? 3 : -99) + evidence(x) + x.files.length + x.records.length * 2
  const featured = [...p.projects].filter(x => x.cover && x.files.length).sort((a, b) => score(b) - score(a)).slice(0, 3)
  const sections = allCats.map(c => {
    const items = p.projects.filter(x => (x.category || '其他') === c)
    return `<section class="cat" data-cat="${esc(c)}" id="cat-${esc(c)}"><div class="sec-head"><span class="en">${esc(catEn(c))}</span><h2>${esc(c)}</h2><span class="n">${items.length} 個專案</span></div><div class="grid">${items.map(x => cardHtml(x, key)).join('\n')}</div></section>`
  }).join('\n')
  const chips = ['全部', ...allCats].map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('')
  const body = `<header class="hero"><div class="wrap">
  <div class="eyebrow">${esc(COMPANY)}　·　PrinTex™ 數位紋理・藝格板</div>
  <h1>${esc(OWNER)}　工作作品集</h1>
  <p class="sub">PORTFOLIO OF ${esc(OWNER_EN.toUpperCase())}　·　2019 — ${esc(String(new Date().getFullYear()))}</p>
  <div class="rule"></div>
  <p class="intro">${esc(INTRO)}</p>
  <div class="stats"><div class="stat"><b>${p.stats.projects}</b><span>專案 PROJECTS</span></div><div class="stat"><b>${p.stats.records}</b><span>工作紀錄 RECORDS</span></div><div class="stat"><b>${p.stats.files}</b><span>檔案 FILES</span></div></div>
  <div class="layers"><span>成果檔案</span><span>工作紀錄</span><span>第三方留痕：客戶回饋・媒體露出・平台數字</span></div>
  <div class="tools"><a class="btn" href="/portfolio/${esc(key)}?all=1">列印版 · 可另存 PDF</a><span>線上版每次打開都是最新資料</span></div>
</div></header>
<nav class="catnav"><div class="wrap" id="chips">${chips}</div></nav>
<main class="wrap">
${featured.length ? `<section class="cat" data-cat="精選"><div class="sec-head"><span class="en">FEATURED</span><h2>精選</h2></div><div class="featured">${featured.map(x => cardHtml(x, key)).join('\n')}</div></section>` : ''}
${sections}
</main>
${footHtml(p)}
<script>
(function(){var chips=document.querySelectorAll('#chips .chip'),secs=document.querySelectorAll('section.cat');
chips.forEach(function(c){c.addEventListener('click',function(){chips.forEach(function(x){x.classList.remove('on')});c.classList.add('on');var v=c.getAttribute('data-cat');
secs.forEach(function(s){var sc=s.getAttribute('data-cat');s.style.display=(v==='全部'||sc===v)?'':'none'});
if(v!=='全部'){var t=document.getElementById('cat-'+v);if(t){var y=t.getBoundingClientRect().top+window.scrollY-70;window.scrollTo({top:y,behavior:'smooth'})}}})})})();
</script>`
  const og = featured[0]?.cover || p.projects.find(x => x.cover)?.cover
  return page({ title: `${OWNER} 工作作品集｜${COMPANY}`, desc: INTRO, body, ogImage: og, url: `${p.origin}/portfolio/${key}` })
}

function fileHtml(f: ShareFile, print = false): string {
  let media: string
  if (f.url && isVideo(f.name) && !print) media = `<video controls preload="metadata"${f.thumb ? ` poster="${esc(f.thumb)}"` : ''} src="${esc(f.url)}"></video>`
  else if (f.thumb) media = `<a class="cover" href="${esc(f.url || '#')}" target="_blank" rel="noopener"><img src="${esc(f.thumb)}" alt="" loading="lazy"></a>`
  else media = `<div class="cover"><span class="ph">${esc(isVideo(f.name) ? '影片' : extOf(f.name))}</span></div>`
  const acts = f.url ? `<div class="acts"><a href="${esc(f.url)}" target="_blank" rel="noopener">開啟</a><a href="${esc(f.download)}">下載</a></div>` : ''
  return `<div class="file">${media}<div class="body"><div class="name">${esc(f.name)}</div><div class="fmeta">${f.category ? `<span>${esc(f.category)}</span>` : ''}${f.date ? `<span>${esc(f.date)}</span>` : ''}</div>${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}${acts}</div></div>`
}

function recordHtml(r: ShareRecord): string {
  const meta = [r.status ? `<span>${esc(r.status)}</span>` : '', r.category ? `<span>${esc(r.category)}</span>` : '', ...r.tags.map(t => `<span>${esc(t)}</span>`), r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">連結 ↗</a>` : ''].filter(Boolean).join('')
  const files = r.files.length ? `<div class="fchips">${r.files.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''
  const att = r.attachments.length ? `<div class="fchips">${r.attachments.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join('')}</div>` : ''
  return `<article class="rec"><div class="date">${esc(r.date || '（無日期）')}</div><h3>${esc(r.title)}</h3><div class="meta">${meta}</div>${r.note ? `<div class="rich">${noteHtml(r.note)}</div>` : ''}${files}${att}</article>`
}

// 專案的主體（說明、檔案、紀錄），專案頁與列印版共用
function projectBody(pr: ShareProject, opt: { print: boolean }): string {
  const files = pr.files
  const visual = files.filter(f => f.thumb || isVideo(f.name) || isImage(f.name))
  const others = files.filter(f => !visual.includes(f))
  return `${pr.note ? `<h2 class="sec"><span class="en">ABOUT</span>專案說明</h2><div class="rich">${noteHtml(pr.note)}</div>` : ''}
<h2 class="sec"><span class="en">WORKS</span>成果檔案（${files.length}）</h2>
${files.length ? `<div class="files">${[...visual, ...others].map(f => fileHtml(f, opt.print)).join('\n')}</div>` : '<p class="empty">這個專案沒有放檔案（例如 SOP、說明書類只留紀錄）。</p>'}
<h2 class="sec"><span class="en">TIMELINE</span>工作紀錄（${pr.records.length}）</h2>
${pr.records.length ? `<div class="tl">${pr.records.map(recordHtml).join('\n')}</div>` : '<p class="empty">沒有紀錄。</p>'}`
}

export function projectHtml(p: Portfolio, pr: ShareProject, key: string): string {
  const body = `<header class="phead">
  ${pr.cover ? `<div class="bg" style="background-image:url('${esc(pr.cover)}')"></div>` : ''}<div class="veil"></div>
  <div class="wrap">
    <div class="topbar"><a href="/portfolio/${esc(key)}">← 回作品集</a><a href="/portfolio/${esc(key)}">${esc(COMPANY)}｜${esc(OWNER)} 工作作品集</a></div>
    <div class="eyebrow">${esc(catEn(pr.category))}　·　${esc(pr.category || '其他')}</div>
    <h1>${esc(pr.name)}</h1>
    <div class="pmeta"><span class="tag">${esc(pr.category || '其他')}</span><span class="st">${esc(pr.status || '—')}</span>${pr.lastDate ? `<span>最近 ${esc(pr.lastDate)}</span>` : ''}<span>紀錄 ${pr.records.length}・檔案 ${pr.files.length}</span></div>
  </div>
</header>
<div class="wrap"><div class="layout">
  <main>${projectBody(pr, { print: false })}</main>
  <aside class="side"><div class="facts">
    <dl><dt>分類</dt><dd>${esc(pr.category || '其他')}</dd><dt>狀態</dt><dd>${esc(pr.status || '—')}</dd>${pr.lastDate ? `<dt>最近</dt><dd>${esc(pr.lastDate)}</dd>` : ''}<dt>紀錄</dt><dd>${pr.records.length} 筆</dd><dt>檔案</dt><dd>${pr.files.length} 個</dd>${pr.link ? `<dt>連結</dt><dd><a href="${esc(pr.link)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(pr.link.replace(/^https?:\/\//, ''))}</a></dd>` : ''}</dl>
    ${pr.link ? `<a class="btn" href="${esc(pr.link)}" target="_blank" rel="noopener">開啟連結 ↗</a>` : ''}
  </div></aside>
</div></div>
${footHtml(p)}`
  return page({ title: `${pr.name}｜${OWNER} 工作作品集`, desc: pr.summary || INTRO, body, ogImage: pr.cover || undefined, url: `${p.origin}/portfolio/${key}/${pr.id}` })
}

// 列印版：封面、專案一覽、每個專案一節（每節從新的一頁開始）。瀏覽器「列印 → 另存 PDF」就是書面版作品集。
export function portfolioFullHtml(p: Portfolio, key: string): string {
  const toc = p.projects.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.category || '其他')}</td><td><a href="#p${i + 1}">${esc(x.name)}</a></td><td>${esc(x.status || '')}</td><td>${esc(x.lastDate || '')}</td><td>${x.records.length}／${x.files.length}</td></tr>`).join('')
  const sections = p.projects.map((pr, i) => `<section class="proj" id="p${i + 1}">
<div class="eyebrow" style="color:var(--gold)">${esc(COMPANY)}｜${esc(OWNER)} 工作作品集　${i + 1}／${p.projects.length}</div>
${pr.cover ? `<div class="hero-img"><img src="${esc(pr.cover)}" alt=""></div>` : ''}
<h1>${esc(pr.name)}</h1>
<div class="pmeta"><span class="tag">${esc(pr.category || '其他')}</span><span class="st">${esc(pr.status || '—')}</span>${pr.lastDate ? `<span>最近 ${esc(pr.lastDate)}</span>` : ''}<span>紀錄 ${pr.records.length}・檔案 ${pr.files.length}</span>${pr.link ? `<span>連結：<a href="${esc(pr.link)}">${esc(pr.link)}</a></span>` : ''}</div>
${projectBody(pr, { print: true })}
</section>`).join('\n')
  const body = `<div class="wrap">
<div class="tools"><a class="btn" href="/portfolio/${esc(key)}" style="border-color:var(--gold);color:var(--gold)">← 回線上版</a><span>這一頁是列印版：用瀏覽器「列印」選「另存為 PDF」，就是書面版作品集。</span></div>
<section class="cover-page">
  <div class="eyebrow" style="color:var(--gold)">${esc(COMPANY)}　·　PrinTex™ 數位紋理・藝格板</div>
  <h1>${esc(OWNER)}　工作作品集</h1>
  <p class="sub" style="color:var(--gold);letter-spacing:.12em;margin:0 0 18px">PORTFOLIO OF ${esc(OWNER_EN.toUpperCase())}</p>
  <p class="intro" style="max-width:760px;color:var(--muted)">${esc(INTRO)}</p>
  <div class="stats" style="gap:32px"><div class="stat"><b style="color:var(--ink)">${p.stats.projects}</b><span style="color:var(--gold)">專案</span></div><div class="stat"><b style="color:var(--ink)">${p.stats.records}</b><span style="color:var(--gold)">工作紀錄</span></div><div class="stat"><b style="color:var(--ink)">${p.stats.files}</b><span style="color:var(--gold)">檔案</span></div></div>
  <div style="font-size:13px;color:var(--muted)">書面版產生於 ${esc(tw(p.generatedAt))}（台北）。線上版：<a href="${esc(p.origin)}/portfolio/${esc(key)}">${esc(p.origin)}/portfolio/${esc(key)}</a>（每次打開都是最新資料，檔案可直接開啟）。</div>
</section>
<section class="toc">
<h2 class="sec" style="margin-top:0"><span class="en">INDEX</span>專案一覽</h2>
<table><tr><th>#</th><th>分類</th><th>專案</th><th>狀態</th><th>最近</th><th>紀錄／檔案</th></tr>${toc}</table>
</section>
${sections}
<div style="padding:30px 0;font-size:12px;color:var(--muted)">此書面版由紀錄櫃 App 產生；文中「開啟／下載」連結到 ${esc(tw(p.linkExpiresAt))} 前有效，之後請用線上版重新取得。</div>
</div>`
  // 列印版不用延遲載圖，否則「另存 PDF」時下方的縮圖會是空的
  return page({ title: `${OWNER} 工作作品集（列印版）｜${COMPANY}`, desc: INTRO, body: body.replace(/ loading="lazy"/g, ''), ogImage: p.projects.find(x => x.cover)?.cover, url: `${p.origin}/portfolio/${key}?all=1` })
}
