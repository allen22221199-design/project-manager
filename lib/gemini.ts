import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function analyzeProgressImage(base64: string, mediaType: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
  const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/')
  const result = await model.generateContent([
    {
      inlineData: { data: base64, mimeType: mediaType as any },
    },
    `你是一個專案進度助理。請從這張圖片（可能是LINE對話截圖或工地現場通知）中提取施工進度資訊。

請以 JSON 格式回傳，欄位如下：
{
  "projectHint": "提到的專案名稱或地址（如果有）",
  "date": "提到的日期（格式 YYYY/MM/DD，沒有則填今天 ${today}）",
  "description": "進度描述（簡潔的一句話，包含施工內容、狀態）",
  "contact": "提到的聯絡人或廠商（如果有）",
  "confidence": "high/medium/low"
}

只回傳 JSON，不要其他文字。`,
  ])

  const text = result.response.text().trim()
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return { description: text, confidence: 'low' }
  }
}

export async function analyzeItemImage(base64: string, mediaType: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
  const result = await model.generateContent([
    {
      inlineData: { data: base64, mimeType: mediaType as any },
    },
    `你是一個室內裝修專案助理。請從這張圖片（可能是報價單、施工圖、材料清單或訂購單截圖）中辨識品項資訊。

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
  ])

  const text = result.response.text().trim()
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

// 整理 Plaud 摘要文字 → 每人工作項目（保留原意、不大改）
export async function organizeDailyTasks(rawText: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
  const result = await model.generateContent([
    `你是工作項目整理助理。以下是一段會議或錄音的摘要內容（可能已提到每個人負責的工作）。
請幫我重新整理成「每個人的工作項目」。重點：盡量保留原意、不要大改內容，只是分類整理清楚、讓敘述更精煉。

請以 JSON 陣列回傳，每筆是一個工作項目：
[
  { "person": "負責人姓名", "task": "工作項目描述（簡潔一句）" }
]

規則：
- 同一個人有多項工作，就拆成多筆
- 沒寫明負責人的，person 填「未分類」
- 只回傳 JSON 陣列，不要其他文字

以下是內容：
${rawText}`,
  ])

  const text = result.response.text().trim()
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
