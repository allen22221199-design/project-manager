// LINE Messaging API 推播
// 需要環境變數：
//   LINE_CHANNEL_ACCESS_TOKEN — LINE 官方帳號的 channel access token
//   LINE_TARGET_ID — 要推播的群組 ID（或使用者 ID）

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
