import { NextRequest, NextResponse } from 'next/server'
import { verifyLineSignature, replyToLine, pushToLine } from '@/lib/line'
import { classifyCustomerMessage } from '@/lib/gemini'
import { judgeCustomerMessage } from '@/lib/claude'

// LINE OA 客服訊息路由：
// Gemini Flash-Lite 第一層分類 → 問候/簡單FAQ 直接回覆；
// 其餘（報價/規格/客訴/不確定）交給 Claude Haiku 第二層嚴謹判斷 → 回覆或通知真人。
async function handleTextEvent(text: string, replyToken: string, userId: string) {
  const classification = await classifyCustomerMessage(text)

  if ((classification.category === 'greeting' || classification.category === 'faq') && classification.confident && classification.reply) {
    await replyToLine(replyToken, classification.reply)
    return
  }

  const judgement = await judgeCustomerMessage(text, classification.category)
  if (judgement.action === 'reply' && judgement.reply) {
    await replyToLine(replyToken, judgement.reply)
    return
  }

  await pushToLine(
    `📩 客戶訊息需要真人處理\n分類：${classification.category}\n使用者ID：${userId}\n內容：${text}\n判斷理由：${judgement.reason || '(無)'}`
  )
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifyLineSignature(rawBody, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const events = Array.isArray(body?.events) ? body.events : []

  // LINE 要求 webhook 盡快回 200，處理失敗也不應讓 LINE 重送；逐一事件各自 try/catch
  await Promise.all(
    events.map(async (event: any) => {
      try {
        if (event.type !== 'message' || event.message?.type !== 'text') return
        await handleTextEvent(event.message.text, event.replyToken, event.source?.userId ?? '未知使用者')
      } catch (err) {
        console.error('line-webhook event error', err)
      }
    })
  )

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
