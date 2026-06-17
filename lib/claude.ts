import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function analyzeProgressImage(base64: string, mediaType: string) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType as any, data: base64 },
        },
        {
          type: 'text',
          text: `你是一個專案進度助理。請從這張圖片（可能是LINE對話截圖或工地現場通知）中提取施工進度資訊。

請以 JSON 格式回傳，欄位如下：
{
  "projectHint": "提到的專案名稱或地址（如果有）",
  "date": "提到的日期（格式 YYYY/MM/DD，沒有則填今天 ${new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/')}）",
  "description": "進度描述（簡潔的一句話，包含施工內容、狀態）",
  "contact": "提到的聯絡人或廠商（如果有）",
  "confidence": "high/medium/low"
}

只回傳 JSON，不要其他文字。`,
        },
      ],
    }],
  })

  const text = (msg.content[0] as any).text?.trim() ?? '{}'
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return { description: text, confidence: 'low' }
  }
}
