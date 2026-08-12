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

// 直接分析「上傳的影片檔」，整理成文字（不必先傳到 YouTube）
export async function extractTextFromVideo(base64: string, mimeType: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await withRetry(() => model.generateContent([
    { inlineData: { data: base64, mimeType: mimeType as any } },
    '請完整觀看並聆聽這支影片，把內容整理成可供查詢的文字筆記：包含主題重點、操作步驟的先後順序、畫面中出現的文字／規格／數據／工具名稱，以及口頭說明的重點與注意事項。盡量詳實完整，只輸出內容本身，不要加開場白或評論。',
  ]))
  return result.response.text().trim()
}

// 聊天室語音輸入：把師傅講的話「逐字」轉成文字（不摘要、不改寫，讓他自己確認後送出）
// terms＝公司實際用語（案場名稱、人名…）。中文語音辨識最大的問題是同音錯字
// （「頤昌」聽成「宜昌」、「峰碩」聽成「豐碩」），把真實詞彙給它才能把音對回正確寫法。
export async function transcribeSpeech(base64: string, mimeType: string, terms: string[] = []) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  // 第一段：純逐字聽寫。刻意「不」給詞彙表——實測給了之後模型會把清單裡的案名硬塞進去（幻覺），
  // 內容整個跑掉。修正同音字留到第二段用純文字處理，那樣不可能無中生有。
  const result = await withRetry(() => model.generateContent([
    { inlineData: { data: base64, mimeType: mimeType as any } },
    `請把這段錄音「逐字」轉成文字。這是台灣工廠／工地的師傅在回報工作進度或提問。
規則：
1. 忠實照講的內容轉寫，不要摘要、不要改寫、不要加任何解釋或標題。
2. 講話者可能是台灣人（國語常夾雜台語）或印尼籍移工（印尼語），用他講的語言轉寫。
3. 數字用阿拉伯數字（例如「四組」寫成 4 組）。
4. 適度加標點讓句子好讀，但不要改變字句。
5. 只輸出轉寫的文字本身，不要有開場白、引號或任何多餘內容。
6. 聽不清楚的地方就照聽到的音寫，或直接略過，絕對不要自己補內容。`,
  ]))
  const raw = result.response.text().trim()
  if (!raw) return raw
  return await fixHomophones(raw, terms)
}

// 第二段：只改「用字」不改內容的同音字校正（純文字進、純文字出，不碰音檔所以不會生出新內容）
export async function fixHomophones(text: string, terms: string[]): Promise<string> {
  const vocab = Array.from(new Set(terms.filter(Boolean).map(t => t.trim()))).slice(0, 250)
  if (vocab.length === 0 || text.length < 2) return text
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `你是中文語音辨識的「錯字校正器」。輸入是一段語音轉出的逐字稿，可能有同音字錯誤
（例如「頤昌」被寫成「宜昌」、「峰碩」被寫成「豐碩」、「丈量」被寫成「丈量」以外的同音詞）。

【公司實際用語】
${vocab.map(t => '・' + t).join('\n')}

嚴格規則：
1. 只有當逐字稿裡某個詞「發音與上表某個詞相同或極接近」時，才把它改成上表的寫法。
2. 絕對不可以新增、刪除或改寫任何內容。不可以把口語改成正式說法。
3. 上表的案場名稱常有「-」與公司前綴（例如「全坤-御大安」），但師傅口語只會講「御大安」；
   這種情況「保持他原本講的簡稱」，只修正用字是否正確，不要補成完整名稱。
4. 如果沒有任何字需要改，就原封不動輸出。
5. 只輸出校正後的文字本身，不要任何說明。`,
    })
    const res = await model.generateContent(text)
    const fixed = res.response.text().trim()
    // 安全閥：長度變化太大代表模型亂改（增刪內容），寧可用原本的逐字稿
    if (!fixed) return text
    const ratio = fixed.length / text.length
    if (ratio < 0.6 || ratio > 1.6) return text
    return fixed
  } catch {
    return text   // 校正失敗就用原文，不影響使用
  }
}

// 直接聽「上傳的錄音檔」，整理成文字（會議錄音、口述 SOP 用）
export async function extractTextFromAudio(base64: string, mimeType: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await withRetry(() => model.generateContent([
    { inlineData: { data: base64, mimeType: mimeType as any } },
    '請完整聆聽這段錄音，把內容整理成可供查詢的文字：包含主題重點、提到的產品／規格／數據／人名／廠商、決議事項與待辦，以及步驟流程。盡量詳實完整，只輸出內容本身，不要加開場白或評論。',
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
使用者希望你做的事：${info.goal?.trim() || '（未填，請依任務內容自行判斷最有幫助的協助）'}`

  // 單次呼叫內完成「初步構思 → 對照內部資料/上網搜尋 → 自我審視」三步，
  // 只輸出最終結果。合併成一次以避免逾時。
  const prompt = `你是一位嚴謹的專案執行顧問。請依下列步驟為這個任務做規劃（內部完成，不要顯示草稿）：
第一步：先構思初步執行方向。
第二步：對照下方「公司內部資料」，並用 Google 搜尋查最新資訊（廠商、店家、價格、做法），修正並補強。
第三步：自我審視是否有漏洞或錯誤。

【任務】
${base}

【公司內部資料（知識庫，可能相關）】
${knowledge || '（無相關內部資料）'}

只輸出第三步後的最終規劃，用繁體中文、條列清楚，包含：
1. 執行步驟（具體、可操作）
2. 需要的資源／建議的廠商或店家（若查到具體名稱、地點、聯絡方式或網址請附上）
3. 風險與注意事項
4. 與公司內部資料的呼應（若用到知識庫內容請說明引用了哪一份）
最後加一段「⚠️ 自我審視」：指出還有哪些不確定、需要人工再確認的地方。`

  // 先試含 Google 搜尋；不可用或失敗時退回不含搜尋。皆只試一次以控制時間。
  try {
    const searchModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] as any })
    const res = await searchModel.generateContent(prompt)
    return res.response.text().trim()
  } catch {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const res = await model.generateContent(prompt + '\n\n（注意：目前無法上網搜尋，請依現有資訊盡量完整）')
    return res.response.text().trim()
  }
}

// 聊天室意圖判斷：分辨這句是「要查詢/問問題」還是「要新增專案進度回報」，
// 若是進度回報，順便把對應的專案、日期、進度內容抽出來。
// 保守原則：不確定時一律當成 question（因為寫入進度前還會再讓使用者確認）。
export type ProgressItem = {
  project: string | null   // 對應到的專案名稱（盡量對應 projectNames 其中一個；無法確定填 null）
  date: string | null      // YYYY/MM/DD；沒提到就 null（之後預設今天）
  description: string       // 乾淨的一句話進度描述
}
// 隨手記的「待辦任務」：老闆隨口交辦，可能沒講是誰做、也可能一次只講一件
export type TaskItem = {
  task: string             // 乾淨、可執行的一句話
  owner: string | null     // 話裡「明確講到」的人名（名單內），沒講就 null——不可用猜的
  self: boolean            // 使用者說「我自己」「我來」，代表這是他本人的待辦
  due: string | null       // YYYY/MM/DD；沒講期限就 null
  suggested: string | null // 沒指定人時，依專長建議的人選（沒把握就 null）
  why: string              // 建議理由，一句話
}
export type ChatIntent = {
  intent: 'progress' | 'task' | 'question'
  items: ProgressItem[]    // 一次可能講很多筆進度（不同專案），逐筆拆開分類
  tasks: TaskItem[]        // 一次可能交辦很多件事，逐件拆開
}

export async function routeChatIntent(
  message: string,
  projectNames: string[],
  todayISO: string,
  people: { name: string; skill: string }[] = [],
): Promise<ChatIntent> {
  const roster = people.length
    ? people.map(p => `・${p.name}：${p.skill || '（未註記專長）'}`).join('\n')
    : '（沒有可指派的人員名單）'
  const sys = `你是一個工地/工廠專案系統的聊天室助理的「意圖分類器」。判斷使用者這句話是：
- "progress"：使用者在「回報／記錄某個專案的工作進度或狀態」（例如「冠德的箱蓋今天噴好了」「國壽三樓施工完成」「桃大的料到了」）。通常是在陳述一件已經發生或完成的現場事實。
- "task"：使用者在「交辦、或隨手記下一件還沒做的事」（例如「叫治先把冠德的圖面畫完」「記一下要跟廠商確認報價」「湘婷這週把影片排一排」「我自己要去看陶大現場」）。重點是這件事「還沒發生、之後要做」。
- "question"：使用者在「問問題、找SOP、問怎麼做、排除困難、閒聊」或任何不屬於上面兩類的情況。

【progress 與 task 最關鍵的差別】
・已經做完／已經發生 → progress（「噴好了」「到料了」「施工完成」）
・還沒做、要人去做、提醒自己 → task（「要去…」「記得…」「叫某某…」「下週前要…」）
　同一句話同時有兩者時，以「使用者的主要目的」判斷；真的分不出來就選 question。

【可指派的人員與專長】
${roster}

【目前進行中的專案清單】
${projectNames.length ? projectNames.map(n => '・' + n).join('\n') : '（目前沒有專案）'}

規則：
1. 只有當這句話明顯是在「陳述某專案的進度/完成/狀態」時才判定 progress；只要有疑問語氣、在問怎麼做、或看起來像查資料，一律判 question。
2. 【重要】使用者常常一次講很多筆進度（一行一筆、用逗號／頓號／分號隔開、或用 1. 2. 3. 條列）。
   請把每一筆「各自獨立」拆成一個 item，不要合併成一句，也不要只取第一筆。
   不同專案要分到不同 item；同一個專案有多件事，若是同一天同一件事的延伸就合併成一筆，否則也拆開。
3. 每個 item 的 project：只有在「能唯一確定」時才填，否則一律填 null。
   ・簡稱只要能唯一對應就填，例如「峰碩」→「全坤-峰碩」。
   ・【最重要】若使用者講的字詞同時符合清單中「多個」專案（例如只講「惠宇」，但清單有 5 個惠宇的案子），
     一律填 null，絕對不要自己挑一個。記錯案場的後果比多問一次嚴重得多。
   ・不要用「工序或品項名稱」去猜案場。像「箱蓋、門片、打樣、丈量、噴印」是進度內容，
     即使某個案名剛好含有這些字，也不能因此對應過去。
   ・完全沒提到任何案場線索時，填 null。
4. date：該筆有明確講日期才填（格式 YYYY/MM/DD），沒有就填 null。若整句開頭講了日期（例如「今天」「8/3」）而後面各筆沒再提，則各筆共用那個日期。
5. description：把該筆進度整理成乾淨、具體的一句話（去掉「幫我記一下」這類指令詞），保留數量、規格、工序等細節。
6. 只輸出 JSON，不要多餘文字。

【intent = task 時，tasks 的填寫規則】
7. 使用者常常一次交辦很多件事，也常常「一次只講一件、分好幾則訊息」。有幾件就拆成幾筆，不要合併。
8. owner：只有話裡「明確講到某個人」時才填，而且必須是上面名單裡的人（短名也算，例如「治先」→「王治先」、「湘婷」→「黃湘婷」）。
   ・沒講到人 → 一律填 null。【絕對不可以用猜的填進 owner】，派錯人比多問一次嚴重得多。
8-1. 一句話同時交辦給多個人（例如「阿蔡跟艾里去大掃除」「治先和文彬一起去現場」），
   要拆成多筆、每人各一筆，任務內容一樣，owner 各自填該人。不可以只挑其中一個人。
9. self：使用者用第一人稱說這件事是自己要做的（「我自己」「我來」「我要去」「提醒我」）→ true，否則 false。
   self 為 true 時 owner 一律填 null。
10. suggested：只有在「owner 是 null 且 self 是 false」時才填。依照上面的專長清單，挑出最適合做這件事的「一位」，並在 why 用一句話說明為什麼（點出對應到的專長）。
   ・判斷不出來、或這件事不明顯屬於任何人的專長 → suggested 填 null、why 填空字串。這種情況很正常，不要硬挑。
   ・這只是「建議」，系統會再讓使用者確認才真的派下去。
11. due：話裡有明確講期限才填（YYYY/MM/DD）。「今天」「明天」「這週五」要換算成實際日期；沒講就填 null。
12. task：整理成乾淨、具體、可執行的一句話。去掉「幫我記一下」「叫」「你去」這類指令詞與人名，但要保留案場、數量、規格等細節。

回傳格式：
{ "intent": "progress" | "task" | "question",
  "items": [ { "project": "專案名稱或 null", "date": "YYYY/MM/DD 或 null", "description": "進度描述" } ],
  "tasks": [ { "task": "任務內容", "owner": "人名或 null", "self": true/false, "due": "YYYY/MM/DD 或 null", "suggested": "人名或 null", "why": "建議理由" } ] }
（用不到的陣列一律回傳空陣列 []）`

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: sys,
      generationConfig: { responseMimeType: 'application/json' },
    })
    const res = await model.generateContent(`今天是 ${todayISO}。\n使用者說：「${message}」`)
    const parsed = JSON.parse(res.response.text().replace(/```json|```/g, '').trim())
    // 舊格式（單筆 project/description）也接受，避免模型偶爾回舊結構
    const raw: any[] = Array.isArray(parsed.items) && parsed.items.length
      ? parsed.items
      : (parsed.description ? [{ project: parsed.project, date: parsed.date, description: parsed.description }] : [])
    const items: ProgressItem[] = raw
      .map(it => ({
        project: it?.project || null,
        date: it?.date || null,
        description: String(it?.description ?? '').trim(),
      }))
      .filter(it => it.description)
    const names = people.map(p => p.name)
    // 模型偶爾會回名單外的人（自創、或把客戶名當成員工）；對不上就丟掉，寧可留白讓使用者選
    const pickName = (v: any): string | null => {
      const n = String(v ?? '').trim()
      if (!n) return null
      if (names.includes(n)) return n
      if (n.length < 2) return null   // 單字比對太容易誤中（「里」會對到「艾里」），寧可留白讓使用者選
      const hit = names.find(x => x.includes(n) || n.includes(x))
      return hit ?? null
    }
    const tasks: TaskItem[] = (Array.isArray(parsed.tasks) ? parsed.tasks : [])
      .map((t: any) => {
        const self = t?.self === true
        return {
          task: String(t?.task ?? '').trim(),
          owner: self ? null : pickName(t?.owner),
          self,
          due: t?.due || null,
          suggested: pickName(t?.suggested),
          why: String(t?.why ?? '').trim(),
        }
      })
      .filter((t: TaskItem) => t.task)
    if (parsed.intent === 'task' && tasks.length > 0) return { intent: 'task', items: [], tasks }
    return {
      intent: parsed.intent === 'progress' && items.length > 0 ? 'progress' : 'question',
      items: parsed.intent === 'progress' ? items : [],
      tasks: [],
    }
  } catch {
    // 分類失敗就當一般問題處理，維持原本聊天流程
    return { intent: 'question', items: [], tasks: [] }
  }
}

// 問答後產生「後續追問」按鈕：根據這次一問一答，猜使用者接下來最可能想問的 3 個問題
export async function suggestFollowups(question: string, answer: string): Promise<string[]> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    })
    const noContent = /查不到|找不到|無法確定|沒有.*資料/.test(answer)
    const prompt = `你是「延伸提問」產生器。使用者剛問了公司 SOP／內部資料的問題並得到答案，請想 3 個他最可能想「深入追問」的問題。

【最重要】每一題都必須「扣著答案裡實際出現的具體內容」——某個名詞、步驟、數字、參數、材料、機台、注意事項——讓人一看就知道是延伸這個主題、而且答案裡有東西可以繼續問。

【嚴禁】以下這種空泛、跟內容無關的問題一律不要（這是最常見的錯誤）：
「這是最新版嗎」「相關同仁是誰」「要問誰／找誰」「哪裡可以查到」「怎麼進資料庫」「要聯絡哪個原廠」「還有哪些SOP」這類與實際內容無關的萬用問句。

範例（假設答案在講丈量）：
✅ 好：「內開門為什麼要用1mm鋁板測試？」「門框內縮1mm是為了什麼？」「現場丈量要帶哪些工具？」
❌ 壞：「這是最新版嗎？」「丈量要問誰？」「還能在哪裡查？」

規則：
1. 緊扣答案內容裡的具體字詞來延伸，不可空泛。
2. ${noContent ? '答案顯示「查不到資料」→ 改成 3 個「換個說法、可能問得到」的同領域具體問法（用相關的具體名詞重問），不要問「要找誰／哪裡查」。' : '不要重複原本的問題。'}
3. 繁體中文、口語、每個 8～22 字、具體可直接點。
4. 只輸出 JSON 陣列 ["...","...","..."]，不要多餘文字。

【使用者的問題】${question}
【得到的答案】${answer.slice(0, 1800)}`
    const res = await model.generateContent(prompt)
    const arr = JSON.parse(res.response.text().replace(/```json|```/g, '').trim())
    // 後備過濾：即使 AI 沒遵守，也把明顯空泛的萬用問句擋掉
    const banned = /最新版|相關同仁|要問誰|找誰|哪裡.*查|哪裡.*找|怎麼.*進.*資料|聯絡.*原廠|還有.*哪些.*SOP/
    return Array.isArray(arr)
      ? arr.filter((s: any) => typeof s === 'string' && s.trim() && !banned.test(s)).map((s: string) => s.trim()).slice(0, 3)
      : []
  } catch {
    return []
  }
}

// 文字向量嵌入（語意搜尋用）；一次批次嵌入多筆
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  // Gemini batchEmbedContents 單次上限 100 筆 → 切成多批、並行送出後依序合併，
  // 避免文件量大時整批失敗、退回粗略的關鍵字比對（知識庫已達數百筆）。
  const BATCH = 100
  const groups: string[][] = []
  for (let i = 0; i < texts.length; i += BATCH) groups.push(texts.slice(i, i + BATCH))
  const perGroup = await Promise.all(groups.map(group => withRetry(async () => {
    const res: any = await model.batchEmbedContents({
      requests: group.map(t => ({ content: { role: 'user', parts: [{ text: (t || ' ').slice(0, 8000) }] } })),
    })
    const vecs = (res.embeddings || []).map((e: any) => e.values as number[])
    if (vecs.length !== group.length) throw new Error('embedding 數量不符')
    return vecs
  })))
  const out = perGroup.flat()
  if (out.length !== texts.length) throw new Error('embedding 數量不符')
  return out
}

// AI 助理即時對話：優先用公司知識庫；查不到內部事實就說不知道；網路資料要標註
export type ChatMedia = { source: string; caption: string; kind: 'image' | 'video' | 'embed' }

export async function chatWithAssistant(
  messages: { role: string; content: string }[],
  knowledge: string,
  media: ChatMedia[] = [],
) {
  // 有素材時，讓 AI 自己決定每張圖／每支影片要插在哪一個步驟旁邊，
  // 而不是全部堆在最後——師傅看步驟時圖就在旁邊，才有輔助效果。
  const mediaBlock = media.length === 0 ? '' : `

【可插入的圖片／影片】
${media.map((m, i) => `${i + 1}. [${m.kind === 'image' ? '圖片' : '影片'}] ${m.caption || m.source}（出自：${m.source}）`).join('\n')}

插入規則（很重要）：
・在「這張圖／這支影片能幫助理解」的那一個步驟或段落的**下一行**，單獨寫一行標記：[[MEDIA:編號]]
・一個編號最多用一次，不要重複插入；不相關的就不要插。
・標記要自己獨佔一行，前後不要加其他文字、不要放在句子中間、不要放在條列符號後面。
・不確定該放哪裡的，就不要插，系統會自動附在最後面。
・不要在回答裡描述「如附圖」「見下圖」這類文字，插入標記即可。`

  const sys = `你是煌盛興業的內部 AI 助理，協助同仁處理：客戶通話的話術建議、公司機具的參數／保養查詢、製作 SOP 等工作。

務必遵守以下規則：
1. 優先使用下方「公司內部資料（知識庫）」回答。查得到就準確、具體地回答（出處統一放在最後，見第 3 點）。
2. 【最重要—通盤彙整】下方常會提供「多份相關的 SOP／資料」。你必須把「全部」相關的都讀完、交叉思考後，「彙整成一個完整、有條理的答案」，不可以只看其中一份就回答：
   - 把不同資料裡「互補、接續、同主題」的內容整合在一起，形成完整流程／清單。
   - 若不同資料有「重疊」，合併去重；若「講法不一致或有新舊版本」（例如檔名帶日期、較新的），要一併指出差異並提醒以哪份為準。
   - 最後可用一句話總結重點或提醒。
3. 【出處統一放最後，不要夾在內文裡】內文只寫答案本身，不要在每一句或每個項目後面加「（出自…）」，
   那會讓現場師傅用手機看的時候很難讀。請在整個回答的最後，另起一段固定寫成：

   ──
   📎 資料來源：〈丈量SOP〉、〈20211015丈量SOP〉

   規則：只列資料名稱，不要寫「第幾段」；同一份只列一次；沒有用到知識庫就整段省略不寫。
   例外：當「不同資料講法不一致」而你要提醒以哪份為準時，該處可以直接寫出資料名稱以利辨識。
4. 若問題屬於「公司機具參數、保養數據、內部規範、報價、廠商」等公司內部事實，而知識庫中找不到，請直接回答：「這部分我在公司知識庫找不到資料，無法確定，請向相關同仁或原廠查證。」——絕對不要自行編造、猜測或填入不確定的數字。
5. 若是一般性知識，你可用 Google 搜尋補充，但提供後必須另起一段明確標註：「（以上內容為網路查詢資料，僅供參考）」。
6. 話術建議、SOP 這類可以發揮，但若牽涉到具體的公司數據／規格，仍以知識庫為準。
7. 一律用繁體中文，條列清楚、口語好讀。

【公司內部資料（知識庫，可能相關；下方可能是多份不同 SOP，請通盤整合）】
${knowledge || '（這次沒有找到相關的公司內部資料）'}${mediaBlock}`

  const contents = messages.slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: sys, tools: [{ googleSearch: {} }] as any })
    const res = await model.generateContent({ contents })
    return cleanAnswer(answerParts(res))
  } catch {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: sys })
    const res = await model.generateContent({ contents })
    return cleanAnswer(answerParts(res))
  }
}

// 只取「真正要給使用者看的文字」。開了 Google 搜尋工具時，回應裡可能夾雜
// 模型的思考片段(thought)與工具呼叫程式碼，直接用 response.text() 會把它們一起印出來。
function answerParts(res: any): string {
  const parts = res?.response?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) {
    try { return res.response.text() } catch { return '' }
  }
  return parts
    .filter((p: any) => typeof p?.text === 'string' && p.thought !== true && !p.executableCode && !p.codeExecutionResult)
    .map((p: any) => p.text)
    .join('')
}

// 第二層防護：萬一模型仍把 tool_code / thought 當成純文字寫出來，把那些段落清掉，
// 不要讓現場師傅看到「print(google_search.search(...))」這種東西。
export function cleanAnswer(raw: string): string {
  let s = raw ?? ''
  s = s.replace(/```(?:tool_code|python|thought)[\s\S]*?```/gi, '')          // 圍欄式程式區塊
  s = s.replace(/^\s*(?:tool_code|thought|tool_outputs?)\s*:?\s*$/gim, '')    // 單獨一行的標記
  s = s.replace(/^\s*print\(\s*(?:default_api\.)?[a-z_]*search[\s\S]*?\)\s*$/gim, '')  // 工具呼叫
  s = s.replace(/^\s*(?:default_api|google_search)\.[a-z_]+\([\s\S]*?\)\s*$/gim, '')
  // 開頭若殘留一整段英文推理（The user is asking… / I need to…），在第一個中文段落前的英文段落刪掉
  const zh = s.search(/[一-鿿]/)
  if (zh > 0) {
    const head = s.slice(0, zh)
    if (/\b(the user|I need to|Therefore,|I should|the phrase)\b/i.test(head)) s = s.slice(zh)
  }
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

// ════════════════════════════════════════════════════════════════
// 晨會任務分配自動化（三階段）
// Stage 0：原始逐字稿 → 五段式管理日誌（人名/術語修正、負責人判斷規則）
// Stage 1：五段式日誌 → 結構化任務（已分配 / 待確認），嚴禁捏造
// Stage 2：對每個已分配任務做 OKR 式拆解 → 可勾選子步驟
// ════════════════════════════════════════════════════════════════

const STAGE0_SYSTEM_PROMPT = `你是王子彩色製版與煌盛興業的總經理特助兼廠務顧問。

---

## 第一步：逐字稿修正（內部執行，不輸出修正版逐字稿）

### 1-1 錯字修正 — 依「語音相似度」比對，不是「字形相似度」

PLAUD 為語音辨識轉錄，錯誤多來自「同音/近音異字」，請優先用發音去比對下列詞彙，而非單純比對字形：

| 正確詞 | 常見錯誤辨識（同音/近音） |
|---|---|
| 藝格板 | 議格板、藝格版、一格板 |
| 藝格玻璃 | 議格玻璃、藝格玻璃（璃/離） |
| 壓紋 | 壓文、押紋 |
| 對色 | 對社、對射 |
| 打樣 | 打養、大樣 |
| 良率 | 兩率、良律 |
| 廊道 | 郎道、狼道 |
| 梯廳 | 提廳、梯庭 |
| 母扇 / 子扇 | 母善/子善、母扇（扇/善） |
| 上框/左框/右框 | 上匡、左筐、右筐 |
| 陶大27期 | 桃大27期、陶帶27期 |
| A棟 | A動、A東 |
| 5S | 5哂、5筍 |
| 交期 | 交起、交器 |
| 報廢 | 報費、爆廢 |
| 工單 | 工丹、供單 |
| VOC | V.O.C、伏歐西（音譯錯誤） |
| SGS | S.G.S、傻雞屎（極端音誤，若出現需標註） |
| 桃大 | 陶大 |

**修正原則**：
- 若辨識詞彙在句子語境中明顯不合理（例如出現在製程/工程語境中卻是無意義詞），優先比對上表音近詞彙進行還原。
- 無法用上表比對，但明顯是專有名詞被誤植的詞彙，標註【待確認-詞彙:原文】，保留原文供人工核對。
- 不更改數字，不刪減任何業務決策或任務指派內容，不補充逐字稿中沒有的內容。

### 1-2 人員判斷 — 明確優先序規則

**人員對照表**：
- 阿蔡、艾里：印尼籍現場作業員（需雙語任務卡）
- 淑慧：內勤行政/客戶聯繫
- 文彬：外勤/工地負責人/工廠負責人
- 治先：噴印/對色/工廠負責人
- 湘婷：印刷/出版/印刷相關工作
- 其他人名依前後文歸類，無法判斷標註【待確認-人員】

**任務負責人判斷優先序（依序判斷，符合即停止）**：

1. **直接稱呼 + 指令句型**：若句型為「[人名]，你去/你負責/你來做…」，負責人 = 該人名。
2. **轉達型指令**：若句型為「跟/請/叫 [人名A] 去跟 [人名B] 說…」，需區分「傳話者」與「實際執行者」——**實際執行動作的人才是負責人**，不是被提及的第一個人名。範例：「你跟阿蔡說一下，叫他去對色」→ 負責人是阿蔡（對色的執行者），不是說話對象。
3. **代名詞指代**：若出現「他/她/那個/這件事」等代詞，需回溯**最近一次明確提及的人名**作為代詞對象；若前文超過 3 句未提及任何人名，或有兩個以上人名皆可能是代詞對象，則不猜測，標註【待確認-負責人:代詞出現於「引用該句原文」】。
4. **一句多人名**：若同一句子出現兩個以上人名，且無法用規則 1、2 判斷誰是動作執行者，標註【待確認-負責人:句中出現多人名「引用原文」】，並列出所有候選人名供人工選擇。
5. **完全無法判斷**：標註【待確認-負責人】，任務內容仍需完整記錄，不可因為無法判斷負責人而省略任務本身。

**鐵則**：寧可標註待確認，不可用猜測填入負責人欄位。錯誤指派的成本高於待確認的成本。

---

## 第二步：輸出混合制管理日誌

完全依照以下五個區塊格式輸出，確保資訊不漏接。凡任務負責人為【待確認】者，該任務仍需完整輸出，並在備註欄註明「待確認原因」。不可以自行想像、推測或補充逐字稿中沒有明確提到的任務或數字。

### 【第一部分】個人待辦 — Notion 複製區

依照每個不同的人員為單位劃分，每人一個獨立區塊（含【待確認-負責人】作為一個獨立區塊，集中列出所有無法判斷歸屬的任務）。

👤 [人名]

| 欄位 | 內容 |
|---|---|
| 任務名稱 | (填入) |
| 截止日期 | (YYYY/MM/DD，逐字稿沒明確提到就留空，不可自行推算) |
| 備註 | (填入補充說明；若負責人為待確認，註明判斷困難原因) |

### 【第二部分】5W2H 決策追蹤

只收錄逐字稿中屬於「決策/需要跨人員協調」性質的事項，用表格輸出：

| 項目 (What) | 負責人 (Who) | 時間 (When) | 地點 (Where) | 為何 (Why) | 如何 (How) | 進度追蹤 (How much/How well) |
|---|---|---|---|---|---|---|

### 【第三部分】雙語現場任務卡 (Bilingual Task Card)

只針對阿蔡、艾里（印尼籍現場作業員）今天的任務製作，中英文對照：

**任務 (Task):**
- 中文: (填入)
- English: (填入對應英文翻譯)

**負責人 (PIC):** (填入)

**截止時間 (Deadline):** (中文日期) / (English date)

**注意事項 (Notes):**
- 中文: (條列)
- English: (條列對應英文)

### 【第四部分】辦公室 / 外勤任務清單

依「今日重點」與「明日規劃」分開列出，今日重點內再依「外勤/現場勘查」與「廠務/行政」分類，每項前面標註 [負責人姓名]：

**今日重點 (YYYY-MM-DD)**

外勤 / 現場勘查:
1. **[人名]** (任務內容，含時間、地點)

廠務 / 行政:
1. **[人名]** (任務內容)

**明日規劃 (YYYY-MM-DD)**
- **[人名]** (任務內容)

### 【第五部分】5S / 品質警示

只收錄逐字稿中提到的品質風險、溝通斷層、5S 相關事項：

| 類別 | 事項 | 負責人 | 狀態/措施 |
|---|---|---|---|

---

輸出時請完整依上述五個部分順序輸出，各部分之間用「---」分隔，不需要額外的開場白或結語。`

function buildStage0UserPrompt(rawTranscript: string, todayDate: string): string {
  return `日誌生成日期：${todayDate}

以下是今天的PLAUD晨會逐字稿：
---
${rawTranscript}
---`
}

// Stage 0：原始逐字稿 → 五段式管理日誌全文
export async function generateMorningLog(rawTranscript: string, todayDate: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: STAGE0_SYSTEM_PROMPT })
  const result = await withRetry(() => model.generateContent(buildStage0UserPrompt(rawTranscript, todayDate)))
  return result.response.text().trim()
}

const STAGE1_SYSTEM_PROMPT = `你是一位嚴謹的企業營運分析助理，負責把「每日晨會管理日誌」（已經由前一步驟整理過負責人歸屬）
轉換成結構化的任務資料，供任務追蹤系統使用。

【重要前提】
這份日誌在生成時，已經套用過嚴格的負責人判斷規則，任何無法確定負責人或內容的任務，
都已經在日誌中用【待確認-負責人:原因】、【待確認-人員】或【待確認-詞彙:原文】等標記標示出來，
也可能被獨立收錄在「待確認-負責人」這個人員區塊底下。你的工作是忠實解析這些標記，
而不是自己重新去判斷或猜測負責人。

【務必遵守的規則】
1. 只能根據日誌內容進行判斷，絕對不可以自行想像、推測、延伸或補充內容中沒有明確提到的任務。
2. 每一項輸出的任務，都必須能在原文中找到對應的句子或段落作為佐證（填入 source_excerpt）。
3. 只要任務內容中出現任何【待確認…】標記，或該任務被歸類在「待確認-負責人」區塊下，
   一律放進 unassigned_tasks，reason 欄位直接引用日誌中該標記寫的原因，不要自己重新編一個理由。
4. 除了日誌已標記的【待確認】項目之外，如果你另外發現某段內容看起來像任務，
   但負責人或內容描述依然模糊到無法確定，一樣要放進 unassigned_tasks，不可以自行猜測或分配。
5. 不可以把同一件事拆成兩筆重複的任務，也不可以合併兩件不相關的事成一筆任務。
6. deadline 與 notes 如果原文沒有明確寫出，就填 null，不可以自行推算或猜測日期。
7. 只能輸出符合指定 JSON schema 的資料，不要有任何額外文字、說明或 Markdown 符號。
8. owner 欄位只能填以下名單中「完全對應」的其中一個正式姓名，不可自創、不可加前綴或後綴、
   不可把多個人名寫在同一個 owner 欄位裡：
   黃湘婷、廖淑慧、吳哲緯、王治先、黃文彬、艾里、阿蔡
   （日誌裡可能出現簡稱，例如「文彬」對應「黃文彬」、「治先」對應「王治先」、「湘婷」對應「黃湘婷」、
   「淑慧」對應「廖淑慧」、「哲緯」對應「吳哲緯」，請對應成完整正式姓名再填入 owner）。
   特別注意：「庫瑪」與「阿蔡」是同一個人，聽到或看到「庫瑪」一律填「阿蔡」。
9. 語音辨識常會把名單內的人名聽成發音相近的其他字（諧音誤判），請優先判斷是不是名單內某人的諧音，
   再決定要不要放進 unassigned_tasks。例如「洪志堅」發音接近「王治先」的「治先」，遇到類似情況應對應回「王治先」。
   只有在真的完全無法對應到名單中任何一位時，才放進 unassigned_tasks，不可以硬塞一個名單外的名字進 owner。

請以下列 JSON 格式回傳（不要其他文字）：
{
  "assigned_tasks": [
    { "id": "t1", "owner": "負責人姓名", "task": "任務內容摘要", "deadline": "YYYY/MM/DD 或 null", "notes": "備註或 null", "source_excerpt": "原文佐證片段" }
  ],
  "unassigned_tasks": [
    { "raw_text": "看起來像任務但無法分配的原文片段", "reason": "無法分配的原因" }
  ]
}`

function buildStage1UserPrompt(dailyLogText: string, todayDate: string): string {
  return `今天日期：${todayDate}

以下是今天的晨會管理日誌內容，請依照系統規則抽取任務並分配負責人：

---
${dailyLogText}
---`
}

export type Stage1AssignedTask = { id: string; owner: string; task: string; deadline: string | null; notes: string | null; source_excerpt: string }
export type Stage1UnassignedTask = { raw_text: string; reason: string }
export type Stage1Output = { assigned_tasks: Stage1AssignedTask[]; unassigned_tasks: Stage1UnassignedTask[] }

// Stage 1：五段式日誌 → 結構化任務（已分配 / 待確認）
export async function extractAndAssignTasks(dailyLogText: string, todayDate: string): Promise<Stage1Output> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: STAGE1_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: 'application/json' },
  })
  const result = await withRetry(() => model.generateContent(buildStage1UserPrompt(dailyLogText, todayDate)))
  const text = result.response.text().trim()
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return {
      assigned_tasks: Array.isArray(parsed.assigned_tasks) ? parsed.assigned_tasks : [],
      unassigned_tasks: Array.isArray(parsed.unassigned_tasks) ? parsed.unassigned_tasks : [],
    }
  } catch {
    return { assigned_tasks: [], unassigned_tasks: [] }
  }
}

const STAGE2_SYSTEM_PROMPT = `你是一位專案管理助理，負責把已經確認負責人與內容的單一任務，
用類似 OKR（目標與關鍵結果）的概念，拆解成幾個有先後順序、可勾選完成的執行步驟（子任務）。

【務必遵守的規則】
1. 拆解出來的每個步驟，都必須是完成這項任務在邏輯上「本來就需要」的具體行動，
   不可以無中生有、加入與這項任務無關的新工作項目或新資訊。
2. 步驟數量抓 2～5 個，太瑣碎或太籠統都不好；每個步驟要具體到「做完就能打勾」的程度。
3. 步驟需要有合理的先後順序（先做什麼、再做什麼）。
4. 當「全部步驟」都完成時，代表這項任務本身也完成了，兩者邏輯要一致。
5. 只能輸出符合指定 JSON schema 的資料，不要有任何額外文字或說明。

請以下列 JSON 格式回傳（不要其他文字）：
{ "steps": [ { "step": "具體行動描述" } ] }`

function buildStage2UserPrompt(task: { id: string; owner: string; task: string; deadline: string | null; notes: string | null }): string {
  return `請拆解以下任務：

任務ID：${task.id}
負責人：${task.owner}
任務內容：${task.task}
截止時間：${task.deadline ?? '未指定'}
備註：${task.notes ?? '無'}`
}

export type TaskStep = { step: string; done: boolean }

// Stage 2：對單一已分配任務做 OKR 式拆解 → 可勾選子步驟
export async function breakdownTaskSteps(task: { id: string; owner: string; task: string; deadline: string | null; notes: string | null }): Promise<TaskStep[]> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: STAGE2_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: 'application/json' },
  })
  const result = await withRetry(() => model.generateContent(buildStage2UserPrompt(task)))
  const text = result.response.text().trim()
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
  const steps = Array.isArray(parsed.steps) ? parsed.steps : []
  return steps.map((s: any) => ({ step: String(s.step ?? ''), done: false })).filter((s: TaskStep) => s.step)
}

// ════════════════════════════════════════════════════════════════
// 教育訓練：把教材文字自動拆解成「生活案例 → 橋接案例 → 正式工作案例」
// 三階段互動字卡（中文／印尼語雙語），並產生結尾測驗題目、批改自由作答。
// 設計依據：現場實測有效的 5W2H 漸進式教學法（生活案例破冰 → 半生活半工作橋接
// → 正式工作案例對應公司系統欄位）。
// ════════════════════════════════════════════════════════════════

const TRAINING_CARDS_SYSTEM_PROMPT = `你是一位資深企業教育訓練設計師，專長是幫工廠/工地的第一線員工（含外籍移工，需中文＋印尼語雙語）設計「漸進式」教材。

【核心教學法（務必遵守）】
把教材內容拆解成三個階段的案例卡，難度漸進：
1. 生活案例（Contoh sehari-hari）：跟教材主題無關、但用大家生活中都遇過的小事練習思考架構，建立信任、降低心理門檻。不用專業術語。
2. 橋接案例（Contoh penghubung）：半生活半工作，開始貼近教材主題，但還不用專業術語。
3. 正式工作案例（Kasus kerja nyata）：直接對應教材真正要教的工作情境與專業內容。

每個階段的案例要用「一問一答」的欄位(fields)呈現，這是教「WHY」而不是死背，讓學員理解「原來我平常就在這樣想事情」。

【欄位數量：不要固定，依教材內容分析需要幾個】
不要每次都硬湊成 4 個欄位。請先分析這份教材真正需要幾個提問面向，再決定欄位數量（通常 3～8 個）：
- 如果教材是「5W2H」思考法，就要完整拆成 7 個欄位，一個蘿蔔一個坑：發生什麼事(What)、為什麼(Why)、誰來做(Who)、什麼時候(When)、在哪裡(Where)、怎麼做(How)、花多少(How much/How many)。
- 如果教材只需要「發生什麼事→為什麼→怎麼辦」就講得清楚，那就只給 3 個欄位，不要硬加。
- 其他教材依實際需要的提問面向決定，寧可貼合內容，也不要為了湊數而空泛。
三個階段（生活／橋接／正式）的欄位「面向」要一致（同樣的提問角度），只是換不同案例。

【重要：每個欄位都要給 3 個「延伸可能」(alts)】
除了主要答案(v)之外，每個欄位都要再給 3 個「其他可能的方向」放進 alts 陣列。這是要教學員「同一件事其實有好幾種可能，不是只有一個標準答案」，鼓勵發散思考。
每個延伸可能都是完整、口語的一句話。範例：
- 問題：為什麼週五的飯菜會臭掉？
- 主要答案(v)：可能是天氣熱、放在室溫太久沒有冰起來。
- 延伸可能(alts)：①可能是昨天就沒拿去冰 ②可能本來就有不新鮮的食材 ③可能是便當盒沒蓋好跑進細菌
每個延伸可能中文與印尼語都要有。

【務必遵守的規則】
1. 三個階段都要有，且必須是同一條學習路徑（由淺入深），不可以三階段互不相關。
2. 生活案例必須是任何人、不分年紀國籍都秒懂的小事（食衣住行育樂），不可以出現任何教材裡的專業術語。
3. 正式工作案例的內容必須真的來自使用者提供的教材，不可以自己編造教材中沒有的專業知識。
4. 每個欄位的中文與印尼語翻譯都要精準、口語化，不要用機器直譯的生硬語氣。
5. 每個欄位的 alts 都要剛好 3 個，且彼此不同、都合理。
6. 只能輸出符合指定 JSON schema 的資料，不要有任何額外文字或說明。

請以下列 JSON 格式回傳（不要其他文字）：
{
  "courseTitle": { "zh": "課程標題", "id": "Judul kursus" },
  "stages": [
    {
      "stage": "生活案例",
      "stageId": "Contoh sehari-hari",
      "title": { "zh": "案例標題", "id": "Judul contoh" },
      "fields": [
        { "k": { "zh": "提問（如 發生什麼事？）", "id": "Pertanyaan" }, "v": { "zh": "...", "id": "..." }, "alts": [ { "zh": "可能…①", "id": "..." }, { "zh": "可能…②", "id": "..." }, { "zh": "可能…③", "id": "..." } ] }
      ]
    }
  ]
}
說明：fields 陣列的長度「不固定」，依教材內容分析需要幾個提問面向就給幾個（一般 3～8 個；5W2H 教材固定 7 個）。每個 field 的 k 是提問、v 是主要答案、alts 是 3 個延伸可能。
stages 陣列必須恰好包含 3 個階段，順序為：生活案例、橋接案例、正式工作案例，且三階段的欄位面向數量與角度要一致。`

function buildTrainingCardsUserPrompt(sourceText: string, is5w2h?: boolean): string {
  const note = is5w2h
    ? '\n\n【本教材為 5W2H 思考法】請務必把每個階段拆成完整 7 個欄位：發生什麼事(What)、為什麼(Why)、誰來做(Who)、什麼時候(When)、在哪裡(Where)、怎麼做(How)、花多少(How much/How many)，一個都不能少。'
    : ''
  return `以下是要教給員工的教材內容，請先分析它需要幾個提問面向，再拆解成三階段案例卡：${note}
---
${sourceText}
---`
}

export type TrainingBilingual = { zh: string; id: string }
export type TrainingField = { k: TrainingBilingual; v: TrainingBilingual; alts?: TrainingBilingual[] }
export type TrainingStage = { stage: string; stageId: string; title: TrainingBilingual; fields: TrainingField[] }
export type TrainingCourseContent = { courseTitle: TrainingBilingual; stages: TrainingStage[] }

export async function generateTrainingCards(sourceText: string, is5w2h?: boolean): Promise<TrainingCourseContent> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: TRAINING_CARDS_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: 'application/json' },
  })
  const result = await withRetry(() => model.generateContent(buildTrainingCardsUserPrompt(sourceText, is5w2h)))
  const text = result.response.text().trim()
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
  return parsed as TrainingCourseContent
}

const TRAINING_QUIZ_SYSTEM_PROMPT = `你是一位企業教育訓練出題老師。根據提供的「正式工作案例」內容，出一題新的情境測驗，
用來確認學員是否真的理解（而不是背答案），情境要類似但不可以完全照抄原案例。

規則：
1. 只給「發生什麼事」，不要直接給答案，讓學員自己填「為什麼」「該怎麼辦」。
2. 同時提供一份「參考答案」（為什麼、該怎麼辦），供批改比對，但不會顯示給學員直到作答後。
3. 中文與印尼語都要提供。
4. 只能輸出符合指定 JSON schema 的資料，不要有其他文字。

請以下列 JSON 格式回傳：
{
  "title": { "zh": "...", "id": "..." },
  "what": { "zh": "...", "id": "..." },
  "referenceWhy": { "zh": "...", "id": "..." },
  "referenceHow": { "zh": "...", "id": "..." }
}`

export type TrainingQuiz = { title: TrainingBilingual; what: TrainingBilingual; referenceWhy: TrainingBilingual; referenceHow: TrainingBilingual }

export async function generateTrainingQuiz(formalCase: TrainingStage): Promise<TrainingQuiz> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: TRAINING_QUIZ_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: 'application/json' },
  })
  const prompt = `正式工作案例內容：\n${JSON.stringify(formalCase, null, 2)}`
  const result = await withRetry(() => model.generateContent(prompt))
  const text = result.response.text().trim()
  return JSON.parse(text.replace(/```json|```/g, '').trim()) as TrainingQuiz
}

const TRAINING_GRADE_SYSTEM_PROMPT = `你是一位親切但認真的教育訓練評分老師。學員用自己的話回答「為什麼」與「該怎麼辦」，
請對照參考答案，判斷學員是否抓到核心邏輯（不要求逐字相同，抓到重點就算對）。

規則：
1. pass：學員答案是否抓到參考答案的核心邏輯（true/false）。
2. feedback：用溫和、鼓勵的語氣給一句中文講評（答對就肯定，答錯就簡短點出參考答案的重點方向，不要打擊信心）。
3. 只能輸出符合指定 JSON schema 的資料。

請以下列 JSON 格式回傳：
{ "pass": true, "feedback": "講評文字" }`

export async function gradeTrainingAnswer(params: { why: string; how: string; referenceWhy: string; referenceHow: string; lang?: string }): Promise<{ pass: boolean; feedback: string }> {
  const langNote = params.lang === 'id' ? '\nfeedback 欄位請務必用印尼文（Bahasa Indonesia）撰寫。' : '\nfeedback 欄位請用繁體中文撰寫。'
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: TRAINING_GRADE_SYSTEM_PROMPT + langNote,
    generationConfig: { responseMimeType: 'application/json' },
  })
  const prompt = `參考答案 - 為什麼：${params.referenceWhy}\n參考答案 - 怎麼辦：${params.referenceHow}\n\n學員作答 - 為什麼：${params.why || '（未填）'}\n學員作答 - 怎麼辦：${params.how || '（未填）'}`
  const result = await withRetry(() => model.generateContent(prompt))
  const text = result.response.text().trim()
  return JSON.parse(text.replace(/```json|```/g, '').trim()) as { pass: boolean; feedback: string }
}

// 訓練中的「問 AI」：以教學為主。一般概念（如 5W2H 思考法、通用安全常識、名詞解釋）
// 可自由上網查資料來解釋；公司內部的細節則依卡片內容回答、不上網、也不編造。
const TRAINING_ASK_SYSTEM_PROMPT = `你是一位有耐心的企業教育訓練小老師，正在陪一位第一線員工（可能中文程度不高、或是外籍移工）學習。

回答規則：
1. 用簡單、白話、鼓勵的語氣，句子要短。學員問什麼就回答什麼，不要長篇大論。
2. 如果問題是「通用知識、概念、思考方法、名詞解釋、常識、舉例」（例如 5W2H 是什麼、為什麼要先想原因、一般的工安概念），你可以用 Google 搜尋查最新、正確的資料來幫忙解釋，並用生活化的例子讓他懂。
3. 如果問題牽涉「這間公司內部的規定、數據、流程、機具參數」等你無法從教材或搜尋確認的內部事實，就依目前這張教材卡片的內容範圍回答；不確定的就誠實說「這部分要問你的主管或看公司規定」，不要自己編造內部資訊。
4. 如果學員是用印尼語問，就用印尼語回答；用中文問就用中文回答。
5. 目的是幫他「聽懂、學會」，不是考他，也不要岔題到跟這張卡片無關的內容。`

// lang='id' 時強制整段用印尼文回答；'zh' 用繁體中文
function langInstruction(lang?: string): string {
  return lang === 'id'
    ? '\n\n【回覆語言】不論學員用什麼語言輸入，請務必「全部用印尼文（Bahasa Indonesia）」回答，不要夾雜中文。'
    : '\n\n【回覆語言】請務必用「繁體中文」回答。'
}

export async function answerTrainingQuestion(cardTitle: string, question: string, lang?: string): Promise<string> {
  const userPrompt = `目前正在學的教材卡片主題：「${cardTitle}」\n\n學員的問題：${question}`
  const sys = TRAINING_ASK_SYSTEM_PROMPT + langInstruction(lang)
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: sys, tools: [{ googleSearch: {} }] as any })
    const res = await model.generateContent(userPrompt)
    return res.response.text().trim()
  } catch {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: sys })
    const res = await model.generateContent(userPrompt)
    return res.response.text().trim()
  }
}

// 學員在字卡上寫下自己的想法後，AI 判斷他的思考「合不合理、抓到重點沒」。
// 重點：沒有唯一標準答案——只要推論方向合理就肯定，偏了才引導；目標是理解與運用。
const TRAINING_EVAL_SYSTEM_PROMPT = `你是一位親切、鼓勵導向的企業教育訓練小老師。學員針對一個現場情境，用自己的話寫下他的判斷（例如「為什麼會這樣」「該怎麼辦」）。

重要觀念：這種思考題沒有唯一標準答案。範例答案只是「其中一種常見情況」，不是唯一正確。學員只要推論邏輯合理、方向對，就算跟範例不同也算對。

請這樣回饋（只給一小段，2～3 句，白話、溫暖）：
1. 先肯定學員想法裡合理的部分（就算跟範例不同，只要在現場說得通就肯定他）。
2. 如果他的方向明顯偏了或有安全疑慮，溫和點出正確的思考方向，不要打擊信心。
3. 收尾用一句話連結到「實際運用」——例如下次遇到類似情況可以怎麼想／怎麼做。
4. 學員用印尼語寫就用印尼語回饋，用中文寫就用中文回饋。
5. 不要說「你錯了」「標準答案是」這種字眼；重點是幫他建立會思考、能運用的能力。`

export async function evaluateTrainingThought(params: { cardTitle: string; question: string; learnerAnswer: string; referenceAnswer: string; lang?: string }): Promise<string> {
  const prompt = `情境卡片：「${params.cardTitle}」
這一題問的是：${params.question}
範例答案（其中一種常見情況，非唯一正解）：${params.referenceAnswer}

學員自己寫的想法：${params.learnerAnswer}

請依規則給一小段鼓勵導向的回饋。`
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: TRAINING_EVAL_SYSTEM_PROMPT + langInstruction(params.lang) })
  const res = await withRetry(() => model.generateContent(prompt))
  return res.response.text().trim()
}
// 總經理把 PDF 待辦清單丟進 AI 助理：只抽出「標了『自己』」的項目，其餘一律忽略。
// 直接把 PDF 交給 Gemini 讀，不自己寫解析器——PDF 的排版（表格、多欄、掃描件）
// 變化太大，自己拆很容易掉字或把兩欄的字黏在一起。
export type OwnTaskItem = {
  task: string          // 乾淨、可執行的一句話
  due: string | null    // YYYY-MM-DD；判斷不出來就 null
  dueFrom: string       // 日期是哪裡來的：'項目' | '檔案' | '檔名' | ''
}
export async function extractOwnTasksFromPdf(
  base64: string,
  filename: string,
  todayISO: string,
): Promise<OwnTaskItem[]> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })
  const sys = `這是一份待辦清單 PDF。請只做一件事：把「標記為『自己』的項目」抽出來。

【判斷哪些要抽】
・項目所在的那一行／那一列／那一段，只要出現「自己」兩個字，就是要抽的。
・其他人的項目（寫了別人名字、或沒有標「自己」的）一律不要抽，不要順便整理。
・抽不到任何一項就回傳空陣列，不要為了有東西交差而硬湊。

【task 怎麼寫】
・整理成乾淨、具體、可執行的一句話。
・去掉「自己」這兩個字本身、也去掉編號與項目符號，但要保留案場、數量、對象、規格等細節。

【due 日期怎麼判斷】依這個優先順序，找到就停：
1. 該項目自己帶的日期（例如「8/15 前跟客戶確認報價」）→ dueFrom 填「項目」
2. 檔案內容裡涵蓋全部項目的日期（例如開頭寫「8月第二週待辦」）→ dueFrom 填「檔案」
3. 檔名裡的日期 → dueFrom 填「檔名」
4. 以上都沒有 → due 填 null、dueFrom 填空字串。【不可以自己填今天】
・一律換算成 YYYY-MM-DD。只有月日沒有年份時，用今天的年份。

這份 PDF 的檔名是：「${filename}」
今天是 ${todayISO}。

只輸出 JSON：{ "items": [ { "task": "...", "due": "YYYY-MM-DD 或 null", "dueFrom": "項目|檔案|檔名|" } ] }`
  try {
    const res = await withRetry(() => model.generateContent([
      { inlineData: { data: base64, mimeType: 'application/pdf' as any } },
      sys,
    ]))
    const parsed = JSON.parse(res.response.text().replace(/```json|```/g, '').trim())
    return (Array.isArray(parsed.items) ? parsed.items : [])
      .map((it: any) => ({
        task: String(it?.task ?? '').trim(),
        due: /^\d{4}-\d{2}-\d{2}$/.test(String(it?.due ?? '')) ? String(it.due) : null,
        dueFrom: String(it?.dueFrom ?? '').trim(),
      }))
      .filter((it: OwnTaskItem) => it.task)
  } catch {
    return []
  }
}
