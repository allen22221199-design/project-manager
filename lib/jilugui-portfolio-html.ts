import type { Portfolio, ShareProject, ShareRecord, ShareFile } from './jilugui-share'

// 紀錄櫃「作品集網頁」：給人看的唯讀版本。資料跟「分享給 AI」同一份（buildPortfolio），只是排成網頁。
// 網址 /portfolio/<金鑰>（首頁）、/portfolio/<金鑰>/<專案 id>（專案頁）、/portfolio/<金鑰>?all=1（一頁看完全部／列印版）。
//
// 設計：簡約歐洲風（像義大利石材品牌或瑞士式型錄）——暖白底、黑字、無襯線細字、大量留白、細線、01／02 編號；
// 只用煌盛自己的 PrinTex 花色（官網花色庫原圖，放在 public/ptx/，標真實編號）當「材質色票」，每個分類一款。
// 不用：深色大圖、漸層光暈、金色流光、陰影卡片、卡片傾斜、數字跳動（AI 模板感），也不用直排、印章、壹貳參（太中式）。

const CATEGORY_ORDER = ['系統開發', '行銷', '工程', '行政', '業務', '會議', '採購', '其他']
const COMPANY = '煌盛興業 EGRRA'
const OWNER = '呂理論'
const OWNER_EN = 'Alen Lu'
const INTRO = '煌盛興業是 PrinTex™ 數位紋理技術與藝格板的製造商，四十多年金屬板製造與大理石紋開發經驗。這裡整理總經理呂理論近年主導或親手完成的工作：系統開發、行銷內容、工程打樣與內部教育訓練。每個專案都附上成果檔案、工作紀錄，以及客戶回饋、媒體露出、平台數字這類第三方留痕。'
const no2 = (n: number) => (n < 10 ? '0' : '') + n

// 每個分類用一款 PrinTex 花色（編號與名稱照官網花色庫）
type Tex = { code: string; name: string; file: string }
const TEX: Record<string, Tex> = {
  '系統開發': { code: 'PT-M118', name: '石墨灰', file: 'PTM118.jpg' },
  '行銷': { code: 'PT-M201', name: '新米黃', file: 'PTM201.jpg' },
  '工程': { code: 'PT-G102', name: '喬治亞灰', file: 'PTG102.jpg' },
  '行政': { code: 'PT-W204', name: '灰橡', file: 'PTW204.jpg' },
  '業務': { code: 'PT-M014', name: '白練', file: 'PTM014.jpg' },
  '會議': { code: 'PT-M101', name: '克羅蒂灰', file: 'PTM101.jpg' },
  '採購': { code: 'PT-G001', name: '金麻', file: 'PTG001.jpg' },
  '其他': { code: 'PT-M005', name: '月光白', file: 'PTM005.jpg' },
}
const STRIP_TEX: Tex = { code: 'PT-M014', name: '白練', file: 'PTM014.jpg' }
const texOf = (c: string) => TEX[c] || TEX['其他']
const texUrl = (t: Tex) => `/ptx/${t.file}`

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tw = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
const isVideo = (name: string) => /\.(mp4|mov|webm|m4v)$/i.test(name || '')
const isImage = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name || '')
const extOf = (name: string) => (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4)

// 專案期間：紀錄與檔案日期的最早到最晚，寫成 2025.08–2025.11
function periodOf(pr: ShareProject): string {
  const ds = [...pr.records.map(r => r.date), ...pr.files.map(f => f.date), pr.lastDate].filter(d => /^\d{4}-\d{2}/.test(d || '')).sort()
  if (!ds.length) return ''
  const f = (d: string) => d.slice(0, 7).replace('-', '.')
  const a = f(ds[0]), b = f(ds[ds.length - 1])
  return a === b ? a : `${a}–${b}`
}

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
:root{--bg:#f6f4f0;--ink:#151515;--ink2:#555350;--mute:#8f8c86;--rule:#dcd8d0;--soft:#ebe8e2}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:300 16px/1.8 "Instrument Sans","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
b,strong{font-weight:500}
.lat{font-family:"Instrument Sans","Noto Sans TC",sans-serif;letter-spacing:.01em}
.wrap{max-width:1240px;margin:0 auto;padding:0 32px}
@media(max-width:600px){.wrap{padding:0 20px}}
@keyframes fade{from{opacity:0}to{opacity:1}}
/* 頁首 */
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:26px 0;font-size:13px;color:var(--ink2)}
.top b{font-weight:500;color:var(--ink);letter-spacing:.02em}
.top a{text-decoration:none}.top a:hover{text-decoration:underline}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:end;padding:72px 0 56px;border-bottom:1px solid var(--ink)}
.hero h1{font-weight:400;font-size:clamp(56px,8vw,112px);line-height:1;letter-spacing:-.03em;margin:0}
.hero .sub{font-size:15px;color:var(--ink2);margin:22px 0 0;display:flex;gap:18px;flex-wrap:wrap}
.hero .lead{font-size:16px;line-height:1.95;color:var(--ink2);margin:0 0 30px;max-width:36em}
.swatches{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.sw{margin:0}.sw i{display:block;aspect-ratio:3/5;background:center/cover}
.sw figcaption{font-size:11.5px;color:var(--ink2);margin-top:8px;line-height:1.5}.sw figcaption span{display:block;color:var(--mute)}
.figs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--rule)}
.figs div{padding:22px 0 20px}.figs div+div{padding-left:22px;border-left:1px solid var(--rule)}
.figs b{display:block;font-weight:300;font-size:44px;line-height:1;letter-spacing:-.02em}
.figs span{font-size:13px;color:var(--mute)}
.links{display:flex;flex-wrap:wrap;gap:8px 28px;padding:22px 0 0;font-size:15px}
.links a{text-decoration:none;border-bottom:1px solid var(--ink);padding-bottom:1px}.links a:hover{opacity:.6}
@media(max-width:900px){.hero{grid-template-columns:minmax(0,1fr);gap:40px;padding-top:40px}.figs{grid-template-columns:repeat(2,minmax(0,1fr))}.figs div:nth-child(3){padding-left:0;border-left:0}.figs div:nth-child(n+3){border-top:1px solid var(--rule)}}
@media(max-width:560px){.figs b{font-size:34px}.hero h1{font-size:56px}}
/* 目錄列 */
.idx{position:sticky;top:0;z-index:20;background:rgba(246,244,240,.94);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid var(--rule)}
.idx .wrap{display:flex;align-items:center;gap:26px;overflow-x:auto;scrollbar-width:none}.idx .wrap::-webkit-scrollbar{display:none}
.idx .who{font-weight:500;font-size:14px;white-space:nowrap;margin-right:auto;padding-right:18px}
.chip{appearance:none;background:none;border:0;border-bottom:1px solid transparent;padding:16px 0 14px;font:inherit;font-size:14px;color:var(--mute);cursor:pointer;white-space:nowrap}
.chip:hover{color:var(--ink)}.chip.on{color:var(--ink);border-bottom-color:var(--ink)}
@media(max-width:700px){.idx .who{display:none}.idx .wrap{gap:20px}}
/* 章節 */
section.cat{padding:0 0 16px;scroll-margin-top:52px}
.chap{display:grid;grid-template-columns:80px minmax(0,1fr) auto;gap:24px;align-items:baseline;border-top:1px solid var(--ink);padding-top:16px;margin:104px 0 40px}
.chap .no{font-size:13px;color:var(--mute)}
.chap h2{font-weight:400;font-size:32px;line-height:1.2;letter-spacing:-.01em;margin:0}
.chap .note{display:block;font-size:13px;color:var(--mute);margin-top:8px}
.chap .mat{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink2);white-space:nowrap}
.chap .mat i{display:block;width:22px;height:22px;background:center/cover;border-radius:50%}
@media(max-width:640px){.chap{grid-template-columns:minmax(0,1fr);gap:6px;margin-top:72px}.chap h2{font-size:26px}}
/* 專案卡 */
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:56px 32px}
@media(max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.grid{grid-template-columns:minmax(0,1fr);gap:44px}}
.card{display:flex;flex-direction:column;text-decoration:none;color:inherit}
.card .cover{aspect-ratio:4/3;overflow:hidden;background:var(--soft)}
.card .cover img{width:100%;height:100%;object-fit:cover;display:block;transition:opacity .3s,transform .8s cubic-bezier(.2,.7,.2,1)}
.card:hover .cover img{transform:scale(1.025)}
.card .cover.tx{background:var(--tex) center/cover}
.card .lab{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--mute);margin-top:16px}
.card .lab .sw0{display:inline-flex;align-items:center;gap:7px}.card .lab .sw0 i{width:10px;height:10px;border-radius:50%;background:var(--tex) center/cover;display:inline-block}
.card h3{font-weight:500;font-size:19px;line-height:1.45;margin:8px 0 6px;letter-spacing:-.005em}
.card:hover h3{text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px}
.card .sum{font-size:14.5px;color:var(--ink2);line-height:1.75;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .cfoot{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--mute);margin-top:14px;padding-top:12px;border-top:1px solid var(--rule)}
.card .go{color:var(--ink)}
.card.open .go{text-decoration:underline}
/* 卡片原地展開 */
.xpanel{grid-column:1/-1;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);padding:28px 0 32px;animation:fade .3s ease}
.xpanel[hidden]{display:none}
.xphead{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;flex-wrap:wrap}
.xphead .lab{font-size:12px;color:var(--mute)}
.xphead h3{font-weight:400;font-size:28px;margin:6px 0 0;line-height:1.3;letter-spacing:-.01em}
.btnp,.btno{display:inline-flex;align-items:center;gap:8px;font:inherit;font-weight:400;font-size:14px;padding:10px 18px;cursor:pointer;text-decoration:none;border:1px solid var(--ink);border-radius:0}
.btnp{background:var(--ink);color:var(--bg)}.btnp:hover{opacity:.82}
.btno{background:transparent;color:var(--ink)}.btno:hover{background:var(--ink);color:var(--bg)}
.xpacts{display:flex;gap:10px;flex-wrap:wrap}
.xpsum{font-size:16px;line-height:1.9;margin:18px 0 8px;max-width:48em;color:var(--ink2)}
.xpfacts{font-size:12.5px;color:var(--mute);display:flex;flex-wrap:wrap;gap:4px 22px}.xpfacts a{color:var(--ink)}
.xpsec{font-size:13px;color:var(--mute);margin:26px 0 12px;display:flex;gap:12px}.xpsec b{color:var(--ink);font-weight:500}
.xfiles{display:flex;gap:16px;overflow-x:auto;padding-bottom:8px;scrollbar-width:thin;align-items:flex-start}
.xf{flex:0 0 160px;text-decoration:none;color:inherit}
.xf .xft{width:160px;height:120px;background:var(--soft);overflow:hidden;display:flex;align-items:center;justify-content:center}
.xf .xft img{width:100%;height:100%;object-fit:cover;display:block}.xf .xft span{font-size:12px;color:var(--mute)}
.xf:hover .xfn{text-decoration:underline}
.xf .xfn{font-size:12px;color:var(--ink2);margin-top:8px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}
.xf.locked .xft{background:var(--soft)}.xf.locked .xft span{font-size:11px;letter-spacing:.12em;color:var(--ink2)}
.xmore{align-self:center;white-space:nowrap;font-size:13px;text-decoration:underline;padding:0 8px}
.xrecs{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}
.xrecs li{display:grid;grid-template-columns:110px minmax(0,1fr);gap:16px;font-size:14px;line-height:1.6;padding:9px 0;border-bottom:1px solid var(--rule)}
.xrecs .d{color:var(--mute);font-size:13px}
.xrecs+.xmore{display:inline-block;margin-top:12px;padding:0}
@media(max-width:600px){.xf{flex-basis:130px}.xf .xft{width:130px;height:98px}.xrecs li{grid-template-columns:1fr;gap:2px}.xphead h3{font-size:23px}}
/* 經歷 */
.yr{display:grid;grid-template-columns:200px minmax(0,1fr);gap:32px;border-top:1px solid var(--rule);padding-top:18px;margin-top:40px}
.yr:first-child{margin-top:0;border-top:0;padding-top:0}
.yr .y{position:sticky;top:72px;align-self:start}
.yr .y b{display:block;font-weight:300;font-size:64px;line-height:1;letter-spacing:-.03em}
.yr .y span{font-size:12.5px;color:var(--mute)}
.mo{font-size:12px;color:var(--mute);padding:4px 0 8px;border-bottom:1px solid var(--rule)}
.mo~.mo{margin-top:24px}
.xi{display:grid;grid-template-columns:72px minmax(0,1fr);gap:20px;padding:16px 0;border-bottom:1px solid var(--rule);text-decoration:none;color:inherit}
.xi .xd{font-size:14px;color:var(--ink2)}
.xi .xp{font-size:12.5px;color:var(--mute)}
.xi h3{font-weight:500;font-size:17px;line-height:1.5;margin:3px 0 4px}
.xi:hover h3{text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px}
.xi p{margin:0;font-size:14px;color:var(--ink2);line-height:1.75;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.xi .xs{font-size:12px;color:var(--mute);margin-top:6px}
@media(max-width:760px){.yr{grid-template-columns:minmax(0,1fr);gap:10px}.yr .y{position:static;display:flex;align-items:baseline;gap:14px}.yr .y b{font-size:44px}.xi{grid-template-columns:minmax(0,1fr);gap:2px}}
/* 專案頁 */
.phd{padding:0 0 8px}
.phd .head{padding:56px 0 36px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:32px;align-items:end;border-bottom:1px solid var(--ink)}
.phd .lab{font-size:13px;color:var(--mute);display:flex;flex-wrap:wrap;gap:4px 22px;margin-bottom:16px}
.phd h1{font-weight:400;font-size:clamp(34px,4.6vw,60px);line-height:1.12;letter-spacing:-.025em;margin:0}
.phd .lede{font-size:17px;line-height:1.9;color:var(--ink2);margin:22px 0 0;max-width:40em}
.phd .mat{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink2);white-space:nowrap}.phd .mat i{width:26px;height:26px;border-radius:50%;background:var(--tex) center/cover;display:block}
.phd .pic{margin:32px 0 0;aspect-ratio:21/9;background:var(--soft);overflow:hidden}
.phd .pic img{width:100%;height:100%;object-fit:cover;display:block}
.phd .pic.tx{background:var(--tex) center/cover}
@media(max-width:760px){.phd .head{grid-template-columns:minmax(0,1fr);padding-top:32px}.phd .pic{aspect-ratio:4/3}}
.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:48px;padding:16px 0 96px}
@media(min-width:980px){.layout{grid-template-columns:minmax(0,1fr) 260px;gap:72px}}
.side{align-self:start;position:sticky;top:72px}
.facts{margin:0;border-top:1px solid var(--ink)}
.facts div{display:grid;grid-template-columns:4.5em 1fr;gap:12px;border-bottom:1px solid var(--rule);padding:11px 0;font-size:14px}
.facts dt{color:var(--mute);font-size:13px}.facts dd{margin:0;word-break:break-all}
.side .acts{display:flex;flex-direction:column;gap:10px;margin-top:22px}.side .acts>*{justify-content:center}
h2.sec{display:grid;grid-template-columns:80px minmax(0,1fr);gap:24px;align-items:baseline;font-weight:400;font-size:24px;letter-spacing:-.01em;margin:64px 0 24px;padding-top:14px;border-top:1px solid var(--ink)}
h2.sec:first-child{margin-top:40px}h2.sec .no{font-size:13px;color:var(--mute)}h2.sec small{font-size:13px;color:var(--mute);margin-left:12px}
@media(max-width:640px){h2.sec{grid-template-columns:44px minmax(0,1fr);gap:12px}}
.rich{max-width:860px}.rich p{margin:12px 0}.rich h4{font-weight:500;margin:26px 0 8px;font-size:16px}.rich ul,.rich ol{margin:8px 0 8px 22px}
.tbl{overflow-x:auto;margin:16px 0}.rich table{border-collapse:collapse;width:100%;font-size:14.5px}
.rich th{font-size:12px;color:var(--mute);font-weight:400;text-align:left;padding:8px 16px 8px 0;border-bottom:1px solid var(--ink)}
.rich td{padding:11px 16px 11px 0;border-bottom:1px solid var(--rule);vertical-align:top;line-height:1.75}
.rich td:first-child{font-weight:500;white-space:nowrap;width:1%;padding-right:28px}
/* 成果檔案 */
.files{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:40px 24px}
.file{display:flex;flex-direction:column}
.file .cover{aspect-ratio:4/3;background:var(--soft);display:block;position:relative;overflow:hidden}
.file .cover img{width:100%;height:100%;object-fit:contain;display:block}
.file .cover .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;letter-spacing:.14em;color:var(--mute)}
.file a.cover:after{content:"放大";position:absolute;right:10px;bottom:10px;background:var(--bg);color:var(--ink);font-size:11px;padding:4px 9px;opacity:0;transition:opacity .2s}.file a.cover[data-ext]:after{content:"開啟 " attr(data-ext)}.file:hover a.cover:after{opacity:1}
.file .body{padding:14px 0 0;font-size:14px;display:flex;flex-direction:column;gap:5px;flex:1}
.file .name{font-weight:500;line-height:1.5;word-break:break-all}
.file .fmeta{font-size:12px;color:var(--mute);display:flex;gap:14px}
.file .note{font-size:13.5px;color:var(--ink2);line-height:1.7;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.file .acts{margin-top:auto;padding-top:10px;display:flex;gap:18px;font-size:13px}.file .acts a{text-decoration:none;border-bottom:1px solid var(--ink)}.file .acts a:hover{opacity:.6}
.file.locked .cover{background:var(--soft);display:flex;align-items:center;justify-content:center}
.file.locked .cover .lk{font-size:12px;letter-spacing:.14em;color:var(--ink2);border:1px solid var(--rule);padding:7px 14px;background:var(--bg)}
.file.locked .lockline{margin-top:auto;padding-top:10px;font-size:12px;color:var(--mute)}
video{width:100%;background:#000;display:block;aspect-ratio:16/9}
/* 紀錄 */
.rec{border-top:1px solid var(--rule);padding:22px 0 8px}
.rec:first-child{border-top:0;padding-top:0}
.rec .date{font-size:13px;color:var(--mute)}
.rec h3{font-weight:500;margin:4px 0 6px;font-size:19px;line-height:1.5}
.rec .meta{font-size:12.5px;color:var(--mute);margin-bottom:4px}.rec .meta a{color:var(--ink)}
.fchips{font-size:12.5px;color:var(--ink2);margin:10px 0 12px;line-height:1.9}.fchips span,.fchips a{margin-right:16px;text-decoration:none}.fchips span:before,.fchips a:before{content:"— ";color:var(--mute)}
.empty{color:var(--mute);font-size:14px}
/* 燈箱、提示、回頂端 */
.lb{position:fixed;inset:0;background:rgba(246,244,240,.97);display:none;align-items:center;justify-content:center;z-index:100;padding:24px}.lb.on{display:flex}
.lb img{max-width:92vw;max-height:84vh}.lb .cap{position:absolute;bottom:18px;left:0;right:0;text-align:center;color:var(--ink2);font-size:13px;padding:0 60px}
.lb .x{position:absolute;top:12px;right:22px;color:var(--ink);font-size:32px;cursor:pointer;line-height:1;font-weight:300}.lb .nav{position:absolute;top:50%;transform:translateY(-50%);color:var(--ink);font-size:40px;cursor:pointer;padding:10px 18px;user-select:none;opacity:.5;font-weight:300}.lb .nav:hover{opacity:1}.lb .prev{left:6px}.lb .next{right:6px}
.toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,16px);background:var(--ink);color:var(--bg);padding:9px 18px;font-size:14px;opacity:0;transition:all .25s;z-index:110;pointer-events:none}.toast.on{opacity:1;transform:translate(-50%,0)}
.totop{position:fixed;right:20px;bottom:20px;width:44px;height:44px;background:var(--bg);color:var(--ink);border:1px solid var(--ink);display:flex;align-items:center;justify-content:center;opacity:0;transform:translateY(10px);transition:.25s;z-index:50;cursor:pointer;font-size:16px}.totop.on{opacity:1;transform:none}.totop:hover{background:var(--ink);color:var(--bg)}
/* 頁尾 */
.foot{margin-top:96px}
.foot .strip{height:10px;background:center/cover}
.foot .wrap{padding-top:40px;padding-bottom:44px;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto;gap:40px;font-size:13px;color:var(--ink2)}
.foot b{display:block;font-weight:500;font-size:15px;color:var(--ink);margin-bottom:6px}
.foot .mats{line-height:1.9;color:var(--mute)}
.foot .ls{display:flex;flex-direction:column;gap:6px}.foot .ls a{text-decoration:none}.foot .ls a:hover{text-decoration:underline}
.foot .gen{grid-column:1/-1;border-top:1px solid var(--rule);padding-top:14px;font-size:12px;color:var(--mute)}
@media(max-width:800px){.foot .wrap{grid-template-columns:minmax(0,1fr)}}
/* 一頁版／列印版 */
.toc table{border-collapse:collapse;width:100%;font-size:14px}.toc th,.toc td{border-bottom:1px solid var(--rule);padding:10px 14px 10px 0;text-align:left;vertical-align:top}.toc th{font-size:12px;color:var(--mute);font-weight:400;border-bottom-color:var(--ink)}.toc td a{text-decoration:none}.toc td a:hover{text-decoration:underline}
.toc td:nth-child(1),.toc td:nth-child(2),.toc td:nth-child(4),.toc td:nth-child(5),.toc td:nth-child(6){white-space:nowrap;color:var(--ink2)}
section.proj{break-before:page;page-break-before:always}
.ptools{display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--ink2);padding:16px 0;border-bottom:1px solid var(--rule)}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{
  :root{--bg:#fff}
  body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .idx,.ptools,.totop,.lb,.toast,.side .acts,.card .go{display:none!important}
  .wrap{max-width:none;padding:0 2mm}
  .file,.rec,.xi,.card{break-inside:avoid;page-break-inside:avoid}
  .yr .y,.side{position:static}
  a{text-decoration:none}
  @page{size:A4;margin:16mm 14mm}
  .hero{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:32px!important;padding:40px 0 32px}
  .hero h1{font-size:72px!important}.hero .lead{font-size:13px;line-height:1.85}
  .figs{grid-template-columns:repeat(4,minmax(0,1fr))!important}.figs div:nth-child(3){padding-left:22px!important;border-left:1px solid var(--rule)!important}.figs div:nth-child(n+3){border-top:0!important}.figs b{font-size:34px}
  .chap{margin-top:8px}.title-page{break-before:page;page-break-before:always}
  .phd .head{padding-top:12px}.phd .pic{aspect-ratio:21/9}
  .layout{grid-template-columns:minmax(0,1fr)!important}
}
`

// 互動（純瀏覽器 JS，不用任何套件）：分類切換、卡片原地展開、圖片燈箱、複製連結、回到頂端。沒有裝飾性動畫。
const JS = `
(function(){
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var tt=document.createElement('div');tt.className='totop';tt.innerHTML='&uarr;';tt.title='回到頂端';document.body.appendChild(tt);tt.addEventListener('click',function(){scrollTo({top:0,behavior:rm?'auto':'smooth'})});addEventListener('scroll',function(){tt.classList.toggle('on',scrollY>700)},{passive:true});
function toast(m){var t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('on')},1800)}
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var v=b.getAttribute('data-copy');(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){toast('已複製連結')},function(){prompt('複製這個網址',v)})})});
var chips=document.querySelectorAll('#chips .chip'),secs=document.querySelectorAll('section.cat');
chips.forEach(function(c){c.addEventListener('click',function(){chips.forEach(function(x){x.classList.remove('on')});c.classList.add('on');var v=c.getAttribute('data-cat');
secs.forEach(function(s){var sc=s.getAttribute('data-cat');s.style.display=(v==='全部'||sc===v)?'':'none'});
var t=document.getElementById('cat-'+v);if(v!=='全部'&&t){scrollTo({top:t.getBoundingClientRect().top+scrollY-48,behavior:rm?'auto':'smooth'})}})});
var imgs=[].slice.call(document.querySelectorAll('[data-lb]'));
if(imgs.length){var lb=document.createElement('div');lb.className='lb';lb.innerHTML='<span class="x" title="關閉">&times;</span><span class="nav prev">&#8249;</span><img alt=""><span class="nav next">&#8250;</span><div class="cap"></div>';document.body.appendChild(lb);var cur=0;
function show(i){cur=(i+imgs.length)%imgs.length;var im=lb.querySelector('img');im.src=imgs[cur].getAttribute('data-lb');lb.querySelector('.cap').textContent=imgs[cur].getAttribute('data-cap')||'';lb.classList.add('on');document.body.style.overflow='hidden'}
function hide(){lb.classList.remove('on');document.body.style.overflow=''}
imgs.forEach(function(a,i){a.addEventListener('click',function(e){e.preventDefault();show(i)})});
lb.querySelector('.x').addEventListener('click',hide);lb.addEventListener('click',function(e){if(e.target===lb)hide()});
lb.querySelector('.prev').addEventListener('click',function(){show(cur-1)});lb.querySelector('.next').addEventListener('click',function(){show(cur+1)});
addEventListener('keydown',function(e){if(!lb.classList.contains('on'))return;if(e.key==='Escape')hide();if(e.key==='ArrowLeft')show(cur-1);if(e.key==='ArrowRight')show(cur+1)})}
var cards=[].slice.call(document.querySelectorAll('.card[data-x]'));
function panelOf(c){return document.getElementById('xp-'+c.getAttribute('data-x'))}
function setGo(id,open){document.querySelectorAll('.card[data-x="'+id+'"]').forEach(function(c){c.classList.toggle('open',open);var g=c.querySelector('.go');if(g)g.textContent=open?'收合':'展開'})}
function closeAll(){document.querySelectorAll('.xpanel').forEach(function(p){if(!p.hidden){p.hidden=true;setGo(p.id.slice(3),false)}})}
function place(c,p){var grid=c.parentNode,top=c.offsetTop,last=c,n=c.nextElementSibling;while(n){if(n.classList.contains('card')){if(Math.abs(n.offsetTop-top)<2)last=n;else break}n=n.nextElementSibling}if(last.nextSibling!==p)grid.insertBefore(p,last.nextSibling)}
function openCard(c){var p=panelOf(c);if(!p)return;closeAll();place(c,p);p.hidden=false;setGo(c.getAttribute('data-x'),true);setTimeout(function(){var r=p.getBoundingClientRect();if(r.bottom>innerHeight||r.top<0)scrollTo({top:scrollY+c.getBoundingClientRect().top-64,behavior:rm?'auto':'smooth'})},30)}
cards.forEach(function(c){c.addEventListener('click',function(e){if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;var p=panelOf(c);if(!p)return;e.preventDefault();if(p.hidden)openCard(c);else{p.hidden=true;setGo(c.getAttribute('data-x'),false)}})});
document.querySelectorAll('.xpanel .xclose').forEach(function(b){b.addEventListener('click',function(){var p=b.closest('.xpanel');p.hidden=true;setGo(p.id.slice(3),false);var c=document.querySelector('.card[data-x="'+p.id.slice(3)+'"]');if(c&&c.getBoundingClientRect().top<0)scrollTo({top:scrollY+c.getBoundingClientRect().top-64,behavior:rm?'auto':'smooth'})})});
})();
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
<meta name="theme-color" content="#f6f4f0">
<meta property="og:title" content="${esc(opt.title)}">
<meta property="og:description" content="${esc(opt.desc)}">
${opt.ogImage ? `<meta property="og:image" content="${esc(opt.ogImage)}">` : ''}
${opt.url ? `<meta property="og:url" content="${esc(opt.url)}">` : ''}
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500&family=Noto+Sans+TC:wght@300;400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>${opt.body}
<script>${JS}</script>
</body>
</html>`
}

function cardHtml(p: ShareProject, key: string): string {
  const t = texOf(p.category || '其他')
  const cover = p.cover ? `<div class="cover"><img src="${esc(p.cover)}" alt="" loading="lazy"></div>` : `<div class="cover tx"></div>`
  return `<a class="card" style="--tex:url('${texUrl(t)}')" href="/portfolio/${esc(key)}/${esc(p.id)}" data-x="${esc(p.id)}">
  ${cover}
  <div class="lab lat"><span class="sw0"><i></i>${esc(p.code || '—')}</span><span>${esc(periodOf(p))}</span></div>
  <h3>${esc(p.name)}</h3>
  ${p.summary ? `<p class="sum">${esc(p.summary)}</p>` : ''}
  <div class="cfoot"><span>紀錄 ${p.records.length}　檔案 ${p.files.length}${p.status ? '　' + esc(p.status) : ''}</span><span class="go">展開</span></div>
</a>`
}

function footHtml(p: Portfolio): string {
  const used = CATEGORY_ORDER.filter(c => p.projects.some(x => (x.category || '其他') === c))
  return `<footer class="foot"><div class="strip" style="background-image:url('${texUrl(STRIP_TEX)}')"></div><div class="wrap">
  <div><b>${esc(COMPANY)}</b>PrinTex™ 數位紋理・藝格板<br>${esc(OWNER)}（${esc(OWNER_EN)}）工作作品集</div>
  <div class="mats">材質色票<br>${used.map(c => `${esc(c)}　<span class="lat">${esc(texOf(c).code)}</span> ${esc(texOf(c).name)}`).join('<br>')}</div>
  <div class="ls"><a href="https://egrra.vercel.app/" target="_blank" rel="noopener">官方網站</a><a href="https://www.tiktok.com/@marblemetal" target="_blank" rel="noopener">TikTok 大理石魔術師呂哥</a><a href="https://www.youtube.com/@marblemetal" target="_blank" rel="noopener">YouTube</a><a href="https://www.instagram.com/egrra1199/" target="_blank" rel="noopener">Instagram</a></div>
  <div class="gen">此頁由紀錄櫃 App 在 ${esc(tw(p.generatedAt))}（台北）產生；檔案與縮圖連結到 ${esc(tw(p.linkExpiresAt))} 前有效，之後重新整理即可。</div>
</div></footer>`
}

// 首頁卡片點一下在原地展開的面板：一句摘要、檔案縮圖一列、紀錄清單；完整內容在專案頁
function panelHtml(p: ShareProject, key: string): string {
  const href = `/portfolio/${esc(key)}/${esc(p.id)}`
  const sum = firstLine(p.note) || p.summary
  const facts = [p.status ? `<span>狀態　${esc(p.status)}</span>` : '', periodOf(p) ? `<span>期間　<span class="lat">${esc(periodOf(p))}</span></span>` : '', `<span>紀錄　${p.records.length}</span>`, `<span>檔案　${p.files.length}</span>`, p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">連結 ↗</a>` : ''].filter(Boolean).join('')
  const visual = p.files.filter(f => f.thumb || isVideo(f.name) || isImage(f.name))
  const files = [...visual, ...p.files.filter(f => !visual.includes(f))]
  const tile = (f: ShareFile) => {
    if (f.confidential) return `<div class="xf locked"><div class="xft"><span>機密</span></div><div class="xfn">${esc(f.name)}</div></div>`
    const lb = f.url && isImage(f.name) ? ` data-lb="${esc(f.url)}" data-cap="${esc(f.name)}"` : ''
    const th = f.thumb ? `<img src="${esc(f.thumb)}" alt="" loading="lazy">` : `<span class="lat">${esc(isVideo(f.name) ? '影片' : extOf(f.name))}</span>`
    return `<a class="xf" href="${esc(f.url || href)}"${lb} target="_blank" rel="noopener"><div class="xft">${th}</div><div class="xfn">${esc(f.name)}</div></a>`
  }
  const MAXF = 12, MAXR = 6
  const fl = files.length ? `<div class="xfiles">${files.slice(0, MAXF).map(tile).join('')}${files.length > MAXF ? `<a class="xmore" href="${href}">還有 ${files.length - MAXF} 個</a>` : ''}</div>` : '<p class="empty">這個專案沒有放檔案（例如 SOP、說明書類只留紀錄）。</p>'
  const rl = p.records.length ? `<ul class="xrecs">${p.records.slice(0, MAXR).map(r => `<li><span class="d lat">${esc(r.date || '')}</span><span>${esc(r.title)}</span></li>`).join('')}</ul>${p.records.length > MAXR ? `<a class="xmore" href="${href}">全部 ${p.records.length} 筆紀錄</a>` : ''}` : '<p class="empty">沒有紀錄。</p>'
  return `<div class="xpanel" id="xp-${esc(p.id)}" hidden>
  <div class="xphead"><div><div class="lab lat">${esc(p.code || '')}　${esc(p.category || '其他')}</div><h3>${esc(p.name)}</h3></div><div class="xpacts"><a class="btnp" href="${href}">開啟專案頁</a><button class="btno xclose" type="button">收合</button></div></div>
  ${sum ? `<p class="xpsum">${esc(sum)}</p>` : ''}<div class="xpfacts">${facts}</div>
  <div class="xpsec"><span class="lat">01</span><b>成果檔案</b><span>${p.files.length}</span></div>${fl}
  <div class="xpsec"><span class="lat">02</span><b>工作紀錄</b><span>${p.records.length}</span></div>${rl}
</div>`
}

// 經歷：2024 年起的每一筆工作紀錄，依年、月分組，由新到舊；每筆可點進專案（列印版連到書內該專案那一節）
const TL_START_YEAR = 2024
const firstLine = (note: string): string => {
  for (const raw of String(note || '').split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || l.startsWith('|') || /^#{1,6}\s/.test(l) || /^【[^】]*】$/.test(l) || /^[-*]\s/.test(l) || /^\d+\.\s/.test(l)) continue
    return l.replace(/\*\*/g, '')
  }
  return ''
}
function ledgerHtml(p: Portfolio, key: string, print = false): { html: string; count: number; range: string } {
  type E = { pr: ShareProject; idx: number; r: ShareRecord; t: number }
  const toT = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN }
  const START = Date.UTC(TL_START_YEAR, 0, 1)
  const es: E[] = []
  p.projects.forEach((pr, idx) => pr.records.forEach(r => { const t = toT(r.date); if (!isNaN(t) && t >= START) es.push({ pr, idx, r, t }) }))
  if (!es.length) return { html: '', count: 0, range: '' }
  es.sort((a, b) => b.t - a.t || a.pr.name.localeCompare(b.pr.name))
  const years = new Map<string, Map<string, E[]>>()
  for (const e of es) {
    const y = e.r.date.slice(0, 4), m = e.r.date.slice(5, 7)
    if (!years.has(y)) years.set(y, new Map())
    const ym = years.get(y) as Map<string, E[]>
    if (!ym.has(m)) ym.set(m, [])
    ;(ym.get(m) as E[]).push(e)
  }
  const item = (e: E) => {
    const href = print ? `#p${e.idx + 1}` : `/portfolio/${esc(key)}/${esc(e.pr.id)}`
    const sum = firstLine(e.r.note)
    const tags = [e.r.status, e.r.files.length ? `檔案 ${e.r.files.length}` : ''].filter(Boolean).join('　')
    return `<a class="xi" href="${href}"><div class="xd lat">${esc(e.r.date.slice(5).replace('-', '.'))}</div><div><div class="xp"><span class="lat">${esc(e.pr.code || '')}</span>　${esc(e.pr.name)}</div><h3>${esc(e.r.title)}</h3>${sum ? `<p>${esc(sum)}</p>` : ''}${tags ? `<div class="xs">${esc(tags)}</div>` : ''}</div></a>`
  }
  const blocks = Array.from(years.entries()).map(([y, ym]) => {
    const n = Array.from(ym.values()).reduce((s, a) => s + a.length, 0)
    const months = Array.from(ym.entries()).map(([m, list]) => `<div class="mo lat">${esc(y)}.${esc(m)}</div>${list.map(item).join('\n')}`).join('\n')
    return `<div class="yr"><div class="y"><b class="lat">${esc(y)}</b><span>${n} 筆經歷</span></div><div>${months}</div></div>`
  }).join('\n')
  const yrs = Array.from(years.keys())
  return { html: blocks, count: es.length, range: `${yrs[yrs.length - 1]}–${yrs[0]}` }
}

function chapHead(no: string, title: string, note: string, tex?: Tex): string {
  return `<div class="chap"><span class="no lat">${esc(no)}</span><h2>${esc(title)}<span class="note">${esc(note)}</span></h2>${tex ? `<div class="mat"><i style="background-image:url('${texUrl(tex)}')"></i><span><span class="lat">${esc(tex.code)}</span>　${esc(tex.name)}</span></div>` : '<span></span>'}</div>`
}

function heroHtml(p: Portfolio, key: string, opt: { print: boolean }): string {
  const yearNow = String(new Date().getFullYear())
  const cats = CATEGORY_ORDER.filter(c => p.projects.some(x => (x.category || '其他') === c)).slice(0, 4)
  const sw = cats.map(c => { const t = texOf(c); return `<figure class="sw"><i style="background-image:url('${texUrl(t)}')"></i><figcaption>${esc(c)}<span class="lat">${esc(t.code)} ${esc(t.name)}</span></figcaption></figure>` }).join('')
  const links = opt.print
    ? `<div class="links"><span>線上版　${esc(p.origin)}/portfolio/${esc(key)}</span></div>`
    : `<nav class="links"><a href="#featured">精選作品</a><a href="#timeline">經歷</a><a href="/portfolio/${esc(key)}?all=1">一頁看完全部</a></nav>`
  return `<header class="wrap">
  <div class="top"><b>${esc(COMPANY)}</b><span class="lat">PrinTex™ Digital Texture　·　${TL_START_YEAR}–${esc(yearNow)}</span></div>
  <div class="hero">
    <div><h1>${esc(OWNER)}</h1><div class="sub"><span>工作作品集</span><span class="lat">${esc(OWNER_EN)}　Portfolio ${TL_START_YEAR}–${esc(yearNow)}</span></div></div>
    <div><p class="lead">${esc(INTRO)}</p><div class="swatches">${sw}</div></div>
  </div>
  <div class="figs"><div><b class="lat">${p.stats.projects}</b><span>專案</span></div><div><b class="lat">${p.stats.records}</b><span>工作紀錄</span></div><div><b class="lat">${p.stats.files}</b><span>成果檔案</span></div><div><b class="lat">${TL_START_YEAR}–${esc(yearNow.slice(2))}</b><span>期間</span></div></div>
  ${links}
</header>`
}

export function portfolioIndexHtml(p: Portfolio, key: string): string {
  const cats = CATEGORY_ORDER.filter(c => p.projects.some(x => (x.category || '其他') === c))
  const extra = Array.from(new Set(p.projects.map(x => x.category || '其他'))).filter(c => !cats.includes(c))
  const allCats = [...cats, ...extra]
  // 精選：有封面與檔案，優先挑有第三方留痕（媒體露出、客戶回饋、平台數字）的，再看檔案與紀錄多寡
  const evidence = (x: ShareProject) => /媒體露出|客戶回饋|第三方|佐證|使用數據/.test(x.note || '') ? 8 : 0
  const score = (x: ShareProject) => (x.cover ? 3 : -99) + evidence(x) + x.files.length + x.records.length * 2
  const featured = [...p.projects].filter(x => x.cover && x.files.length).sort((a, b) => score(b) - score(a)).slice(0, 3)
  const led = ledgerHtml(p, key)
  let n = 1
  const featHtml = featured.length ? `<section class="cat" data-cat="精選" id="featured"><div class="wrap">${chapHead(no2(n++), '精選作品', '有客戶回饋、媒體露出或平台數字的案子')}<div class="grid">${featured.map(x => cardHtml(x, key)).join('\n')}</div></div></section>` : ''
  const ledHtml = led.count ? `<section class="cat" data-cat="經歷" id="timeline"><div class="wrap">${chapHead(no2(n++), `經歷　${led.range}`, `${led.count} 筆工作紀錄，由新到舊；點一筆進專案`)}${led.html}</div></section>` : ''
  const sections = allCats.map(c => {
    const items = p.projects.filter(x => (x.category || '其他') === c)
    return `<section class="cat" data-cat="${esc(c)}" id="cat-${esc(c)}"><div class="wrap">${chapHead(no2(n++), c, `${items.length} 個專案`, texOf(c))}<div class="grid">${items.map(x => cardHtml(x, key) + panelHtml(x, key)).join('\n')}</div></div></section>`
  }).join('\n')
  const chips = ['全部', ...(featured.length ? ['精選'] : []), ...(led.count ? ['經歷'] : []), ...allCats].map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('')
  const body = `${heroHtml(p, key, { print: false })}
<nav class="idx"><div class="wrap" id="chips"><span class="who">${esc(OWNER)}　工作作品集</span>${chips}</div></nav>
<main>
${featHtml}
${ledHtml}
${sections}
</main>
${footHtml(p)}`
  const og = featured[0]?.cover || p.projects.find(x => x.cover)?.cover
  return page({ title: `${OWNER} 工作作品集｜${COMPANY}`, desc: INTRO, body, ogImage: og, url: `${p.origin}/portfolio/${key}` })
}

function fileHtml(f: ShareFile, print = false): string {
  const meta = `<div class="fmeta">${f.category ? `<span>${esc(f.category)}</span>` : ''}${f.date ? `<span class="lat">${esc(f.date)}</span>` : ''}</div>`
  if (f.confidential) return `<div class="file locked"><div class="cover"><span class="lk">機密　只記錄不查閱</span></div><div class="body"><div class="name">${esc(f.name)}</div>${meta}${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}<div class="lockline">內含機密資料，只列出紀錄，不提供開啟與下載</div></div></div>`
  let media: string
  if (f.url && isVideo(f.name) && !print) media = `<video controls preload="metadata"${f.thumb ? ` poster="${esc(f.thumb)}"` : ''} src="${esc(f.url)}"></video>`
  else if (f.thumb && f.url && isImage(f.name)) media = `<a class="cover" href="${esc(f.url)}" data-lb="${esc(f.url)}" data-cap="${esc(f.name)}" target="_blank" rel="noopener"><img src="${esc(f.thumb)}" alt="" loading="lazy"></a>`
  else if (f.thumb) media = `<a class="cover" href="${esc(f.url || '#')}" data-ext="${esc(extOf(f.name))}" target="_blank" rel="noopener"><img src="${esc(f.thumb)}" alt="" loading="lazy"></a>`
  else media = `<div class="cover"><span class="ph lat">${esc(isVideo(f.name) ? '影片' : extOf(f.name))}</span></div>`
  const acts = f.url ? `<div class="acts"><a href="${esc(f.url)}" target="_blank" rel="noopener">開啟</a><a href="${esc(f.download)}">下載</a></div>` : ''
  return `<div class="file">${media}<div class="body"><div class="name">${esc(f.name)}</div>${meta}${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}${acts}</div></div>`
}

function recordHtml(r: ShareRecord): string {
  const meta = [r.status, r.category, ...r.tags].filter(Boolean).map(esc).join('　·　') + (r.link ? `　·　<a href="${esc(r.link)}" target="_blank" rel="noopener">連結 ↗</a>` : '')
  const files = r.files.length ? `<div class="fchips">${r.files.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''
  const att = r.attachments.length ? `<div class="fchips">${r.attachments.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join('')}</div>` : ''
  return `<article class="rec"><div class="date lat">${esc(r.date || '（無日期）')}</div><h3>${esc(r.title)}</h3><div class="meta">${meta}</div>${r.note ? `<div class="rich">${noteHtml(r.note)}</div>` : ''}${files}${att}</article>`
}

// 專案的主體（說明、檔案、紀錄），專案頁與一頁版共用
function projectBody(pr: ShareProject, opt: { print: boolean }): string {
  const files = pr.files
  const visual = files.filter(f => f.thumb || isVideo(f.name) || isImage(f.name))
  const others = files.filter(f => !visual.includes(f))
  let k = 1
  return `${pr.note ? `<h2 class="sec"><span class="no lat">${no2(k++)}</span><span>專案說明</span></h2><div class="rich">${noteHtml(pr.note)}</div>` : ''}
<h2 class="sec"><span class="no lat">${no2(k++)}</span><span>成果檔案<small>${files.length}</small></span></h2>
${files.length ? `<div class="files">${[...visual, ...others].map(f => fileHtml(f, opt.print)).join('\n')}</div>` : '<p class="empty">這個專案沒有放檔案（例如 SOP、說明書類只留紀錄）。</p>'}
<h2 class="sec"><span class="no lat">${no2(k++)}</span><span>工作紀錄<small>${pr.records.length}</small></span></h2>
${pr.records.length ? `<div class="recs">${pr.records.map(recordHtml).join('\n')}</div>` : '<p class="empty">沒有紀錄。</p>'}`
}

function projectHead(pr: ShareProject, top: string): string {
  const t = texOf(pr.category || '其他')
  const per = periodOf(pr)
  const pic = pr.cover ? `<div class="pic"><img src="${esc(pr.cover)}" alt=""></div>` : `<div class="pic tx"></div>`
  return `<header class="phd wrap" style="--tex:url('${texUrl(t)}')">
  ${top}
  <div class="head">
    <div><div class="lab"><span class="lat">${esc(pr.code || '')}</span><span>${esc(pr.category || '其他')}</span><span>${esc(pr.status || '')}</span>${per ? `<span class="lat">${esc(per)}</span>` : ''}</div>
      <h1>${esc(pr.name)}</h1>${pr.summary ? `<p class="lede">${esc(pr.summary)}</p>` : ''}</div>
    <div class="mat"><i></i><span><span class="lat">${esc(t.code)}</span>　${esc(t.name)}</span></div>
  </div>
  ${pic}
</header>`
}

export function projectHtml(p: Portfolio, pr: ShareProject, key: string): string {
  const url = `${p.origin}/portfolio/${key}/${pr.id}`
  const top = `<div class="top"><a href="/portfolio/${esc(key)}">← ${esc(OWNER)}　工作作品集</a><b>${esc(COMPANY)}</b></div>`
  const per = periodOf(pr)
  const body = `${projectHead(pr, top)}
<div class="wrap"><div class="layout">
  <main>${projectBody(pr, { print: false })}</main>
  <aside class="side">
    <dl class="facts">
      <div><dt>編號</dt><dd class="lat">${esc(pr.code || '—')}</dd></div>
      <div><dt>分類</dt><dd>${esc(pr.category || '其他')}</dd></div>
      <div><dt>狀態</dt><dd>${esc(pr.status || '—')}</dd></div>
      ${per ? `<div><dt>期間</dt><dd class="lat">${esc(per)}</dd></div>` : ''}
      <div><dt>紀錄</dt><dd>${pr.records.length} 筆</dd></div>
      <div><dt>檔案</dt><dd>${pr.files.length} 個</dd></div>
      ${pr.link ? `<div><dt>連結</dt><dd><a href="${esc(pr.link)}" target="_blank" rel="noopener">${esc(pr.link.replace(/^https?:\/\//, ''))}</a></dd></div>` : ''}
    </dl>
    <div class="acts">${pr.link ? `<a class="btnp" href="${esc(pr.link)}" target="_blank" rel="noopener">開啟連結 ↗</a>` : ''}<button class="btno" type="button" data-copy="${esc(url)}">複製這頁連結</button><a class="btno" href="/portfolio/${esc(key)}">回作品集</a></div>
  </aside>
</div></div>
${footHtml(p)}`
  return page({ title: `${pr.name}｜${OWNER} 工作作品集`, desc: pr.summary || INTRO, body, ogImage: pr.cover || undefined, url })
}

// 一頁版（也是列印版）：首頁、專案一覽、經歷、每個專案一節（列印時每節從新的一頁開始）。瀏覽器「列印 → 另存 PDF」就是書面版。
export function portfolioFullHtml(p: Portfolio, key: string): string {
  const toc = p.projects.map((x, i) => `<tr><td class="lat">${no2(i + 1)}</td><td class="lat">${esc(x.code || '')}</td><td><a href="#p${i + 1}">${esc(x.name)}</a></td><td>${esc(x.category || '其他')}</td><td class="lat">${esc(periodOf(x))}</td><td class="lat">${x.records.length} / ${x.files.length}</td></tr>`).join('')
  const led = ledgerHtml(p, key, true)
  const sections = p.projects.map((pr, i) => `<section class="proj" id="p${i + 1}">
${projectHead(pr, `<div class="top"><span>${esc(OWNER)}　工作作品集</span><span class="lat">${no2(i + 1)} / ${no2(p.projects.length)}</span></div>`)}
<div class="wrap">${projectBody(pr, { print: true })}</div>
</section>`).join('\n')
  const body = `<div class="wrap"><div class="ptools"><a class="btnp" href="/portfolio/${esc(key)}">← 回作品集首頁</a><span>這一頁把所有專案排在一起；用瀏覽器「列印」選「另存為 PDF」，就是書面版作品集。</span></div></div>
${heroHtml(p, key, { print: true })}
<section class="title-page"><div class="wrap">
${chapHead('01', '專案一覽', `${p.projects.length} 個專案；編號、期間、紀錄 / 檔案數`)}
<div class="toc"><table><tr><th>#</th><th>編號</th><th>專案</th><th>分類</th><th>期間</th><th>紀錄 / 檔案</th></tr>${toc}</table></div>
</div></section>
${led.count ? `<section class="proj"><div class="wrap">${chapHead('02', `經歷　${led.range}`, `${led.count} 筆工作紀錄，由新到舊；每一筆都連到書內該專案那一節`)}${led.html}</div></section>` : ''}
${sections}
${footHtml(p)}`
  // 一頁版：不延遲載圖（否則另存 PDF 時圖會空白）
  const html = body.replace(/ loading="lazy"/g, '')
  return page({ title: `${OWNER} 工作作品集（一頁版）｜${COMPANY}`, desc: INTRO, body: html, ogImage: p.projects.find(x => x.cover)?.cover, url: `${p.origin}/portfolio/${key}?all=1` })
}
