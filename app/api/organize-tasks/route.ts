import { NextRequest, NextResponse } from 'next/server'
import { runDailyTaskPipeline } from '@/lib/dailyTaskPipeline'

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
      count: result.assignedCount,
      pendingCount: result.pendingCount,
      dailyLogText: result.dailyLogText,
      line: result.line,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
