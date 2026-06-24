import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// 重試包裝：Gemini 過載(503)或暫時性錯誤時，自動退避重試
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: any
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      lastErr = e
      const msg = String(e?.message ?? e)
      const transient = msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand') || msg.includes('429')
      if (!transient || i === retries - 1) throw e
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw lastErr
}

export async function analyzeProgressImage(base64: string, mediaType: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/')
  const result = await withRetry(() => model.generateContent([
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
  ]))

  const text = result.response.text().trim()
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return { description: text, confidence: 'low' }
  }
}

export async function analyzeItemImage(base64: string, mediaType: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await withRetry(() => model.generateContent([
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
  ]))

  const text = result.response.text().trim()
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

// 從圖片或 PDF 檔案完整抄錄文字（知識庫萃取用）
export async function extractTextFromMedia(base64: string, mimeType: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await withRetry(() => model.generateContent([
    { inlineData: { data: base64, mimeType: mimeType as any } },
    '請把這個檔案／圖片裡的所有文字內容完整、忠實地抄錄出來（包含表格、數字、規格、聯絡資訊）。只輸出內容本身，不要加任何說明或評論。',
  ]))
  return result.response.text().trim()
}

// 讓 Gemini 直接讀 YouTube 影片，整理成文字（知識庫用）
export async function extractTextFromYouTube(url: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await withRetry(() => model.generateContent([
    { fileData: { fileUri: url } } as any,
    '請完整觀看並聆聽這支影片，把內容整理成文字：包含主題重點、提到的產品／規格／數據／價格／廠商／聯絡資訊與步驟流程。盡量詳實完整，只輸出內容本身，不要加開場白或評論。',
  ]))
  return result.response.text().trim()
}

// AI 規劃：兩階段思考（初步規劃 → 結合知識庫＋上網搜尋修正並自我審視）
export async function generateAiPlan(
  info: { task: string; content?: string; direction?: string; goal?: string },
  knowledge: string
) {
  const base = `任務名稱：${info.task}
任務內容：${info.content?.trim() || '（未填）'}
目前進度／方向：${info.direction?.trim() || '（未填）'}
最終目的：${info.goal?.trim() || '（未填）'}`

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  // 第一階段：初步思考「該如何執行」
  const first = await withRetry(() => model.generateContent(
    `你是一位專案執行顧問。請針對以下任務思考「該如何執行」，輸出初步規劃：建議步驟、需要的資源或廠商類型、可能的風險。用繁體中文。\n\n${base}`
  ))
  const firstPlan = first.response.text().trim()

  // 第二階段：結合公司知識庫 + 上網搜尋，修正補強並自我審視
  const prompt2 = `你是一位嚴謹的專案執行顧問。以下是某任務的初步規劃，請依「公司內部資料」與「網路最新資訊」修正、補強，並檢查是否有漏洞或錯誤。

【任務】
${base}

【初步規劃】
${firstPlan}

【公司內部資料（知識庫，可能相關）】
${knowledge || '（無相關內部資料）'}

請用繁體中文輸出最終規劃，條列清楚，包含：
1. 執行步驟（具體、可操作）
2. 需要的資源／建議的廠商或店家（若上網查到具體名稱、地點、聯絡方式或網址請附上）
3. 風險與注意事項
4. 與公司內部資料的呼應（若用到知識庫內容請說明引用了哪一份）
最後加一段「⚠️ 自我審視」：指出這份規劃還有哪些不確定、需要人工再確認的地方。`

  let finalPlan = ''
  try {
    const searchModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] as any })
    const second = await withRetry(() => searchModel.generateContent(prompt2))
    finalPlan = second.response.text().trim()
  } catch {
    // 搜尋工具不可用時，退回不含網搜的修正
    const second = await withRetry(() => model.generateContent(prompt2 + '\n\n（注意：目前無法上網搜尋，請依現有資訊盡量完整）'))
    finalPlan = second.response.text().trim()
  }
  return finalPlan
}

// 只整理以下這幾位人員的工作項目
const ALLOWED_PEOPLE = ['呂理論', '徐碧惠', '黃湘婷', '廖淑慧', '吳哲緯', '王治先', '黃文彬', '艾里', '阿蔡']

// 整理 Plaud 摘要文字 → 每人工作項目（保留原意、不大改）
export async function organizeDailyTasks(rawText: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await withRetry(() => model.generateContent([
    `你是工作項目整理助理。以下是一段會議或錄音的摘要內容（可能已提到每個人負責的工作）。
請幫我重新整理成「每個人的工作項目」。重點：盡量保留原意、不要大改內容，只是分類整理清楚、讓敘述更精煉。

⚠️ 重要：只輸出以下這幾位人員的工作項目，其他人名或沒提到的人一律不要輸出：
${ALLOWED_PEOPLE.join('、')}

請以 JSON 陣列回傳，每筆是一個工作項目：
[
  { "person": "負責人姓名", "task": "工作項目描述（簡潔一句）" }
]

規則：
- person 必須是上面名單中的其中一位，不在名單內的人完全不要列出
- 同一個人有多項工作，就拆成多筆
- 只回傳 JSON 陣列，不要其他文字

以下是內容：
${rawText}`,
  ]))

  const text = result.response.text().trim()
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    if (!Array.isArray(parsed)) return []
    // 保險：只保留名單內人員
    return parsed.filter((it: any) => ALLOWED_PEOPLE.includes((it.person ?? '').trim()))
  } catch {
    return []
  }
}
