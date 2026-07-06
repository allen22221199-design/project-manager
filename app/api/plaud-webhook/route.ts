import { NextRequest, NextResponse } from 'next/server'
import { runDailyTaskPipeline } from '@/lib/dailyTaskPipeline'

// 給 Zapier「Webhooks by Zapier → POST」動作打的端點。
// Zap 設定：Plaud「Transcript & Summary Ready」→（可選）Filter 平日 → Webhooks POST 到這支 API
//
// 選用保護：若設定 PLAUD_WEBHOOK_SECRET 環境變數，要求帶入相同的
// x-webhook-secret header 或 ?secret= 參數，避免網址外流被任意呼叫。
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }

  const secret = process.env.PLAUD_WEBHOOK_SECRET
  if (secret) {
    const got = req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret')
    if (got !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    // ⚠️ 欄位名稱請依 Zapier 測試觸發時實際看到的欄位調整
    const rawTranscript: string | undefined = body?.transcript ?? body?.transcript_text ?? body?.raw_text

    if (!rawTranscript || rawTranscript.trim().length === 0) {
      return NextResponse.json({ error: '收不到逐字稿內容，請檢查 Zapier 送過來的欄位名稱是否對應' }, { status: 400 })
    }

    const result = await runDailyTaskPipeline(rawTranscript, { sendLine: true })

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
