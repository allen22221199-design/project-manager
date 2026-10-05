import type { NextRequest } from 'next/server'
import { listProjects, listRecords, listFiles, shareSign, type JProject, type JRecord, type JFile } from './jilugui'

// 紀錄櫃「分享給 AI」：把整個作品集整理成一份 Markdown（或 JSON），讓外部 AI 用一個網址就能讀。
// 文字直接給；檔案本體與縮圖給帶時效簽章的連結（預設 7 天），不用交出登入碼，對方也改不了資料。

const LINK_DAYS = 7
const CATEGORY_ORDER = ['系統開發', '行銷', '工程', '行政', '業務', '會議', '採購', '其他']

export type ShareFile = { id: string; name: string; category: string; date: string; note: string; tags: string[]; by: string; url: string; download: string; thumb: string }
export type ShareRecord = { id: string; title: string; date: string; status: string; category: string; tags: string[]; by: string; link: string; note: string; files: string[]; attachments: { name: string; url: string }[] }
export type ShareProject = { id: string; name: string; category: string; status: string; lastDate: string; link: string; cover: string; summary: string; note: string; records: ShareRecord[]; files: ShareFile[] }
export type Portfolio = {
  app: string; company: string; generatedAt: string; linkExpiresAt: string; origin: string
  stats: { projects: number; records: number; files: number }
  projects: ShareProject[]
  unassigned: { records: ShareRecord[]; files: ShareFile[] }
}

// 對外網址的主機名：Vercel 會把真正的主機放在 x-forwarded-host
export function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export function fileLink(origin: string, id: string, idx: number, exp: number, download = false): string {
  return `${origin}/api/jilugui/share/file/${id}/${idx}?exp=${exp}&sig=${shareSign(`file:${id}:${idx}:${exp}`)}${download ? '&download=1' : ''}`
}
export function thumbLink(origin: string, id: string, kind: 'file' | 'project', exp: number): string {
  return `${origin}/api/jilugui/share/thumb/${id}?kind=${kind}&exp=${exp}&sig=${shareSign(`thumb:${kind}:${id}:${exp}`)}`
}
// 封面欄存的可能是 /api/jilugui/thumb/<id>[?kind=project]（要登入才看得到）或外部網址；換成分享用的簽章連結
function coverLink(origin: string, cover: string, exp: number): string {
  const m = /^\/api\/jilugui\/thumb\/([0-9a-f-]+)(\?kind=project)?/i.exec(cover || '')
  if (m) return thumbLink(origin, m[1], m[2] ? 'project' : 'file', exp)
  return /^https?:\/\//i.test(cover) ? cover : ''
}

async function allRecords(): Promise<JRecord[]> {
  const out: JRecord[] = []
  let cursor: string | undefined
  do {
    const r = await listRecords({ limit: 100, cursor })
    out.push(...r.items)
    cursor = r.nextCursor || undefined
  } while (cursor && out.length < 2000)
  return out
}
async function allFiles(): Promise<JFile[]> {
  const out: JFile[] = []
  let cursor: string | undefined
  do {
    const r = await listFiles({ limit: 100, cursor })
    out.push(...r.items)
    cursor = r.nextCursor || undefined
  } while (cursor && out.length < 2000)
  return out
}

// 說明／細節的第一個非表格行＝一句摘要（跟 App 卡片上的一樣）
export function summaryOf(note: string, max = 120): string {
  for (const raw of String(note || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('|')) continue
    const t = line.replace(/^#{1,3}\s*/, '').replace(/^【([^】]+)】\s*/, '$1：').replace(/\*\*/g, '').replace(/^[-•]\s+/, '')
    return t.length > max ? t.slice(0, max - 1) + '…' : t
  }
  return ''
}
// App 用的簡易排版 → 標準 Markdown：【小標】和 ## 都改成粗體行，避免跟文件的標題層級打架；表格本來就是 GFM
function noteMd(note: string): string {
  return String(note || '').split('\n').map(line => {
    const t = line.replace(/\s+$/, '')
    const m = /^【([^】]+)】\s*(.*)$/.exec(t.trim())
    if (m) return `**${m[1]}**${m[2] ? '　' + m[2] : ''}`
    const h = /^#{1,3}\s+(.*)$/.exec(t.trim())
    if (h) return `**${h[1]}**`
    return t
  }).join('\n').trim()
}

export async function buildPortfolio(origin: string): Promise<Portfolio> {
  const exp = Date.now() + LINK_DAYS * 86400000
  const [projects, records, files] = await Promise.all([listProjects(), allRecords(), allFiles()])
  const fileName = new Map(files.map(f => [f.id, f.name]))
  const toFile = (f: JFile): ShareFile => ({
    id: f.id, name: f.name, category: f.category, date: f.date, note: f.note, tags: f.tags, by: f.by,
    url: f.files[0] ? fileLink(origin, f.id, 0, exp) : '',
    download: f.files[0] ? fileLink(origin, f.id, 0, exp, true) : '',
    thumb: f.thumb ? (f.thumb.startsWith('/api/jilugui/thumb/') ? thumbLink(origin, f.id, 'file', exp) : f.thumb) : '',
  })
  const toRecord = (r: JRecord): ShareRecord => ({
    id: r.id, title: r.title, date: r.date, status: r.status, category: r.category, tags: r.tags, by: r.by, link: r.link, note: r.note,
    files: r.fileIds.map(id => fileName.get(id) || '').filter(Boolean),
    attachments: (r.attachments || []).map(a => ({ name: a.name, url: fileLink(origin, r.id, a.index, exp) })),
  })
  const byDate = <T extends { date: string }>(a: T, b: T) => (b.date || '').localeCompare(a.date || '')
  const rank = (c: string) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? 99 : i }
  const sortedProjects = [...projects].sort((a, b) => rank(a.category) - rank(b.category) || (b.lastDate || '').localeCompare(a.lastDate || ''))
  const out: ShareProject[] = sortedProjects.map((p: JProject) => ({
    id: p.id, name: p.name, category: p.category, status: p.status, lastDate: p.lastDate, link: p.link,
    cover: coverLink(origin, p.cover, exp), summary: summaryOf(p.note), note: p.note,
    records: records.filter(r => r.projectId === p.id).sort(byDate).map(toRecord),
    files: files.filter(f => f.projectId === p.id).sort(byDate).map(toFile),
  }))
  const pid = new Set(projects.map(p => p.id))
  return {
    app: '紀錄櫃', company: '煌盛興業 EGRRA', generatedAt: new Date().toISOString(), linkExpiresAt: new Date(exp).toISOString(), origin,
    stats: { projects: projects.length, records: records.length, files: files.length },
    projects: out,
    unassigned: {
      records: records.filter(r => !r.projectId || !pid.has(r.projectId)).sort(byDate).map(toRecord),
      files: files.filter(f => !f.projectId || !pid.has(f.projectId)).sort(byDate).map(toFile),
    },
  }
}

const esc = (s: string) => String(s || '').replace(/\|/g, '／').replace(/\n/g, ' ')
const tw = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })

function recordMd(r: ShareRecord): string {
  const meta = [`狀態：${r.status || '—'}`, `分類：${r.category || '—'}`, r.tags.length ? `標籤：${r.tags.join('、')}` : '', r.by ? `記錄者：${r.by}` : '', r.link ? `連結：${r.link}` : ''].filter(Boolean).join(' ｜ ')
  const lines = [`#### ${r.date || '（無日期）'} ｜ ${r.title}`, `- ${meta}`]
  if (r.files.length) lines.push(`- 相關檔案：${r.files.join('、')}`)
  if (r.attachments.length) lines.push(`- 附件：${r.attachments.map(a => `[${a.name}](${a.url})`).join('、')}`)
  if (r.note) lines.push('', noteMd(r.note))
  return lines.join('\n')
}
function filesMd(files: ShareFile[]): string {
  if (!files.length) return '（沒有檔案）'
  const rows = files.map(f => `| ${esc(f.name)} | ${f.category || ''} | ${f.date || ''} | ${esc(f.note)} | ${f.url ? `[開啟](${f.url}) ／ [下載](${f.download})` : '—'} | ${f.thumb ? `[縮圖](${f.thumb})` : '—'} |`)
  return ['| 檔名 | 分類 | 日期 | 說明 | 檔案 | 縮圖 |', '|---|---|---|---|---|---|', ...rows].join('\n')
}

export function portfolioMarkdown(p: Portfolio): string {
  const out: string[] = []
  out.push(`# ${p.app}・作品集 — ${p.company}`)
  out.push('')
  out.push(`這是給 AI 閱讀的唯讀快照，由紀錄櫃 App 在 ${tw(p.generatedAt)}（台北）產生。文字是全部內容；「檔案」「縮圖」連結到 ${tw(p.linkExpiresAt)} 前有效，過期請重新讀取本頁。同一個網址加上 \`?format=json\` 可拿結構化版本。`)
  out.push('')
  out.push(`統計：專案 ${p.stats.projects}、工作紀錄 ${p.stats.records}、檔案 ${p.stats.files}。`)
  out.push('')
  out.push('## 專案一覽')
  out.push('')
  out.push('| 分類 | 專案 | 狀態 | 最近 | 一句話 |')
  out.push('|---|---|---|---|---|')
  for (const pr of p.projects) out.push(`| ${pr.category || ''} | ${esc(pr.name)} | ${pr.status || ''} | ${pr.lastDate || ''} | ${esc(pr.summary)} |`)
  for (const pr of p.projects) {
    out.push('', `## 專案：${pr.name}`, '')
    const meta = [`分類：${pr.category || '—'}`, `狀態：${pr.status || '—'}`, pr.lastDate ? `最近：${pr.lastDate}` : '', `紀錄 ${pr.records.length}`, `檔案 ${pr.files.length}`].filter(Boolean).join(' ｜ ')
    out.push(`- ${meta}`)
    if (pr.link) out.push(`- 連結：${pr.link}`)
    if (pr.cover) out.push(`- 封面：${pr.cover}`)
    if (pr.note) out.push('', '### 說明', '', noteMd(pr.note))
    out.push('', `### 工作紀錄（${pr.records.length}）`, '')
    out.push(pr.records.length ? pr.records.map(recordMd).join('\n\n') : '（沒有紀錄）')
    out.push('', `### 檔案（${pr.files.length}）`, '', filesMd(pr.files))
  }
  if (p.unassigned.records.length || p.unassigned.files.length) {
    out.push('', '## 沒掛專案的項目', '')
    if (p.unassigned.records.length) out.push('### 工作紀錄', '', p.unassigned.records.map(recordMd).join('\n\n'), '')
    if (p.unassigned.files.length) out.push('### 檔案', '', filesMd(p.unassigned.files))
  }
  out.push('', '---', `資料來源：Notion「紀錄櫃」三個資料庫（專案、工作紀錄、檔案庫），經紀錄櫃 App 整理。`)
  return out.join('\n') + '\n'
}
