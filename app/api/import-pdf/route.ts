import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { extractOwnTasksFromPdf, type OwnTaskItem, type TaskSourceMedia } from '@/lib/gemini'
import { getTasksByPerson } from '@/lib/notion'

// 總經理專用：上傳待辦清單 PDF，抽出「標了自己」的項目回傳草稿。
// 這支只負責「讀出來」，不寫入 Notion——寫入要等前端出確認卡片、使用者按下去，
// 跟隨手記任務同一套規矩：沒按確認就不會有任何東西進系統。
//
// 收到的東西：前端（lib/pdf-tiles.ts）已經把 PDF 放大重畫、切成好幾張 JPEG 才送上來，
// 所以這裡拿到的是一疊圖片而不是原始 PDF。原因有兩個，缺一不可：
//   ・9.4MB 的原檔過不了 Vercel 約 4MB 的請求上限；
//   ・XMind 匯出的心智圖字只有約 1pt，原尺寸送給 AI 也讀不到字。
// 仍然接受單一 PDF（小檔、或其他來源直接打這支 API），只是不保證讀得清楚。
export const maxDuration = 120

const PRIVATE_PERSON = '呂理論'   // 對應 Notion 的人員名稱（勿改）
const MAX_TOTAL_MB = 3.5          // Vercel 的請求上限實測約 4MB，留一點餘裕
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf']

export type PdfTaskDraft = {
  task: string
  date: string | null    // YYYY-MM-DD；判斷不出來就 null（前端顯示「未設日期」）
  dueFrom: string        // 日期來源：項目 / 分支 / 檔名 / 空
  duplicate: boolean     // 這筆已經在待辦清單裡了
}

function taipeiTodayISO(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

const norm = (s: string) => s.replace(/\s/g, '')

// 切片之間有重疊，同一筆會被讀到兩次；另外同一句在不同日期底下是不同的兩件事，
// 所以「內容＋日期」都一樣才算重複。
function dedupe(items: OwnTaskItem[]): OwnTaskItem[] {
  // 用 Set 不用物件：任務內容剛好等於 toString / constructor 時，物件會摸到原型上的屬性而誤判成重複
  // 有些切片會把日期分支切掉，同一句就會出現「有日期」和「沒日期」兩個版本，留有日期的那筆
  const dated = new Set<string>()
  items.forEach(it => { if (it.due) dated.add(norm(it.task)) })
  const seen = new Set<string>()
  const out: OwnTaskItem[] = []
  items.forEach(it => {
    if (!it.due && dated.has(norm(it.task))) return
    const key = norm(it.task) + '|' + (it.due ?? '')
    if (seen.has(key)) return
    seen.add(key)
    out.push(it)
  })
  return out
}

export async function POST(req: NextRequest) {
  // 管理者限定。前端雖然也會把按鈕藏起來，但那只是介面，真正的門在這裡——
  // 這批是總經理的私人待辦，不能靠前端藏一藏就當作有保護。
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: '請先登入管理者' }, { status: 401 })
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const form = await req.formData()
    const parts = form.getAll('file').filter(f => typeof f !== 'string') as File[]
    if (parts.length === 0) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 })

    // 檔名跟著切片一起送上來，AI 要靠它判斷日期；沒送就退回第一個檔案的名字
    const name = String(form.get('name') || parts[0].name || 'upload.pdf')

    const media: TaskSourceMedia[] = []
    let bytes = 0
    for (const f of parts) {
      const mimeType = (f.type || '').toLowerCase()
      if (ALLOWED.indexOf(mimeType) < 0) {
        return NextResponse.json({ error: `不支援的檔案格式（${mimeType || '未知'}）` }, { status: 400 })
      }
      const buf = Buffer.from(await f.arrayBuffer())
      bytes += buf.byteLength
      media.push({ data: buf.toString('base64'), mimeType })
    }
    const sizeMB = bytes / (1024 * 1024)
    if (sizeMB > MAX_TOTAL_MB) {
      return NextResponse.json({ error: `檔案太大（約 ${sizeMB.toFixed(1)}MB），請分批上傳（上限約 ${MAX_TOTAL_MB}MB）` }, { status: 413 })
    }

    const { items, failed } = await extractOwnTasksFromPdf(media, name, taipeiTodayISO())
    const partial = failed > 0 ? `（有 ${failed} 張沒讀成功，可能會少幾筆，重上傳一次通常就好了）` : ''
    const unique = dedupe(items)
    if (unique.length === 0) {
      return NextResponse.json({
        reply: `這份《${name}》裡我找不到掛在【自己】底下的項目${partial}。確認一下標記方式，或看看是不是整份都標了別人。`,
        pdfDrafts: [],
      })
    }

    // 同一份 PDF 重複上傳很常見，先比對現有待辦，重複的標出來讓使用者自己決定
    let existing: string[] = []
    try {
      const tasks = await getTasksByPerson(PRIVATE_PERSON)
      existing = tasks
        .filter((t: any) => t.status !== '完成' && t.status !== '已封存')
        .map((t: any) => norm(String(t.task ?? '')))
    } catch { /* 讀不到就當作沒有重複，不影響主流程 */ }

    const drafts: PdfTaskDraft[] = unique.map(it => ({
      task: it.task,
      date: it.due,
      dueFrom: it.dueFrom,
      duplicate: existing.indexOf(norm(it.task)) >= 0,
    }))

    const dup = drafts.filter(d => d.duplicate).length
    const noDate = drafts.filter(d => !d.date).length
    const extra: string[] = []
    if (dup) extra.push(`${dup} 筆已經在清單裡`)
    if (noDate) extra.push(`${noDate} 筆沒有日期`)
    const reply = `從《${name}》抽出 ${drafts.length} 筆掛在【自己】底下的待辦`
      + (extra.length ? `（${extra.join('、')}）` : '')
      + partial
      + '。勾好之後按下面的按鈕才會加進你的待辦👇'

    return NextResponse.json({ reply, pdfDrafts: drafts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
