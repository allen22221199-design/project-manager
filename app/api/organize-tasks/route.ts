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

    // 從內容標題解析日期（支援 YYYY/MM/DD、YYYY-MM-DD、MM/DD、M月D日 等格式）
    let today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    const firstLine = text.trim().split('\n')[0]
    const m1 = firstLine.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
    const m2 = firstLine.match(/(\d{1,2})[\/](\d{1,2})/)
    const m3 = firstLine.match(/(\d{1,2})月(\d{1,2})日/)
    if (m1) {
      today = `${m1[1]}-${m1[2].padStart(2,'0')}-${m1[3].padStart(2,'0')}`
    } else if (m2) {
      const yr = new Date(Date.now() + 8 * 3600 * 1000).getFullYear()
      today = `${yr}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`
    } else if (m3) {
      const yr = new Date(Date.now() + 8 * 3600 * 1000).getFullYear()
      today = `${yr}-${m3[1].padStart(2,'0')}-${m3[2].padStart(2,'0')}`
    }

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
    // 週五 13:30–14:30（台灣時間）跳過，由 Cron 週報提醒統一發送，避免重複
    const twNow = new Date(Date.now() + 8 * 3600 * 1000)
    const isFridayReminderWindow = twNow.getUTCDay() === 5 && twNow.getUTCHours() === 6 &&
      twNow.getUTCMinutes() >= 0 && twNow.getUTCMinutes() <= 59
    // UTC 06:00–06:59 = TW 14:00–14:59，搭配 cron 0 6 * * 5
    let lineResult: any = null
    if (sendLine !== false) {
      if (isFridayReminderWindow) {
        lineResult = { skipped: '週五自動提醒時段，LINE 由 Cron 週報統一發送' }
      } else {
        const msg = `📋 今日工作日誌已完成（${today}）\n請至以下網址查看：\nhttps://project-manager-theta-nine.vercel.app`
        try {
          lineResult = await pushToLine(msg)
        } catch (e: any) {
          lineResult = { error: e.message }
        }
      }
    }

    return NextResponse.json({ ok: true, count: items.length, items, line: lineResult })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
