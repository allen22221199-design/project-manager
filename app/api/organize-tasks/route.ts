import { NextRequest, NextResponse } from 'next/server'
import { runDailyTaskPipeline } from '@/lib/dailyTaskPipeline'

// 這支要跑完 3 段 AI（產日誌 → 抽任務 → 逐項拆步驟）再寫進 Notion，
// 十幾項任務時輕易超過一分鐘。沒有指定就會用平台預設的十幾秒，
// 於是請求被切斷、畫面沒有反應——就是「貼了卻沒新增」的來源。
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { text, sendLine } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: '請貼上 Plaud 內容' }, { status: 400 })

    const result = await runDailyTaskPipeline(text.trim(), { sendLine })

    if (result.assignedCount === 0 && result.pendingCount === 0) {
      return NextResponse.json({ error: '無法從內容整理出工作項目，請確認內容', count: 0 }, { status: 200 })
    }

    return NextResponse.json({
      ok: true,
      logDate: result.logDate,
      replaced: result.replaced,
      dates: result.dates,
      count: result.assignedCount,
      pendingCount: result.pendingCount,
      dailyLogText: result.dailyLogText,
      line: result.line,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
