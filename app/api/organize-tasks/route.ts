import { NextRequest, NextResponse } from 'next/server'
import { organizeDailyTasks } from '@/lib/gemini'
import { addDailyTask, deleteDailyTasksByDate, writeHistorySection } from '@/lib/notion'
import { pushToLine } from '@/lib/line'

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { text, sendLine } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: '請貼上 Plaud 內容' }, { status: 400 })

    // 1. Gemini 整理成每人工作項目
    const items = await organizeDailyTasks(text.trim())
    if (items.length === 0) {
      return NextResponse.json({ error: '無法從內容整理出工作項目，請確認內容', count: 0 }, { status: 200 })
    }

    // 台灣時間日期（UTC+8）
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

    // 依人員分組（給 LINE、歷史頁面用）
    const grouped: Record<string, string[]> = {}
    for (const it of items) {
      ;(grouped[it.person?.trim() || '未分類'] ??= []).push(it.task?.trim() || '')
    }

    // 2. 重寫當天：先刪掉今天的舊資料，再寫入新版
    await deleteDailyTasksByDate(today)
    for (const it of items) {
      await addDailyTask(it.person?.trim() || '未分類', it.task?.trim() || '', today, 'Plaud')
    }

    // 3. 寫入歷史頁面（以日期分段，重寫同一天會替換）
    try { await writeHistorySection(today, grouped) } catch (e) { /* 歷史頁面失敗不影響主流程 */ }

    // 4. 整理成 LINE 訊息（依人員分組）並推播
    let lineResult: any = null
    if (sendLine !== false) {
      const msg = `📋 今日工作日誌已完成（${today}）\n請至以下網址查看：\nhttps://project-manager-theta-nine.vercel.app`
      try {
        lineResult = await pushToLine(msg)
      } catch (e: any) {
        lineResult = { error: e.message }
      }
    }

    return NextResponse.json({ ok: true, count: items.length, items, line: lineResult })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
