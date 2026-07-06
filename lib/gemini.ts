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

// 文字向量嵌入（語意搜尋用）；一次批次嵌入多筆
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  const res: any = await model.batchEmbedContents({
    requests: texts.map(t => ({ content: { role: 'user', parts: [{ text: (t || ' ').slice(0, 8000) }] } })),
  })
  const out = (res.embeddings || []).map((e: any) => e.values as number[])
  if (out.length !== texts.length) throw new Error('embedding 數量不符')
  return out
}

// AI 助理即時對話：優先用公司知識庫；查不到內部事實就說不知道；網路資料要標註
export async function chatWithAssistant(messages: { role: string; content: string }[], knowledge: string) {
  const sys = `你是煌盛興業的內部 AI 助理，協助同仁處理：客戶通話的話術建議、公司機具的參數／保養查詢、製作 SOP 等工作。

務必遵守以下規則：
1. 優先使用下方「公司內部資料（知識庫）」回答。查得到就準確、具體地回答，並可說明出自哪一份資料。
2. 若問題屬於「公司機具參數、保養數據、內部規範、報價、廠商」等公司內部事實，而知識庫中找不到，請直接回答：「這部分我在公司知識庫找不到資料，無法確定，請向相關同仁或原廠查證。」——絕對不要自行編造、猜測或填入不確定的數字。
3. 若是一般性知識，你可用 Google 搜尋補充，但提供後必須另起一段明確標註：「（以上內容為網路查詢資料，僅供參考）」。
4. 話術建議、SOP 這類可以發揮，但若牽涉到具體的公司數據／規格，仍以知識庫為準。
5. 一律用繁體中文，條列清楚、口語好讀。

【公司內部資料（知識庫，可能相關）】
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
