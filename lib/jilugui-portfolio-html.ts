import type { Portfolio, ShareProject, ShareRecord, ShareFile } from './jilugui-share'

// 紀錄櫃「作品集網頁」：給人看的唯讀版本。資料跟「分享給 AI」同一份（buildPortfolio），只是排成網頁。
// 網址 /portfolio/<金鑰>（首頁）、/portfolio/<金鑰>/<專案 id>（專案頁）、/portfolio/<金鑰>?all=1（列印版）。
// 視覺跟官網同一套：深色大面積、暖石色紙面、香檳金點綴、襯線標題（Noto Serif TC）。
// 互動（適度）：進場淡入、數字跳動、大圖區跟著滑鼠的光、卡片微傾斜＋光暈、圖片燈箱、複製連結提示、回到頂端；
// 使用者系統設「減少動態」時全部關掉，列印時也不會出現。

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
const pad2 = (n: number) => (n < 10 ? '0' : '') + n

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
:root{--bg:#f4f1ec;--paper:#fffdfa;--ink:#1b1a18;--muted:#6f6962;--line:#e4ddd2;--gold:#a8884f;--gold-2:#d8bd8a;--gold-3:#f1e2c4;--dark:#111316;--dark-2:#1b1d22;--shadow:0 1px 2px rgba(20,16,10,.04),0 18px 40px -24px rgba(20,16,10,.35)}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 "Noto Sans TC","PingFang TC","Microsoft JhengHei",-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
.serif{font-family:"Noto Serif TC","Songti TC","PMingLiU",serif}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.eyebrow{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold-2);font-weight:500}
/* 進場 */
.rv{opacity:0;transform:translateY(22px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0s)}.rv.in{opacity:1;transform:none}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{0%{background-position:0 0}100%{background-position:200% 0}}@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(168,136,79,.55)}100%{box-shadow:0 0 0 14px rgba(168,136,79,0)}}@keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}@keyframes drift{0%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(2%,-3%,0) scale(1.06)}100%{transform:translate3d(0,0,0) scale(1)}}
/* 首頁大圖區 */
.hero{position:relative;overflow:hidden;background:var(--dark);color:#f4efe6;isolation:isolate;min-height:82vh;display:flex;align-items:center}
.hero:before{content:"";position:absolute;inset:0;z-index:-3;background:radial-gradient(1200px 600px at 10% -10%,rgba(216,189,138,.24),transparent 60%),radial-gradient(900px 500px at 100% 110%,rgba(168,136,79,.22),transparent 60%),linear-gradient(135deg,#1a1c21 0%,#0f1114 55%,#19170f 100%)}
.hero .veins{position:absolute;inset:-30%;z-index:-2;background:conic-gradient(from 180deg at 50% 50%,rgba(216,189,138,0) 0deg,rgba(216,189,138,.2) 70deg,rgba(216,189,138,0) 140deg,rgba(168,136,79,.14) 220deg,rgba(216,189,138,0) 320deg);filter:blur(70px);animation:spin 50s linear infinite}
.hero .spot{position:absolute;inset:0;z-index:-2;background:radial-gradient(640px 420px at var(--mx,72%) var(--my,30%),rgba(216,189,138,.2),transparent 62%)}
.hero:after{content:"";position:absolute;inset:0;z-index:-1;background-image:${NOISE};opacity:.14;mix-blend-mode:overlay;pointer-events:none}
.hero .wm{position:absolute;right:-1%;bottom:-6%;z-index:-1;font-family:"Noto Serif TC",serif;font-weight:700;font-size:min(26vw,330px);line-height:1;color:transparent;-webkit-text-stroke:1px rgba(216,189,138,.16);user-select:none;pointer-events:none;letter-spacing:-.02em}
.hero .wrap{padding:84px 20px 64px;width:100%;will-change:transform}
.hero h1{font-family:"Noto Serif TC","Songti TC","PMingLiU",serif;font-weight:700;font-size:clamp(40px,6.4vw,76px);line-height:1.1;margin:16px 0 8px;letter-spacing:.01em}
.hero h1 .gold{background:linear-gradient(90deg,var(--gold-3),var(--gold-2),#b8955a,var(--gold-3));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shimmer 7s linear infinite}
.hero .sub{font-family:"Noto Serif TC",serif;font-size:clamp(15px,1.7vw,20px);color:var(--gold-2);letter-spacing:.16em;margin:0 0 26px}
.hero .intro{max-width:720px;font-size:16px;line-height:1.95;color:#d9d2c6;margin:0 0 34px}
.rule{width:72px;height:2px;background:linear-gradient(90deg,var(--gold-2),transparent);margin:0 0 22px}
.stats{display:flex;gap:44px;flex-wrap:wrap;margin:0 0 30px}
.stat b{font-family:"Noto Serif TC",serif;font-size:52px;line-height:1;display:block;color:#fff;font-variant-numeric:tabular-nums}.stat span{font-size:12px;letter-spacing:.16em;color:var(--gold-2)}
.layers{display:flex;gap:10px;flex-wrap:wrap}.layers span{font-size:12px;letter-spacing:.08em;color:#d6cdbd;border:1px solid rgba(216,189,138,.38);border-radius:999px;padding:6px 14px;backdrop-filter:blur(4px)}
.btnp{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,var(--gold-2),var(--gold));color:#1b1a18!important;border:0;border-radius:999px;padding:11px 22px;font-size:14px;font-weight:600;letter-spacing:.08em;cursor:pointer;font-family:inherit;box-shadow:0 12px 26px -12px rgba(216,189,138,.8);transition:transform .2s,box-shadow .2s,filter .2s}.btnp:hover{transform:translateY(-2px);box-shadow:0 18px 32px -12px rgba(216,189,138,.95);filter:brightness(1.05);text-decoration:none}.btnp:active{transform:translateY(0)}
.tools{display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:13px;color:#a79f92;margin-top:26px}
.scroll-hint{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);font-size:11px;letter-spacing:.3em;color:rgba(216,189,138,.7);display:flex;flex-direction:column;align-items:center;gap:6px}.scroll-hint i{display:block;width:1px;height:34px;background:linear-gradient(var(--gold-2),transparent);animation:pulse 2.4s ease-out infinite;box-shadow:none;border-radius:1px}
/* 分類列（黏在上方） */
.catnav{position:sticky;top:0;z-index:20;background:rgba(244,241,236,.86);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.catnav .wrap{display:flex;gap:8px;overflow-x:auto;padding:10px 20px;scrollbar-width:none;align-items:center}.catnav .wrap::-webkit-scrollbar{display:none}
.catnav .brandmini{font-family:"Noto Serif TC",serif;font-weight:700;margin-right:auto;white-space:nowrap;font-size:14px;color:var(--ink)}
.chip{position:relative;flex:0 0 auto;border:1px solid var(--line);background:var(--paper);border-radius:999px;padding:7px 18px;font-size:13.5px;cursor:pointer;color:var(--muted);font-family:inherit;letter-spacing:.06em;transition:all .2s;overflow:hidden}
.chip:after{content:"";position:absolute;left:50%;bottom:0;width:0;height:2px;background:var(--gold);transform:translateX(-50%);transition:width .25s}.chip:hover{border-color:var(--gold);color:var(--ink);transform:translateY(-1px)}.chip:hover:after{width:60%}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}.chip.on:after{width:60%;background:var(--gold-2)}
/* 區塊 */
section.cat{padding:44px 0 10px}.sec-head{display:flex;align-items:baseline;gap:14px;margin:0 0 22px}
.sec-head .num{font-family:"Noto Serif TC",serif;font-size:46px;line-height:1;color:transparent;-webkit-text-stroke:1px var(--gold);letter-spacing:-.02em}
.sec-head h2{font-family:"Noto Serif TC",serif;font-size:28px;margin:0;font-weight:700}.sec-head .en{font-size:11px;letter-spacing:.26em;color:var(--gold);font-weight:600}.sec-head .n{font-size:13px;color:var(--muted);margin-left:auto}
.band{background:var(--dark);color:#f4efe6;position:relative;isolation:isolate;padding:54px 0 60px;margin:34px 0 0}
.band:before{content:"";position:absolute;inset:0;z-index:-2;background:radial-gradient(900px 420px at 0% 0%,rgba(216,189,138,.16),transparent 60%),linear-gradient(180deg,#121417,#17191d)}
.band:after{content:"";position:absolute;inset:0;z-index:-1;background-image:${NOISE};opacity:.12;mix-blend-mode:overlay;pointer-events:none}
.band .sec-head h2{color:#fff}.band .sec-head .n{color:#a79f92}.band .sec-head .num{-webkit-text-stroke-color:var(--gold-2)}.band .card{color:var(--ink)}
.sec-head{flex-wrap:wrap}.sec-head h2{white-space:nowrap}
@media(max-width:600px){.scroll-hint{display:none}.hero .wrap{padding:64px 20px 48px}.hero h1 .sp{display:block;height:0;overflow:hidden}.hero h1{font-size:40px}.stats{gap:28px}.stat b{font-size:42px}}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
.featured{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.featured .card{border-top:3px solid var(--gold-2)}.featured .card h3{font-size:21px}
@media(max-width:899px){.featured{grid-template-columns:1fr}}
.card{position:relative;background:var(--paper);border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column;box-shadow:var(--shadow);transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .25s ease,box-shadow .3s ease;transform-style:preserve-3d}
.card:hover{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(-6px);box-shadow:0 2px 4px rgba(20,16,10,.05),0 34px 56px -26px rgba(20,16,10,.5);text-decoration:none}
.card:after{content:"";position:absolute;inset:0;border-radius:18px;background:radial-gradient(420px circle at var(--gx,50%) var(--gy,50%),rgba(216,189,138,.22),transparent 48%);opacity:0;transition:opacity .3s;pointer-events:none}.card:hover:after{opacity:1}
.cover{aspect-ratio:3/2;background:linear-gradient(135deg,#e7e0d4,#d6ccbc);overflow:hidden;position:relative}
.cover img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .7s cubic-bezier(.2,.7,.2,1)}.card:hover .cover img{transform:scale(1.06)}
.cover .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:"Noto Serif TC",serif;font-size:56px;color:rgba(80,64,40,.25)}
.card .body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:6px;flex:1}
.kicker{display:flex;justify-content:space-between;align-items:center;font-size:11px;letter-spacing:.2em;color:var(--gold);font-weight:600}.kicker .st{color:var(--muted);letter-spacing:.04em;font-weight:400;font-size:12px}
.card h3{font-family:"Noto Serif TC",serif;font-size:18px;margin:0;line-height:1.45;font-weight:700}
.card h3 span{background-image:linear-gradient(var(--gold-2),var(--gold-2));background-size:0 2px;background-repeat:no-repeat;background-position:0 100%;transition:background-size .4s cubic-bezier(.2,.7,.2,1);padding-bottom:2px}.card:hover h3 span{background-size:100% 2px}
.sum{font-size:14px;color:var(--muted);line-height:1.7;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .meta{margin-top:auto;padding-top:10px;font-size:12px;color:var(--muted);display:flex;gap:12px;border-top:1px solid var(--line);align-items:center}.card .meta .go{margin-left:auto;color:var(--gold);letter-spacing:.1em;opacity:0;transform:translateX(-6px);transition:all .3s}.card:hover .meta .go{opacity:1;transform:none}
/* 經歷年表：依年、月分組的工作紀錄 */
.exp{position:relative}
.xyear{display:grid;grid-template-columns:150px minmax(0,1fr);gap:28px;padding:14px 0 22px;border-top:1px solid var(--line)}
.xyear .y{position:sticky;top:66px;align-self:start;display:flex;flex-direction:column;gap:6px}
.xyear .y b{font-family:"Noto Serif TC",serif;font-size:62px;line-height:1;color:transparent;-webkit-text-stroke:1px var(--gold);letter-spacing:-.02em;font-weight:700}
.xyear .y span{font-size:11px;letter-spacing:.2em;color:var(--muted)}
.ylist{position:relative;padding-left:28px}.ylist:before{content:"";position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:linear-gradient(var(--gold-2),var(--line))}
.xmon{position:relative;font-size:11px;letter-spacing:.24em;color:var(--gold);font-weight:600;margin:16px 0 10px}.xmon:first-child{margin-top:2px}
.xmon:before{content:"";position:absolute;left:-25px;top:3px;width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 4px var(--bg)}
.xi{position:relative;display:grid;grid-template-columns:70px minmax(0,1fr);gap:14px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin:0 0 10px;text-decoration:none;color:inherit;box-shadow:var(--shadow);transition:transform .25s,border-color .25s,box-shadow .3s}
.xi:hover{transform:translateX(6px);border-color:var(--gold-2);text-decoration:none;box-shadow:0 2px 4px rgba(20,16,10,.05),0 22px 40px -22px rgba(20,16,10,.4)}
.xi:before{content:"";position:absolute;left:-25px;top:22px;width:8px;height:8px;border-radius:50%;background:var(--paper);border:2px solid var(--gold);box-shadow:0 0 0 4px var(--bg);transition:transform .25s,background .25s}.xi:hover:before{background:var(--gold);transform:scale(1.3)}
.xi .xd{font-family:"Noto Serif TC",serif;font-size:17px;color:var(--gold);font-weight:700;font-variant-numeric:tabular-nums;padding-top:2px;letter-spacing:.04em}
.xi .xp{font-size:12px;letter-spacing:.06em;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.xi .xp b{font-size:10px;letter-spacing:.16em;color:var(--gold);margin-right:8px;font-weight:600}
.xi h3{font-family:"Noto Serif TC",serif;font-size:17px;margin:3px 0 4px;line-height:1.5;font-weight:700}
.xi p{margin:0;font-size:13.5px;color:var(--muted);line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.xi .xs{margin-top:8px;font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center}.xi .xs span{border:1px solid var(--line);border-radius:999px;padding:1px 9px}
.xi .xs .go{margin-left:auto;border:0;padding:0;color:var(--gold);letter-spacing:.1em;opacity:0;transform:translateX(-6px);transition:all .3s}.xi:hover .xs .go{opacity:1;transform:none}
.xi .xb{min-width:0}
@media(max-width:700px){.xyear{grid-template-columns:minmax(0,1fr);gap:10px}.xyear .y{position:static;flex-direction:row;align-items:baseline;gap:12px}.xyear .y b{font-size:44px}.ylist{padding-left:22px}.xmon:before,.xi:before{left:-19px}.xi{grid-template-columns:minmax(0,1fr);gap:2px;padding:12px 14px}.xi .xd{font-size:14px}.xi .xp{white-space:normal}}
@media print{.xprint{page-break-before:always;break-before:page;padding-top:14px}.xyear{grid-template-columns:110px 1fr;gap:16px}.xyear .y{position:static}.xyear .y b{font-size:40px;color:var(--gold);-webkit-text-stroke:0}.xi{break-inside:avoid;page-break-inside:avoid;margin-bottom:8px;padding:10px 14px}.xi:hover{transform:none}.xi .xs .go{display:none}.xi:before,.xmon:before{box-shadow:0 0 0 4px #fff}}
/* 首頁卡片原地展開的面板 */
.xpanel{grid-column:1/-1;background:var(--paper);border:1px solid var(--gold-2);border-radius:18px;box-shadow:var(--shadow);overflow:hidden;animation:pop .3s ease}
.xpanel[hidden]{display:none}
.xpin{padding:22px 24px 24px}
.xphead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
.xphead .en{font-size:11px;letter-spacing:.22em;color:var(--gold);font-weight:600}.xphead h3{font-family:"Noto Serif TC",serif;font-size:22px;margin:4px 0 0;line-height:1.4;font-weight:700}
.xpacts{display:flex;gap:8px;flex-wrap:wrap}.xpacts .btnp{padding:9px 18px;font-size:13px}.xpacts .btno{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:8px 16px;font-size:13px;color:var(--ink);cursor:pointer;background:var(--paper);font-family:inherit;transition:all .2s}.xpacts .btno:hover{border-color:var(--gold);color:var(--gold)}
.xpsum{font-size:15px;line-height:1.85;color:var(--ink);margin:12px 0 10px;max-width:860px}
.xpfacts{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--muted)}.xpfacts span,.xpfacts a{border:1px solid var(--line);border-radius:999px;padding:2px 10px}
.xpsec{font-family:"Noto Serif TC",serif;font-size:16px;font-weight:700;margin:20px 0 10px;display:flex;align-items:baseline;gap:10px}.xpsec .en{font-size:10px;letter-spacing:.24em;color:var(--gold);font-family:"Noto Sans TC",sans-serif;font-weight:600}
.xfiles{display:flex;gap:12px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:thin;align-items:flex-start}
.xf{flex:0 0 150px;text-decoration:none;color:inherit}.xf .xft{width:150px;height:110px;border-radius:12px;background:#efe9df;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);transition:transform .25s,border-color .25s}.xf .xft img{width:100%;height:100%;object-fit:cover;display:block}.xf .xft span{font-size:12px;letter-spacing:.2em;color:rgba(80,64,40,.5)}.xf:hover .xft{transform:translateY(-3px);border-color:var(--gold-2)}.xf:hover{text-decoration:none}
.xf .xfn{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}
.xmore{flex:0 0 auto;align-self:center;font-size:13px;color:var(--gold);white-space:nowrap;padding:0 10px}.xrecs+.xmore{display:inline-block;margin-top:10px;padding:0}
.xrecs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:0 24px}
.xrecs li{display:flex;gap:12px;font-size:14px;line-height:1.6;padding:7px 0;border-bottom:1px dashed var(--line)}.xrecs .d{color:var(--gold);font-weight:600;font-variant-numeric:tabular-nums;flex:0 0 auto;font-size:12.5px;letter-spacing:.06em;padding-top:2px}
.card.open{box-shadow:0 0 0 2px var(--gold-2),var(--shadow)}.card.open .meta .go{opacity:1;transform:none}
.band .xpanel{color:var(--ink)}
@media(max-width:600px){.xpin{padding:16px 16px 18px}.xrecs{grid-template-columns:1fr}.xf{flex-basis:124px}.xf .xft{width:124px;height:92px}.xphead h3{font-size:19px}}
/* 專案頁 */
.phead{position:relative;background:var(--dark);color:#f4efe6;overflow:hidden;isolation:isolate}
.phead .bg{position:absolute;inset:-4%;z-index:-3;background-size:cover;background-position:center;filter:saturate(.9);animation:drift 24s ease-in-out infinite}
.phead .veil{position:absolute;inset:0;z-index:-2;background:linear-gradient(180deg,rgba(17,19,22,.5) 0%,rgba(17,19,22,.72) 55%,rgba(17,19,22,.97) 100%)}
.phead .spot{position:absolute;inset:0;z-index:-1;background:radial-gradient(560px 360px at var(--mx,70%) var(--my,40%),rgba(216,189,138,.16),transparent 62%)}
.phead .wrap{padding:28px 20px 48px;min-height:440px;display:flex;flex-direction:column;justify-content:flex-end}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:auto;padding-bottom:44px;font-size:13px}.topbar a{color:#e8dfcf;letter-spacing:.06em;display:inline-flex;align-items:center;gap:6px}.topbar a:hover{color:#fff;text-decoration:none}.topbar a .ar{transition:transform .2s;display:inline-block}.topbar a:hover .ar{transform:translateX(-4px)}
.phead h1{font-family:"Noto Serif TC",serif;font-size:clamp(30px,4.6vw,54px);line-height:1.18;margin:12px 0 16px;font-weight:700}
.pmeta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px;color:#d9d2c6}.pmeta .tag{border:1px solid rgba(216,189,138,.6);color:var(--gold-2);border-radius:999px;padding:3px 12px;letter-spacing:.12em;font-size:11px}
.pmeta .st{border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:3px 12px}
.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:36px;padding:40px 0 64px}
@media(min-width:960px){.layout{grid-template-columns:minmax(0,1fr) 300px}}
.side{align-self:start;position:sticky;top:20px}
.facts{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px 22px;box-shadow:var(--shadow)}
.facts dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:14px}.facts dt{color:var(--muted);font-size:11px;letter-spacing:.14em;padding-top:3px}.facts dd{margin:0}
.facts .acts{display:flex;flex-direction:column;gap:8px;margin-top:16px}.facts .btnp{justify-content:center}.facts .btno{display:inline-flex;justify-content:center;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:10px 18px;font-size:14px;color:var(--ink);cursor:pointer;background:var(--paper);font-family:inherit;transition:all .2s}.facts .btno:hover{border-color:var(--gold);color:var(--gold);text-decoration:none}
h2.sec{font-family:"Noto Serif TC",serif;font-size:25px;margin:44px 0 18px;display:flex;align-items:baseline;gap:12px}h2.sec:first-child{margin-top:0}h2.sec .en{font-size:11px;letter-spacing:.26em;color:var(--gold);font-family:"Noto Sans TC",sans-serif;font-weight:600}
.rich{max-width:860px}.rich p{margin:10px 0}.rich h4{font-family:"Noto Serif TC",serif;margin:22px 0 8px;font-size:17px}.rich ul,.rich ol{margin:8px 0 8px 24px}
.tbl{overflow-x:auto;margin:14px 0}.rich table{border-collapse:separate;border-spacing:0;width:100%;font-size:14px;background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.rich th{font-size:11px;letter-spacing:.14em;color:var(--muted);font-weight:600;text-align:left;padding:10px 14px;background:#f6f1e9;border-bottom:1px solid var(--line)}
.rich td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.7;transition:background .2s}.rich tr:hover td{background:#fbf8f2}.rich tr:last-child td{border-bottom:0}
.rich td:first-child{color:var(--gold);font-weight:600;white-space:nowrap;width:1%}
/* 成果檔案 */
.files{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
.file{background:var(--paper);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow);transition:transform .25s,box-shadow .3s}.file:hover{transform:translateY(-4px);box-shadow:0 2px 4px rgba(20,16,10,.05),0 28px 48px -24px rgba(20,16,10,.45)}
.file .cover{aspect-ratio:4/3;background:#ece6dc;display:block}.file .cover img{object-fit:contain;background:#efe9df;transition:transform .6s}.file:hover .cover img{transform:scale(1.04)}.file .cover .ph{font-size:22px;letter-spacing:.2em;color:rgba(80,64,40,.45)}
.file a.cover:after{content:"放大檢視";position:absolute;left:0;right:0;bottom:0;padding:26px 10px 10px;text-align:center;background:linear-gradient(transparent,rgba(17,19,22,.65));color:#fff;font-size:11px;letter-spacing:.3em;opacity:0;transition:opacity .25s}.file a.cover[data-ext]:after{content:"開啟 " attr(data-ext)}.file:hover a.cover:after{opacity:1}
.file .body{padding:12px 14px 14px;font-size:14px;display:flex;flex-direction:column;gap:5px;flex:1}
.file .name{font-weight:600;line-height:1.45;word-break:break-all}.file .fmeta{font-size:12px;color:var(--muted);display:flex;gap:10px}.file .note{font-size:13px;color:var(--muted);line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.file .acts{margin-top:auto;padding-top:8px;display:flex;gap:14px;font-size:13px}.file .acts a{position:relative}.file .acts a:after{content:"";position:absolute;left:0;bottom:-2px;width:0;height:1px;background:var(--gold);transition:width .25s}.file .acts a:hover{text-decoration:none}.file .acts a:hover:after{width:100%}
video{width:100%;background:#000;display:block;aspect-ratio:16/9}
/* 工作紀錄：時間軸 */
.tl{position:relative;padding-left:30px}.tl:before{content:"";position:absolute;left:9px;top:8px;bottom:8px;width:2px;background:linear-gradient(var(--gold-2),var(--line))}
.rec{position:relative;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px 22px;margin:0 0 18px;box-shadow:var(--shadow);transition:border-color .25s,transform .25s}.rec:hover{border-color:var(--gold-2);transform:translateX(4px)}
.rec:before{content:"";position:absolute;left:-27px;top:22px;width:12px;height:12px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 4px var(--bg);transition:transform .25s}.rec:hover:before{transform:scale(1.35);animation:pulse 1.2s ease-out}
.rec .date{font-size:12px;letter-spacing:.14em;color:var(--gold);font-weight:600}.rec h3{font-family:"Noto Serif TC",serif;margin:4px 0 8px;font-size:19px;line-height:1.45;font-weight:700}
.rec .meta{display:flex;flex-wrap:wrap;gap:6px;font-size:12px;color:var(--muted);margin-bottom:6px}.rec .meta span,.rec .meta a{border:1px solid var(--line);border-radius:999px;padding:1px 10px}
.fchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.fchips span,.fchips a{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:2px 10px;color:var(--muted);background:#faf7f2}
.empty{color:var(--muted);font-size:14px}
/* 燈箱、提示、回頂端 */
.lb{position:fixed;inset:0;background:rgba(10,10,12,.93);display:none;align-items:center;justify-content:center;z-index:100;padding:24px}.lb.on{display:flex}
.lb img{max-width:92vw;max-height:84vh;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.6);animation:pop .25s ease}.lb .cap{position:absolute;bottom:18px;left:0;right:0;text-align:center;color:#e8dfcf;font-size:13px;padding:0 60px}
.lb .x{position:absolute;top:10px;right:18px;color:#fff;font-size:34px;cursor:pointer;line-height:1}.lb .nav{position:absolute;top:50%;transform:translateY(-50%);color:#fff;font-size:44px;cursor:pointer;padding:10px 18px;user-select:none;opacity:.7}.lb .nav:hover{opacity:1}.lb .prev{left:6px}.lb .next{right:6px}
.toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);background:var(--ink);color:#fff;padding:10px 20px;border-radius:999px;font-size:14px;opacity:0;transition:all .3s;z-index:110;pointer-events:none;box-shadow:var(--shadow)}.toast.on{opacity:1;transform:translate(-50%,0)}
.totop{position:fixed;right:18px;bottom:18px;width:46px;height:46px;border-radius:50%;background:var(--ink);color:var(--gold-2);display:flex;align-items:center;justify-content:center;opacity:0;transform:translateY(12px);transition:.3s;z-index:50;cursor:pointer;box-shadow:var(--shadow);font-size:18px}.totop.on{opacity:1;transform:none}.totop:hover{background:var(--gold);color:#1b1a18}
/* 頁尾 */
.foot{background:var(--dark);color:#b9b2a7;padding:48px 0;margin-top:48px;font-size:13px;position:relative;isolation:isolate}
.foot:after{content:"";position:absolute;inset:0;z-index:-1;background-image:${NOISE};opacity:.1;mix-blend-mode:overlay;pointer-events:none}
.foot .wrap{display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:flex-start}
.foot b{font-family:"Noto Serif TC",serif;color:#f4efe6;font-size:18px;display:block;margin-bottom:4px}.foot a{color:#e3d7c1;position:relative}.foot a:after{content:"";position:absolute;left:0;bottom:-3px;width:0;height:1px;background:var(--gold-2);transition:width .25s}.foot a:hover{text-decoration:none}.foot a:hover:after{width:100%}.foot .links{display:flex;gap:18px;flex-wrap:wrap}
/* 列印版 */
.cover-page{padding:60px 0 30px}.cover-page h1{font-family:"Noto Serif TC",serif;font-size:40px;margin:14px 0 8px}
.toc table{border-collapse:collapse;width:100%;font-size:13px}.toc th,.toc td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}.toc th{background:#f6f1e9;font-size:11px;letter-spacing:.12em}
section.proj{page-break-before:always;break-before:page;padding-top:14px}
section.proj .hero-img{border-radius:14px;overflow:hidden;max-height:300px;margin:12px 0}section.proj .hero-img img{width:100%;max-height:300px;object-fit:cover;display:block}
section.proj h1{font-family:"Noto Serif TC",serif;font-size:28px;margin:10px 0 8px}
section.proj .pmeta{color:var(--muted)}section.proj .pmeta .tag{border-color:var(--gold);color:var(--gold)}section.proj .pmeta .st{border-color:var(--line)}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv{opacity:1;transform:none}.card,.card:hover{transform:none}}
@media print{
  :root{--bg:#fff;--paper:#fff;--line:#d5cfc6;--shadow:none}
  body{font-size:12px;line-height:1.55}.wrap{max-width:none;padding:0}
  .catnav,.tools,.topbar,.foot,.side .acts,.totop,.lb,.toast,.scroll-hint,.veins,.spot,.wm,.card .meta .go,.xpanel{display:none!important}
  .rv{opacity:1!important;transform:none!important}.card,.card:hover{transform:none!important}
  .hero,.phead,.band{background:#fff;color:var(--ink);min-height:auto}.hero:before,.hero:after,.phead .bg,.phead .veil,.phead .spot,.band:before,.band:after{display:none}.hero .intro{color:var(--muted)}.stat b{color:var(--ink)}.hero h1 .gold{color:var(--ink);background:none;-webkit-text-fill-color:initial}.band .sec-head h2{color:var(--ink)}
  .card,.rec,.file,.tbl,.hero-img{break-inside:avoid;page-break-inside:avoid;box-shadow:none!important;border:1px solid var(--line)}
  .sum,.file .note{display:block;-webkit-line-clamp:unset;overflow:visible}
  .grid,.featured{grid-template-columns:repeat(3,1fr);gap:10px}.files{grid-template-columns:repeat(3,1fr);gap:10px}
  video{display:none}a{color:inherit}
  h2.sec{margin-top:18px;break-after:avoid-page;page-break-after:avoid}.hero-img,section.proj h1,.pmeta{break-after:avoid-page;page-break-after:avoid}
  .cover-page{page-break-after:always;break-after:page}.layout{display:block}.side{position:static}
}
`

// 互動（純瀏覽器 JS，不用任何套件）；系統「減少動態」時只留功能、不做動畫
const JS = `
(function(){
var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
var els=document.querySelectorAll('.rv');
if('IntersectionObserver' in window&&!rm){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});els.forEach(function(e){io.observe(e)})}else{els.forEach(function(e){e.classList.add('in')})}
document.querySelectorAll('[data-n]').forEach(function(b){var n=+b.getAttribute('data-n')||0;if(rm){b.textContent=n;return}var t0=null;function step(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/1400);p=1-Math.pow(1-p,3);b.textContent=Math.round(n*p);if(p<1)requestAnimationFrame(step)}requestAnimationFrame(step)});
var hero=document.querySelector('.hero,.phead');
if(hero&&!rm){hero.addEventListener('mousemove',function(e){var r=hero.getBoundingClientRect();hero.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');hero.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%')});
var inner=hero.querySelector('.wrap');addEventListener('scroll',function(){var y=scrollY;if(y<1000&&inner){inner.style.transform='translateY('+(y*.14)+'px)';inner.style.opacity=String(Math.max(0,1-y/750))}},{passive:true})}
if(!rm&&matchMedia('(hover:hover)').matches){document.querySelectorAll('.card').forEach(function(c){c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.style.setProperty('--gx',(x*100)+'%');c.style.setProperty('--gy',(y*100)+'%');c.style.setProperty('--rx',((.5-y)*5)+'deg');c.style.setProperty('--ry',((x-.5)*5)+'deg')});c.addEventListener('mouseleave',function(){c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')})})}
var tt=document.createElement('div');tt.className='totop';tt.innerHTML='&uarr;';tt.title='回到頂端';document.body.appendChild(tt);tt.addEventListener('click',function(){scrollTo({top:0,behavior:'smooth'})});addEventListener('scroll',function(){tt.classList.toggle('on',scrollY>700)},{passive:true});
function toast(m){var t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('on')},1800)}
document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var v=b.getAttribute('data-copy');(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){toast('已複製連結')},function(){prompt('複製這個網址',v)})})});
var chips=document.querySelectorAll('#chips .chip'),secs=document.querySelectorAll('section.cat');
chips.forEach(function(c){c.addEventListener('click',function(){chips.forEach(function(x){x.classList.remove('on')});c.classList.add('on');var v=c.getAttribute('data-cat');
secs.forEach(function(s){var sc=s.getAttribute('data-cat');s.style.display=(v==='全部'||sc===v)?'':'none';if(v==='全部'||sc===v)s.querySelectorAll('.rv').forEach(function(e){e.classList.add('in')})});
var t=document.getElementById('cat-'+v);if(v!=='全部'&&t){var y=t.getBoundingClientRect().top+scrollY-64;scrollTo({top:y,behavior:'smooth'})}})});
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
function setGo(id,open){document.querySelectorAll('.card[data-x="'+id+'"]').forEach(function(c){c.classList.toggle('open',open);var g=c.querySelector('.go');if(g)g.textContent=open?'收合 ▴':'展開 ▾'})}
function closeAll(){document.querySelectorAll('.xpanel').forEach(function(p){if(!p.hidden){p.hidden=true;setGo(p.id.slice(3),false)}})}
function place(c,p){var grid=c.parentNode,top=c.offsetTop,last=c,n=c.nextElementSibling;while(n){if(n.classList.contains('card')){if(Math.abs(n.offsetTop-top)<2)last=n;else break}n=n.nextElementSibling}if(last.nextSibling!==p)grid.insertBefore(p,last.nextSibling)}
function openCard(c){var p=panelOf(c);if(!p)return;closeAll();place(c,p);p.hidden=false;setGo(c.getAttribute('data-x'),true);setTimeout(function(){var r=p.getBoundingClientRect();if(r.bottom>innerHeight||r.top<0)scrollTo({top:scrollY+c.getBoundingClientRect().top-72,behavior:rm?'auto':'smooth'})},30)}
cards.forEach(function(c){c.addEventListener('click',function(e){if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;var p=panelOf(c);if(!p)return;e.preventDefault();if(p.hidden)openCard(c);else{p.hidden=true;setGo(c.getAttribute('data-x'),false)}})});
document.querySelectorAll('.xpanel .xclose').forEach(function(b){b.addEventListener('click',function(){var p=b.closest('.xpanel');p.hidden=true;setGo(p.id.slice(3),false);var c=document.querySelector('.card[data-x="'+p.id.slice(3)+'"]');if(c&&c.getBoundingClientRect().top<0)scrollTo({top:scrollY+c.getBoundingClientRect().top-72,behavior:rm?'auto':'smooth'})})});
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
<meta name="theme-color" content="#111316">
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
<body>${opt.body}
<script>${JS}</script>
</body>
</html>`
}

function cardHtml(p: ShareProject, key: string, i = 0): string {
  const cover = p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : `<span class="ph">${esc((p.name || '＃').slice(0, 1))}</span>`
  const meta = [p.lastDate ? year(p.lastDate) : '', `紀錄 ${p.records.length}`, `檔案 ${p.files.length}`].filter(Boolean)
  return `<a class="card rv" style="--d:${Math.min(i, 5) * 0.07}s" href="/portfolio/${esc(key)}/${esc(p.id)}" data-x="${esc(p.id)}">
  <div class="cover">${cover}</div>
  <div class="body">
    <div class="kicker"><span>${esc(catEn(p.category))}・${esc(p.category || '其他')}</span><span class="st">${esc(p.status || '')}</span></div>
    <h3><span>${esc(p.name)}</span></h3>
    <div class="sum">${esc(p.summary)}</div>
    <div class="meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}<span class="go">展開 ▾</span></div>
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

// 首頁卡片點一下在原地展開的面板：一句摘要、檔案縮圖一列、紀錄清單；完整內容在專案頁
function panelHtml(p: ShareProject, key: string): string {
  const href = `/portfolio/${esc(key)}/${esc(p.id)}`
  const sum = firstLine(p.note) || p.summary
  const facts = [p.status ? `<span>狀態 ${esc(p.status)}</span>` : '', p.lastDate ? `<span>最近 ${esc(p.lastDate)}</span>` : '', `<span>紀錄 ${p.records.length}</span>`, `<span>檔案 ${p.files.length}</span>`, p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">連結 ↗</a>` : ''].filter(Boolean).join('')
  const visual = p.files.filter(f => f.thumb || isVideo(f.name) || isImage(f.name))
  const files = [...visual, ...p.files.filter(f => !visual.includes(f))]
  const tile = (f: ShareFile) => {
    const lb = f.url && isImage(f.name) ? ` data-lb="${esc(f.url)}" data-cap="${esc(f.name)}"` : ''
    const th = f.thumb ? `<img src="${esc(f.thumb)}" alt="" loading="lazy">` : `<span>${esc(isVideo(f.name) ? '影片' : extOf(f.name))}</span>`
    return `<a class="xf" href="${esc(f.url || href)}"${lb} target="_blank" rel="noopener"><div class="xft">${th}</div><div class="xfn">${esc(f.name)}</div></a>`
  }
  const MAXF = 12, MAXR = 6
  const fl = files.length ? `<div class="xfiles">${files.slice(0, MAXF).map(tile).join('')}${files.length > MAXF ? `<a class="xmore" href="${href}">還有 ${files.length - MAXF} 個 →</a>` : ''}</div>` : '<p class="empty">這個專案沒有放檔案（例如 SOP、說明書類只留紀錄）。</p>'
  const rl = p.records.length ? `<ul class="xrecs">${p.records.slice(0, MAXR).map(r => `<li><span class="d">${esc(r.date || '')}</span><span class="t">${esc(r.title)}</span></li>`).join('')}</ul>${p.records.length > MAXR ? `<a class="xmore" href="${href}">全部 ${p.records.length} 筆紀錄 →</a>` : ''}` : '<p class="empty">沒有紀錄。</p>'
  return `<div class="xpanel" id="xp-${esc(p.id)}" hidden><div class="xpin">
  <div class="xphead"><div><div class="en">${esc(catEn(p.category))}・${esc(p.category || '其他')}</div><h3>${esc(p.name)}</h3></div><div class="xpacts"><a class="btnp" href="${href}">開啟專案頁 →</a><button class="btno xclose" type="button">收合 ▴</button></div></div>
  ${sum ? `<p class="xpsum">${esc(sum)}</p>` : ''}<div class="xpfacts">${facts}</div>
  <div class="xpsec"><span class="en">WORKS</span>成果檔案（${p.files.length}）</div>${fl}
  <div class="xpsec"><span class="en">TIMELINE</span>工作紀錄（${p.records.length}）</div>${rl}
</div></div>`
}

// 經歷年表：2024 年起的每一筆工作紀錄，依年、月分組，由新到舊；每筆可點進專案（列印版連到書內該專案那一節）
const TL_START_YEAR = 2024
const firstLine = (note: string): string => {
  for (const raw of String(note || '').split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || l.startsWith('|') || /^#{1,6}\s/.test(l) || /^【[^】]*】$/.test(l) || /^[-*]\s/.test(l) || /^\d+\.\s/.test(l)) continue
    return l.replace(/\*\*/g, '')
  }
  return ''
}
function timelineHtml(p: Portfolio, key: string, print = false): string {
  type E = { pr: ShareProject; idx: number; r: ShareRecord; t: number }
  const toT = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN }
  const START = Date.UTC(TL_START_YEAR, 0, 1)
  const es: E[] = []
  p.projects.forEach((pr, idx) => pr.records.forEach(r => { const t = toT(r.date); if (!isNaN(t) && t >= START) es.push({ pr, idx, r, t }) }))
  if (!es.length) return ''
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
    const tags = [e.r.status ? `<span>${esc(e.r.status)}</span>` : '', e.r.files.length ? `<span>檔案 ${e.r.files.length}</span>` : ''].filter(Boolean).join('')
    return `<a class="xi rv" href="${href}"><div class="xd">${esc(e.r.date.slice(5))}</div><div class="xb"><div class="xp"><b>${esc(catEn(e.r.category || e.pr.category))}</b>${esc(e.pr.name)}</div><h3>${esc(e.r.title)}</h3>${sum ? `<p>${esc(sum)}</p>` : ''}<div class="xs">${tags}<span class="go">查看專案 →</span></div></div></a>`
  }
  const blocks = Array.from(years.entries()).map(([y, ym]) => {
    const n = Array.from(ym.values()).reduce((s, a) => s + a.length, 0)
    const months = Array.from(ym.entries()).map(([m, list]) => `<div class="xmon rv">${+m} 月</div>${list.map(item).join('\n')}`).join('\n')
    return `<div class="xyear"><div class="y rv"><b>${esc(y)}</b><span>${n} 筆經歷</span></div><div class="ylist">${months}</div></div>`
  }).join('\n')
  const yrs = Array.from(years.keys())
  const range = `${esc(yrs[yrs.length - 1])} — ${esc(yrs[0])}`
  if (print) return `<section class="xprint"><h2 class="sec" style="margin-top:0"><span class="en">TIMELINE</span>經歷年表 ${range}</h2><p style="font-size:13px;color:var(--muted);margin:0 0 14px">${es.length} 筆工作紀錄，由新到舊；每一筆都連到書內該專案那一節。</p><div class="exp">${blocks}</div></section>`
  return `<section class="cat" data-cat="年表" id="timeline"><div class="wrap"><div class="sec-head rv"><span class="num">⟶</span><div><div class="en">TIMELINE</div><h2>經歷年表 ${range}</h2></div><span class="n">${es.length} 筆經歷，由新到舊，點一下進專案</span></div><div class="exp">${blocks}</div></div></section>`
}

export function portfolioIndexHtml(p: Portfolio, key: string): string {
  const cats = CATEGORY_ORDER.filter(c => p.projects.some(x => (x.category || '其他') === c))
  const extra = Array.from(new Set(p.projects.map(x => x.category || '其他'))).filter(c => !cats.includes(c))
  const allCats = [...cats, ...extra]
  // 精選：有封面與檔案，優先挑有第三方留痕（媒體露出、客戶回饋、平台數字）的，再看檔案與紀錄多寡
  const evidence = (x: ShareProject) => /媒體露出|客戶回饋|第三方|佐證|使用數據/.test(x.note || '') ? 8 : 0
  const score = (x: ShareProject) => (x.cover ? 3 : -99) + evidence(x) + x.files.length + x.records.length * 2
  const featured = [...p.projects].filter(x => x.cover && x.files.length).sort((a, b) => score(b) - score(a)).slice(0, 3)
  const sections = allCats.map((c, ci) => {
    const items = p.projects.filter(x => (x.category || '其他') === c)
    return `<section class="cat" data-cat="${esc(c)}" id="cat-${esc(c)}"><div class="wrap"><div class="sec-head rv"><span class="num">${pad2(ci + 1)}</span><div><div class="en">${esc(catEn(c))}</div><h2>${esc(c)}</h2></div><span class="n">${items.length} 個專案</span></div><div class="grid">${items.map((x, i) => cardHtml(x, key, i) + panelHtml(x, key)).join('\n')}</div></div></section>`
  }).join('\n')
  const chips = ['全部', ...allCats].map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-cat="${esc(c)}" type="button">${esc(c)}</button>`).join('')
  const body = `<header class="hero"><div class="veins"></div><div class="spot"></div><div class="wm">EGRRA</div><div class="wrap">
  <div class="eyebrow rv" style="--d:.05s">${esc(COMPANY)}　·　PrinTex™ 數位紋理・藝格板</div>
  <h1 class="rv" style="--d:.15s">${esc(OWNER)}<span class="sp">　</span><span class="gold">工作作品集</span></h1>
  <p class="sub rv" style="--d:.25s">PORTFOLIO OF ${esc(OWNER_EN.toUpperCase())}　·　${TL_START_YEAR} — ${esc(String(new Date().getFullYear()))}</p>
  <div class="rule rv" style="--d:.3s"></div>
  <p class="intro rv" style="--d:.35s">${esc(INTRO)}</p>
  <div class="stats rv" style="--d:.45s"><div class="stat"><b data-n="${p.stats.projects}">0</b><span>專案 PROJECTS</span></div><div class="stat"><b data-n="${p.stats.records}">0</b><span>工作紀錄 RECORDS</span></div><div class="stat"><b data-n="${p.stats.files}">0</b><span>檔案 FILES</span></div></div>
  <div class="layers rv" style="--d:.55s"><span>成果檔案</span><span>工作紀錄</span><span>第三方留痕：客戶回饋・媒體露出・平台數字</span></div>
  <div class="tools rv" style="--d:.65s"><a class="btnp" href="#featured">看精選作品 ↓</a><a class="btnp" style="background:transparent;color:var(--gold-2)!important;border:1px solid rgba(216,189,138,.6);box-shadow:none" href="/portfolio/${esc(key)}?all=1">列印版 · 可另存 PDF</a><span>線上版每次打開都是最新資料</span></div>
</div><div class="scroll-hint"><span>SCROLL</span><i></i></div></header>
<nav class="catnav"><div class="wrap" id="chips"><span class="brandmini">${esc(OWNER)}・作品集</span>${chips}</div></nav>
<main>
${featured.length ? `<section class="band cat" data-cat="精選" id="featured"><div class="wrap"><div class="sec-head rv"><span class="num">★</span><div><div class="en">FEATURED</div><h2>精選作品</h2></div><span class="n">有客戶回饋、媒體露出或平台數字的案子</span></div><div class="featured">${featured.map((x, i) => cardHtml(x, key, i)).join('\n')}</div></div></section>` : ''}
${timelineHtml(p, key)}
${sections}
</main>
${footHtml(p)}`
  const og = featured[0]?.cover || p.projects.find(x => x.cover)?.cover
  return page({ title: `${OWNER} 工作作品集｜${COMPANY}`, desc: INTRO, body, ogImage: og, url: `${p.origin}/portfolio/${key}` })
}

function fileHtml(f: ShareFile, print = false): string {
  let media: string
  if (f.url && isVideo(f.name) && !print) media = `<video controls preload="metadata"${f.thumb ? ` poster="${esc(f.thumb)}"` : ''} src="${esc(f.url)}"></video>`
  else if (f.thumb && f.url && isImage(f.name)) media = `<a class="cover" href="${esc(f.url)}" data-lb="${esc(f.url)}" data-cap="${esc(f.name)}" target="_blank" rel="noopener"><img src="${esc(f.thumb)}" alt="" loading="lazy"></a>`
  else if (f.thumb) media = `<a class="cover" href="${esc(f.url || '#')}" data-ext="${esc(extOf(f.name))}" target="_blank" rel="noopener"><img src="${esc(f.thumb)}" alt="" loading="lazy"></a>`
  else media = `<div class="cover"><span class="ph">${esc(isVideo(f.name) ? '影片' : extOf(f.name))}</span></div>`
  const acts = f.url ? `<div class="acts"><a href="${esc(f.url)}" target="_blank" rel="noopener">開啟</a><a href="${esc(f.download)}">下載</a></div>` : ''
  return `<div class="file rv">${media}<div class="body"><div class="name">${esc(f.name)}</div><div class="fmeta">${f.category ? `<span>${esc(f.category)}</span>` : ''}${f.date ? `<span>${esc(f.date)}</span>` : ''}</div>${f.note ? `<div class="note">${esc(f.note)}</div>` : ''}${acts}</div></div>`
}

function recordHtml(r: ShareRecord): string {
  const meta = [r.status ? `<span>${esc(r.status)}</span>` : '', r.category ? `<span>${esc(r.category)}</span>` : '', ...r.tags.map(t => `<span>${esc(t)}</span>`), r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">連結 ↗</a>` : ''].filter(Boolean).join('')
  const files = r.files.length ? `<div class="fchips">${r.files.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''
  const att = r.attachments.length ? `<div class="fchips">${r.attachments.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join('')}</div>` : ''
  return `<article class="rec rv"><div class="date">${esc(r.date || '（無日期）')}</div><h3>${esc(r.title)}</h3><div class="meta">${meta}</div>${r.note ? `<div class="rich">${noteHtml(r.note)}</div>` : ''}${files}${att}</article>`
}

// 專案的主體（說明、檔案、紀錄），專案頁與列印版共用
function projectBody(pr: ShareProject, opt: { print: boolean }): string {
  const files = pr.files
  const visual = files.filter(f => f.thumb || isVideo(f.name) || isImage(f.name))
  const others = files.filter(f => !visual.includes(f))
  return `${pr.note ? `<h2 class="sec rv"><span class="en">ABOUT</span>專案說明</h2><div class="rich rv">${noteHtml(pr.note)}</div>` : ''}
<h2 class="sec rv"><span class="en">WORKS</span>成果檔案（${files.length}）</h2>
${files.length ? `<div class="files">${[...visual, ...others].map(f => fileHtml(f, opt.print)).join('\n')}</div>` : '<p class="empty">這個專案沒有放檔案（例如 SOP、說明書類只留紀錄）。</p>'}
<h2 class="sec rv"><span class="en">TIMELINE</span>工作紀錄（${pr.records.length}）</h2>
${pr.records.length ? `<div class="tl">${pr.records.map(recordHtml).join('\n')}</div>` : '<p class="empty">沒有紀錄。</p>'}`
}

export function projectHtml(p: Portfolio, pr: ShareProject, key: string): string {
  const url = `${p.origin}/portfolio/${key}/${pr.id}`
  const body = `<header class="phead">
  ${pr.cover ? `<div class="bg" style="background-image:url('${esc(pr.cover)}')"></div>` : ''}<div class="veil"></div><div class="spot"></div>
  <div class="wrap">
    <div class="topbar"><a href="/portfolio/${esc(key)}"><span class="ar">←</span> 回作品集</a><a href="/portfolio/${esc(key)}">${esc(COMPANY)}｜${esc(OWNER)} 工作作品集</a></div>
    <div class="eyebrow rv" style="--d:.05s">${esc(catEn(pr.category))}　·　${esc(pr.category || '其他')}</div>
    <h1 class="rv" style="--d:.15s">${esc(pr.name)}</h1>
    <div class="pmeta rv" style="--d:.25s"><span class="tag">${esc(pr.category || '其他')}</span><span class="st">${esc(pr.status || '—')}</span>${pr.lastDate ? `<span>最近 ${esc(pr.lastDate)}</span>` : ''}<span>紀錄 ${pr.records.length}・檔案 ${pr.files.length}</span></div>
  </div>
</header>
<div class="wrap"><div class="layout">
  <main>${projectBody(pr, { print: false })}</main>
  <aside class="side"><div class="facts rv">
    <dl><dt>分類</dt><dd>${esc(pr.category || '其他')}</dd><dt>狀態</dt><dd>${esc(pr.status || '—')}</dd>${pr.lastDate ? `<dt>最近</dt><dd>${esc(pr.lastDate)}</dd>` : ''}<dt>紀錄</dt><dd>${pr.records.length} 筆</dd><dt>檔案</dt><dd>${pr.files.length} 個</dd>${pr.link ? `<dt>連結</dt><dd><a href="${esc(pr.link)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(pr.link.replace(/^https?:\/\//, ''))}</a></dd>` : ''}</dl>
    <div class="acts">${pr.link ? `<a class="btnp" href="${esc(pr.link)}" target="_blank" rel="noopener">開啟連結 ↗</a>` : ''}<button class="btno" type="button" data-copy="${esc(url)}">複製這頁連結</button><a class="btno" href="/portfolio/${esc(key)}">回作品集</a></div>
  </div></aside>
</div></div>
${footHtml(p)}`
  return page({ title: `${pr.name}｜${OWNER} 工作作品集`, desc: pr.summary || INTRO, body, ogImage: pr.cover || undefined, url })
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
<div class="tools" style="color:var(--muted)"><a class="btnp" href="/portfolio/${esc(key)}">← 回線上版</a><span>這一頁是列印版：用瀏覽器「列印」選「另存為 PDF」，就是書面版作品集。</span></div>
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
${timelineHtml(p, key, true)}
${sections}
<div style="padding:30px 0;font-size:12px;color:var(--muted)">此書面版由紀錄櫃 App 產生；文中「開啟／下載」連結到 ${esc(tw(p.linkExpiresAt))} 前有效，之後請用線上版重新取得。</div>
</div>`
  // 列印版：不延遲載圖、不做進場動畫（否則另存 PDF 時會空白）
  const html = body.replace(/ loading="lazy"/g, '').replace(/ class="([^"]*)\brv\b([^"]*)"/g, ' class="$1$2"')
  return page({ title: `${OWNER} 工作作品集（列印版）｜${COMPANY}`, desc: INTRO, body: html, ogImage: p.projects.find(x => x.cover)?.cover, url: `${p.origin}/portfolio/${key}?all=1` })
}
