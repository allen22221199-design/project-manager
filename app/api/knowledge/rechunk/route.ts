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
    // 穩定排序（依 id）讓 offset 游標在多次呼叫間可靠推進
    const kb = (await getFileKnowledgeBase()).sort((a, b) => (a.id < b.id ? -1 : 1))
    const offset = Math.max(0, parseInt(req.headers.get('x-offset') || '0', 10) || 0)
    const started = Date.now()
    const done: string[] = []
    let processedThisCall = 0
    let idx = offset
    for (; idx < kb.length; idx++) {
      // 至少處理 1 筆；之後每 12 秒收手，剩下的下一批（用 nextOffset）接續
      if (idx > offset && Date.now() - started > 12000) break
      const item = kb[idx]
      processedThisCall++
      try {
        const r = await rechunkKnowledgePage(item.id)
        if (!r.skipped) done.push(item.title)
      } catch { /* 個別頁失敗略過，繼續下一頁 */ }
    }
    const nextOffset = idx
    return NextResponse.json({
      ok: true,
      total: kb.length,
      offset,
      nextOffset,
      processedThisCall,
      chunkedThisCall: done.length,
      chunkedTitles: done,
      more: nextOffset < kb.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
