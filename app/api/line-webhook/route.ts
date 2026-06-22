import { NextRequest, NextResponse } from 'next/server'

// LINE Webhook：機器人收到訊息時，回報「這個群組/聊天室的 ID」
// 用途：把機器人加進群組後，在群組打任一則訊息，機器人會回覆群組 ID，
//       你把那個 ID 設成 Vercel 的 LINE_TARGET_ID 即可。

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const events = body.events ?? []
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
    for (const ev of events) {
      const src = ev.source ?? {}
      const id = src.groupId || src.roomId || src.userId || '(無法取得)'
      const label = src.groupId ? '群組' : src.roomId ? '聊天室' : '個人'
      if (ev.replyToken && token) {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            replyToken: ev.replyToken,
            messages: [{
              type: 'text',
              text: `✅ 此${label}的 ID：\n${id}\n\n請把這個 ID 填到 Vercel 的 LINE_TARGET_ID 環境變數。`,
            }],
          }),
        })
      }
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, note: 'LINE webhook endpoint 正常運作' })
}
