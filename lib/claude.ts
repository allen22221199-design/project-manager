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

// ════════════════════════════════════════════════════════════════
// LINE 客服機器人 — 第二層嚴謹判斷（Claude Haiku）
// 只在第一層（Gemini）無法直接確定回覆時才呼叫
// ════════════════════════════════════════════════════════════════

export type CustomerJudgement = { action: 'reply' | 'escalate'; reply: string | null; reason: string }

const CUSTOMER_JUDGE_SYSTEM = `你是煌盛興業（藝格板、藝格玻璃）LINE客服的第二層嚴謹審核員。第一層AI已經初步分類，但無法確定是否能直接回覆，交給你做最終判斷。

1. 若訊息可以用一般性、不涉及具體金額／規格數字／個案承諾的方式安全回覆（例如：說明大方向、請客戶提供更多資訊、告知會請專人盡快聯繫），可以直接回覆，action 設為 "reply"。
2. 若訊息涉及：具體報價金額、具體規格數字確認、任何形式的客訴或糾紛、需要查詢個案資料才能回答的問題，一律 action 設為 "escalate"，交給真人處理，reply 填 null。
3. 絕對不要編造價格、規格數字、交期或任何無法確認的具體承諾。有疑慮時一律選擇 escalate。
4. 回覆需親切、簡潔、繁體中文，不要條列。

請以下列 JSON 格式回傳（不要其他文字）：
{ "action": "reply 或 escalate", "reply": "回覆內容或 null", "reason": "簡短判斷理由" }`

export async function judgeCustomerMessage(text: string, category: string): Promise<CustomerJudgement> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: CUSTOMER_JUDGE_SYSTEM,
    messages: [{ role: 'user', content: `第一層分類：${category}\n客戶訊息：${text.slice(0, 2000)}` }],
  })
  const raw = (msg.content[0] as any).text?.trim() ?? '{}'
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      action: parsed.action === 'reply' ? 'reply' : 'escalate',
      reply: parsed.reply || null,
      reason: String(parsed.reason ?? ''),
    }
  } catch {
    return { action: 'escalate', reply: null, reason: 'parse_error' }
  }
}

export async function analyzeItemImage(base64: string, mediaType: string) {
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
          text: `你是一個室內裝修專案助理。請從這張圖片（可能是報價單、施工圖、材料清單或訂購單截圖）中辨識品項資訊。

圖片中可能包含消防箱、維修門、蓋板、石材面板等建材或五金品項的規格資訊。

請以 JSON 格式回傳，每個偵測到的品項用一個物件，回傳陣列：
[
  {
    "item": "品項名稱（例：消防箱蓋板、維修門、面盤）",
    "content": "材質或工法說明（例：戴固煥盛烤漆、石紋烤漆、單開門貼板）",
    "spec": "規格尺寸，僅數字加單位（例：92*129、60*80、110x210cm）",
    "qty": "數量，僅數字（例：23、28、2）",
    "unit": "單位（例：組、片、扇、套）",
    "note": "其他備註（如顏色、型號，沒有則空字串）"
  }
]

如果圖片中只有一個品項，也回傳陣列（只有一個元素）。
只回傳 JSON 陣列，不要其他文字。`,
        },
      ],
    }],
  })

  const text = (msg.content[0] as any).text?.trim() ?? '[]'
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}
