import crypto from 'crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { notion } from './notion'

// ===== 紀錄櫃（從 Cloudflare Workers 搬到 Vercel 的後端）=====
// 資料還是 Notion「專案總表 → 紀錄櫃」底下的三個資料庫：工作紀錄、檔案庫、成員。
// 新上傳的檔案放 Vercel Blob（Notion 的「檔案」欄存外部連結）；
// 以前在 Cloudflare 版上傳、存在 Notion 裡的檔案照樣讀得到（走 /api/jilugui/file 轉址到 Notion 的臨時網址）。
//
// 前端在 public/jilugui/app.js，回傳的資料形狀（record / file / user）要跟它對得上，改欄位兩邊要一起改。

export const APP_NAME = '紀錄櫃'
export const RECORDS_DB = process.env.JILUGUI_RECORDS_DB_ID || 'c03fe9e5680546ff9fca00f9f07550c1'
export const FILES_DB = process.env.JILUGUI_FILES_DB_ID || 'e4b40fa0d6b946da8f24b1d933217ce2'
export const MEMBERS_DB = process.env.JILUGUI_MEMBERS_DB_ID || '38ee2e325f2d44abbe67b9280a164eec'
export const PROJECTS_DB = process.env.JILUGUI_PROJECTS_DB_ID || '96b2e6b508f84f5099fc9355b06073e5'
export const AI_ON = !!process.env.GEMINI_API_KEY
export const PROJECT_STATUS = ['進行中', '已完成', '暫停']

export const RECORD_STATUS = ['進行中', '已完成', '待追蹤', '取消']
export const RECORD_CATEGORY = ['工程', '業務', '會議', '採購', '行政', '系統開發', '其他']
export const FILE_CATEGORY = ['文件', '照片', '合約', '報價與發票', '圖面', '影片', '其他']

// ---------- Notion 小工具 ----------
const rtext = (p: any) => (p?.rich_text ?? []).map((r: any) => r.plain_text).join('')
const ttext = (p: any) => (p?.title ?? []).map((r: any) => r.plain_text).join('')
function rich(s: string): any[] {
  const out: any[] = []
  const str = String(s ?? '')
  for (let i = 0; i < str.length; i += 2000) out.push({ text: { content: str.slice(i, i + 2000) } })
  return out
}
function codeOf(p: any): string {
  const u = p?.unique_id
  if (!u || u.number == null) return ''
  return (u.prefix ? u.prefix + '-' : '') + u.number
}
const s = (x: any, max: number) => String(x ?? '').trim().slice(0, max)
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
function cleanTags(v: any): string[] {
  const out: string[] = []
  for (const t of Array.isArray(v) ? v : []) {
    const x = s(t, 50).replace(/,/g, '')
    if (x && !out.includes(x)) out.push(x)
    if (out.length >= 20) break
  }
  return out
}
function cleanIds(v: any): string[] {
  const out: string[] = []
  for (const t of Array.isArray(v) ? v : []) {
    const x = s(t, 64)
    if (/^[0-9a-f-]{32,36}$/i.test(x) && !out.includes(x)) out.push(x)
    if (out.length >= 100) break
  }
  return out
}
// Notion 查詢分頁：一次最多 100 筆
async function queryAll(database_id: string, body: any, max = 300): Promise<any[]> {
  const results: any[] = []
  let cursor: string | undefined
  do {
    const res: any = await notion.databases.query({ database_id, page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) })
    results.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor && results.length < max)
  return results.filter((p: any) => !p.archived && !p.in_trash)
}
function isGone(e: any): boolean {
  const msg = String(e?.message ?? e)
  return e?.code === 'object_not_found' || msg.includes('archived') || msg.includes('Could not find')
}

// ---------- 成員與登入碼 ----------
export type JUser = { name: string; role: 'admin' | 'member' }
type Member = JUser & { id: string; code: string; enabled: boolean }

function toMember(p: any): Member {
  const pr = p.properties ?? {}
  return {
    id: p.id,
    name: ttext(pr['姓名']).replace(/\s+/g, ''),
    role: pr['角色']?.select?.name === '管理者' ? 'admin' : 'member',
    code: rtext(pr['登入碼']).trim(),
    enabled: pr['啟用']?.checkbox !== false,
  }
}
async function listMembers(): Promise<Member[]> {
  return (await queryAll(MEMBERS_DB, {})).map(toMember).filter(m => m.name)
}

// 登入碼存成 pbkdf2$次數$鹽$雜湊（Cloudflare 版就是這個格式，所以舊的登入碼照樣能用）。
// 管理者在 Notion 直接打明文也可以，第一次登入成功就會自動換成雜湊。
function b64(buf: Buffer): string { return buf.toString('base64url') }
function unb64(str: string): Buffer {
  const t = str.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(t + '='.repeat((4 - (t.length % 4)) % 4), 'base64')
}
export function hashCode(code: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.pbkdf2Sync(code, salt, 100000, 32, 'sha256')
  return `pbkdf2$100000$${b64(salt)}$${b64(hash)}`
}
function safeEq(a: Buffer, b: Buffer): boolean { return a.length === b.length && crypto.timingSafeEqual(a, b) }
export function verifyCode(code: string, stored: string): boolean {
  if (!code || !stored) return false
  if (stored.startsWith('pbkdf2$')) {
    const [, iterS, saltS, hashS] = stored.split('$')
    const iter = Number(iterS)
    if (!iter || !saltS || !hashS) return false
    const want = unb64(hashS)
    // 鹽的寫法不確定（舊版可能是 base64 解開的位元組、也可能直接用字串），兩種都試
    for (const salt of [unb64(saltS), Buffer.from(saltS, 'utf8')]) {
      for (const algo of ['sha256', 'sha512']) {
        try {
          if (safeEq(crypto.pbkdf2Sync(code, salt, iter, want.length, algo), want)) return true
        } catch { /* 試下一種 */ }
      }
    }
    return false
  }
  return safeEq(Buffer.from(code, 'utf8'), Buffer.from(stored, 'utf8'))
}

// 只用登入碼登入：每個人一組不一樣的登入碼，系統靠它認出是誰。
export async function loginByCode(code: string): Promise<{ ok: true; user: JUser } | { ok: false; error: string }> {
  const c = String(code ?? '').trim()
  if (!c) return { ok: false, error: '請輸入登入碼' }
  const members = (await listMembers()).filter(m => m.enabled)
  const hits = members.filter(m => verifyCode(c, m.code))
  if (hits.length === 0) return { ok: false, error: '登入碼不對' }
  if (hits.length > 1) return { ok: false, error: '這組登入碼有兩個人以上在用，請管理者到 Notion「成員」把登入碼改成每人不一樣' }
  const m = hits[0]
  if (!m.code.startsWith('pbkdf2$')) {
    // 明文登入碼：登入成功後換成雜湊存回去，Notion 裡就看不到原文
    try { await notion.pages.update({ page_id: m.id, properties: { 登入碼: { rich_text: rich(hashCode(c)) } } }) } catch { /* 存不回去也不影響登入 */ }
  }
  return { ok: true, user: { name: m.name, role: m.role } }
}

export async function changeCode(user: JUser, current: string, next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const n = String(next ?? '').trim()
  if (n.length < 6) return { ok: false, error: '新登入碼至少 6 碼' }
  const members = await listMembers()
  const me = members.find(m => m.name === user.name)
  if (!me) return { ok: false, error: '找不到你的成員資料，請管理者確認 Notion「成員」名單' }
  if (!verifyCode(String(current ?? ''), me.code)) return { ok: false, error: '目前的登入碼不對' }
  // 新登入碼不能跟別人一樣，不然只用登入碼登入會認不出是誰
  if (members.some(m => m.id !== me.id && m.enabled && verifyCode(n, m.code))) return { ok: false, error: '這組登入碼已經有人在用，請換一組' }
  await notion.pages.update({ page_id: me.id, properties: { 登入碼: { rich_text: rich(hashCode(n)) } } })
  return { ok: true }
}

// ---------- 登入狀態（簽章 cookie）----------
const SECRET = process.env.JILUGUI_SECRET || process.env.AUTH_SECRET || process.env.ADMIN_PASS || process.env.NOTION_TOKEN || 'insecure-dev-secret'
export const COOKIE = 'jilugui_session'
export function signUser(u: JUser, days = 30): string {
  const payload = Buffer.from(JSON.stringify({ n: u.name, r: u.role, exp: Date.now() + days * 86400000 })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}
export function readUser(token?: string | null): JUser | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  try {
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
    if (!safeEq(Buffer.from(sig), Buffer.from(expected))) return null
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (typeof d.exp !== 'number' || d.exp < Date.now() || !d.n) return null
    return { name: String(d.n), role: d.r === 'admin' ? 'admin' : 'member' }
  } catch { return null }
}

// ---------- 工作紀錄 ----------
export type JRecord = {
  id: string; title: string; date: string; note: string; status: string; category: string
  tags: string[]; link: string; fileIds: string[]; attachments: { name: string; index: number }[]
  by: string; code: string; notionUrl: string; createdAt: string; updatedAt: string
  projectId: string   // 掛在哪個專案底下（「專案」關聯的第一個）；沒有就空字串
}
function toRecord(p: any): JRecord {
  const pr = p.properties ?? {}
  return {
    id: p.id,
    projectId: pr['專案']?.relation?.[0]?.id ?? '',
    title: ttext(pr['做了什麼']),
    date: pr['日期']?.date?.start ?? '',
    note: rtext(pr['細節']),
    status: pr['狀態']?.select?.name ?? '',
    category: pr['分類']?.select?.name ?? '',
    tags: (pr['標籤']?.multi_select ?? []).map((o: any) => o.name),
    link: pr['連結']?.url ?? '',
    fileIds: (pr['相關檔案']?.relation ?? []).map((r: any) => r.id),
    attachments: (pr['附件']?.files ?? []).map((f: any, index: number) => ({ name: f.name || '附件', index })),
    by: rtext(pr['記錄者']),
    code: codeOf(pr['編號']),
    notionUrl: p.url ?? '',
    createdAt: p.created_time ?? '',
    updatedAt: p.last_edited_time ?? '',
  }
}
// projectId：undefined＝不動、''＝取消掛專案、id＝掛到那個專案
export type RecordInput = { title: string; date: string; note: string; status: string; category: string; tags: string[]; link: string; fileIds?: string[]; projectId?: string }
export function cleanRecordInput(v: any): RecordInput | null {
  if (!v || typeof v !== 'object') return null
  const title = s(v.title, 200)
  if (!title) return null
  const date = s(v.date, 10)
  if (date && !isDate(date)) return null
  const link = s(v.link, 2000)
  if (link && !/^https?:\/\//i.test(link)) return null
  const out: RecordInput = { title, date, note: s(v.note, 20000), status: s(v.status, 50), category: s(v.category, 50), tags: cleanTags(v.tags), link }
  if (v.fileIds !== undefined) out.fileIds = cleanIds(v.fileIds)
  if (v.projectId !== undefined) out.projectId = cleanIds([v.projectId])[0] ?? ''
  return out
}
function recordProps(r: RecordInput, by?: string): any {
  const props: any = {
    做了什麼: { title: rich(r.title) },
    日期: r.date ? { date: { start: r.date } } : { date: null },
    細節: { rich_text: rich(r.note) },
    狀態: r.status ? { select: { name: r.status } } : { select: null },
    分類: r.category ? { select: { name: r.category } } : { select: null },
    標籤: { multi_select: r.tags.map(name => ({ name })) },
    連結: { url: r.link || null },
  }
  if (r.fileIds) props['相關檔案'] = { relation: r.fileIds.map(id => ({ id })) }
  if (r.projectId !== undefined) props['專案'] = { relation: r.projectId ? [{ id: r.projectId }] : [] }
  if (by !== undefined) props['記錄者'] = { rich_text: rich(by) }
  return props
}
function recordFilter(q?: string, status?: string, project?: string): any {
  const parts: any[] = []
  if (project) parts.push({ property: '專案', relation: { contains: project } })
  // status=active：首頁「進行中的項目」用，進行中＋待追蹤一起拿
  if (status === 'active') parts.push({ or: [{ property: '狀態', select: { equals: '進行中' } }, { property: '狀態', select: { equals: '待追蹤' } }] })
  else if (status) parts.push({ property: '狀態', select: { equals: status } })
  if (q) parts.push({ or: [
    { property: '做了什麼', title: { contains: q } },
    { property: '細節', rich_text: { contains: q } },
    { property: '記錄者', rich_text: { contains: q } },
  ] })
  if (!parts.length) return undefined
  return parts.length === 1 ? parts[0] : { and: parts }
}
export async function listRecords(o: { q?: string; status?: string; project?: string; cursor?: string; limit?: number }): Promise<{ items: JRecord[]; nextCursor: string | null }> {
  const filter = recordFilter(o.q, o.status, o.project)
  const res: any = await notion.databases.query({
    database_id: RECORDS_DB,
    ...(filter ? { filter } : {}),
    sorts: [{ property: '日期', direction: 'descending' }, { timestamp: 'created_time', direction: 'descending' }],
    page_size: Math.min(100, Math.max(1, o.limit || 30)),
    ...(o.cursor ? { start_cursor: o.cursor } : {}),
  })
  return { items: res.results.filter((p: any) => !p.archived && !p.in_trash).map(toRecord), nextCursor: res.has_more ? res.next_cursor : null }
}
export async function getRecord(id: string): Promise<JRecord | null> {
  try {
    const p: any = await notion.pages.retrieve({ page_id: id })
    if (p.archived || p.in_trash) return null
    return toRecord(p)
  } catch (e) { if (isGone(e)) return null; throw e }
}
export async function createRecord(r: RecordInput, by: string): Promise<JRecord> {
  const p: any = await notion.pages.create({ parent: { database_id: RECORDS_DB }, properties: recordProps({ ...r, fileIds: r.fileIds ?? [] }, by) })
  return toRecord(p)
}
export async function updateRecord(id: string, r: RecordInput): Promise<JRecord | null> {
  try {
    const p: any = await notion.pages.update({ page_id: id, properties: recordProps(r) })
    return toRecord(p)
  } catch (e) { if (isGone(e)) return null; throw e }
}
export async function deleteRecord(id: string): Promise<void> {
  try { await notion.pages.update({ page_id: id, archived: true }) } catch (e) { if (!isGone(e)) throw e }
}

// ---------- 檔案庫 ----------
export type JFile = {
  id: string; name: string; files: { name: string; index: number; url?: string }[]; category: string; date: string
  note: string; tags: string[]; by: string; code: string; recordIds: string[]; notionUrl: string; createdAt: string
  thumb: string   // 縮圖網址（瀏覽器上傳時產生、放在 Vercel Blob）；沒有就空字串
  projectId: string   // 直接掛在哪個專案底下；沒有就空字串（經由紀錄間接屬於專案的不算在這裡）
}
const isBlobUrl = (u: string) => { try { return new URL(u).hostname.endsWith('blob.vercel-storage.com') } catch { return false } }
function toFile(p: any): JFile {
  const pr = p.properties ?? {}
  return {
    id: p.id,
    name: ttext(pr['檔名']),
    // 外部連結（Vercel Blob）直接給網址；存在 Notion 裡的檔案網址一小時會過期，讓前端走 /file/:id/:idx 每次拿新的
    files: (pr['檔案']?.files ?? []).map((f: any, index: number) => ({ name: f.name || '檔案', index, ...(f.type === 'external' && f.external?.url ? { url: f.external.url } : {}) })),
    category: pr['分類']?.select?.name ?? '',
    date: pr['日期']?.date?.start ?? '',
    note: rtext(pr['說明']),
    tags: (pr['標籤']?.multi_select ?? []).map((o: any) => o.name),
    by: rtext(pr['上傳者']),
    code: codeOf(pr['編號']),
    recordIds: (pr['相關紀錄']?.relation ?? []).map((r: any) => r.id),
    notionUrl: p.url ?? '',
    createdAt: p.created_time ?? '',
    thumb: pr['縮圖']?.url ?? '',
    projectId: pr['專案']?.relation?.[0]?.id ?? '',
  }
}
export type Upload = { url: string; name: string; size?: number; type?: string }
export type FileInput = { name: string; uploads: Upload[]; category: string; date: string; note: string; tags: string[]; recordIds: string[]; thumb?: string; projectId?: string }
export function cleanFileInput(v: any): FileInput | null {
  if (!v || typeof v !== 'object') return null
  const uploads: Upload[] = []
  for (const u of Array.isArray(v.uploads) ? v.uploads.slice(0, 20) : []) {
    const url = s(u?.url, 2000)
    if (!/^https?:\/\//i.test(url)) continue
    uploads.push({ url, name: s(u?.name, 200) || url.split('/').pop() || '檔案', size: Number(u?.size) || undefined, type: s(u?.type, 100) || undefined })
  }
  if (!uploads.length) return null
  const date = s(v.date, 10)
  if (date && !isDate(date)) return null
  const thumb = s(v.thumb, 2000)
  const projectId = v.projectId !== undefined ? (cleanIds([v.projectId])[0] ?? '') : undefined
  return { name: s(v.name, 200) || uploads[0].name, uploads, category: s(v.category, 50), date, note: s(v.note, 20000), tags: cleanTags(v.tags), recordIds: cleanIds(v.recordIds), ...(/^https?:\/\//i.test(thumb) ? { thumb } : {}), ...(projectId !== undefined ? { projectId } : {}) }
}
// 只改有送來的欄位：編輯表單會送全部，「補縮圖」只送 thumb
export type FileEdit = { name?: string; category?: string; date?: string; note?: string; tags?: string[]; thumb?: string; projectId?: string }
export function cleanFileEdit(v: any): FileEdit | null {
  if (!v || typeof v !== 'object') return null
  const out: FileEdit = {}
  if (v.name !== undefined) out.name = s(v.name, 200)
  if (v.category !== undefined) out.category = s(v.category, 50)
  if (v.date !== undefined) {
    const date = s(v.date, 10)
    if (date && !isDate(date)) return null
    out.date = date
  }
  if (v.note !== undefined) out.note = s(v.note, 20000)
  if (v.tags !== undefined) out.tags = cleanTags(v.tags)
  if (v.thumb !== undefined) {
    const t = s(v.thumb, 2000)
    if (t && !/^https?:\/\//i.test(t)) return null
    out.thumb = t
  }
  if (v.projectId !== undefined) out.projectId = cleanIds([v.projectId])[0] ?? ''
  if (!Object.keys(out).length) return null
  return out
}
function fileFilter(q?: string, category?: string, project?: string): any {
  const parts: any[] = []
  if (project) parts.push({ property: '專案', relation: { contains: project } })
  if (category) parts.push({ property: '分類', select: { equals: category } })
  if (q) parts.push({ or: [
    { property: '檔名', title: { contains: q } },
    { property: '說明', rich_text: { contains: q } },
    { property: '上傳者', rich_text: { contains: q } },
  ] })
  if (!parts.length) return undefined
  return parts.length === 1 ? parts[0] : { and: parts }
}
export async function listFiles(o: { q?: string; category?: string; project?: string; cursor?: string; limit?: number }): Promise<{ items: JFile[]; nextCursor: string | null }> {
  const filter = fileFilter(o.q, o.category, o.project)
  const res: any = await notion.databases.query({
    database_id: FILES_DB,
    ...(filter ? { filter } : {}),
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: Math.min(100, Math.max(1, o.limit || 30)),
    ...(o.cursor ? { start_cursor: o.cursor } : {}),
  })
  return { items: res.results.filter((p: any) => !p.archived && !p.in_trash).map(toFile), nextCursor: res.has_more ? res.next_cursor : null }
}
export async function getFile(id: string): Promise<JFile | null> {
  try {
    const p: any = await notion.pages.retrieve({ page_id: id })
    if (p.archived || p.in_trash) return null
    return toFile(p)
  } catch (e) { if (isGone(e)) return null; throw e }
}
export async function createFile(f: FileInput, by: string): Promise<JFile> {
  const p: any = await notion.pages.create({
    parent: { database_id: FILES_DB },
    properties: {
      檔名: { title: rich(f.name) },
      檔案: { files: f.uploads.map(u => ({ name: u.name.slice(0, 100), type: 'external', external: { url: u.url } })) },
      分類: f.category ? { select: { name: f.category } } : { select: null },
      日期: f.date ? { date: { start: f.date } } : { date: null },
      說明: { rich_text: rich(f.note) },
      標籤: { multi_select: f.tags.map(name => ({ name })) },
      相關紀錄: { relation: f.recordIds.map(id => ({ id })) },
      上傳者: { rich_text: rich(by) },
      縮圖: { url: f.thumb || null },
      專案: { relation: f.projectId ? [{ id: f.projectId }] : [] },
    },
  })
  return toFile(p)
}
export async function updateFile(id: string, f: FileEdit): Promise<JFile | null> {
  try {
    const props: any = {}
    if (f.name) props['檔名'] = { title: rich(f.name) }
    if (f.category !== undefined) props['分類'] = f.category ? { select: { name: f.category } } : { select: null }
    if (f.date !== undefined) props['日期'] = f.date ? { date: { start: f.date } } : { date: null }
    if (f.note !== undefined) props['說明'] = { rich_text: rich(f.note) }
    if (f.tags !== undefined) props['標籤'] = { multi_select: f.tags.map(name => ({ name })) }
    if (f.thumb !== undefined) props['縮圖'] = { url: f.thumb || null }
    if (f.projectId !== undefined) props['專案'] = { relation: f.projectId ? [{ id: f.projectId }] : [] }
    const p: any = await notion.pages.update({ page_id: id, properties: props })
    return toFile(p)
  } catch (e) { if (isGone(e)) return null; throw e }
}
// 封存頁面；回傳放在 Vercel Blob 的網址，讓 route 順手把檔案刪掉
export async function deleteFile(id: string): Promise<{ blobUrls: string[] }> {
  let blobUrls: string[] = []
  try {
    const p: any = await notion.pages.retrieve({ page_id: id })
    const urls: any[] = (p.properties?.['檔案']?.files ?? []).map((f: any) => f?.external?.url)
    urls.push(p.properties?.['縮圖']?.url)   // 縮圖也在 Blob 上，一起刪
    blobUrls = urls.filter((u: any) => typeof u === 'string' && isBlobUrl(u))
  } catch { /* 讀不到就只封存 */ }
  try { await notion.pages.update({ page_id: id, archived: true }) } catch (e) { if (!isGone(e)) throw e }
  return { blobUrls }
}

// ---------- 專案 ----------
// 一個專案底下掛工作紀錄（紀錄的「專案」欄）和檔案（檔案直接掛、或經由紀錄的「相關檔案」間接掛）。
export type JProject = {
  id: string; name: string; status: string; category: string; note: string; link: string; code: string
  recordCount: number; fileCount: number; lastDate: string; notionUrl: string; createdAt: string; updatedAt: string
}
function toProject(p: any): JProject {
  const pr = p.properties ?? {}
  // 筆數用 Notion 的 rollup；rollup 欄位不在時退回關聯陣列長度（查詢結果最多只給 25 個，夠當個概數）
  const rollNum = (k: string, relKey: string) => {
    const r = pr[k]?.rollup
    if (r && r.type === 'number' && typeof r.number === 'number') return r.number
    return (pr[relKey]?.relation ?? []).length
  }
  const r = pr['最近日期']?.rollup
  return {
    id: p.id,
    name: ttext(pr['專案名稱']),
    status: pr['狀態']?.select?.name ?? '',
    category: pr['分類']?.select?.name ?? '',
    note: rtext(pr['說明']),
    link: pr['連結']?.url ?? '',
    code: codeOf(pr['編號']),
    recordCount: rollNum('紀錄數', '紀錄'),
    fileCount: rollNum('檔案數', '檔案'),
    lastDate: r && r.type === 'date' ? (r.date?.start ?? '') : '',
    notionUrl: p.url ?? '',
    createdAt: p.created_time ?? '',
    updatedAt: p.last_edited_time ?? '',
  }
}
export type ProjectInput = { name: string; status: string; category: string; note: string; link: string }
export function cleanProjectInput(v: any): ProjectInput | null {
  if (!v || typeof v !== 'object') return null
  const name = s(v.name, 200)
  if (!name) return null
  const link = s(v.link, 2000)
  if (link && !/^https?:\/\//i.test(link)) return null
  return { name, status: s(v.status, 50), category: s(v.category, 50), note: s(v.note, 20000), link }
}
function projectProps(r: ProjectInput): any {
  return {
    專案名稱: { title: rich(r.name) },
    狀態: r.status ? { select: { name: r.status } } : { select: null },
    分類: r.category ? { select: { name: r.category } } : { select: null },
    說明: { rich_text: rich(r.note) },
    連結: { url: r.link || null },
  }
}
export async function listProjects(): Promise<JProject[]> {
  const pages = await queryAll(PROJECTS_DB, { sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }] }, 200)
  return pages.map(toProject)
}
export async function getProject(id: string): Promise<JProject | null> {
  try {
    const p: any = await notion.pages.retrieve({ page_id: id })
    if (p.archived || p.in_trash) return null
    return toProject(p)
  } catch (e) { if (isGone(e)) return null; throw e }
}
export async function createProject(r: ProjectInput): Promise<JProject> {
  const p: any = await notion.pages.create({ parent: { database_id: PROJECTS_DB }, properties: projectProps(r) })
  return toProject(p)
}
export async function updateProject(id: string, r: ProjectInput): Promise<JProject | null> {
  try {
    const p: any = await notion.pages.update({ page_id: id, properties: projectProps(r) })
    return toProject(p)
  } catch (e) { if (isGone(e)) return null; throw e }
}
// 只封存專案本身；底下的紀錄和檔案都留著，只是不再掛在專案上
export async function deleteProject(id: string): Promise<void> {
  try { await notion.pages.update({ page_id: id, archived: true }) } catch (e) { if (!isGone(e)) throw e }
}
// 專案頁要的整包：專案本身、它的紀錄（新→舊）、它的檔案（直接掛的＋經由紀錄掛的，去重、新→舊）
export async function getProjectBundle(id: string): Promise<{ project: JProject; records: JRecord[]; files: JFile[] } | null> {
  const project = await getProject(id)
  if (!project) return null
  const [recPages, directFiles] = await Promise.all([
    queryAll(RECORDS_DB, { filter: { property: '專案', relation: { contains: id } }, sorts: [{ property: '日期', direction: 'descending' }, { timestamp: 'created_time', direction: 'descending' }] }, 200),
    queryAll(FILES_DB, { filter: { property: '專案', relation: { contains: id } }, sorts: [{ timestamp: 'created_time', direction: 'descending' }] }, 200),
  ])
  const records = recPages.map(toRecord)
  const files: JFile[] = directFiles.map(toFile)
  const seen = new Set(files.map(f => f.id))
  // 經由紀錄掛的檔案：一筆一筆讀，最多 80 個，十個一組平行讀
  const viaIds: string[] = []
  for (const r of records) for (const fid of r.fileIds) if (!seen.has(fid) && !viaIds.includes(fid)) viaIds.push(fid)
  for (let i = 0; i < Math.min(viaIds.length, 80); i += 10) {
    const got = await Promise.all(viaIds.slice(i, i + 10).map(fid => getFile(fid).catch(() => null)))
    for (const f of got) if (f && !seen.has(f.id)) { seen.add(f.id); files.push(f) }
  }
  files.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return { project, records, files }
}

// 檔案本體的網址：檔案庫的「檔案」欄或工作紀錄的「附件」欄，第 idx 個
export async function resolveFileUrl(pageId: string, idx: number): Promise<{ url: string; name: string; external: boolean } | null> {
  let p: any
  try { p = await notion.pages.retrieve({ page_id: pageId }) } catch (e) { if (isGone(e)) return null; throw e }
  const pr = p.properties ?? {}
  const files: any[] = pr['檔案']?.files ?? pr['附件']?.files ?? []
  const f = files[idx]
  if (!f) return null
  const url = f.type === 'external' ? f.external?.url : f.file?.url
  if (!url) return null
  return { url, name: f.name || '檔案', external: f.type === 'external' }
}

// ---------- 問紀錄櫃 ----------
// 關鍵字切法：先照標點和空白切，中文長詞再切成兩字一組（「台中報價單」→ 台中、中報、報價、價單），
// 不然沒加空白的中文問句整句當一個關鍵字，什麼都比對不到。
function tokens(q: string): string[] {
  const out: string[] = []
  for (const w of q.toLowerCase().replace(/[，。、？！?!,.:：；;（）()「」\s]+/g, ' ').split(' ')) {
    const t = w.trim()
    if (!t) continue
    out.push(t)
    if (t.length >= 3 && /[一-鿿]/.test(t)) for (let i = 0; i + 2 <= t.length; i++) out.push(t.slice(i, i + 2))
  }
  return Array.from(new Set(out))
}
function score(hay: string, toks: string[]): number {
  const h = hay.toLowerCase()
  let n = 0
  for (const t of toks) if (t && h.includes(t)) n += t.length >= 2 ? 2 : 1
  return n
}
export async function askVault(question: string, history: { role: string; text: string }[]): Promise<{ answer: string; files: JFile[]; records: JRecord[] }> {
  const q = s(question, 500)
  if (!q) return { answer: '請輸入想找什麼。', files: [], records: [] }
  const [recs, files] = await Promise.all([
    queryAll(RECORDS_DB, { sorts: [{ property: '日期', direction: 'descending' }] }, 150).then(ps => ps.map(toRecord)),
    queryAll(FILES_DB, { sorts: [{ timestamp: 'created_time', direction: 'descending' }] }, 150).then(ps => ps.map(toFile)),
  ])
  const fileText = (f: JFile) => [f.name, f.category, f.note, f.tags.join(' '), f.by, f.date].join(' ')
  const recText = (r: JRecord) => [r.title, r.note, r.category, r.status, r.tags.join(' '), r.by, r.date].join(' ')

  if (AI_ON) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } })
      const fl = files.map((f, i) => `F${i}｜${f.name}｜${f.category}｜${f.date || f.createdAt.slice(0, 10)}｜${f.by}｜${f.tags.join(',')}｜${f.note.slice(0, 160)}`).join('\n')
      const rl = recs.map((r, i) => `R${i}｜${r.date}｜${r.title}｜${r.status}｜${r.category}｜${r.by}｜${r.tags.join(',')}｜${r.note.slice(0, 160)}`).join('\n')
      const hist = (history || []).slice(-6).map(m => `${m.role === 'user' ? '使用者' : '助理'}：${s(m.text, 300)}`).join('\n')
      const prompt = `你是公司「紀錄櫃」的找檔案助理。使用者會用口語問檔案或做過的事在哪，請從下面的檔案清單與工作紀錄清單裡挑出最相關的，用繁體中文簡短回答（兩三句，說找到什麼、是哪天的、誰上傳的；找不到就老實說沒有，並建議換個關鍵字）。
只能回傳 JSON：{"answer":"…","fileIds":["F3","F7"],"recordIds":["R2"]}。fileIds、recordIds 各最多 5 個，依相關程度排序，沒有就給空陣列。不要編造清單裡沒有的東西。

${hist ? '之前的對話：\n' + hist + '\n\n' : ''}使用者這次問：${q}

檔案清單（編號｜檔名｜分類｜日期｜上傳者｜標籤｜說明）：
${fl || '（沒有檔案）'}

工作紀錄清單（編號｜日期｜做了什麼｜狀態｜分類｜記錄者｜標籤｜細節）：
${rl || '（沒有紀錄）'}`
      const res = await model.generateContent(prompt)
      const raw = res.response.text()
      const j = JSON.parse(raw.replace(/^```json\s*|```\s*$/g, ''))
      const pick = <T,>(ids: any, list: T[], prefix: string): T[] => {
        const out: T[] = []
        for (const x of Array.isArray(ids) ? ids : []) {
          const m = /^([FR])(\d+)$/.exec(String(x).trim().toUpperCase())
          if (!m || m[1] !== prefix) continue
          const it = list[Number(m[2])]
          if (it && !out.includes(it)) out.push(it)
          if (out.length >= 5) break
        }
        return out
      }
      return { answer: s(j.answer, 1000) || '找到了，請看下面。', files: pick(j.fileIds, files, 'F'), records: pick(j.recordIds, recs, 'R') }
    } catch (e) {
      console.error('[jilugui] AI 查詢失敗，改用關鍵字', e)
    }
  }

  // 關鍵字模式（沒有 AI 金鑰、或 AI 失敗時）
  const toks = tokens(q)
  const fHits = files.map(f => ({ f, n: score(fileText(f), toks) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5).map(x => x.f)
  const rHits = recs.map(r => ({ r, n: score(recText(r), toks) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5).map(x => x.r)
  const answer = fHits.length || rHits.length
    ? `用關鍵字找到 ${fHits.length} 個檔案、${rHits.length} 筆紀錄。`
    : '沒有找到符合的檔案或紀錄，換個關鍵字試試（例如案名、客戶、檔案類型）。'
  return { answer, files: fHits, records: rHits }
}
