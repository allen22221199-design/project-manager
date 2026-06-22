import { NextRequest, NextResponse } from 'next/server'
import { addDailyTask } from '@/lib/notion'

// 每天 9:30（台灣時間）由 Vercel Cron 觸發
// 流程：抓最新錄音 → 觸發產生摘要 → 等生成完成 → 解析已分人的工作項目 → 寫入 Notion
//
// 注意：需要 Plaud API 金鑰（PLAUD_CLIENT_ID / PLAUD_SECRET_KEY）才能運作。
// 申請：https://dev.plaud.ai/

export async function GET(req: NextRequest) {
  // 安全檢查：只允許 Vercel Cron 或帶正確密鑰的請求觸發
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientId = process.env.PLAUD_CLIENT_ID
  const secretKey = process.env.PLAUD_SECRET_KEY
  if (!clientId || !secretKey) {
    return NextResponse.json({
      error: '尚未設定 Plaud API 金鑰（PLAUD_CLIENT_ID / PLAUD_SECRET_KEY）',
      todo: '請到 https://dev.plaud.ai/ 申請開發者存取，取得金鑰後加到 Vercel 環境變數',
      ready: false,
    }, { status: 503 })
  }

  try {
    // === 以下為 Plaud API 串接邏輯，待拿到金鑰後依官方文件補完 ===
    // 1. 交換 partner token：POST /auth/partner-token { client_id, secret_key }
    // 2. 交換 user token
    // 3. 列出錄音，取最新一筆
    // 4. 觸發產生摘要（等同按「✦ 產生」），輪詢直到完成
    // 5. 取得已分人的摘要文字
    // 6. 解析成 { person, task }[] 寫入 Notion

    const today = new Date().toISOString().slice(0, 10)

    // 範例：解析後寫入（實際資料來自 Plaud）
    // const items = parsePlaudSummary(summaryText)
    // for (const it of items) {
    //   await addDailyTask(it.person, it.task, today, recordingName)
    // }

    return NextResponse.json({ ok: true, ready: true, note: 'Plaud 串接邏輯待補完', date: today })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
