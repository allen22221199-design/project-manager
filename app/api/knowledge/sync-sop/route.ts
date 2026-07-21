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
        // 抓不到可讀內文時，寫一個「夠長」的標記（>40字），避免被判定成「摘要過短」而無限重抓
        const summary = text.length >= 20 ? text : '（此頁沒有可擷取的文字內容，可能是純圖片、掃描檔或影片檔；本次同步已處理，不需再重試）'
        await saveSopSummary(item.id, summary)
        results.push({ title: item.title, ok: text.length >= 20 })
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
