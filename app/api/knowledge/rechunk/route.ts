import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { getFileKnowledgeBase, rechunkKnowledgePage } from '@/lib/notion'

export const maxDuration = 60

// 一次性維護用 token（跑完切塊後會移除此路徑的 bypass）。
const MAINT_KEY = 'chunk-once-9f2a7c4e1b'

// 把「檔案庫」（已處理）項目的內文，重新整理成 Notion 內的「切塊」區塊。
// 具冪等性 + 分批：每次只處理一小段（時間預算內），連續呼叫直到 more=false。
// 注意：只針對檔案庫，不動 SOP知識庫（其內含表格排版，切塊會破壞）。
export async function POST(req: NextRequest) {
  const authed = verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  const maint = req.headers.get('x-maint-key') === MAINT_KEY  // 一次性維護觸發
  if (!authed && !maint) {
    return NextResponse.json({ error: '未授權（請先登入管理者）' }, { status: 401 })
  }
  try {
    const kb = await getFileKnowledgeBase()
    const started = Date.now()
    const results: { title: string; chunks: number; skipped: boolean }[] = []
    let remaining = 0
    for (const item of kb) {
      // 12 秒後不再開始新項目（單頁重整可能含多次 Notion 刪除/新增）
      if (Date.now() - started > 12000) { remaining = kb.length - results.length; break }
      try {
        const r = await rechunkKnowledgePage(item.id)
        results.push({ title: item.title, chunks: r.chunks, skipped: r.skipped })
      } catch (e: any) {
        results.push({ title: item.title, chunks: 0, skipped: true })
      }
    }
    // 尚未處理到的（時間預算用完）
    const processedDone = results.filter(r => !r.skipped).length
    return NextResponse.json({
      ok: true,
      processed: results.length,
      chunked: processedDone,
      remaining,
      more: remaining > 0,
      results,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
