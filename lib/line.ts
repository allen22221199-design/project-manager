// LINE Messaging API 推播 / 回覆 / Webhook 簽章驗證
// 需要環境變數：
//   LINE_CHANNEL_ACCESS_TOKEN — LINE 官方帳號的 channel access token
//   LINE_CHANNEL_SECRET — LINE 官方帳號的 channel secret（驗證 webhook 用）
//   LINE_TARGET_ID — 要推播的群組 ID（或使用者 ID，通常是內部員工群組）

import crypto from 'crypto'

// 驗證 LINE webhook 請求確實來自 LINE（避免偽造請求打進來亂觸發 AI 呼叫）
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET
  if (!secret || !signature) return false
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  return hash === signature
}

// 回覆客戶訊息（用 webhook 事件附的 replyToken，免費、不計入月推播額度）
export async function replyToLine(replyToken: string, message: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return { skipped: true, reason: '尚未設定 LINE_CHANNEL_ACCESS_TOKEN' }
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: message.slice(0, 5000) }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error('LINE 回覆失敗: ' + err)
  }
  return { ok: true }
}

export async function pushToLine(message: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const to = process.env.LINE_TARGET_ID
  if (!token || !to) {
    return { skipped: true, reason: '尚未設定 LINE_CHANNEL_ACCESS_TOKEN / LINE_TARGET_ID' }
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text: message }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error('LINE 推播失敗: ' + err)
  }
  return { ok: true }
}
