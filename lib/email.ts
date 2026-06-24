// 用 Resend 寄信（REST API，免額外套件）
export async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('尚未設定 RESEND_API_KEY（請到 resend.com 取得並設到 Vercel 環境變數）')
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev'
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`寄信失敗 (${r.status})：${t}`)
  }
  return r.json()
}
