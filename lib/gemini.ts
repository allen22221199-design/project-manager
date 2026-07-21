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
export type ChatIntent = {
  intent: 'progress' | 'question'
  project: string | null   // 對應到的專案名稱（盡量對應 projectNames 其中一個；無法確定填 null）
  date: string | null      // YYYY/MM/DD；沒提到就 null（之後預設今天）
  description: string       // 乾淨的一句話進度描述
}

export async function routeChatIntent(message: string, projectNames: string[], todayISO: string): Promise<ChatIntent> {
  const sys = `你是一個工地/工廠專案系統的聊天室助理的「意圖分類器」。判斷使用者這句話是：
- "progress"：使用者在「回報／記錄某個專案的工作進度或狀態」（例如「冠德的箱蓋今天噴好了」「國壽三樓施工完成」「桃大的料到了」）。通常是在陳述一件已經發生或完成的現場事實。
- "question"：使用者在「問問題、找SOP、問怎麼做、排除困難、閒聊」或任何不是要記錄進度的情況。

【目前進行中的專案清單】
${projectNames.length ? projectNames.map(n => '・' + n).join('\n') : '（目前沒有專案）'}

規則：
1. 只有當這句話明顯是在「陳述某專案的進度/完成/狀態」時才判定 progress；只要有疑問語氣、在問怎麼做、或看起來像查資料，一律判 question。
2. 若判 progress，project 盡量對應到上面清單中「最相符的一個」專案完整名稱；真的對應不到就填 null。
3. date：句子有明確講日期才填（格式 YYYY/MM/DD），沒有就填 null。
4. description：把進度整理成乾淨、具體的一句話（去掉「幫我記一下」這類指令詞）。
5. 只輸出 JSON，不要多餘文字。

回傳格式：
{ "intent": "progress" | "question", "project": "專案名稱或 null", "date": "YYYY/MM/DD 或 null", "description": "進度描述（question 時可空字串）" }`

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: sys,
      generationConfig: { responseMimeType: 'application/json' },
    })
    const res = await model.generateContent(`今天是 ${todayISO}。\n使用者說：「${message}」`)
    const parsed = JSON.parse(res.response.text().replace(/```json|```/g, '').trim())
    return {
      intent: parsed.intent === 'progress' ? 'progress' : 'question',
      project: parsed.project || null,
      date: parsed.date || null,
      description: String(parsed.description || ''),
    }
  } catch {
    // 分類失敗就當一般問題處理，維持原本聊天流程
    return { intent: 'question', project: null, date: null, description: '' }
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
export async function chatWithAssistant(messages: { role: string; content: string }[], knowledge: string) {
  const sys = `你是煌盛興業的內部 AI 助理，協助同仁處理：客戶通話的話術建議、公司機具的參數／保養查詢、製作 SOP 等工作。

務必遵守以下規則：
1. 優先使用下方「公司內部資料（知識庫）」回答。查得到就準確、具體地回答，並標明出自哪一份資料。
2. 【最重要—通盤彙整】下方常會提供「多份相關的 SOP／資料」。你必須把「全部」相關的都讀完、交叉思考後，「彙整成一個完整、有條理的答案」，不可以只看其中一份就回答：
   - 把不同資料裡「互補、接續、同主題」的內容整合在一起，形成完整流程／清單。
   - 若不同資料有「重疊」，合併去重；若「講法不一致或有新舊版本」（例如檔名帶日期、較新的），要一併指出差異並提醒以哪份為準。
   - 每個重點盡量標註出自哪一份資料（例如：（出自〈丈量SOP〉））。
   - 最後可用一句話總結重點或提醒。
3. 若問題屬於「公司機具參數、保養數據、內部規範、報價、廠商」等公司內部事實，而知識庫中找不到，請直接回答：「這部分我在公司知識庫找不到資料，無法確定，請向相關同仁或原廠查證。」——絕對不要自行編造、猜測或填入不確定的數字。
4. 若是一般性知識，你可用 Google 搜尋補充，但提供後必須另起一段明確標註：「（以上內容為網路查詢資料，僅供參考）」。
5. 話術建議、SOP 這類可以發揮，但若牽涉到具體的公司數據／規格，仍以知識庫為準。
6. 一律用繁體中文，條列清楚、口語好讀。

【公司內部資料（知識庫，可能相關；下方可能是多份不同 SOP，請通盤整合）】
${knowledge || '（這次沒有找到相關的公司內部資料）'}`

  const contents = messages.slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: sys, tools: [{ googleSearch: {} }] as any })
    const res = await model.generateContent({ contents })
    return res.response.text().trim()
  } catch {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: sys })
    const res = await model.generateContent({ contents })
    return res.response.text().trim()
  }
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
   徐碧惠、黃湘婷、廖淑慧、吳哲緯、王治先、黃文彬、艾里、阿蔡、庫瑪
   （日誌裡可能出現簡稱，例如「文彬」對應「黃文彬」、「治先」對應「王治先」、「湘婷」對應「黃湘婷」、
   「淑慧」對應「廖淑慧」、「哲緯」對應「吳哲緯」、「碧惠」對應「徐碧惠」，請對應成完整正式姓名再填入 owner）。
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
