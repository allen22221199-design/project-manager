import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { extractOwnTasksFromPdf } from '@/lib/gemini'
import { getTasksByPerson } from '@/lib/notion'

// 總經理專用：上傳待辦清單 PDF，抽出「標了自己」的項目回傳草稿。
// 這支只負責「讀出來」，不寫入 Notion——寫入要等前端出確認卡片、使用者按下去，
// 跟隨手記任務同一套規矩：沒按確認就不會有任何東西進系統。
export const maxDuration = 120

const PRIVATE_PERSON = '呂理論'   // 對應 Notion 的人員名稱（勿改）

export type PdfTaskDraft = {
  task: string
  date: string | null    // YYYY-MM-DD；判斷不出來就 null（前端顯示「未設日期」）
  dueFrom: string        // 日期來源：項目 / 檔案 / 檔名 / 空
  duplicate: boolean     // 這筆已經在待辦清單裡了
}

function taipeiTodayISO(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
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
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: '沒有收到檔案' }, { status: 400 })

    const name = file.name || 'upload.pdf'
    if (!/\.pdf$/i.test(name)) {
      return NextResponse.json({ error: '目前只支援 PDF 檔' }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const sizeMB = buf.byteLength / (1024 * 1024)
    // Vercel 的請求上限實測約 4MB，比程式裡其他地方寫的 18MB 低很多；
    // 超過就會回一個看不懂的 413，不如自己先擋下來講清楚。
    if (sizeMB > 3.5) {
      return NextResponse.json({ error: `檔案太大（約 ${sizeMB.toFixed(1)}MB），請壓縮或分批上傳（上限約 3.5MB）` }, { status: 413 })
    }

    const items = await extractOwnTasksFromPdf(buf.toString('base64'), name, taipeiTodayISO())
    if (items.length === 0) {
      return NextResponse.json({
        reply: '這份 PDF 裡我找不到標記「自己」的項目。確認一下標記方式，或看看是不是掃描件（圖片檔）導致讀不到文字。',
        pdfDrafts: [],
      })
    }

    // 同一份 PDF 重複上傳很常見，先比對現有待辦，重複的標出來讓使用者自己決定
    let existing: string[] = []
    try {
      const tasks = await getTasksByPerson(PRIVATE_PERSON)
      existing = tasks
        .filter((t: any) => t.status !== '完成' && t.status !== '已封存')
        .map((t: any) => String(t.task ?? '').replace(/\s/g, ''))
    } catch { /* 讀不到就當作沒有重複，不影響主流程 */ }

    const drafts: PdfTaskDraft[] = items.map(it => ({
      task: it.task,
      date: it.due,
      dueFrom: it.dueFrom,
      duplicate: existing.includes(it.task.replace(/\s/g, '')),
    }))

    const dup = drafts.filter(d => d.duplicate).length
    const noDate = drafts.filter(d => !d.date).length
    const parts: string[] = []
    if (dup) parts.push(`${dup} 筆已經在清單裡`)
    if (noDate) parts.push(`${noDate} 筆沒有日期`)
    const reply = `從《${name}》抽出 ${drafts.length} 筆標了「自己」的待辦`
      + (parts.length ? `（${parts.join('、')}）` : '')
      + '。確認後按下面的按鈕才會加進你的待辦👇'

    return NextResponse.json({ reply, pdfDrafts: drafts })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
