import { NextResponse } from 'next/server'
import { getSopPagesNeedingSummary, readPagePlainText, saveSopSummary } from '@/lib/notion'

export const maxDuration = 60

// 同步 SOP知識庫：讀每頁內文、擷取前段當「檢索摘要」，讓 AI 第一階段用真實內容排序。
// 具冪等性 + 分批：只處理「檢索摘要」還空著的頁；處理完該頁就從待辦清單消失，前端連續呼叫直到 more=false。
export async function POST() {
  try {
    const pending = await getSopPagesNeedingSummary()
    const started = Date.now()
    const results: { title: string; ok: boolean }[] = []
    for (const item of pending) {
      if (results.length > 0 && Date.now() - started > 12000) break  // 12 秒後收手，剩下的下一批
      try {
        const text = (await readPagePlainText(item.id)).trim()
        // 空白頁也寫一個標記，避免每次同步都重讀（用「（無內文）」佔位）
        await saveSopSummary(item.id, text || '（此頁無內文）')
        results.push({ title: item.title, ok: !!text })
      } catch {
        results.push({ title: item.title, ok: false })
      }
    }
    const remaining = pending.length - results.length
    return NextResponse.json({
      ok: true,
      processed: results.length,
      success: results.filter(r => r.ok).length,
      remaining,
      more: remaining > 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
