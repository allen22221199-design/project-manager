// 晨會任務自動化：共用流程（Stage0 → Stage1 → Stage2 → 寫入 Notion）
// 供「貼上 Plaud 內容」(app/api/organize-tasks) 使用
import { generateMorningLog, extractAndAssignTasks, breakdownTaskSteps } from './gemini'
import { addDailyTask, updateDailyTask, deleteDailyTasksByDate, writeHistorySection } from './notion'
import { pushToLine } from './line'

// 系統唯一認可的人員名單（跟 app/page.tsx 的 DAILY_PEOPLE 一致）
const DAILY_PEOPLE = ['徐碧惠', '黃湘婷', '廖淑慧', '吳哲緯', '王治先', '黃文彬', '艾里', '阿蔡', '庫瑪']
// 短名／常見別名 → 系統內全名
const NAME_MAP: Record<string, string> = {
  文彬: '黃文彬', 治先: '王治先', 湘婷: '黃湘婷', 淑慧: '廖淑慧',
  哲緯: '吳哲緯', 碧惠: '徐碧惠', 阿蔡: '阿蔡', 艾里: '艾里', 庫瑪: '庫瑪',
}
// 語音辨識常見諧音/錯字誤判 → 正式姓名（發現新的誤判案例時往這裡加）
const MISHEARD_ALIASES: Record<string, string> = {
  洪志堅: '王治先', // 「志堅」與「治先」發音相近，易被誤聽/誤植
}
// 把 AI 給的負責人字串正規化成名單內的正式姓名；比對不到任何一位就回傳 null（丟去待確認，不可自創新名字）
function normalizeOwner(name: string): string | null {
  const n = (name ?? '').trim()
  if (!n) return null
  if (DAILY_PEOPLE.includes(n)) return n
  if (MISHEARD_ALIASES[n]) return MISHEARD_ALIASES[n]
  if (NAME_MAP[n]) return NAME_MAP[n]
  // 名字裡包含某位已知人員的姓名/短名（例如 AI 多加了「海陸」等前綴字）
  for (const full of DAILY_PEOPLE) {
    if (n.includes(full)) return full
  }
  for (const short in NAME_MAP) {
    if (n.includes(short)) return NAME_MAP[short]
  }
  for (const alias in MISHEARD_ALIASES) {
    if (n.includes(alias) || alias.includes(n)) return MISHEARD_ALIASES[alias]
  }
  return null
}

// 把日誌裡的 YYYY/MM/DD 或類似格式轉成 ISO YYYY-MM-DD；解析不出來回傳 null
function toISODate(d: string | null | undefined): string | null {
  if (!d) return null
  const m = String(d).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

// 從貼上內容的第一行嘗試解析出「這份記錄屬於哪一天」（支援 YYYY/MM/DD、M月D日、M/D）
function detectLogDate(rawText: string): string {
  const nowTW = new Date(Date.now() + 8 * 3600 * 1000)
  const todayStr = nowTW.toISOString().slice(0, 10)
  const yr = nowTW.getUTCFullYear()
  const firstLine = rawText.trim().split('\n')[0]
  const validMD = (mo: number, d: number) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31
  const pad = (n: string | number) => String(n).padStart(2, '0')

  const m1 = firstLine.match(/(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  const m3 = firstLine.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  const m2 = firstLine.match(/(?:^|[\s　])(\d{1,2})\/(\d{1,2})(?![\/\d])/)

  if (m1 && validMD(+m1[2], +m1[3])) return `${m1[1]}-${pad(m1[2])}-${pad(m1[3])}`
  if (m3 && validMD(+m3[1], +m3[2])) return `${yr}-${pad(m3[1])}-${pad(m3[2])}`
  if (m2 && validMD(+m2[1], +m2[2])) {
    const cand = `${yr}-${pad(m2[1])}-${pad(m2[2])}`
    const diffDays = Math.abs((new Date(cand).getTime() - new Date(todayStr).getTime()) / 86400000)
    return diffDays <= 14 ? cand : todayStr
  }
  return todayStr
}

export type DailyTaskPipelineResult = {
  logDate: string
  dailyLogText: string
  assignedCount: number
  pendingCount: number
  line: any
}

export async function runDailyTaskPipeline(rawText: string, opts: { sendLine?: boolean } = {}): Promise<DailyTaskPipelineResult> {
  const logDate = detectLogDate(rawText)

  // Stage 0：原始逐字稿／摘要 → 五段式管理日誌
  const dailyLogText = await generateMorningLog(rawText.trim(), logDate)

  // Stage 1：抽取任務 + 分配負責人（嚴禁捏造，無法判斷者列為待確認）
  const stage1 = await extractAndAssignTasks(dailyLogText, logDate)

  // Stage 2：對每個已分配任務做 OKR 拆解（單一任務失敗不影響整批）
  const stepsByTaskId = new Map<string, { step: string; done: boolean }[]>()
  await Promise.all(stage1.assigned_tasks.map(async task => {
    try { stepsByTaskId.set(task.id, await breakdownTaskSteps(task)) }
    catch { stepsByTaskId.set(task.id, []) }
  }))

  // 重寫當天：先刪掉這一天的舊資料，再寫入新版
  await deleteDailyTasksByDate(logDate)

  const grouped: Record<string, string[]> = {}
  let assignedCount = 0
  let pendingCount = 0

  for (const task of stage1.assigned_tasks) {
    const owner = normalizeOwner(task.owner)
    if (!owner) {
      // 負責人不在名單內（AI 自創或無法辨識的名字）→ 一律歸類為待確認，不可自行新增人名標籤
      const page = await addDailyTask('待確認', task.task, logDate, 'Plaud')
      const steps = stepsByTaskId.get(task.id) ?? []
      if (steps.length) { try { await updateDailyTask((page as any).id, { steps }) } catch {} }
      ;(grouped['待確認'] ??= []).push(task.task)
      pendingCount++
      continue
    }
    const dueDate = toISODate(task.deadline) ?? logDate
    const page = await addDailyTask(owner, task.task, dueDate, 'Plaud')
    const steps = stepsByTaskId.get(task.id) ?? []
    try { await updateDailyTask((page as any).id, { content: task.notes ?? '', steps }) } catch {}
    ;(grouped[owner] ??= []).push(task.task)
    assignedCount++
  }

  for (const p of stage1.unassigned_tasks) {
    // 只記錄任務本身，不附「無法辨識的原因」備註
    await addDailyTask('待確認', p.raw_text, logDate, 'Plaud')
    ;(grouped['待確認'] ??= []).push(p.raw_text)
    pendingCount++
  }

  try { await writeHistorySection(logDate, grouped) } catch { /* 歷史頁面失敗不影響主流程 */ }

  let lineResult: any = null
  if (opts.sendLine !== false) {
    const msg = `📋 今日工作日誌已完成（${logDate}）\n已排程 ${assignedCount} 項、待確認 ${pendingCount} 項\n請至以下網址查看：\nhttps://project-manager-theta-nine.vercel.app`
    try { lineResult = await pushToLine(msg) } catch (e: any) { lineResult = { error: e.message } }
  }

  return {
    logDate,
    dailyLogText,
    assignedCount,
    pendingCount,
    line: lineResult,
  }
}
