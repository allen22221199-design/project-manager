import type { Portfolio, ShareProject, ShareRecord, ShareFile } from './jilugui-share'

// 紀錄櫃「作品集網頁」：給人看的唯讀版本。資料跟「分享給 AI」同一份（buildPortfolio），只是排成網頁。
// 網址 /portfolio/<金鑰>（首頁）、/portfolio/<金鑰>/<專案 id>（專案頁）、/portfolio/<金鑰>?all=1（一頁看完全部／列印版）。
//
// 設計概念：「PrinTex 樣板冊」。整本作品集當成煌盛自己的材質樣板冊來排——
// 每個分類各用一款真實的 PrinTex 紋理（官網花色庫的原圖，放在 public/ptx/，標上真的花色編號），
// 每個專案是一片「樣板」：左緣露出該分類的石材、上面貼著專案編號（Notion 的 PRJ-xx）。
// 版面語彙取自型錄與規格表：直排姓名、朱文印章、壹貳參章節、細線表格、等寬字的編號與日期。
// 刻意不用：漸層光暈、金色流光、圓角卡片陰影、英文小標、卡片傾斜、數字跳動這類常見的網頁模板手法。

const CATEGORY_ORDER = ['系統開發', '行銷', '工程', '行政', '業務', '會議', '採購', '其他']
const COMPANY = '煌盛興業 EGRRA'
const OWNER = '呂理論'
const OWNER_EN = 'Alen Lu'
const INTRO = '煌盛興業是 PrinTex™ 數位紋理技術與藝格板的製造商，四十多年金屬板製造與大理石紋開發經驗。這裡整理總經理呂理論近年主導或親手完成的工作：系統開發、行銷內容、工程打樣與內部教育訓練。每個專案都附上成果檔案、工作紀錄，以及客戶回饋、媒體露出、平台數字這類第三方留痕。'
const NUM = ['壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖', '拾', '拾壹', '拾貳', '拾參']

// 每個分類用一款 PrinTex 紋理（編號與名稱照官網花色庫）
type Tex = { code: string; name: string; file: string }
const TEX: Record<string, Tex> = {
  '系統開發': { code: 'PT-M101', name: '克羅蒂灰', file: 'PTM101.jpg' },
  '行銷': { code: 'PT-M208', name: '西班牙紅', file: 'PTM208.jpg' },
  '工程': { code: 'PT-G102', name: '喬治亞灰', file: 'PTG102.jpg' },
  '行政': { code: 'PT-W204', name: '灰橡', file: 'PTW204.jpg' },
  '業務': { code: 'PT-M014', name: '白練', file: 'PTM014.jpg' },
  '會議': { code: 'PT-M118', name: '石墨灰', file: 'PTM118.jpg' },
  '採購': { code: 'PT-G001', name: '金麻', file: 'PTG001.jpg' },
  '其他': { code: 'PT-M005', name: '月光白', file: 'PTM005.jpg' },
}
const HERO_TEX: Tex = { code: 'PT-M111', name: '水墨灰', file: 'PTM111.jpg' }
const FOOT_TEX: Tex = { code: 'PT-M301', name: '墨淵', file: 'PTM301.jpg' }
const texOf = (c: string) => TEX[c] || TEX['其他']
const texUrl = (t: Tex) => `/ptx/${t.file}`

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tw = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
const isVideo = (name: string) => /\.(mp4|mov|webm|m4v)$/i.test(name || '')
const isImage = (name: string) => /\.(png|jpe?g|gif|webp)$/i.test(name || '')
const extOf = (name: string) => (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4)

// 專案期間：紀錄與檔案日期的最早到最晚，寫成 2025.08—2025.11
function periodOf(pr: ShareProject): string {
  const ds = [...pr.records.map(r => r.date), ...pr.files.map(f => f.date), pr.lastDate].filter(d => /^\d{4}-\d{2}/.test(d || '')).sort()
  if (!ds.length) return ''
  const f = (d: string) => d.slice(0, 7).replace('-', '.')
  const a = f(ds[0]), b = f(ds[ds.length - 1])
  return a === b ? a : `${a}—${b}`
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
:root{--stone:#ebe7df;--paper:#f8f6f1;--ink:#1c1b19;--ink2:#4a4743;--mute:#8a857c;--rule:#d2cbbe;--rule2:#b8b0a2;--seal:#a3322a;--slab:#1f1e1c}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--stone);color:var(--ink);font:16px/1.75 "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;letter-spacing:.02em}
.serif{font-family:"Noto Serif TC","Songti TC","PMingLiU",serif}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
/* 朱文印章：論呂／印理（由右上往下讀：呂理論印） */
.seal{display:inline-grid;grid-template-columns:1fr 1fr;width:58px;height:58px;padding:5px;background:var(--seal);color:#f6efe6;font-family:"Noto Serif TC",serif;font-weight:900;font-size:21px;line-height:1;border-radius:3px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.18)}
.seal i{font-style:normal;display:flex;align-items:center;justify-content:center}
.seal.sm{width:34px;height:34px;font-size:12px;padding:3px;border-radius:2px}
/* 書名頁 */
.mast{padding:28px 0 56px}
.mast .bar{display:flex;justify-content:space-between;gap:16px;align-items:baseline;font-size:12px;color:var(--ink2);border-bottom:1px solid var(--ink);padding-bottom:10px;margin-bottom:48px}
.mast .bar b{font-family:"Noto Serif TC",serif;font-size:15px;color:var(--ink)}
.mgrid{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(260px,400px);gap:56px;align-items:stretch}
.vname{display:flex;flex-direction:row-reverse;gap:22px;align-items:flex-start;margin:0}
.vname .n{writing-mode:vertical-rl;font-family:"Noto Serif TC",serif;font-weight:900;font-size:clamp(76px,9vw,132px);line-height:1;letter-spacing:.1em}
.vname .t{writing-mode:vertical-rl;font-family:"Noto Serif TC",serif;font-weight:700;font-size:clamp(20px,2vw,26px);letter-spacing:.55em;color:var(--ink2);padding-top:.4em}
.namecol{display:flex;flex-direction:column;justify-content:space-between;gap:28px}
.namecol .en{font-size:12px;color:var(--mute);writing-mode:vertical-rl;letter-spacing:.2em}
.lead{font-size:17px;line-height:2;color:var(--ink2);margin:0 0 28px;max-width:34em}
.spec{margin:0 0 28px;border-top:1px solid var(--ink)}
.spec div{display:grid;grid-template-columns:7em 1fr;gap:12px;align-items:baseline;border-bottom:1px solid var(--rule);padding:9px 0}
.spec dt{font-size:13px;color:var(--mute)}.spec dd{margin:0;font-size:15px}
.spec dd b{font-family:"Noto Serif TC",serif;font-size:26px;font-weight:700;margin-right:4px;line-height:1}
.mlinks{display:flex;flex-wrap:wrap;gap:8px 26px;font-size:15px}
.mlinks a{text-decoration:none;border-bottom:1px solid var(--ink);padding-bottom:2px}.mlinks a:hover{color:var(--seal);border-color:var(--seal)}
.plate{margin:0;display:flex;flex-direction:column;gap:10px}
.plate .slab{flex:1;min-height:440px;background:center/cover;box-shadow:0 1px 0 rgba(0,0,0,.08),0 22px 34px -26px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.18)}
.plate figcaption{font-size:11.5px;color:var(--ink2);display:flex;justify-content:space-between;gap:10px;border-top:1px solid var(--rule2);padding-top:7px}
@media(max-width:900px){.mgrid{grid-template-columns:auto minmax(0,1fr);gap:28px}.mgrid .txt{grid-column:1/-1;order:3}.plate .slab{min-height:340px}}
@media(max-width:560px){.mast{padding-bottom:36px}.mast .bar{margin-bottom:28px}.vname .n{font-size:64px}.vname .t{font-size:17px}.plate .slab{min-height:280px}.namecol .en{display:none}}
/* 目錄列 */
.idx{position:sticky;top:0;z-index:20;background:rgba(235,231,223,.95);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-top:1px solid var(--ink);border-bottom:1px solid var(--rule)}
.idx .wrap{display:flex;align-items:center;gap:2px;overflow-x:auto;scrollbar-width:none}.idx .wrap::-webkit-scrollbar{display:none}
.idx .who{display:flex;align-items:center;gap:10px;margin-right:14px;font-family:"Noto Serif TC",serif;font-weight:700;font-size:14px;white-space:nowrap}
.chip{appearance:none;background:none;border:0;border-bottom:2px solid transparent;padding:13px 11px 11px;font:inherit;font-size:14px;color:var(--ink2);cursor:pointer;white-space:nowrap}
.chip:hover{color:var(--ink)}.chip.on{color:var(--ink);border-bottom-color:var(--seal)}
/* 章節 */
section.cat{padding:8px 0 24px;scroll-margin-top:56px}
.chap{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:22px;align-items:end;border-top:1px solid var(--ink);padding-top:20px;margin:64px 0 28px}
.chap .no{font-family:"Noto Serif TC",serif;font-weight:900;font-size:58px;line-height:.85;color:var(--seal)}
.chap h2{font-family:"Noto Serif TC",serif;font-weight:900;font-size:34px;line-height:1.15;margin:0}
.chap .note{display:block;font-size:13px;color:var(--mute);margin-top:6px;font-weight:400;font-family:"Noto Sans TC",sans-serif}
.chap .mat{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--ink2);text-align:right}
.chap .mat i{display:block;width:54px;height:34px;background:center/cover;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
@media(max-width:600px){.chap{grid-template-columns:auto minmax(0,1fr);margin-top:44px}.chap .no{font-size:44px}.chap h2{font-size:27px}.chap .mat{grid-column:1/-1;justify-content:flex-start;text-align:left}}
/* 樣板（專案卡） */
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:30px 26px}
@media(max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.grid{grid-template-columns:minmax(0,1fr)}}
.card{position:relative;display:flex;flex-direction:column;background:var(--paper);border:1px solid var(--rule);text-decoration:none;color:inherit;padding-left:14px;transition:border-color .2s}
.card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--tex) center/cover;box-shadow:inset -1px 0 0 rgba(0,0,0,.15);transition:width .25s ease;z-index:1}
.card:hover{border-color:var(--ink)}.card:hover:before{width:24px}
.card .cover{aspect-ratio:4/3;overflow:hidden;background:#ddd7cc;border-bottom:1px solid var(--rule);position:relative}
.card .cover img{width:100%;height:100%;object-fit:cover;display:block}
.card .cover.tx{background:var(--tex) center/cover;display:flex;align-items:flex-end;padding:12px}
.card .cover.tx span{background:rgba(248,246,241,.9);font-size:11px;padding:4px 8px;line-height:1.5}
.card .lab{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:var(--mute);padding:12px 18px 0}
.card .lab .code{color:var(--seal)}
.card h3{font-family:"Noto Serif TC",serif;font-weight:700;font-size:19px;line-height:1.45;margin:6px 18px 6px}
.card .sum{font-size:14px;color:var(--ink2);line-height:1.75;margin:0 18px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .cfoot{margin:14px 18px 0;padding:11px 0 13px;border-top:1px dashed var(--rule2);margin-top:auto;display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--mute)}
.card .sum+.cfoot,.card h3+.cfoot{margin-top:14px}
.card .go{color:var(--ink)}
.card.open{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}.card.open .go{color:var(--seal)}
/* 卡片原地展開 */
.xpanel{grid-column:1/-1;background:var(--paper);border:1px solid var(--ink);border-top-width:3px;animation:pop .25s ease}
.xpanel[hidden]{display:none}
.xpin{padding:22px 26px 26px}
.xphead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;border-bottom:1px solid var(--rule);padding-bottom:14px}
.xphead .lab{font-size:12px;color:var(--mute)}.xphead .lab .code{color:var(--seal)}
.xphead h3{font-family:"Noto Serif TC",serif;font-size:23px;margin:4px 0 0;line-height:1.4;font-weight:900}
.btnp,.btno{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:14px;padding:9px 16px;cursor:pointer;text-decoration:none;border:1px solid var(--ink)}
.btnp{background:var(--ink);color:var(--paper)}.btnp:hover{background:var(--seal);border-color:var(--seal)}
.btno{background:transparent;color:var(--ink)}.btno:hover{border-color:var(--seal);color:var(--seal)}
.xpacts{display:flex;gap:8px;flex-wrap:wrap}
.xpsum{font-size:15px;line-height:1.9;margin:14px 0 8px;max-width:52em}
.xpfacts{font-size:12px;color:var(--ink2);display:flex;flex-wrap:wrap;gap:4px 18px}.xpfacts a{color:var(--seal)}
.xpsec{display:flex;align-items:baseline;gap:10px;font-family:"Noto Serif TC",serif;font-weight:700;font-size:16px;margin:22px 0 10px}.xpsec .no{color:var(--seal)}
.xfiles{display:flex;gap:14px;overflow-x:auto;padding-bottom:8px;scrollbar-width:thin;align-items:flex-start}
.xf{flex:0 0 150px;text-decoration:none;color:inherit}
.xf .xft{width:150px;height:110px;background:#e4dfd5;border:1px solid var(--rule);overflow:hidden;display:flex;align-items:center;justify-content:center}
.xf .xft img{width:100%;height:100%;object-fit:cover;display:block}.xf .xft span{font-size:12px;color:var(--mute)}
.xf:hover .xft{border-color:var(--ink)}
.xf .xfn{font-size:12px;color:var(--ink2);margin-top:6px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}
.xf.locked .xft{background:#d9d3c8;position:relative}.xf.locked .xft span{background:var(--seal);color:#fff;padding:3px 10px;letter-spacing:.3em;font-size:11px}
.xmore{align-self:center;white-space:nowrap;font-size:13px;color:var(--seal);text-decoration:none;padding:0 8px}
.xrecs{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}
.xrecs li{display:grid;grid-template-columns:100px minmax(0,1fr);gap:14px;font-size:14px;line-height:1.6;padding:8px 0;border-bottom:1px solid var(--rule)}
.xrecs .d{color:var(--mute);font-size:12.5px;padding-top:2px}
.xrecs+.xmore{display:inline-block;margin-top:10px;padding:0}
@media(max-width:600px){.xpin{padding:16px}.xf{flex-basis:124px}.xf .xft{width:124px;height:92px}.xrecs li{grid-template-columns:1fr;gap:2px}}
/* 經歷（帳冊式） */
.yr{display:grid;grid-template-columns:150px minmax(0,1fr);gap:30px;border-top:1px solid var(--ink);padding-top:14px;margin-top:30px}
.yr:first-child{margin-top:0}
.yr .y{position:sticky;top:64px;align-self:start}
.yr .y b{display:block;font-family:"Noto Serif TC",serif;font-weight:900;font-size:60px;line-height:1}
.yr .y span{font-size:12px;color:var(--mute)}
.mo{font-size:12px;color:var(--seal);letter-spacing:.12em;padding:4px 0 6px;border-bottom:1px solid var(--rule)}
.mo~.mo{margin-top:18px}
.xi{display:grid;grid-template-columns:62px minmax(0,1fr);gap:18px;padding:13px 10px 13px 12px;border-bottom:1px solid var(--rule);text-decoration:none;color:inherit;position:relative;transition:background .15s}
.xi:hover{background:var(--paper)}.xi:hover:before{content:"";position:absolute;left:0;top:-1px;bottom:-1px;width:3px;background:var(--seal)}
.xi .xd{font-size:14px;color:var(--ink);padding-top:2px}
.xi .xp{font-size:12px;color:var(--mute)}.xi .xp .code{color:var(--seal);margin-right:8px}
.xi h3{font-family:"Noto Serif TC",serif;font-weight:700;font-size:17px;line-height:1.5;margin:2px 0 3px}
.xi p{margin:0;font-size:13.5px;color:var(--ink2);line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.xi .xs{font-size:11.5px;color:var(--mute);margin-top:5px}
@media(max-width:700px){.yr{grid-template-columns:minmax(0,1fr);gap:8px}.yr .y{position:static;display:flex;align-items:baseline;gap:12px}.yr .y b{font-size:42px}.xi{grid-template-columns:minmax(0,1fr);gap:2px;padding-left:8px}}
/* 專案頁 */
.phd{padding:24px 0 40px}
.crumb{display:flex;justify-content:space-between;gap:16px;font-size:12px;color:var(--ink2);border-bottom:1px solid var(--ink);padding-bottom:10px;margin-bottom:40px}
.crumb a{text-decoration:none}.crumb a:hover{color:var(--seal)}
.phgrid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:48px;align-items:end}
.phgrid .lab{font-size:12px;color:var(--mute);display:flex;flex-wrap:wrap;gap:4px 16px}.phgrid .lab .code{color:var(--seal)}
.phgrid h1{font-family:"Noto Serif TC",serif;font-weight:900;font-size:clamp(30px,4.2vw,50px);line-height:1.25;margin:12px 0 16px}
.phgrid .lede{font-size:17px;line-height:1.95;color:var(--ink2);margin:0;max-width:32em}
.mount{margin:0;position:relative;padding-left:18px}
.mount:before{content:"";position:absolute;left:0;top:0;bottom:30px;width:18px;background:var(--tex) center/cover;box-shadow:inset -1px 0 0 rgba(0,0,0,.15)}
.mount .pic{aspect-ratio:4/3;background:#ddd7cc;border:1px solid var(--rule2);overflow:hidden}
.mount .pic img{width:100%;height:100%;object-fit:cover;display:block}
.mount .pic.tx{background:var(--tex) center/cover}
.mount figcaption{font-size:11.5px;color:var(--ink2);display:flex;justify-content:space-between;gap:10px;padding-top:8px}
@media(max-width:860px){.phgrid{grid-template-columns:minmax(0,1fr);gap:28px}}
.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:40px;padding:8px 0 72px}
@media(min-width:980px){.layout{grid-template-columns:minmax(0,1fr) 280px}}
.side{align-self:start;position:sticky;top:20px}
.facts{border-top:1px solid var(--ink)}
.facts div{display:grid;grid-template-columns:4.5em 1fr;gap:10px;border-bottom:1px solid var(--rule);padding:9px 0;font-size:14px}
.facts dt{color:var(--mute);font-size:12.5px}.facts dd{margin:0;word-break:break-all}.facts dd a{color:var(--seal)}
.side .acts{display:flex;flex-direction:column;gap:8px;margin-top:18px}.side .acts>*{justify-content:center}
h2.sec{display:flex;align-items:baseline;gap:12px;font-family:"Noto Serif TC",serif;font-weight:900;font-size:24px;margin:52px 0 18px;padding-top:14px;border-top:1px solid var(--ink)}
h2.sec:first-child{margin-top:0}h2.sec .no{color:var(--seal);font-size:20px}h2.sec small{font-family:"Noto Sans TC",sans-serif;font-weight:400;font-size:13px;color:var(--mute)}
.rich{max-width:860px}.rich p{margin:10px 0}.rich h4{font-family:"Noto Serif TC",serif;margin:22px 0 8px;font-size:17px}.rich ul,.rich ol{margin:8px 0 8px 24px}
.tbl{overflow-x:auto;margin:14px 0}.rich table{border-collapse:collapse;width:100%;font-size:14px;border-top:1px solid var(--ink)}
.rich th{font-size:12px;color:var(--mute);font-weight:500;text-align:left;padding:8px 12px 8px 0;border-bottom:1px solid var(--rule2)}
.rich td{padding:9px 12px 9px 0;border-bottom:1px solid var(--rule);vertical-align:top;line-height:1.75}
.rich td:first-child{color:var(--ink);font-weight:700;white-space:nowrap;width:1%;padding-right:22px}
/* 成果檔案 */
.files{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:20px}
.file{background:var(--paper);border:1px solid var(--rule);display:flex;flex-direction:column}
.file:hover{border-color:var(--ink)}
.file .cover{aspect-ratio:4/3;background:#e4dfd5;display:block;position:relative;overflow:hidden;border-bottom:1px solid var(--rule)}
.file .cover img{width:100%;height:100%;object-fit:contain;display:block}
.file .cover .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;letter-spacing:.2em;color:var(--mute)}
.file a.cover:after{content:"放大";position:absolute;left:0;bottom:0;background:var(--ink);color:var(--paper);font-size:11px;letter-spacing:.2em;padding:5px 10px;opacity:0;transition:opacity .2s}.file a.cover[data-ext]:after{content:"開啟 " attr(data-ext)}.file:hover a.cover:after{opacity:1}
.file .body{padding:12px 14px 14px;font-size:14px;display:flex;flex-direction:column;gap:5px;flex:1}
.file .name{font-weight:700;line-height:1.5;word-break:break-all}
.file .fmeta{font-size:11.5px;color:var(--mute);display:flex;gap:12px}
.file .note{font-size:13px;color:var(--ink2);line-height:1.65;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.file .acts{margin-top:auto;padding-top:8px;display:flex;gap:16px;font-size:13px}.file .acts a{text-decoration:none;border-bottom:1px solid var(--ink)}.file .acts a:hover{color:var(--seal);border-color:var(--seal)}
.file.locked:hover{border-color:var(--rule)}
.file.locked .cover{background:var(--tex,#cfc8bb) center/cover}
.file.locked .cover:before{content:"";position:absolute;inset:0;background:rgba(235,231,223,.58)}
.file.locked .tape{position:absolute;left:-12%;right:-12%;top:44%;transform:rotate(-7deg);background:var(--seal);color:#f6efe6;text-align:center;font-size:12.5px;letter-spacing:.35em;padding:7px 0;box-shadow:0 2px 0 rgba(0,0,0,.12)}
.file.locked .lockline{margin-top:auto;padding-top:8px;font-size:12px;color:var(--seal)}
video{width:100%;background:#000;display:block;aspect-ratio:16/9}
/* 紀錄 */
.rec{border-top:1px solid var(--rule);padding:20px 0 6px}
.rec:first-child{border-top:1px solid var(--ink)}
.rec .date{font-size:12.5px;color:var(--seal)}
.rec h3{font-family:"Noto Serif TC",serif;margin:4px 0 6px;font-size:19px;line-height:1.5;font-weight:700}
.rec .meta{font-size:12px;color:var(--mute);margin-bottom:4px}.rec .meta a{color:var(--seal)}
.fchips{font-size:12px;color:var(--ink2);margin:8px 0 10px;line-height:1.9}.fchips span:before,.fchips a:before{content:"▸ ";color:var(--mute)}.fchips span,.fchips a{margin-right:14px;text-decoration:none}
.empty{color:var(--mute);font-size:14px}
/* 燈箱、提示、回頂端 */
.lb{position:fixed;inset:0;background:rgba(20,19,17,.94);display:none;align-items:center;justify-content:center;z-index:100;padding:24px}.lb.on{display:flex}
.lb img{max-width:92vw;max-height:84vh;box-shadow:0 30px 80px rgba(0,0,0,.6)}.lb .cap{position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#e8e2d8;font-size:13px;padding:0 60px}
.lb .x{position:absolute;top:10px;right:18px;color:#fff;font-size:34px;cursor:pointer;line-height:1}.lb .nav{position:absolute;top:50%;transform:translateY(-50%);color:#fff;font-size:44px;cursor:pointer;padding:10px 18px;user-select:none;opacity:.7}.lb .nav:hover{opacity:1}.lb .prev{left:6px}.lb .next{right:6px}
.toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,16px);background:var(--ink);color:var(--paper);padding:9px 18px;font-size:14px;opacity:0;transition:all .25s;z-index:110;pointer-events:none}.toast.on{opacity:1;transform:translate(-50%,0)}
.totop{position:fixed;right:18px;bottom:18px;width:44px;height:44px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;opacity:0;transform:translateY(10px);transition:.25s;z-index:50;cursor:pointer;font-size:17px}.totop.on{opacity:1;transform:none}.totop:hover{background:var(--seal)}
/* 版權頁 */
.colo{position:relative;color:#d9d3c8;margin-top:56px;padding:46px 0 40px;background:var(--slab) center/cover;isolation:isolate;font-size:13px}
.colo:before{content:"";position:absolute;inset:0;background:rgba(24,23,21,.82);z-index:-1}
.colo .cg{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto;gap:32px;align-items:start}
.colo b{display:block;font-family:"Noto Serif TC",serif;font-size:19px;color:#f3eee6;margin-bottom:6px}
.colo .mats{line-height:1.9;color:#b9b2a6}
.colo .links{display:flex;flex-direction:column;gap:6px}.colo .links a{text-decoration:none;color:#e9e2d6}.colo .links a:hover{color:#fff;text-decoration:underline}
.colo .gen{margin-top:26px;padding-top:12px;border-top:1px solid rgba(255,255,255,.14);font-size:12px;color:#9b948a}
@media(max-width:800px){.colo .cg{grid-template-columns:minmax(0,1fr)}}
/* 一頁版／列印版 */
.title-page{padding:28px 0 40px}
.toc table{border-collapse:collapse;width:100%;font-size:13.5px;border-top:1px solid var(--ink)}.toc th,.toc td{border-bottom:1px solid var(--rule);padding:8px 10px 8px 0;text-align:left;vertical-align:top}.toc th{font-size:12px;color:var(--mute);font-weight:500}.toc td a{text-decoration:none}.toc .code{color:var(--seal)}
section.proj{break-before:page;page-break-before:always;padding-top:20px}
section.proj .runner{display:flex;justify-content:space-between;font-size:11.5px;color:var(--mute);border-bottom:1px solid var(--ink);padding-bottom:8px;margin-bottom:24px}
.ptools{display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--ink2);padding:14px 0;border-bottom:1px solid var(--rule)}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
@media print{
  :root{--stone:#fff;--paper:#fff}
  body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .idx,.ptools,.totop,.lb,.toast,.side .acts,.card .go{display:none!important}
  .wrap{max-width:none;padding:0 6mm}
  .file,.rec,.xi,.card{break-inside:avoid;page-break-inside:avoid}
  .yr .y{position:static}
  a{text-decoration:none}
  @page{size:A4;margin:14mm 12mm}
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
function setGo(id,open){document.querySelectorAll('.card[data-x="'+id+'"]').forEach(function(c){c.classList.toggle('open',open);var g=c.querySelector('.go');if(g)g.textContent=open?'收合 －':'展開 ＋'})}
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
<meta name="theme-color" content="#ebe7df">
<meta property="og:title" content="${esc(opt.title)}">
<meta property="og:description" content="${esc(opt.desc)}">
${opt.ogImage ? `<meta property="og:image" content="${esc(opt.ogImage)}">` : ''}
${opt.url ? `<meta property="og:url" content="${esc(opt.url)}">` : ''}
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700;900&family=Noto+Sans+TC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>${opt.body}
<script>${JS}</script>
</body>
</html>`
}

const sealHtml = (sm = false) => `<span class="seal${sm ? ' sm' : ''}" aria-hidden="true"><i>論</i><i>呂</i><i>印</i><i>理</i></span>`

function cardHtml(p: ShareProject, key: string): string {
  const t = texOf(p.category || '其他')
  const cover = p.cover ? `<div class="cover"><img src="${esc(p.cover)}" alt="" loading="lazy"></div>` : `<div class="cover tx"><span class="mono">${esc(t.code)}　${esc(t.name)}</span></div>`
  const per = periodOf(p)
  return `<a class="card" style="--tex:url('${texUrl(t)}')" href="/portfolio/${esc(key)}/${esc(p.id)}" data-x="${esc(p.id)}">
  ${cover}
  <div class="lab mono"><span class="code">${esc(p.code || '—')}</span><span>${esc(per)}</span></div>
  <h3>${esc(p.name)}</h3>
  ${p.summary ? `<p class="sum">${esc(p.summary)}</p>` : ''}
  <div class="cfoot mono"><span>紀錄 ${p.records.length}　檔案 ${p.files.length}${p.status ? '　' + esc(p.status) : ''}</span><span class="go">展開 ＋</span></div>
</a>`
}

function colophon(p: Portfolio): string {
  const used = CATEGORY_ORDER.filter(c => p.projects.some(x => (x.category || '其他') === c))
  const mats = [`封面　${HERO_TEX.code} ${HERO_TEX.name}`, ...used.map(c => `${c}　${texOf(c).code} ${texOf(c).name}`), `本頁底　${FOOT_TEX.code} ${FOOT_TEX.name}`]
  return `<footer class="colo" style="background-image:url('${texUrl(FOOT_TEX)}')"><div class="wrap">
  <div class="cg">
    <div><b>${esc(COMPANY)}</b>PrinTex™ 數位紋理・藝格板<br>${esc(OWNER)}（${esc(OWNER_EN)}）工作作品集</div>
    <div class="mats mono">本冊以 PrinTex™ 花色樣板排版<br>${mats.map(esc).join('<br>')}</div>
    <div class="links"><a href="https://egrra.vercel.app/" target="_blank" rel="noopener">官方網站</a><a href="https://www.tiktok.com/@marblemetal" target="_blank" rel="noopener">TikTok 大理石魔術師呂哥</a><a href="https://www.youtube.com/@marblemetal" target="_blank" rel="noopener">YouTube</a><a href="https://www.instagram.com/egrra1199/" target="_blank" rel="noopener">Instagram</a></div>
  </div>
  <div class="gen">此頁由紀錄櫃 App 在 ${esc(tw(p.generatedAt))}（台北）產生；檔案與縮圖連結到 ${esc(tw(p.linkExpiresAt))} 前有效，之後重新整理即可。</div>
</div></footer>`
}

// 首頁卡片點一下在原地展開的面板：一句摘要、檔案縮圖一列、紀錄清單；完整內容在專案頁
function panelHtml(p: ShareProject, key: string): string {
  const href = `/portfolio/${esc(key)}/${esc(p.id)}`
  const sum = firstLine(p.note) || p.summary
  const facts = [p.status ? `<span>狀態 ${esc(p.status)}</span>` : '', periodOf(p) ? `<span>期間 ${esc(periodOf(p))}</span>` : '', `<span>紀錄 ${p.records.length}</span>`, `<span>檔案 ${p.files.length}</span>`, p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">連結 ↗</a>` : ''].filter(Boolean).join('')
  const visual = p.files.filter(f => f.thumb || isVideo(f.name) || isImage(f.name))
  const files = [...visual, ...p.files.filter(f => !visual.includes(f))]
  const tile = (f: ShareFile) => {
    if (f.confidential) return `<div class="xf locked"><div class="xft"><span>機密</span></div><div class="xfn">${esc(f.name)}</div></div>`
    const lb = f.url && isImage(f.name) ? ` data-lb="${esc(f.url)}" data-cap="${esc(f.name)}"` : ''
    const th = f.thumb ? `<img src="${esc(f.thumb)}" alt="" loading="lazy">` : `<span class="mono">${esc(isVideo(f.name) ? '影片' : extOf(f.name))}</span>`
    return `<a class="xf" href="${esc(f.url || href)}"${lb} target="_blank" rel="noopener"><div class="xft">${th}</div><div class="xfn">${esc(f.name)}</div></a>`
  }
  const MAXF = 12, MAXR = 6
  const fl = files.length ? `<div class="xfiles">${files.slice(0, MAXF).map(tile).join('')}${files.length > MAXF ? `<a class="xmore" href="${href}">還有 ${files.length - MAXF} 個 →</a>` : ''}</div>` : '<p class="empty">這個專案沒有放檔案（例如 SOP、說明書類只留紀錄）。</p>'
  const rl = p.records.length ? `<ul class="xrecs">${p.records.slice(0, MAXR).map(r => `<li><span class="d mono">${esc(r.date || '')}</span><span>${esc(r.title)}</span></li>`).join('')}</ul>${p.records.length > MAXR ? `<a class="xmore" href="${href}">全部 ${p.records.length} 筆紀錄 →</a>` : ''}` : '<p class="empty">沒有紀錄。</p>'
  return `<div class="xpanel" id="xp-${esc(p.id)}" hidden><div class="xpin">
  <div class="xphead"><div><div class="lab mono"><span class="code">${esc(p.code || '')}</span>　${esc(p.category || '其他')}</div><h3>${esc(p.name)}</h3></div><div class="xpacts"><a class="btnp" href="${href}">開啟專案頁 →</a><button class="btno xclose" type="button">收合</button></div></div>
  ${sum ? `<p class="xpsum">${esc(sum)}</p>` : ''}<div class="xpfacts mono">${facts}</div>
  <div class="xpsec"><span class="no">一</span>成果檔案（${p.files.length}）</div>${fl}
  <div class="xpsec"><span class="no">二</span>工作紀錄（${p.records.length}）</div>${rl}
</div></div>`
}

// 經歷：2024 年起的每一筆工作紀錄，依年、月分組，由新到舊（帳冊式）；每筆可點進專案（列印版連到書內該專案那一節）
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
    return `<a class="xi" href="${href}"><div class="xd mono">${esc(e.r.date.slice(5).replace('-', '.'))}</div><div><div class="xp"><span class="code mono">${esc(e.pr.code || '')}</span>${esc(e.pr.name)}</div><h3>${esc(e.r.title)}</h3>${sum ? `<p>${esc(sum)}</p>` : ''}${tags ? `<div class="xs mono">${esc(tags)}</div>` : ''}</div></a>`
  }
  const blocks = Array.from(years.entries()).map(([y, ym]) => {
    const n = Array.from(ym.values()).reduce((s, a) => s + a.length, 0)
    const months = Array.from(ym.entries()).map(([m, list]) => `<div class="mo mono">${esc(y)}.${esc(m)}</div>${list.map(item).join('\n')}`).join('\n')
    return `<div class="yr"><div class="y"><b>${esc(y)}</b><span>${n} 筆經歷</span></div><div>${months}</div></div>`
  }).join('\n')
  const yrs = Array.from(years.keys())
  return { html: blocks, count: es.length, range: `${yrs[yrs.length - 1]}—${yrs[0]}` }
}

function chapHead(no: string, title: string, note: string, tex?: Tex): string {
  return `<div class="chap"><span class="no">${esc(no)}</span><h2>${esc(title)}<span class="note">${esc(note)}</span></h2>${tex ? `<div class="mat mono"><span>本章材質<br>${esc(tex.code)}　${esc(tex.name)}</span><i style="background-image:url('${texUrl(tex)}')"></i></div>` : '<span></span>'}</div>`
}

function mastHtml(p: Portfolio, key: string, opt: { print: boolean }): string {
  const yearNow = String(new Date().getFullYear())
  const links = opt.print
    ? `<div class="mlinks"><span>線上版：${esc(p.origin)}/portfolio/${esc(key)}</span></div>`
    : `<nav class="mlinks"><a href="#featured">精選作品</a><a href="#timeline">經歷</a><a href="/portfolio/${esc(key)}?all=1">一頁看完全部（可列印）</a></nav>`
  return `<header class="mast"><div class="wrap">
  <div class="bar"><b>${esc(COMPANY)}</b><span class="mono">PrinTex™ 數位紋理・藝格板　／　${TL_START_YEAR}—${esc(yearNow)}</span></div>
  <div class="mgrid">
    <div class="namecol"><h1 class="vname"><span class="n">${esc(OWNER)}</span><span class="t">工作作品集</span></h1><div>${sealHtml()}</div></div>
    <div class="txt">
      <p class="lead">${esc(INTRO)}</p>
      <dl class="spec">
        <div><dt>專案</dt><dd><b>${p.stats.projects}</b>件</dd></div>
        <div><dt>工作紀錄</dt><dd><b>${p.stats.records}</b>筆</dd></div>
        <div><dt>成果檔案</dt><dd><b>${p.stats.files}</b>個</dd></div>
        <div><dt>佐證</dt><dd>客戶回饋・媒體露出・平台數字</dd></div>
        <div><dt>機密資料</dt><dd>只記錄，不開放查閱</dd></div>
      </dl>
      ${links}
    </div>
    <figure class="plate"><div class="slab" style="background-image:url('${texUrl(HERO_TEX)}')"></div><figcaption class="mono"><span>${esc(HERO_TEX.code)}　${esc(HERO_TEX.name)}</span><span>${esc(OWNER_EN)}</span></figcaption></figure>
  </div>
</div></header>`
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
  let n = 0
  const featHtml = featured.length ? `<section class="cat" data-cat="精選" id="featured"><div class="wrap">${chapHead(NUM[n++], '精選作品', '有客戶回饋、媒體露出或平台數字的案子')}<div class="grid">${featured.map(x => cardHtml(x, key)).join('\n')}</div></div></section>` : ''
  const ledHtml = led.count ? `<section class="cat" data-cat="經歷" id="timeline"><div class="wrap">${chapHead(NUM[n++], `經歷 ${led.range}`, `${led.count} 筆工作紀錄，由新到舊；點一筆進專案`)}${led.html}</div></section>` : ''
  const sections = allCats.map(c => {
    const items = p.projects.filter(x => (x.category || '其他') === c)
    return `<section class="cat" data-cat="${esc(c)}" id="cat-${esc(c)}"><div class="wrap">${chapHead(NUM[n++] || '', c, `${items.length} 個專案`, texOf(c))}<div class="grid">${items.map(x => cardHtml(x, key) + panelHtml(x, key)).join('\n')}</div></div></section>`
  }).join('\n')
  const chips = ['全部', ...(featured.length ? ['精選'] : []), ...(led.count ? ['經歷'] : []), ...allCats].map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('')
  const body = `${mastHtml(p, key, { print: false })}
<nav class="idx"><div class="wrap" id="chips"><span class="who">${sealHtml(true)}${esc(OWNER)}</span>${chips}</div></nav>
<main>
${featHtml}
${ledHtml}
${sections}
</main>
${colophon(p)}`
  const og = featured[0]?.cover || p.projects.find(x => x.cover)?.cover
  return page({ title: `${OWNER} 工作作品集｜${COMPANY}`, desc: INTRO, body, ogImage: og, url: `${p.origin}/portfolio/${key}` })
}

function fileHtml(f: ShareFile, print = false): string {
  const meta = `<div class="fmeta mono">${f.category ? `<span>${esc(f.category)}</span>` : ''}${f.date ? `<span>${esc(f.date)}</span>` : ''}</div>`
  if (f.confidential) return `<div class="file locked"><div class="cover"><span class="tape">機密　只記錄不查閱</span></div><div class="body"><div class="name">${esc(f.name)}</div>${meta}${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}<div class="lockline">內含機密資料，只列出紀錄，不提供開啟與下載</div></div></div>`
  let media: string
  if (f.url && isVideo(f.name) && !print) media = `<video controls preload="metadata"${f.thumb ? ` poster="${esc(f.thumb)}"` : ''} src="${esc(f.url)}"></video>`
  else if (f.thumb && f.url && isImage(f.name)) media = `<a class="cover" href="${esc(f.url)}" data-lb="${esc(f.url)}" data-cap="${esc(f.name)}" target="_blank" rel="noopener"><img src="${esc(f.thumb)}" alt="" loading="lazy"></a>`
  else if (f.thumb) media = `<a class="cover" href="${esc(f.url || '#')}" data-ext="${esc(extOf(f.name))}" target="_blank" rel="noopener"><img src="${esc(f.thumb)}" alt="" loading="lazy"></a>`
  else media = `<div class="cover"><span class="ph mono">${esc(isVideo(f.name) ? '影片' : extOf(f.name))}</span></div>`
  const acts = f.url ? `<div class="acts"><a href="${esc(f.url)}" target="_blank" rel="noopener">開啟</a><a href="${esc(f.download)}">下載</a></div>` : ''
  return `<div class="file">${media}<div class="body"><div class="name">${esc(f.name)}</div>${meta}${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}${acts}</div></div>`
}

function recordHtml(r: ShareRecord): string {
  const meta = [r.status, r.category, ...r.tags].filter(Boolean).map(esc).join('　／　') + (r.link ? `　／　<a href="${esc(r.link)}" target="_blank" rel="noopener">連結 ↗</a>` : '')
  const files = r.files.length ? `<div class="fchips">${r.files.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''
  const att = r.attachments.length ? `<div class="fchips">${r.attachments.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join('')}</div>` : ''
  return `<article class="rec"><div class="date mono">${esc(r.date || '（無日期）')}</div><h3>${esc(r.title)}</h3><div class="meta mono">${meta}</div>${r.note ? `<div class="rich">${noteHtml(r.note)}</div>` : ''}${files}${att}</article>`
}

// 專案的主體（說明、檔案、紀錄），專案頁與一頁版共用
function projectBody(pr: ShareProject, opt: { print: boolean }): string {
  const files = pr.files
  const visual = files.filter(f => f.thumb || isVideo(f.name) || isImage(f.name))
  const others = files.filter(f => !visual.includes(f))
  const t = texOf(pr.category || '其他')
  let k = 0
  const no = () => ['一', '二', '三', '四'][k++]
  return `${pr.note ? `<h2 class="sec"><span class="no">${no()}</span>專案說明</h2><div class="rich">${noteHtml(pr.note)}</div>` : ''}
<h2 class="sec"><span class="no">${no()}</span>成果檔案<small>${files.length} 個</small></h2>
${files.length ? `<div class="files" style="--tex:url('${texUrl(t)}')">${[...visual, ...others].map(f => fileHtml(f, opt.print)).join('\n')}</div>` : '<p class="empty">這個專案沒有放檔案（例如 SOP、說明書類只留紀錄）。</p>'}
<h2 class="sec"><span class="no">${no()}</span>工作紀錄<small>${pr.records.length} 筆</small></h2>
${pr.records.length ? `<div class="recs">${pr.records.map(recordHtml).join('\n')}</div>` : '<p class="empty">沒有紀錄。</p>'}`
}

function projectHead(pr: ShareProject, crumb: string): string {
  const t = texOf(pr.category || '其他')
  const per = periodOf(pr)
  const pic = pr.cover ? `<div class="pic"><img src="${esc(pr.cover)}" alt=""></div>` : `<div class="pic tx"></div>`
  return `<header class="phd"><div class="wrap">
  ${crumb}
  <div class="phgrid">
    <div><div class="lab mono"><span class="code">${esc(pr.code || '')}</span><span>${esc(pr.category || '其他')}</span><span>${esc(pr.status || '')}</span>${per ? `<span>${esc(per)}</span>` : ''}</div>
      <h1>${esc(pr.name)}</h1>${pr.summary ? `<p class="lede">${esc(pr.summary)}</p>` : ''}</div>
    <figure class="mount" style="--tex:url('${texUrl(t)}')">${pic}<figcaption class="mono"><span>材質　${esc(t.code)} ${esc(t.name)}</span><span>紀錄 ${pr.records.length}・檔案 ${pr.files.length}</span></figcaption></figure>
  </div>
</div></header>`
}

export function projectHtml(p: Portfolio, pr: ShareProject, key: string): string {
  const url = `${p.origin}/portfolio/${key}/${pr.id}`
  const crumb = `<div class="crumb mono"><a href="/portfolio/${esc(key)}">← ${esc(OWNER)} 工作作品集</a><span>${esc(COMPANY)}</span></div>`
  const per = periodOf(pr)
  const body = `${projectHead(pr, crumb)}
<div class="wrap"><div class="layout">
  <main>${projectBody(pr, { print: false })}</main>
  <aside class="side">
    <dl class="facts mono">
      <div><dt>編號</dt><dd>${esc(pr.code || '—')}</dd></div>
      <div><dt>分類</dt><dd>${esc(pr.category || '其他')}</dd></div>
      <div><dt>狀態</dt><dd>${esc(pr.status || '—')}</dd></div>
      ${per ? `<div><dt>期間</dt><dd>${esc(per)}</dd></div>` : ''}
      <div><dt>紀錄</dt><dd>${pr.records.length} 筆</dd></div>
      <div><dt>檔案</dt><dd>${pr.files.length} 個</dd></div>
      ${pr.link ? `<div><dt>連結</dt><dd><a href="${esc(pr.link)}" target="_blank" rel="noopener">${esc(pr.link.replace(/^https?:\/\//, ''))}</a></dd></div>` : ''}
    </dl>
    <div class="acts">${pr.link ? `<a class="btnp" href="${esc(pr.link)}" target="_blank" rel="noopener">開啟連結 ↗</a>` : ''}<button class="btno" type="button" data-copy="${esc(url)}">複製這頁連結</button><a class="btno" href="/portfolio/${esc(key)}">回作品集</a></div>
  </aside>
</div></div>
${colophon(p)}`
  return page({ title: `${pr.name}｜${OWNER} 工作作品集`, desc: pr.summary || INTRO, body, ogImage: pr.cover || undefined, url })
}

// 一頁版（也是列印版）：書名頁、專案一覽、經歷、每個專案一節（列印時每節從新的一頁開始）。瀏覽器「列印 → 另存 PDF」就是書面版。
export function portfolioFullHtml(p: Portfolio, key: string): string {
  const toc = p.projects.map((x, i) => `<tr><td class="mono">${i + 1}</td><td class="mono code">${esc(x.code || '')}</td><td><a href="#p${i + 1}">${esc(x.name)}</a></td><td>${esc(x.category || '其他')}</td><td class="mono">${esc(periodOf(x))}</td><td class="mono">${x.records.length}／${x.files.length}</td></tr>`).join('')
  const led = ledgerHtml(p, key, true)
  const sections = p.projects.map((pr, i) => `<section class="proj" id="p${i + 1}"><div class="wrap">
${projectHead(pr, `<div class="crumb mono"><span>${esc(OWNER)} 工作作品集</span><span>${i + 1}／${p.projects.length}</span></div>`)}
${projectBody(pr, { print: true })}
</div></section>`).join('\n')
  const body = `<div class="wrap"><div class="ptools"><a class="btnp" href="/portfolio/${esc(key)}">← 回作品集首頁</a><span>這一頁把所有專案排在一起；用瀏覽器「列印」選「另存為 PDF」，就是書面版作品集。</span></div></div>
${mastHtml(p, key, { print: true })}
<section class="title-page"><div class="wrap">
${chapHead('目', '專案一覽', `${p.projects.length} 個專案；編號、期間、紀錄／檔案數`)}
<div class="toc"><table><tr><th>#</th><th>編號</th><th>專案</th><th>分類</th><th>期間</th><th>紀錄／檔案</th></tr>${toc}</table></div>
</div></section>
${led.count ? `<section class="proj"><div class="wrap">${chapHead('歷', `經歷 ${led.range}`, `${led.count} 筆工作紀錄，由新到舊；每一筆都連到書內該專案那一節`)}${led.html}</div></section>` : ''}
${sections}
${colophon(p)}`
  // 一頁版：不延遲載圖（否則另存 PDF 時圖會空白）
  const html = body.replace(/ loading="lazy"/g, '')
  return page({ title: `${OWNER} 工作作品集（一頁版）｜${COMPANY}`, desc: INTRO, body: html, ogImage: p.projects.find(x => x.cover)?.cover, url: `${p.origin}/portfolio/${key}?all=1` })
}
