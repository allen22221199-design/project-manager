'use client'
import { useState, useEffect, useRef } from 'react'
import Tour, { type TourStep } from './tour'

// 新手教學引導步驟（後台登入不列入）— 除了每個頁面，也帶到具體操作
const TOUR_STEPS: TourStep[] = [
  { title: '歡迎使用煌盛專案 App 👋', body: '第一次用嗎？我帶你花 2 分鐘認識每個功能和常用操作。點「下一步」開始，隨時可按右上角「跳過」。' },
  // 總覽
  { view: 'dashboard', target: '[data-tour="nav-dashboard"]', title: '📊 總覽（主畫面）', body: '一進來就在這頁。上面是流程排程表，下面有今日待辦、逾期任務、本週完成率、進行中案件數。', demo: { type: 'click' } },
  { view: 'dashboard', target: '[data-tour="schedule"]', title: '🗓️ 流程排程表', body: '每個案子排在哪天、哪個工序，一格一格看清楚。操作：① 先點上方要排的「案件」→ ② 在格子上「按住滑鼠拖過去」就會塗上顏色；同一案件再塗一次可清除。', demo: { type: 'drag' } },
  // 案件清單
  { view: 'list', target: '[data-tour="nav-list"]', title: '📋 案件清單', body: '所有專案都在這，點任一個案子可看細節、改負責人與狀態。', demo: { type: 'click' } },
  { view: 'list', target: '[data-tour="case-filters"]', title: '🔎 篩選 / 搜尋 / 新增專案', body: '用上面的狀態標籤（報價中／打樣中／施工中…）快速篩選；上方搜尋框可找名稱／聯絡人／地址；點「＋ 新增專案」建立新案子。', demo: { type: 'click' } },
  // 新增專案 + 報價單
  { view: 'create', target: '[data-tour="create-form"]', title: '➕ 怎麼新增專案', body: '填「專案名稱」（必填）、聯絡人、地址、狀態，就能建立一個新案子。', demo: { type: 'type', text: '惠宇-新竹關埔案' } },
  { view: 'create', target: '[data-tour="quote-upload"]', title: '📷 放上報價單（自動辨識品項）', body: '在「產品品項」按「📷 上傳圖片辨識」，拍或選一張報價單／材料清單照片，AI 會自動把品項、材質、規格、數量、單位辨識填進來，不用一項一項手打。', demo: { type: 'click' } },
  // 今日工作
  { view: 'daily', target: '[data-tour="nav-daily"]', title: '✅ 今日工作', body: '看每位同事今天要做什麼、直接勾選完成。下面幾個常用操作我一個一個講。', demo: { type: 'click' } },
  { view: 'daily', target: '[data-tour="plaud"]', title: '📥 晨會記錄放這裡', body: '開完晨會，把 Plaud 的逐字稿或摘要「貼到這個框」，按下按鈕，AI 會自動修正錯字、判斷負責人、拆解成可勾選步驟，寫進今日工作（可同時發到 LINE 群組）。', demo: { type: 'type', text: '晨會：阿蔡負責前處理、艾里包裝，今天陶大要出貨…' } },
  { view: 'daily', target: '[data-tour="add-task"]', title: '➕ 怎麼新增任務', body: '想手動加一項工作：先在「選人員」下拉選負責人 → 在旁邊輸入任務內容 → 按「新增」，就會指派給那個人。', demo: { type: 'type', text: '櫃體包裝完成、回報進度' } },
  { view: 'daily', target: '[data-tour="task-drag"]', title: '✋ 怎麼拖移任務', body: '任務卡片可以「拖曳」搬到別人名下換負責人；點卡片上的「狀態」可切換進行中／完成；點任務文字可直接編輯——這些都會即時同步到 Notion。', demo: { type: 'drag' } },
  // 任務查詢
  { view: 'search', target: '[data-tour="nav-search"]', title: '🔍 任務查詢', body: '用關鍵字或點人名，快速查任務、看每個人手上的工作量。', demo: { type: 'click' } },
  // AI 助理
  { view: 'chat', target: '[data-tour="nav-chat"]', title: '💬 AI 助理', body: '不會的直接問它！查公司 SOP、機具參數、排除困難，都幫你從公司資料找答案。', demo: { type: 'click' } },
  { view: 'chat', target: '[data-tour="chat-input"]', title: '⌨️ 怎麼問 / 怎麼記進度', body: '在這個框打字問問題（Enter 送出）。也能直接講一句進度，例如「冠德的箱蓋今天噴好了」，它會幫你對應專案、確認後寫進進度紀錄。', demo: { type: 'type', text: '冠德的箱蓋今天噴好了' } },
  // 教育訓練
  { view: 'training', target: '[data-tour="nav-training"]', title: '📚 教育訓練', body: '新人互動式學習區：一步步的字卡＋小測驗，邊做邊懂，AI 還會給回饋。', demo: { type: 'click' } },
  { title: '這樣就會用囉！🎉', body: '之後想再看一次，隨時點左下角的「🎓 新手教學」。開始操作看看吧！' },
]

const STATUS_COLORS: Record<string, string> = {
  '生產中': 'bg-yellow-100 text-yellow-800',
  '施工中': 'bg-green-100 text-green-800',
  '打樣中': 'bg-orange-100 text-orange-800',
  '對色中': 'bg-orange-100 text-orange-800',
  '等待中': 'bg-gray-100 text-gray-600',
  '報價中': 'bg-blue-100 text-blue-800',
  '請款中含保留款': 'bg-purple-100 text-purple-800',
  '完成': 'bg-green-100 text-green-700',
}

const STATUS_OPTIONS = ['報價中', '等待中', '打樣中', '對色中', '生產中', '施工中', '請款中含保留款', '完成']
const FILTER_TABS = ['全部', '報價中', '打樣中', '對色中', '生產中', '施工中', '等待中', '請款中含保留款', '完成']
const INACTIVE_STATUSES = ['完成', '請款中含保留款']
const DAILY_PEOPLE = ['徐碧惠', '黃湘婷', '廖淑慧', '吳哲緯', '王治先', '黃文彬', '艾里', '阿蔡', '庫瑪']
const PROJECT_ASSIGNEES = ['', '黃文彬', '王志先', '廖淑慧', '呂理論', '呂敏紅']
const DAILY_STATUS_CYCLE = ['進行中', '完成']
// 此人員的工作項目不在公開區顯示，只在管理者登入後的私人區可見
const PRIVATE_PERSON = '呂理論'          // 對應 Notion 的人員名稱（勿改）
const PRIVATE_PERSON_LABEL = 'Alen'      // 畫面上顯示的名稱
const PROCESS_STEPS = ['打樣', '丈量', '製圖', '訂料', '噴印檔', '前處理', '環氧白', '生產', '包裝', '施工']
// 舊版排程資料是用流程「順序編號」儲存的（沒有打樣），用來把舊資料轉成用流程名稱對應
const OLD_PROCESS_STEPS = ['丈量', '製圖', '訂料', '噴印檔', '前處理', '環氧白', '四色', '烘乾', '面漆', '包裝', '施工']
// 「四色／烘乾／面漆」合併成「生產」後，把舊資料的這三個流程名稱一併轉存到「生產」，避免既有排程消失
const MERGED_INTO_PRODUCTION = ['四色', '烘乾', '面漆']
// 任務文字含以下關鍵字 → 視為急件，套紅底
const URGENT_KEYWORDS = ['急件', '緊急', '急需', '趕件', '趕工', '火速', '儘快', '盡快', '馬上', '立刻', 'ASAP', '急']
function isUrgentTask(text?: string): boolean {
  if (!text) return false
  const t = text.toLowerCase()
  return URGENT_KEYWORDS.some(k => t.includes(k.toLowerCase()))
}

// 其他分類：協作（需他人先完成才能接續）、丈量繪圖
const DEPENDENCY_KEYWORDS = ['協作', '後續', '完成後', '才能', '無法執行', '無法進行', '需配合', '需要配合', '等待', '銜接', '交接', '上游', '對方', '依賴', '接續']
const DRAWING_KEYWORDS = ['丈量', '量測', '測量', '放樣', '畫圖', '製圖', '繪圖', '出圖', '圖面', 'CAD']
type TaskTag = { label: string; cls: string }
function taskTags(text?: string): TaskTag[] {
  if (!text) return []
  const t = text.toLowerCase()
  const tags: TaskTag[] = []
  if (DEPENDENCY_KEYWORDS.some(k => t.includes(k.toLowerCase()))) tags.push({ label: '🔗 協作', cls: 'bg-red-100 text-red-700' })
  if (DRAWING_KEYWORDS.some(k => t.includes(k.toLowerCase()))) tags.push({ label: '📐 丈量繪圖', cls: 'bg-red-100 text-red-700' })
  return tags
}
// 是否為需標紅的任務（急件 或 任一分類）
function isFlaggedTask(text?: string): boolean {
  return isUrgentTask(text) || taskTags(text).length > 0
}
// 綜合手動標記（優先）與關鍵字自動判定：'on'=強制紅、'off'=強制不紅、其他=依關鍵字
function effectiveFlagged(t: { flag?: string; task: string }): boolean {
  if (t.flag === 'on') return true
  if (t.flag === 'off') return false
  return isFlaggedTask(t.task)
}
const PROJECT_COLORS_LIST = [
  { label: '藍', bg: '#AEC6E8', text: '#1A5276' },
  { label: '綠', bg: '#A8D5A2', text: '#1A5E2A' },
  { label: '橘', bg: '#F7C59F', text: '#935116' },
  { label: '紫', bg: '#D5A6E0', text: '#6C3483' },
  { label: '紅', bg: '#F1948A', text: '#7B241C' },
  { label: '黃', bg: '#F9E79F', text: '#7D6608' },
  { label: '青', bg: '#A3E4D7', text: '#0E6251' },
  { label: '粉', bg: '#F5B7C4', text: '#943126' },
  { label: '棕', bg: '#D7BDA5', text: '#6E4B2A' },
  { label: '灰', bg: '#C5CBD1', text: '#424949' },
]

type Project = { id: string; name: string; status: string; contact: string; address: string; url: string; assignee?: string; color?: string; ganttStart?: string; ganttEnd?: string; schedule?: string; latestProgress?: string; latestProgressDate?: string }
type Task = { type: 'task'; id: string; taskName: string; status: string; assignees: string; helpers: string; dueDate: string; priority: string; note: string; url: string }
type ReportTab = 'progress' | 'item'
type View = 'list' | 'report' | 'search' | 'create' | 'daily' | 'chat' | 'dashboard' | 'private' | 'training'
type PrivateEvent = { id: string; title: string; date: string; note?: string; time?: string; endTime?: string; allDay?: boolean }
type FileResult = { title: string; name: string; url: string }
type ProgressDraft = { date: string; description: string; matchedId: string | null; matchedName: string | null; candidates: { id: string; name: string }[] }
type ChatMsg = { role: 'user' | 'assistant'; content: string; files?: FileResult[]; draft?: ProgressDraft; draftDone?: boolean; suggestions?: string[] }
type TaskAttachment = { name: string; url: string }
type TaskStep = { step: string; done: boolean }
type DailyTask = { id: string; task: string; person: string; date: string; createdAt?: string; status: string; source: string; freq: string; content?: string; direction?: string; aiPlan?: string; attachments?: TaskAttachment[]; flag?: string; steps?: TaskStep[] }

// 教育訓練
type TrainingBilingual = { zh: string; id: string }
type TrainingField = { k: TrainingBilingual; v: TrainingBilingual; alts?: TrainingBilingual[] }
type TrainingStage = { stage: string; stageId: string; title: TrainingBilingual; fields: TrainingField[] }
type TrainingCourseContent = { courseTitle: TrainingBilingual; stages: TrainingStage[]; is5w2h?: boolean }
type TrainingCourse = { id: string; name: string; active: boolean; content: TrainingCourseContent | null }
type TrainingQuiz = { title: TrainingBilingual; what: TrainingBilingual; referenceWhy: TrainingBilingual; referenceHow: TrainingBilingual }

// 5W2H ↔ 人事時地物 對照：依中文問題文字判斷這一格是哪一個，方便長者秒懂
function fw2hTag(labelZh: string): { en: string; zh: string; color: string } | null {
  const k = labelZh || ''
  if (/什麼事|發生/.test(k)) return { en: 'What', zh: '事', color: '#2563EB' }
  if (/為什麼|原因/.test(k)) return { en: 'Why', zh: '因', color: '#7C3AED' }
  if (/多少|花費|花錢|成本/.test(k)) return { en: 'How much', zh: '花多少', color: '#B45309' }
  if (/怎麼|解決|處理|該辦|辦/.test(k)) return { en: 'How', zh: '法', color: '#B45309' }
  if (/誰/.test(k)) return { en: 'Who', zh: '人', color: '#0F766E' }
  if (/何時|時候|時間/.test(k)) return { en: 'When', zh: '時', color: '#0F766E' }
  if (/何地|哪裡|地點/.test(k)) return { en: 'Where', zh: '地', color: '#0F766E' }
  return null
}
function Fw2hBadge({ labelZh, showZh = true }: { labelZh: string; showZh?: boolean }) {
  const tag = fw2hTag(labelZh)
  if (!tag) return null
  return (
    <span style={{ background: `${tag.color}18`, color: tag.color }}
      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full align-middle ml-1.5 whitespace-nowrap">
      {tag.en}{showZh ? ` · ${tag.zh}` : ''}
    </span>
  )
}

// 安全解析回應：伺服器逾時/出錯時回的是 HTML，不要讓 JSON.parse 噴出難懂的錯誤
async function readJson(r: Response): Promise<any> {
  const raw = await r.text()
  try { return JSON.parse(raw) }
  catch { throw new Error('伺服器忙碌或處理逾時，請稍後再試一次') }
}

export default function Page() {
  const [view, setView] = useState<View>('dashboard')
  const [tourStep, setTourStep] = useState<number>(-1)  // -1 = 未開啟教學
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)
  const [filterStatus, setFilterStatus] = useState('全部')
  const [searchText, setSearchText] = useState('')

  // progress form
  const [reportTab, setReportTab] = useState<ReportTab>('progress')
  const [date, setDate] = useState(today())
  const [desc, setDesc] = useState('')
  const [progressStatus, setProgressStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [submitOk, setSubmitOk] = useState(false)

  // item form
  const [itemName, setItemName] = useState('')
  const [itemContent, setItemContent] = useState('')
  const [itemSpec, setItemSpec] = useState('')
  const [itemQty, setItemQty] = useState('')
  const [itemUnit, setItemUnit] = useState('')
  const [itemNote, setItemNote] = useState('')

  // search
  const [searchQ, setSearchQ] = useState('')
  const [searchProjectResults, setSearchProjectResults] = useState<Project[]>([])
  const [searchTaskResults, setSearchTaskResults] = useState<Task[]>([])
  const [searchDetail, setSearchDetail] = useState<any>(null)
  const [searching, setSearching] = useState(false)

  // daily tasks
  const [dailyAll, setDailyAll] = useState<DailyTask[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [dailyLoading, setDailyLoading] = useState(false)
  const [plaudText, setPlaudText] = useState('')
  const [organizing, setOrganizing] = useState(false)
  const [organizeMsg, setOrganizeMsg] = useState('')
  const [organizeOk, setOrganizeOk] = useState(false)
  const [sendLine, setSendLine] = useState(true)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [reminderMsg, setReminderMsg] = useState('')
  const [reminderOk, setReminderOk] = useState(false)
  // 管理者登入 / 私人行事曆
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [privateEvents, setPrivateEvents] = useState<PrivateEvent[]>([])
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null)
  const [gcalLoading, setGcalLoading] = useState(false)
  const [privateMonth, setPrivateMonth] = useState(() => {
    const n = new Date(Date.now() + 8 * 3600 * 1000)
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`
  })
  const [agendaDate, setAgendaDate] = useState(() => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10))
  // 新增／編輯行程表單
  const [showEventForm, setShowEventForm] = useState(false)
  const [evId, setEvId] = useState<string | null>(null)
  const [evTitle, setEvTitle] = useState('')
  const [evDate, setEvDate] = useState('')
  const [evTime, setEvTime] = useState('')
  const [evEndTime, setEvEndTime] = useState('')
  const [evSaving, setEvSaving] = useState(false)
  const [privatePersonTasks, setPrivatePersonTasks] = useState<DailyTask[]>([])
  const [showPrivateDone, setShowPrivateDone] = useState(false)
  const [addingPrivateTask, setAddingPrivateTask] = useState(false)
  const [showPrivateTaskForm, setShowPrivateTaskForm] = useState(false)
  const [ptTaskId, setPtTaskId] = useState<string | null>(null)
  const [ptTaskText, setPtTaskText] = useState('')
  const [ptTaskDate, setPtTaskDate] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverPerson, setDragOverPerson] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [inProgressTasks, setInProgressTasks] = useState<DailyTask[]>([])
  const [showCompletedSearch, setShowCompletedSearch] = useState(false)
  const [selectedPersonTag, setSelectedPersonTag] = useState<string | null>(null)
  const [dailyTaskResults, setDailyTaskResults] = useState<DailyTask[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [filterPerson, setFilterPerson] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [personTasks, setPersonTasks] = useState<DailyTask[]>([])
  const [personTasksLoading, setPersonTasksLoading] = useState(false)
  const [personFreqFilter, setPersonFreqFilter] = useState<string | null>(null)
  const [personSubFilter, setPersonSubFilter] = useState<string | null>(null)
  const [projectDetail, setProjectDetail] = useState<any>(null)
  const [projectDetailLoading, setProjectDetailLoading] = useState(false)
  const [colorPickerOpenId, setColorPickerOpenId] = useState<string | null>(null)
  const [ganttMonth, setGanttMonth] = useState(() => {
    const n = new Date(Date.now() + 8 * 3600 * 1000)
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`
  })
  const [ganttActiveProject, setGanttActiveProject] = useState<string | null>(null)
  // 流程排程表：按住拖曳塗色用（像 Excel 拖曳選取一樣直覺）
  const [ganttDragStart, setGanttDragStart] = useState<{ proc: string; ampm: string; date: string } | null>(null)
  const [ganttDragOver, setGanttDragOver] = useState<string | null>(null)
  // 用 ref 同步保存拖曳狀態，讓「放開滑鼠/手指」時一定拿得到最新值（避免 useEffect 掛監聽的時間差造成「塗不上」）
  const ganttDragStartRef = useRef<{ proc: string; ampm: string; date: string } | null>(null)
  const ganttDragOverRef = useRef<string | null>(null)
  const commitGanttRef = useRef<(proc: string, ampm: string, d1: string, d2: string) => void>(() => {})

  // 流程排程表用：讀取／寫入某案件的排程資料（key 格式：流程|AM或PM|日期）
  function parseGanttSchedule(p: Project): Record<string, string> {
    let obj: Record<string, string> = {}
    try { obj = p.schedule ? JSON.parse(p.schedule) : {} } catch { return {} }
    const out: Record<string, string> = {}
    for (const k in obj) {
      const parts = k.split('|')
      let proc = parts[0]
      if (/^\d+$/.test(proc)) {
        const name = OLD_PROCESS_STEPS[Number(proc)]
        if (name) proc = name
      }
      if (MERGED_INTO_PRODUCTION.includes(proc)) proc = '生產'
      const key = `${proc}|${parts[1]}|${parts[2]}`
      if (!(key in out) || obj[k]) out[key] = obj[k]
    }
    return out
  }
  function saveGanttSchedule(p: Project, obj: Record<string, string>) {
    const json = JSON.stringify(obj)
    setProjects(prev => prev.map(x => x.id === p.id ? { ...x, schedule: json } : x))
    fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, schedule: json }) })
  }
  function ganttCellKey(proc: string, ampm: string, dateStr: string) {
    return `${proc}|${ampm}|${dateStr}`
  }
  // 拖曳結束時套用：整段塗上目前選定案件的顏色；若整段本來就是該案件，改成清除
  function commitGanttDrag(proc: string, ampm: string, d1: string, d2: string) {
    const ap = projects.find(p => p.id === ganttActiveProject)
    if (!ap) return
    const activeProj = projects.filter(p => !INACTIVE_STATUSES.includes(p.status))
    const owners: Record<string, string> = {}
    for (const p of activeProj) {
      const s = parseGanttSchedule(p)
      for (const k in s) owners[k] = p.id
    }
    const lo = d1 <= d2 ? d1 : d2
    const hi = d1 <= d2 ? d2 : d1
    const startKey = ganttCellKey(proc, ampm, d1)
    const clearMode = owners[startKey] === ap.id
    const apSched = parseGanttSchedule(ap)
    const otherEdits: Record<string, Record<string, string>> = {}
    const [gy2, gm2] = ganttMonth.split('-').map(Number)
    const daysInMonth2 = new Date(gy2, gm2, 0).getDate()
    for (let d = 1; d <= daysInMonth2; d++) {
      const ds = `${ganttMonth}-${String(d).padStart(2, '0')}`
      if (ds < lo || ds > hi) continue
      const key = ganttCellKey(proc, ampm, ds)
      if (clearMode) {
        if (owners[key] === ap.id) delete apSched[key]
      } else {
        const ownerId = owners[key]
        if (ownerId && ownerId !== ap.id) {
          const op = activeProj.find(p => p.id === ownerId)
          if (op) {
            if (!otherEdits[op.id]) otherEdits[op.id] = parseGanttSchedule(op)
            delete otherEdits[op.id][key]
          }
        }
        if (!(key in apSched)) apSched[key] = ''
      }
    }
    saveGanttSchedule(ap, apSched)
    for (const pid in otherEdits) {
      const op = activeProj.find(p => p.id === pid)
      if (op) saveGanttSchedule(op, otherEdits[pid])
    }
  }
  // 讓下面「掛一次就好」的監聽器永遠呼叫到最新的 commitGanttDrag（帶最新的 projects / 選定案件）
  commitGanttRef.current = commitGanttDrag
  // 拖曳結束（放開滑鼠／手指）時套用整段塗色。監聽器只在掛載時掛一次，狀態改讀 ref，
  // 這樣即使快速點一下或快速拖曳（在 useEffect 來得及執行前就放開），也一定會完成塗色。
  useEffect(() => {
    function endDrag() {
      const start = ganttDragStartRef.current
      if (start) {
        const over = ganttDragOverRef.current
        commitGanttRef.current(start.proc, start.ampm, start.date, over ?? start.date)
      }
      ganttDragStartRef.current = null
      ganttDragOverRef.current = null
      setGanttDragStart(null)
      setGanttDragOver(null)
    }
    // 手機／平板：用手指拖曳。滑鼠 onMouseEnter 在觸控不會觸發，改用 elementFromPoint 找目前手指下的格子
    function onTouchMove(e: TouchEvent) {
      const start = ganttDragStartRef.current
      if (!start) return
      const t = e.touches[0]
      if (!t) return
      const cell = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest('[data-gcell]')
      const key = cell?.getAttribute('data-gcell')
      if (!key) return
      const [proc, ampm, date] = key.split('|')
      if (proc === start.proc && ampm === start.ampm) {
        e.preventDefault()  // 拖曳塗色時不要讓頁面跟著捲動
        ganttDragOverRef.current = date
        setGanttDragOver(date)
      }
    }
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('touchend', endDrag)
    window.addEventListener('touchcancel', endDrag)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('touchend', endDrag)
      window.removeEventListener('touchcancel', endDrag)
      window.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  // 知識庫同步
  const [kbSyncing, setKbSyncing] = useState(false)
  const [kbMsg, setKbMsg] = useState('')
  const [kbOk, setKbOk] = useState(false)

  // 教育訓練
  const [trainingCourses, setTrainingCourses] = useState<TrainingCourse[]>([])
  const [trainingLoading, setTrainingLoading] = useState(false)
  const [trainingCourseId, setTrainingCourseId] = useState<string | null>(null)
  const [trainingLang, setTrainingLang] = useState<'zh' | 'id'>('zh')
  const [trainingStageIdx, setTrainingStageIdx] = useState(0)
  const [trainingRevealed, setTrainingRevealed] = useState(0)
  const [trainingQuiz, setTrainingQuiz] = useState<TrainingQuiz | null>(null)
  const [trainingQuizLoading, setTrainingQuizLoading] = useState(false)
  const [trainingWhy, setTrainingWhy] = useState('')
  const [trainingHow, setTrainingHow] = useState('')
  const [trainingGrading, setTrainingGrading] = useState(false)
  const [trainingResult, setTrainingResult] = useState<{ pass: boolean; feedback: string } | null>(null)
  const [trainingPerson, setTrainingPerson] = useState('')
  // 新增課程（管理者）
  const [showTrainingCreate, setShowTrainingCreate] = useState(false)
  const [trainingSourceText, setTrainingSourceText] = useState('')
  const [trainingCreating, setTrainingCreating] = useState(false)
  const [trainingCreateErr, setTrainingCreateErr] = useState('')
  const [trainingIs5w2h, setTrainingIs5w2h] = useState(false)  // 只有 5W2H 課程才顯示 5W2H 對照標籤
  const [trainingEditId, setTrainingEditId] = useState<string | null>(null)  // 正在改標題的課程 id
  const [trainingEditTitle, setTrainingEditTitle] = useState('')
  const [trainingAskInput, setTrainingAskInput] = useState('')
  const [trainingAskAnswer, setTrainingAskAnswer] = useState('')
  const [trainingAsking, setTrainingAsking] = useState(false)
  // 互動：每格「先想再看」— 記住學員自己打的想法（key: `${stageIdx}-${fieldIdx}`）
  const [trainingGuesses, setTrainingGuesses] = useState<Record<string, string>>({})
  const [trainingGuessInput, setTrainingGuessInput] = useState('')
  // AI 對學員想法的評語（key 同上）
  const [trainingFeedbacks, setTrainingFeedbacks] = useState<Record<string, string>>({})
  const [trainingEvaluatingKey, setTrainingEvaluatingKey] = useState<string | null>(null)

  async function evaluateThought(key: string, cardTitle: string, question: string, learnerAnswer: string, referenceAnswer: string) {
    setTrainingEvaluatingKey(key)
    try {
      const r = await fetch('/api/training/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardTitle, question, learnerAnswer, referenceAnswer, lang: trainingLang }),
      })
      const data = await readJson(r)
      if (r.ok) setTrainingFeedbacks(prev => ({ ...prev, [key]: data.feedback ?? '' }))
    } catch {} finally { setTrainingEvaluatingKey(null) }
  }

  async function askTrainingAI(cardTitle: string) {
    if (!trainingAskInput.trim() || trainingAsking) return
    setTrainingAsking(true); setTrainingAskAnswer('')
    try {
      const r = await fetch('/api/training/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardTitle, question: trainingAskInput.trim(), lang: trainingLang }),
      })
      const data = await readJson(r)
      setTrainingAskAnswer(r.ok ? (data.answer ?? '') : ('錯誤：' + (data.error ?? '無法回答')))
    } catch (e: any) { setTrainingAskAnswer('錯誤：' + e.message) }
    finally { setTrainingAsking(false); setTrainingAskInput('') }
  }

  async function fetchTrainingCourses() {
    setTrainingLoading(true)
    try {
      const r = await fetch('/api/training/courses')
      const data = await readJson(r)
      setTrainingCourses(data.courses ?? [])
    } catch {} finally { setTrainingLoading(false) }
  }
  function openTrainingCourse(id: string) {
    setTrainingCourseId(id)
    setTrainingStageIdx(0)
    setTrainingRevealed(1)   // 第一格「發生什麼事」是情境說明，自動顯示；之後每格先想再看
    setTrainingQuiz(null)
    setTrainingResult(null)
    setTrainingWhy(''); setTrainingHow('')
    setTrainingGuesses({}); setTrainingGuessInput(''); setTrainingAskAnswer('')
    setTrainingFeedbacks({})
  }
  async function createTrainingCourse2() {
    if (!trainingSourceText.trim() || trainingCreating) return
    setTrainingCreating(true); setTrainingCreateErr('')
    try {
      const r = await fetch('/api/training/courses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText: trainingSourceText.trim(), is5w2h: trainingIs5w2h }),
      })
      const data = await readJson(r)
      if (!r.ok) { setTrainingCreateErr(data.error ?? '建立失敗'); return }
      setTrainingSourceText(''); setShowTrainingCreate(false); setTrainingIs5w2h(false)
      await fetchTrainingCourses()
    } catch (e: any) { setTrainingCreateErr(e.message ?? '網路錯誤') }
    finally { setTrainingCreating(false) }
  }
  async function deleteTrainingCourseUI(id: string) {
    if (!window.confirm('確定刪除這堂課程嗎？')) return
    setTrainingCourses(prev => prev.filter(c => c.id !== id))
    if (trainingCourseId === id) setTrainingCourseId(null)
    await fetch('/api/training/courses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  }
  async function saveTrainingTitle(id: string) {
    const title = trainingEditTitle.trim()
    if (!title) { setTrainingEditId(null); return }
    setTrainingCourses(prev => prev.map(c => c.id === id
      ? { ...c, name: title, content: c.content ? { ...c.content, courseTitle: { ...(c.content.courseTitle ?? {}), zh: title } } : c.content }
      : c))
    setTrainingEditId(null)
    await fetch('/api/training/courses', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }) })
  }
  async function startTrainingQuiz(formalCase: TrainingStage) {
    setTrainingQuizLoading(true); setTrainingResult(null); setTrainingWhy(''); setTrainingHow('')
    try {
      const r = await fetch('/api/training/quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formalCase }),
      })
      const data = await readJson(r)
      if (r.ok) setTrainingQuiz(data.quiz)
    } finally { setTrainingQuizLoading(false) }
  }
  async function submitTrainingAnswer() {
    if (!trainingQuiz || !trainingCourseId || trainingGrading) return
    setTrainingGrading(true)
    try {
      const r = await fetch('/api/training/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person: trainingPerson.trim() || '匿名', courseId: trainingCourseId,
          why: trainingWhy, how: trainingHow,
          referenceWhy: trainingQuiz.referenceWhy.zh, referenceHow: trainingQuiz.referenceHow.zh,
          lang: trainingLang,
        }),
      })
      const data = await readJson(r)
      if (r.ok) setTrainingResult({ pass: data.pass, feedback: data.feedback })
    } finally { setTrainingGrading(false) }
  }

  // AI 助理對話
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatInitialized = useRef(false)

  // 手動新增任務
  const [newTaskText, setNewTaskText] = useState('')
  const [newTaskPerson, setNewTaskPerson] = useState(DAILY_PEOPLE[0])
  const [addingTask, setAddingTask] = useState(false)

  // 截止日期行內編輯
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null)
  const [editDueDateText, setEditDueDateText] = useState('')

  // 任務詳情面板（內容 / 進度方向）
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailContent, setDetailContent] = useState('')
  const [detailDirection, setDetailDirection] = useState('')
  const [savingDetail, setSavingDetail] = useState(false)
  const [saveDetailOk, setSaveDetailOk] = useState(false)
  const [saveDetailErr, setSaveDetailErr] = useState('')

  // 任務附件
  const [detailAttachments, setDetailAttachments] = useState<TaskAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const taskFileRef = useRef<HTMLInputElement>(null)

  // create project form
  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newStatus, setNewStatus] = useState('報價中')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
  const [createOk, setCreateOk] = useState(false)
  // 新增專案時的品項（可由圖片辨識自動填入）
  const [newItems, setNewItems] = useState<any[]>([])
  const [newItemAnalyzing, setNewItemAnalyzing] = useState(false)
  const createItemFileRef = useRef<HTMLInputElement>(null)

  // image (progress tab)
  const [imgPreview, setImgPreview] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzed, setAnalyzed] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // image (item tab)
  const [itemImgPreview, setItemImgPreview] = useState('')
  const [itemAnalyzing, setItemAnalyzing] = useState(false)
  const [itemAnalyzed, setItemAnalyzed] = useState<any[] | null>(null)
  const itemFileRef = useRef<HTMLInputElement>(null)
  // 報告頁品項分頁：批次品項列表（辨識/手動，最後一次寫入）
  const [itemList, setItemList] = useState<any[]>([])

  useEffect(() => {
    fetchProjects(); fetchDailyTasks()
    // 支援用網址參數 ?v=<view> 直接開啟指定頁面（截圖／分享用）
    try {
      const v = new URLSearchParams(window.location.search).get('v') as View | null
      const valid: View[] = ['dashboard', 'list', 'daily', 'search', 'chat', 'training', 'private']
      if (v && valid.includes(v)) {
        setView(v)
        if (v === 'search') fetchInProgress()
        else if (v === 'training') fetchTrainingCourses()
      }
      // ?tour 直接開啟新手教學（?tour=2 可從第 3 步開始，分享／截圖用）
      const tourParam = new URLSearchParams(window.location.search).get('tour')
      if (tourParam !== null) setTourStep(Math.max(0, Math.min(parseInt(tourParam) || 0, TOUR_STEPS.length - 1)))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 教學進行中：跟著步驟切換到對應頁面，讓引導的功能在背景顯示
  useEffect(() => {
    if (tourStep < 0) return
    const s = TOUR_STEPS[tourStep]
    if (s?.view && s.view !== view) {
      setView(s.view as View)
      if (s.view === 'search') fetchInProgress()
      else if (s.view === 'training') fetchTrainingCourses()
      else if (s.view === 'daily') fetchDailyTasks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep])
  useEffect(() => {
    if (!colorPickerOpenId) return
    const handler = () => setColorPickerOpenId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [colorPickerOpenId])

  // 開站檢查是否已登入管理者（並檢查 Google 日曆連結狀態）
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.authed) { setIsAdmin(true); checkGcalStatus(); fetchPrivatePersonTasks() }
    }).catch(() => {})
    // 記住上次登入帳號，自動帶入
    try { const u = localStorage.getItem('adminUser'); if (u) setLoginUser(u) } catch {}
    // OAuth 導回後的提示
    const p = new URLSearchParams(window.location.search).get('gcal')
    if (p) {
      if (p === 'ok') { setIsAdmin(true); checkGcalStatus() }
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // 切換私人行事曆月份時，重新讀取該月 Google 事件
  useEffect(() => {
    if (isAdmin && gcalConnected && view === 'private') fetchPrivateEvents()
  }, [privateMonth, gcalConnected, view])

  async function checkGcalStatus() {
    try {
      const r = await fetch('/api/gcal?status=1')
      const d = await r.json()
      setGcalConnected(!!d.connected)
    } catch { setGcalConnected(false) }
  }

  // 抓「私人人員」(呂理論) 的工作項目，只在管理者私人區顯示
  async function fetchPrivatePersonTasks() {
    try {
      const r = await fetch(`/api/daily-tasks?person=${encodeURIComponent(PRIVATE_PERSON)}`)
      if (!r.ok) return
      const d = await r.json()
      setPrivatePersonTasks(d.tasks ?? [])
    } catch {}
  }
  async function togglePrivatePersonDone(t: DailyTask) {
    const next = t.status === '完成' ? '進行中' : '完成'
    setPrivatePersonTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x))
    fetch('/api/daily-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, status: next }) })
  }
  function openAddPrivateTask() {
    setPtTaskId(null); setPtTaskText(''); setPtTaskDate(todayISO()); setShowPrivateTaskForm(true)
  }
  function openEditPrivateTask(t: DailyTask) {
    setPtTaskId(t.id); setPtTaskText(t.task); setPtTaskDate(t.date || todayISO()); setShowPrivateTaskForm(true)
  }
  async function savePrivateTaskForm() {
    if (!ptTaskText.trim() || addingPrivateTask) return
    setAddingPrivateTask(true)
    try {
      if (ptTaskId) {
        setPrivatePersonTasks(prev => prev.map(x => x.id === ptTaskId ? { ...x, task: ptTaskText.trim(), date: ptTaskDate } : x))
        await fetch('/api/daily-tasks', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ptTaskId, task: ptTaskText.trim(), dueDate: ptTaskDate }),
        })
      } else {
        await fetch('/api/daily-tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person: PRIVATE_PERSON, task: ptTaskText.trim(), date: ptTaskDate || todayISO() }),
        })
      }
      setShowPrivateTaskForm(false)
      await fetchPrivatePersonTasks()
    } finally { setAddingPrivateTask(false) }
  }
  async function deletePrivatePersonTask(t: DailyTask) {
    if (!window.confirm(`確定刪除「${t.task}」嗎？`)) return
    setPrivatePersonTasks(prev => prev.filter(x => x.id !== t.id))
    fetch('/api/daily-tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) })
  }

  async function doLogin() {
    if (loginLoading) return
    setLoginLoading(true); setLoginErr('')
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      })
      const d = await r.json()
      if (!r.ok) { setLoginErr(d.error ?? '登入失敗'); return }
      try { localStorage.setItem('adminUser', loginUser) } catch {}
      setIsAdmin(true); setShowLogin(false); setLoginPass('')  // 保留帳號，只清密碼
      checkGcalStatus(); fetchPrivatePersonTasks()
    } catch (e: any) { setLoginErr(e.message ?? '網路錯誤') }
    finally { setLoginLoading(false) }
  }
  async function doLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setIsAdmin(false); setPrivateEvents([]); setGcalConnected(null)
    if (view === 'private') setView('dashboard')
  }
  // 私人行事曆＝直接讀寫 Google 日曆
  async function fetchPrivateEvents() {
    setGcalLoading(true)
    try {
      const r = await fetch(`/api/gcal?month=${privateMonth}`)
      const d = await r.json()
      if (r.ok) { setPrivateEvents(d.events ?? []); setGcalConnected(true) }
      else if (d.connected === false) setGcalConnected(false)
    } catch {} finally { setGcalLoading(false) }
  }
  function openAddEvent(date: string) {
    setEvId(null); setEvTitle(''); setEvDate(date); setEvTime(''); setEvEndTime(''); setShowEventForm(true)
  }
  function openEditEvent(ev: PrivateEvent) {
    setEvId(ev.id); setEvTitle(ev.title); setEvDate(ev.date)
    setEvTime(ev.allDay ? '' : (ev.time ?? '')); setEvEndTime(ev.allDay ? '' : (ev.endTime ?? ''))
    setShowEventForm(true)
  }
  async function saveEventForm() {
    if (!evTitle.trim() || !evDate || evSaving) return
    setEvSaving(true)
    try {
      const body = { id: evId ?? undefined, title: evTitle.trim(), date: evDate, time: evTime, endTime: evEndTime }
      const r = await fetch('/api/gcal', {
        method: evId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { alert(d.error ?? '儲存失敗'); return }
      setShowEventForm(false)
      fetchPrivateEvents()
    } finally { setEvSaving(false) }
  }
  async function deleteEventForm() {
    if (!evId) { setShowEventForm(false); return }
    if (!window.confirm('確定刪除這筆行程嗎？（同步從 Google 日曆刪除）')) return
    setPrivateEvents(prev => prev.filter(e => e.id !== evId))
    setShowEventForm(false)
    await fetch('/api/gcal', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: evId }) })
    fetchPrivateEvents()
  }

  // 逾期 / 今天到期標記
  function dueBadge(t: DailyTask): { label: string; cls: string } | null {
    if (!t.date || t.status === '完成' || t.status === '已封存') return null
    const today = todayISO()
    if (t.date < today) return { label: '逾期', cls: 'bg-red-100 text-red-700' }
    if (t.date === today) return { label: '今天', cls: 'bg-yellow-100 text-yellow-700' }
    return null
  }

  // 手動新增任務並指派人員
  async function addManualTask(dateForTask: string, after: () => void) {
    const task = newTaskText.trim()
    if (!task || addingTask) return
    setAddingTask(true)
    try {
      await fetch('/api/daily-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: newTaskPerson, task, date: dateForTask }),
      })
      setNewTaskText('')
      after()
    } finally { setAddingTask(false) }
  }

  // AI 助理對話：重開頁面自動還原（存在瀏覽器本機）
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chatMessages')
      if (saved) {
        const parsed: (ChatMsg & { _ts?: number })[] = JSON.parse(saved)
        const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000
        // 過濾掉超過 7 天的訊息
        const recent = parsed.filter(m => !m._ts || m._ts > sevenDaysAgo)
        setChatMessages(recent)
      }
    } catch {}
    chatInitialized.current = true
  }, [])
  useEffect(() => {
    if (!chatInitialized.current) return  // 避免初始空陣列覆蓋已儲存的對話
    try { localStorage.setItem('chatMessages', JSON.stringify(chatMessages)) } catch {}
  }, [chatMessages])

  function today() {
    const d = new Date()
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
  }

  function todayISO() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
  }

  async function fetchProjects() {
    setLoading(true)
    try {
      const r = await fetch('/api/projects')
      const data = await readJson(r)
      setProjects(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }

  async function selectProject(p: Project) {
    setSelected(p)
    setDate(today())
    setDesc('')
    setProgressStatus('')
    setSubmitMsg('')
    setSubmitOk(false)
    setItemName('')
    setItemContent('')
    setItemSpec('')
    setItemQty('')
    setItemUnit('')
    setItemNote('')
    setItemList([])
    setReportTab('progress')
    setProjectDetail(null)
    setProjectDetailLoading(true)
    setView('report')
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: p.id }),
      })
      setProjectDetail(await readJson(r))
    } catch {} finally { setProjectDetailLoading(false) }
  }

  // 重新抓取目前專案的明細（新增進度/品項後即時更新畫面）
  async function refreshProjectDetail() {
    if (!selected) return
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selected.id }),
      })
      setProjectDetail(await readJson(r))
    } catch {}
  }

  // 專案表格列：就地編輯 / 刪除（項目清單、進度紀錄）
  function setItemCell(ri: number, ci: number, v: string) {
    setProjectDetail((pd: any) => ({ ...pd, itemRows: pd.itemRows.map((row: string[], i: number) => i === ri ? row.map((c, j) => j === ci ? v : c) : row) }))
  }
  function saveItemRow(ri: number) {
    const rowId = projectDetail?.itemRowIds?.[ri]
    if (!rowId) return
    fetch('/api/project-row', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowId, cells: projectDetail.itemRows[ri] }) })
  }
  function deleteItemRow(ri: number) {
    const rowId = projectDetail?.itemRowIds?.[ri]
    if (!rowId || !window.confirm('確定刪除這一列品項嗎？')) return
    setProjectDetail((pd: any) => ({ ...pd, itemRows: pd.itemRows.filter((_: any, i: number) => i !== ri), itemRowIds: pd.itemRowIds.filter((_: any, i: number) => i !== ri) }))
    fetch('/api/project-row', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowId }) })
  }
  function setProgressField(ri: number, field: 'date' | 'desc', v: string) {
    setProjectDetail((pd: any) => ({ ...pd, progressRows: pd.progressRows.map((r: any, i: number) => i === ri ? { ...r, [field]: v } : r) }))
  }
  function saveProgressRow(ri: number) {
    const rowId = projectDetail?.progressRowIds?.[ri]
    if (!rowId) return
    const r = projectDetail.progressRows[ri]
    fetch('/api/project-row', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowId, cells: [r.date, r.desc], pageId: selected?.id, kind: 'progress' }) })
      .then(() => fetchProjects())
  }
  function deleteProgressRow(ri: number) {
    const rowId = projectDetail?.progressRowIds?.[ri]
    if (!rowId || !window.confirm('確定刪除這一筆進度嗎？')) return
    setProjectDetail((pd: any) => ({ ...pd, progressRows: pd.progressRows.filter((_: any, i: number) => i !== ri), progressRowIds: pd.progressRowIds.filter((_: any, i: number) => i !== ri) }))
    fetch('/api/project-row', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowId, pageId: selected?.id, kind: 'progress' }) })
      .then(() => fetchProjects())
  }

  // 從「最新進度回報」移除某案件（重算其最新進度標記；沒有紀錄就清空）
  async function dismissProgress(p: Project) {
    setProjects(prev => prev.map(x => x.id === p.id ? { ...x, latestProgress: '', latestProgressDate: '' } : x))
    try {
      await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, recomputeProgress: true }) })
    } finally { fetchProjects() }
  }

  // 直接變更專案狀態（例如標記完成）
  async function changeProjectStatus(status: string) {
    if (!selected) return
    setSelected({ ...selected, status })
    setProjects(prev => prev.map(p => p.id === selected.id ? { ...p, status } : p))
    try {
      await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, status }),
      })
    } finally { fetchProjects() }
  }

  // 刪除（封存）專案
  async function removeProject() {
    if (!selected) return
    if (!window.confirm(`確定要刪除專案「${selected.name}」嗎？（會在 Notion 封存此專案）`)) return
    const id = selected.id
    setProjects(prev => prev.filter(p => p.id !== id))
    setSelected(null)
    setView('list')
    try {
      await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } finally { fetchProjects() }
  }

  async function submitProgress() {
    if (!selected || !desc.trim()) return
    setSubmitting(true)
    setSubmitMsg('')
    setSubmitOk(false)
    try {
      const r = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selected.id, date, description: desc, newStatus: progressStatus || undefined }),
      })
      const data = await readJson(r)
      if (r.ok) {
        setSubmitMsg('進度已寫入 Notion ✓')
        setSubmitOk(true)
        setDesc('')
        setProgressStatus('')
        fetchProjects()
        refreshProjectDetail()
      } else {
        setSubmitMsg('錯誤：' + (data.error ?? '未知錯誤'))
        setSubmitOk(false)
      }
    } finally { setSubmitting(false) }
  }

  async function submitItem() {
    if (!selected || !itemName.trim()) return
    setSubmitting(true)
    setSubmitMsg('')
    setSubmitOk(false)
    try {
      const r = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'item', pageId: selected.id, item: itemName, content: itemContent, spec: itemSpec, qty: itemQty, unit: itemUnit, note: itemNote }),
      })
      const data = await readJson(r)
      if (r.ok) {
        setSubmitMsg('品項已寫入 Notion ✓')
        setSubmitOk(true)
        setItemName('')
        setItemContent('')
        setItemSpec('')
        setItemQty('')
        setItemUnit('')
        setItemNote('')
      } else {
        setSubmitMsg('錯誤：' + (data.error ?? '未知錯誤'))
        setSubmitOk(false)
      }
    } finally { setSubmitting(false) }
  }

  async function doSearch() {
    if (!searchQ.trim()) return
    setSearching(true)
    setSearchDetail(null)
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQ }),
      })
      const data = await readJson(r)
      setSearchProjectResults(data.projects ?? [])
      setSearchTaskResults(data.tasks ?? [])
      setDailyTaskResults(data.dailyTasks ?? [])
    } finally { setSearching(false) }
  }

  async function fetchInProgress(activeOnly = true) {
    try {
      const r = await fetch(`/api/daily-tasks${activeOnly ? '?activeOnly=1' : ''}`)
      const data = await readJson(r)
      // 預設只抓進行中（在 Notion 端就篩掉完成／已封存，避免每次都掃全部歷史資料變慢）；
      // 點「顯示已完成」才會改抓全部
      setInProgressTasks((data.all ?? []).filter((t: DailyTask) => t.status !== '已封存'))
    } catch {}
  }

  async function loadPersonTasks(person: string) {
    setPersonTasksLoading(true)
    setPersonTasks([])
    try {
      const r = await fetch(`/api/daily-tasks?person=${encodeURIComponent(person)}`)
      const data = await readJson(r)
      setPersonTasks(data.tasks ?? [])
    } catch {} finally { setPersonTasksLoading(false) }
  }

  async function loadDetail(p: { id: string }) {
    setSearching(true)
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: p.id }),
      })
      setSearchDetail(await readJson(r))
    } finally { setSearching(false) }
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setImgPreview(file.type === 'application/pdf' ? `pdf:${file.name}` : dataUrl)
      setAnalyzing(true)
      setAnalyzed(null)
      const base64 = dataUrl.split(',')[1]
      const mediaType = file.type || 'image/jpeg'
      try {
        const r = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mediaType }),
        })
        setAnalyzed(await readJson(r))
      } finally { setAnalyzing(false) }
    }
    reader.readAsDataURL(file)
  }

  async function handleItemImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setItemImgPreview(file.type === 'application/pdf' ? `pdf:${file.name}` : dataUrl)
      setItemAnalyzing(true)
      setItemAnalyzed(null)
      const base64 = dataUrl.split(',')[1]
      const mediaType = file.type || 'image/jpeg'
      try {
        const r = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mediaType, type: 'item' }),
        })
        const data = await readJson(r)
        if (Array.isArray(data) && data.length > 0) {
          setItemList(prev => [...prev, ...data.map(d => ({
            item: d.item ?? '', content: d.content ?? '', spec: d.spec ?? '',
            qty: d.qty ?? '', unit: d.unit ?? '', note: d.note ?? '',
          }))])
        } else {
          setSubmitMsg('未從圖片辨識出品項，可手動新增')
          setSubmitOk(false)
        }
      } finally { setItemAnalyzing(false) }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function updateItemRow(i: number, field: string, value: string) {
    setItemList(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }
  function removeItemRow(i: number) {
    setItemList(prev => prev.filter((_, idx) => idx !== i))
  }

  // 一次寫入所有品項到目前專案
  async function submitItemBatch() {
    if (!selected) return
    const items = itemList.filter(it => (it.item ?? '').trim())
    if (items.length === 0) return
    setSubmitting(true)
    setSubmitMsg('')
    setSubmitOk(false)
    try {
      const r = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'items', pageId: selected.id, items }),
      })
      const data = await readJson(r)
      if (r.ok) {
        setSubmitMsg(`已寫入 ${data.written ?? items.length} 筆品項 ✓`)
        setSubmitOk(true)
        setItemList([])
        refreshProjectDetail()
      } else {
        setSubmitMsg('錯誤：' + (data.error ?? '寫入失敗'))
        setSubmitOk(false)
      }
    } catch (e: any) {
      setSubmitMsg('錯誤：' + e.message)
      setSubmitOk(false)
    } finally { setSubmitting(false) }
  }

  function applyItemAnalyzed(row: any) {
    setItemName(row.item ?? '')
    setItemContent(row.content ?? '')
    setItemSpec(row.spec ?? '')
    setItemQty(row.qty ?? '')
    setItemUnit(row.unit ?? '')
    setItemNote(row.note ?? '')
    setItemAnalyzed(null)
    setItemImgPreview('')
  }

  async function fetchDailyTasks() {
    setDailyLoading(true)
    try {
      const r = await fetch('/api/daily-tasks')
      const data = await readJson(r)
      const all: DailyTask[] = data.all ?? []
      setDailyAll(all)
      const dates = Array.from(new Set(all.map(t => t.date).filter(Boolean))).sort().reverse()
      setSelectedDate(prev => (prev && dates.includes(prev)) ? prev : (dates[0] ?? todayISO()))
    } finally { setDailyLoading(false) }
  }

  async function organizePlaud() {
    if (!plaudText.trim()) return
    setOrganizing(true)
    setOrganizeMsg('')
    setOrganizeOk(false)
    try {
      const r = await fetch('/api/organize-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plaudText, sendLine }),
      })
      const data = await readJson(r)
      if (r.ok && (data.count > 0 || data.pendingCount > 0)) {
        const lineNote = data.line?.ok ? '，已發送 LINE ✓'
          : data.line?.skipped ? '（LINE 未設定，略過）'
          : data.line?.error ? `（LINE 發送失敗：${data.line.error}）` : ''
        const pendingNote = data.pendingCount > 0 ? `，另有 ${data.pendingCount} 項待確認負責人` : ''
        setOrganizeMsg(`已整理 ${data.count} 筆工作項目並寫入 Notion ✓${pendingNote}${lineNote}`)
        setOrganizeOk(true)
        setPlaudText('')
        fetchDailyTasks()
      } else {
        setOrganizeMsg('錯誤：' + (data.error ?? '無法整理'))
        setOrganizeOk(false)
      }
    } finally { setOrganizing(false) }
  }

  // 拖拉換負責人
  async function sendWeeklyReminder() {
    setSendingReminder(true)
    setReminderMsg('')
    setReminderOk(false)
    try {
      const r = await fetch('/api/cron/weekly-reminder')
      const data = await readJson(r)
      if (r.ok && data.ok) {
        setReminderMsg('已發送週報提醒到 LINE ✓')
        setReminderOk(true)
      } else {
        setReminderMsg('發送失敗：' + (data.error ?? '未知錯誤'))
        setReminderOk(false)
      }
    } finally { setSendingReminder(false) }
  }

  async function reassignTask(taskId: string, newPerson: string) {
    setDailyAll(prev => prev.map(t => t.id === taskId ? { ...t, person: newPerson } : t))
    await fetch('/api/daily-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, person: newPerson, date: selectedDate }),
    })
    fetchDailyTasks()
  }

  const FREQ_CYCLE = ['當日', '每周', '每月']

  // 切換狀態（optimistic）
  async function cycleStatus(t: DailyTask) {
    const idx = DAILY_STATUS_CYCLE.indexOf(t.status)
    const next = DAILY_STATUS_CYCLE[(idx + 1) % DAILY_STATUS_CYCLE.length]
    setDailyAll(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x))
    fetch('/api/daily-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, status: next, date: selectedDate }),
    })
  }

  // 切換頻率（optimistic）
  async function cycleFreq(t: DailyTask) {
    const idx = FREQ_CYCLE.indexOf(t.freq ?? '當日')
    const next = FREQ_CYCLE[(idx + 1) % FREQ_CYCLE.length]
    setDailyAll(prev => prev.map(x => x.id === t.id ? { ...x, freq: next } : x))
    fetch('/api/daily-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, freq: next, date: selectedDate }),
    })
  }

  // 編輯任務文字（optimistic）
  async function saveEdit(taskId: string) {
    const newText = editText.trim()
    setEditingId(null)
    setEditText('')
    if (newText) {
      setDailyAll(prev => prev.map(x => x.id === taskId ? { ...x, task: newText } : x))
      setInProgressTasks(prev => prev.map(x => x.id === taskId ? { ...x, task: newText } : x))
      setPrivatePersonTasks(prev => prev.map(x => x.id === taskId ? { ...x, task: newText } : x))
      fetch('/api/daily-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, task: newText, date: selectedDate }),
      })
    }
  }

  // 更新截止日期
  async function saveDueDate(taskId: string) {
    const newDate = editDueDateText.trim()
    setEditingDueDateId(null)
    setEditDueDateText('')
    if (!newDate) return
    setDailyAll(prev => prev.map(x => x.id === taskId ? { ...x, date: newDate } : x))
    setInProgressTasks(prev => prev.map(x => x.id === taskId ? { ...x, date: newDate } : x))
    fetch('/api/daily-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, dueDate: newDate }),
    })
  }

  // 更新案件負責人
  async function changeProjectAssignee(assignee: string) {
    if (!selected) return
    setSelected({ ...selected, assignee })
    setProjects(prev => prev.map(p => p.id === selected.id ? { ...p, assignee } : p))
    fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, assignee }),
    })
  }

  // AI 助理：送出訊息
  async function sendChat(override?: string) {
    const text = (override ?? chatInput).trim()
    if (!text || chatLoading) return
    // 點了某則答案的追問按鈕 → 清掉那些按鈕，避免重複點
    const base = override ? chatMessages.map(m => m.suggestions ? { ...m, suggestions: undefined } : m) : chatMessages
    const next: ChatMsg[] = [...base, { role: 'user', content: text, _ts: Date.now() } as any]
    setChatMessages(next)
    setChatInput('')
    setChatLoading(true)
    try {
      // 附上進行中的專案清單（id+名稱），讓後端判斷「要記進度」時能對應到專案
      const activeProjects = projects.filter(p => !INACTIVE_STATUSES.includes(p.status)).map(p => ({ id: p.id, name: p.name }))
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, projects: activeProjects }),
      })
      const data = await readJson(r)
      const reply = r.ok ? (data.reply || '（沒有回覆）') : ('錯誤：' + (data.error ?? '回覆失敗'))
      const files: FileResult[] = r.ok ? (data.files ?? []) : []
      const draft: ProgressDraft | undefined = r.ok ? data.progressDraft : undefined
      const suggestions: string[] = r.ok && !draft ? (data.suggestions ?? []) : []
      setChatMessages([...next, { role: 'assistant', content: reply, files, draft, suggestions }])
    } catch (e: any) {
      setChatMessages([...next, { role: 'assistant', content: '錯誤：' + e.message }])
    } finally { setChatLoading(false) }
  }

  // 聊天室裡確認新增進度：把草稿寫入指定專案的 Notion 進度紀錄
  async function confirmChatProgress(msgIndex: number, draft: ProgressDraft, pageId: string, projName: string) {
    // 日期轉成 YYYY-MM-DD（progress API 用的格式）
    const dateISO = draft.date.replace(/\//g, '-')
    setChatMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, draftDone: true, content: `⏳ 正在把進度寫入【${projName}】…` } : m))
    try {
      const r = await fetch('/api/progress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, date: dateISO, description: draft.description }),
      })
      const data = await readJson(r)
      const ok = r.ok
      setChatMessages(prev => prev.map((m, i) => i === msgIndex
        ? { ...m, draftDone: true, draft: undefined, content: ok
            ? `✅ 已把進度記到【${projName}】\n・日期：${draft.date}\n・內容：${draft.description}`
            : `❌ 寫入失敗：${data.error ?? '未知錯誤'}` }
        : m))
      if (ok) { fetchProjects(); if (selected?.id === pageId) refreshProjectDetail() }
    } catch (e: any) {
      setChatMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, draftDone: true, content: `❌ 寫入失敗：${e.message}` } : m))
    }
  }
  function cancelChatProgress(msgIndex: number) {
    setChatMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, draft: undefined, draftDone: true, content: '好的，這筆進度沒有記錄。有需要再跟我說 🙂' } : m))
  }

  // 同步知識庫（處理 Notion 知識庫中「待處理」的項目）
  async function syncKnowledge() {
    setKbSyncing(true)
    setKbMsg('')
    setKbOk(false)
    let totalOk = 0
    let totalProcessed = 0
    const allFails: any[] = []
    try {
      // 自動分批：每次後端只跑一小段，前端連續呼叫直到全部處理完
      for (let round = 0; round < 100; round++) {
        const r = await fetch('/api/knowledge/sync', { method: 'POST' })
        const raw = await r.text()
        let data: any
        try { data = JSON.parse(raw) } catch {
          setKbMsg(`已處理 ${totalOk} 筆；伺服器忙碌中斷，請再按一次「同步」接續剩下的`)
          setKbOk(false)
          return
        }
        if (!r.ok) {
          setKbMsg('錯誤：' + (data.error ?? '同步失敗'))
          setKbOk(false)
          return
        }
        totalProcessed += data.processed
        totalOk += data.success
        ;(data.results ?? []).filter((x: any) => !x.ok).forEach((x: any) => allFails.push(x))
        if (data.more) {
          setKbMsg(`處理中... 已完成 ${totalOk} 筆，還有約 ${data.remaining} 筆`)
        } else {
          break
        }
      }
      // 接著同步 SOP知識庫：讀內文、產生「檢索摘要」讓搜尋更準（也是分批）
      let sopDone = 0
      for (let round = 0; round < 100; round++) {
        setKbMsg(`檔案庫完成，正在同步 SOP知識庫...（已處理 ${sopDone} 筆）`)
        const r = await fetch('/api/knowledge/sync-sop', { method: 'POST' })
        const raw = await r.text()
        let data: any
        try { data = JSON.parse(raw) } catch {
          setKbMsg(`檔案庫 ${totalOk} 筆已完成；SOP 同步中斷，請再按一次「同步」接續`); setKbOk(false); return
        }
        if (!r.ok) { setKbMsg('SOP 同步錯誤：' + (data.error ?? '失敗')); setKbOk(false); return }
        sopDone += data.processed
        if (!data.more) break
      }

      if (totalProcessed === 0 && sopDone === 0) {
        setKbMsg('沒有待處理的項目（檔案庫與 SOP知識庫都是最新的）')
        setKbOk(true)
      } else {
        const sopMsg = sopDone > 0 ? `；SOP知識庫 產生 ${sopDone} 筆檢索摘要` : ''
        setKbMsg(`完成：檔案庫成功 ${totalOk} 筆${allFails.length ? `；失敗 ${allFails.length} 筆：${allFails.map((x: any) => `${x.title}(${x.error})`).join('、')}` : ''}${sopMsg} ✓`)
        setKbOk(allFails.length === 0)
      }
    } catch (e: any) {
      setKbMsg('錯誤：' + e.message)
      setKbOk(false)
    } finally { setKbSyncing(false) }
  }

  // 把既有知識庫內容在 Notion 內重新整理成「切塊」（分批連續呼叫直到全部完成）
  async function rechunkKnowledge() {
    setKbSyncing(true); setKbMsg(''); setKbOk(false)
    let totalChunked = 0
    try {
      for (let round = 0; round < 100; round++) {
        const r = await fetch('/api/knowledge/rechunk', { method: 'POST' })
        const raw = await r.text()
        let data: any
        try { data = JSON.parse(raw) } catch {
          setKbMsg(`已整理 ${totalChunked} 筆；伺服器忙碌中斷，請再按一次「整理切塊」接續`)
          setKbOk(false); return
        }
        if (!r.ok) { setKbMsg('錯誤：' + (data.error ?? '整理失敗')); setKbOk(false); return }
        totalChunked += data.chunked ?? 0
        if (data.more) {
          setKbMsg(`整理中... 已切塊 ${totalChunked} 筆，還有約 ${data.remaining} 筆`)
        } else {
          setKbMsg(`切塊整理完成：這次新整理 ${totalChunked} 筆 ✓（已切塊過的自動略過）`)
          setKbOk(true); return
        }
      }
    } catch (e: any) {
      setKbMsg('錯誤：' + e.message); setKbOk(false)
    } finally { setKbSyncing(false) }
  }

  // 開啟/關閉任務詳情面板
  function toggleDetail(t: DailyTask) {
    if (detailId === t.id) { setDetailId(null); setSaveDetailOk(false); setSaveDetailErr(''); return }
    setDetailId(t.id)
    setDetailContent(t.content ?? '')
    setDetailDirection(t.direction ?? '')
    setDetailAttachments(t.attachments ?? [])
    setSaveDetailOk(false)
    setSaveDetailErr('')
  }

  // 手動切換紅標（急件）：on=強制紅、off=強制不紅
  function toggleFlag(t: DailyTask) {
    const nextFlag = effectiveFlagged(t) ? 'off' : 'on'
    setDailyAll(prev => prev.map(x => x.id === t.id ? { ...x, flag: nextFlag } : x))
    setInProgressTasks(prev => prev.map(x => x.id === t.id ? { ...x, flag: nextFlag } : x))
    setDailyTaskResults(prev => prev.map(x => x.id === t.id ? { ...x, flag: nextFlag } : x))
    fetch('/api/daily-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, flag: nextFlag }) })
  }

  // 切換子步驟（checklist）完成狀態
  function toggleTaskStep(t: DailyTask, stepIdx: number) {
    const nextSteps = (t.steps ?? []).map((s, i) => i === stepIdx ? { ...s, done: !s.done } : s)
    setDailyAll(prev => prev.map(x => x.id === t.id ? { ...x, steps: nextSteps } : x))
    setInProgressTasks(prev => prev.map(x => x.id === t.id ? { ...x, steps: nextSteps } : x))
    fetch('/api/daily-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, steps: nextSteps }) })
  }

  // 儲存任務詳情（內容 / 進度方向 / 附件）
  async function saveDetail(taskId: string) {
    setSavingDetail(true)
    setSaveDetailOk(false)
    setSaveDetailErr('')
    setDailyAll(prev => prev.map(x => x.id === taskId ? { ...x, content: detailContent, direction: detailDirection, attachments: detailAttachments } : x))
    setInProgressTasks(prev => prev.map(x => x.id === taskId ? { ...x, content: detailContent, direction: detailDirection, attachments: detailAttachments } : x))
    try {
      const r = await fetch('/api/daily-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, content: detailContent, direction: detailDirection, attachments: detailAttachments }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setSaveDetailErr(d.error ?? '儲存失敗，請檢查 Notion 欄位是否存在')
      } else {
        setSaveDetailOk(true)
        setTimeout(() => setSaveDetailOk(false), 2000)
      }
    } catch (e: any) {
      setSaveDetailErr(e.message ?? '網路錯誤')
    } finally { setSavingDetail(false) }
  }

  // 上傳附件到 Vercel Blob，回傳 URL
  async function uploadTaskFile(file: File): Promise<TaskAttachment | null> {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await readJson(r)
      if (!r.ok) { alert('上傳失敗：' + (data.error ?? '未知錯誤')); return null }
      return { name: data.name, url: data.url }
    } catch (e: any) {
      alert('上傳失敗：' + e.message)
      return null
    } finally { setUploading(false) }
  }

  // 刪除任務（optimistic）
  async function deleteTask(taskId: string) {
    setDailyAll(prev => prev.filter(x => x.id !== taskId))
    setInProgressTasks(prev => prev.filter(x => x.id !== taskId))
    if (detailId === taskId) setDetailId(null)
    fetch('/api/daily-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, date: selectedDate }),
    })
  }

  // 新增專案：上傳圖片 → 辨識品項 → 自動填入品項列
  async function handleCreateItemImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setNewItemAnalyzing(true)
      const base64 = dataUrl.split(',')[1]
      const mediaType = file.type || 'image/jpeg'
      try {
        const r = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mediaType, type: 'item' }),
        })
        const data = await readJson(r)
        if (Array.isArray(data) && data.length > 0) {
          setNewItems(prev => [...prev, ...data.map(d => ({
            item: d.item ?? '', content: d.content ?? '', spec: d.spec ?? '',
            qty: d.qty ?? '', unit: d.unit ?? '', note: d.note ?? '',
          }))])
        } else {
          setCreateMsg('圖片未辨識出品項，可手動新增')
          setCreateOk(false)
        }
      } catch (err: any) {
        setCreateMsg('辨識失敗：' + err.message)
        setCreateOk(false)
      } finally { setNewItemAnalyzing(false) }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function updateNewItem(i: number, field: string, value: string) {
    setNewItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }
  function removeNewItem(i: number) {
    setNewItems(prev => prev.filter((_, idx) => idx !== i))
  }

  async function submitCreateProject() {
    if (!newName.trim()) return
    setCreating(true)
    setCreateMsg('')
    setCreateOk(false)
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, contact: newContact, address: newAddress, status: newStatus }),
      })
      const data = await readJson(r)
      if (r.ok) {
        // 建立成功後，把品項一次全部寫入該專案
        const items = newItems.filter(it => (it.item ?? '').trim())
        let written = 0
        if (items.length > 0) {
          try {
            const ir = await fetch('/api/progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'items', pageId: data.id, items }),
            })
            const idata = await readJson(ir)
            if (ir.ok) written = idata.written ?? items.length
          } catch {}
        }
        setCreateMsg(`專案已建立 ✓${items.length ? `，寫入 ${written}/${items.length} 筆品項` : ''}`)
        setCreateOk(true)
        setNewName('')
        setNewContact('')
        setNewAddress('')
        setNewStatus('報價中')
        setNewItems([])
        fetchProjects()
      } else {
        setCreateMsg('錯誤：' + (data.error ?? '未知錯誤'))
        setCreateOk(false)
      }
    } finally { setCreating(false) }
  }

  // 任務詳情面板（今日工作 / 任務查詢 共用）
  function renderTaskDetail(t: DailyTask) {
    return (
      <div className="mt-1 ml-1.5 mr-1 mb-2 p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
        <div>
          <input ref={taskFileRef} type="file" multiple className="hidden"
            onChange={async e => {
              const files = Array.from(e.target.files ?? [])
              for (const f of files) {
                const att = await uploadTaskFile(f)
                if (att) setDetailAttachments(prev => [...prev, att])
              }
              if (taskFileRef.current) taskFileRef.current.value = ''
            }} />
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-xs text-gray-500">任務內容</label>
            <button onClick={() => taskFileRef.current?.click()} disabled={uploading}
              className="text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded px-2 py-0.5 disabled:opacity-40">
              {uploading ? '上傳中...' : '📎 新增附件'}
            </button>
          </div>
          <textarea value={detailContent} onChange={e => setDetailContent(e.target.value)} rows={3}
            placeholder="這個任務的背景、細節、目前狀況..."
            className="w-full mt-0.5 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none" />
          {detailAttachments.length > 0 && (
            <div className="mt-1 space-y-1">
              {detailAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded px-2 py-1">
                  <span className="text-xs text-indigo-600 flex-1 truncate">📎 {att.name}</span>
                  <a href={att.url} download={att.name} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-500 hover:underline shrink-0">下載</a>
                  <button onClick={() => setDetailAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="text-xs text-gray-300 hover:text-red-400 shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => saveDetail(t.id)} disabled={savingDetail}
            className="aurora-grad text-white shadow-sm rounded px-3 py-1 text-xs font-medium hover:brightness-105 disabled:opacity-40">
            {savingDetail ? '儲存中...' : '儲存'}
          </button>
          {saveDetailOk && <span className="text-xs text-green-600 font-medium">✓ 已儲存</span>}
          {saveDetailErr && <span className="text-xs text-red-500">{saveDetailErr}</span>}
          <button onClick={() => { setDetailId(null); setSaveDetailOk(false); setSaveDetailErr('') }} className="text-xs text-gray-400 hover:text-gray-600 px-1">關閉</button>
        </div>
      </div>
    )
  }

  // 導覽項目：電腦版側欄與手機版底部導覽共用（label 給側欄、short 給底部列）
  const NAV_ITEMS: { v: View; icon: string; label: string; short: string; onClick: () => void }[] = [
    { v: 'dashboard', icon: '📊', label: '總覽', short: '總覽', onClick: () => { setView('dashboard'); fetchProjects(); fetchDailyTasks() } },
    { v: 'list', icon: '📋', label: '案件清單', short: '案件', onClick: () => setView('list') },
    { v: 'daily', icon: '✅', label: '今日工作', short: '今日', onClick: () => { setView('daily'); fetchDailyTasks() } },
    { v: 'search', icon: '🔍', label: '任務查詢', short: '查詢', onClick: () => { setView('search'); fetchInProgress() } },
    { v: 'chat', icon: '💬', label: 'AI 助理', short: 'AI', onClick: () => setView('chat') },
    { v: 'training', icon: '📚', label: '教育訓練', short: '培訓', onClick: () => { setView('training'); fetchTrainingCourses() } },
    ...(isAdmin ? [{ v: 'private' as View, icon: '🔐', label: '私人行事曆', short: '私人', onClick: () => { setView('private'); fetchPrivateEvents(); fetchPrivatePersonTasks() } }] : []),
  ]

  // 側欄底部小卡：本週完成率（用真實任務資料計算，非假數字）
  const wkNow = new Date(Date.now() + 8 * 3600 * 1000)
  const wkMon = new Date(wkNow); wkMon.setUTCDate(wkNow.getUTCDate() - ((wkNow.getUTCDay() + 6) % 7))
  const wkStart = wkMon.toISOString().slice(0, 10)
  const wkSun = new Date(wkMon); wkSun.setUTCDate(wkMon.getUTCDate() + 6)
  const wkEnd = wkSun.toISOString().slice(0, 10)
  const wkTasks = dailyAll.filter(t => t.date >= wkStart && t.date <= wkEnd)
  const wkDone = wkTasks.filter(t => t.status === '完成').length
  const wkRate = wkTasks.length ? Math.round((wkDone / wkTasks.length) * 100) : 0

  return (
    <div className="min-h-screen relative">
      {/* 背景極光光暈層（固定、不擋點擊） */}
      <div className="aurora-bg" aria-hidden="true">
        <span className="orb orb1" />
        <span className="orb orb2" />
        <span className="orb orb3" />
        <span className="orb orb4" />
      </div>
      {/* 電腦版：左側固定側欄（手機隱藏，手機改用底部導覽列） */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[246px] z-20 flex-col px-[18px] py-[26px] border-r"
        style={{ background: 'var(--glass-2)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderColor: 'var(--hairline)' }}>
        {/* logo */}
        <div className="flex items-center gap-2.5 px-2 mb-6">
          <div className="w-9 h-9 rounded-xl aurora-grad text-white flex items-center justify-center text-base font-bold">煌</div>
          <div className="leading-tight">
            <p className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>煌盛專案</p>
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>施工進度回報</p>
          </div>
        </div>
        {/* 導覽項 */}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(item => {
            const on = view === item.v
            return (
              <button key={item.v} onClick={item.onClick} data-tour={`nav-${item.v}`}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${on ? '' : 'hover:bg-[rgba(120,130,170,0.10)]'}`}
                style={{ background: on ? 'rgba(110,168,254,0.14)' : undefined, color: on ? '#4a7fd6' : 'var(--text-2)', fontWeight: on ? 700 : 500 }}>
                <span className="text-base leading-none" style={{ filter: on ? 'none' : 'grayscale(.4) opacity(.7)' }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>
        {/* 底部：本週完成率 + 帳號列 */}
        <div className="mt-auto pt-4 space-y-2.5">
          <div className="rounded-xl p-3" style={{ background: 'rgba(120,130,170,0.08)' }}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>本週完成率</span>
              <span className="text-sm font-bold mono-num" style={{ color: 'var(--st-done)' }}>{wkRate}%</span>
            </div>
            <div className="pg-track">
              <div className="pg-fill" style={{ width: `${wkRate}%`, background: 'var(--st-done)' }}><span className="shine" /></div>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-3)' }}>{wkDone}/{wkTasks.length} 項工作</p>
          </div>
          {/* 新手教學：一步步引導認識每個功能 */}
          <button onClick={() => setTourStep(0)}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors hover:bg-[rgba(110,168,254,0.12)]"
            style={{ color: '#4a7fd6', background: 'rgba(110,168,254,0.10)' }}>
            <span>🎓</span><span>新手教學</span><span className="ml-auto" style={{ color: 'var(--text-3)' }}>引導導覽 ›</span>
          </button>
          {isAdmin ? (
            <button onClick={doLogout}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors hover:bg-[rgba(120,130,170,0.10)]"
              style={{ color: 'var(--text-2)' }}>
              <span>👷 管理者</span><span style={{ color: 'var(--text-3)' }}>登出</span>
            </button>
          ) : (
            <button onClick={() => { setShowLogin(true); setLoginErr('') }}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors hover:bg-[rgba(120,130,170,0.10)]"
              style={{ color: 'var(--text-2)' }}>
              <span>🔒 管理者登入</span><span style={{ color: 'var(--text-3)' }}>›</span>
            </button>
          )}
        </div>
      </aside>

      {/* 手機版：頂部列（電腦版由側欄取代） */}
      <header className="md:hidden sticky top-0 z-20 backdrop-blur-xl border-b px-4 py-2.5 flex items-center gap-3" style={{ background: 'var(--glass-2)', borderColor: 'var(--hairline)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg aurora-grad text-white flex items-center justify-center text-sm font-bold shadow-sm">煌</div>
          <div className="text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>專案進度管理</div>
        </div>
        <button onClick={() => setTourStep(0)} title="新手教學"
          className="ml-auto text-xs rounded-lg px-2 py-1.5 font-semibold" style={{ color: '#4a7fd6', background: 'rgba(110,168,254,0.12)' }}>🎓 教學</button>
        {isAdmin ? (
          <button onClick={doLogout} title="登出管理者"
            className="text-xs border rounded-lg px-2 py-1.5" style={{ color: 'var(--text-3)', borderColor: 'var(--hairline)' }}>登出</button>
        ) : (
          <button onClick={() => { setShowLogin(true); setLoginErr('') }} title="管理者登入"
            className="text-xs border rounded-lg px-2 py-1.5" style={{ color: 'var(--text-2)', borderColor: 'var(--hairline)' }}>🔒 登入</button>
        )}
      </header>

      {/* 管理者登入視窗 */}
      {showLogin && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowLogin(false)}>
          <form className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); doLogin() }}>
            <p className="text-base font-semibold text-gray-900 mb-1">管理者登入</p>
            <p className="text-xs text-gray-400 mb-4">登入後可管理只有你看得到的私人行事曆</p>
            <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="帳號" autoFocus={!loginUser}
              name="username" autoComplete="username"
              className="w-full mb-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            <input value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="密碼" type="password"
              name="password" autoComplete="current-password" autoFocus={!!loginUser}
              className="w-full mb-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            {loginErr && <p className="text-xs text-red-500 mb-2">{loginErr}</p>}
            <div className="flex gap-2 mt-2">
              <button type="submit" disabled={loginLoading}
                className="flex-1 aurora-grad text-white rounded-lg py-2 text-sm font-medium hover:brightness-105 disabled:opacity-40">
                {loginLoading ? '登入中…' : '登入'}
              </button>
              <button type="button" onClick={() => setShowLogin(false)} className="px-3 text-sm text-gray-400 hover:text-gray-600">取消</button>
            </div>
          </form>
        </div>
      )}

      {/* 新增／編輯行程表單 */}
      {showEventForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowEventForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900 mb-4">{evId ? '編輯行程' : '新增行程'}</p>
            <label className="text-xs text-gray-500">內容</label>
            <input value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="行程內容" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveEventForm() }}
              className="w-full mt-0.5 mb-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            <div className="mb-1">
              <label className="text-xs text-gray-500">日期</label>
              <input type="date" value={evDate} onChange={e => setEvDate(e.target.value)}
                className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
            <div className="flex gap-2 mb-1 mt-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500">開始時間</label>
                <input type="time" value={evTime} onChange={e => setEvTime(e.target.value)}
                  className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">截止時間</label>
                <input type="time" value={evEndTime} onChange={e => setEvEndTime(e.target.value)} disabled={!evTime}
                  className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-300" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">開始時間留空＝全天行程；截止時間留空＝預設開始後 1 小時</p>
            <div className="flex items-center gap-2">
              <button onClick={saveEventForm} disabled={evSaving || !evTitle.trim()}
                className="flex-1 aurora-grad text-white rounded-lg py-2 text-sm font-medium hover:brightness-105 disabled:opacity-40">
                {evSaving ? '儲存中…' : '儲存'}
              </button>
              {evId && <button onClick={deleteEventForm} className="text-xs text-red-500 hover:text-red-600 border border-red-200 rounded-lg px-2.5 py-2">刪除</button>}
              <button onClick={() => setShowEventForm(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 新增／編輯 Alen 任務表單 */}
      {showPrivateTaskForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowPrivateTaskForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
            <p className="text-base font-semibold text-gray-900 mb-4">{ptTaskId ? '編輯任務' : `新增 ${PRIVATE_PERSON_LABEL} 的工作項目`}</p>
            <label className="text-xs text-gray-500">任務內容</label>
            <input value={ptTaskText} onChange={e => setPtTaskText(e.target.value)} placeholder="工作項目內容" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') savePrivateTaskForm() }}
              className="w-full mt-0.5 mb-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            <label className="text-xs text-gray-500">截止日期</label>
            <input type="date" value={ptTaskDate} onChange={e => setPtTaskDate(e.target.value)}
              className="w-full mt-0.5 mb-4 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            <div className="flex items-center gap-2">
              <button onClick={savePrivateTaskForm} disabled={addingPrivateTask || !ptTaskText.trim()}
                className="flex-1 aurora-grad text-white rounded-lg py-2 text-sm font-medium hover:brightness-105 disabled:opacity-40">
                {addingPrivateTask ? '儲存中…' : '儲存'}
              </button>
              <button onClick={() => setShowPrivateTaskForm(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2">取消</button>
            </div>
          </div>
        </div>
      )}

      <div className="md:pl-[246px]">
      <main className={`relative z-10 mx-auto p-4 pb-24 md:px-[34px] md:pt-[26px] md:pb-10 animate-fade-in ${view === 'dashboard' || view === 'private' || view === 'daily' ? 'max-w-[1300px]' : view === 'search' ? 'max-w-4xl' : view === 'chat' || view === 'training' ? 'max-w-3xl' : 'max-w-2xl'}`}>

        {/* DASHBOARD */}
        {view === 'dashboard' && (() => {
          const today = todayISO()
          const now = new Date(Date.now() + 8 * 3600 * 1000)
          const dow = now.getUTCDay()
          const mon = new Date(now); mon.setUTCDate(now.getUTCDate() - ((dow + 6) % 7))
          const weekStart = mon.toISOString().slice(0, 10)
          const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
          const weekEnd = sun.toISOString().slice(0, 10)
          const active = (t: DailyTask) => t.status !== '完成' && t.status !== '已封存'
          const todayTasks = dailyAll.filter(t => t.date === today && active(t))
          const overdue = dailyAll.filter(t => t.date && t.date < today && active(t)).sort((a, b) => a.date.localeCompare(b.date))
          const weekTasks = dailyAll.filter(t => t.date >= weekStart && t.date <= weekEnd)
          const weekDone = weekTasks.filter(t => t.status === '完成' || t.status === '已封存')
          const rate = weekTasks.length ? Math.round(weekDone.length / weekTasks.length * 100) : 0
          const byStatus: Record<string, number> = {}
          for (const p of projects) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
          const statusList = Object.entries(byStatus).sort((a, b) => b[1] - a[1])
          // 最新進度回報卡片（寬螢幕時放到右側灰色區）
          const nowP = new Date(Date.now() + 8 * 3600 * 1000)
          const cutP = new Date(nowP); cutP.setUTCDate(nowP.getUTCDate() - 2)
          const cutPStr = cutP.toISOString().slice(0, 10)
          const recentProg = projects
            .filter(p => p.latestProgress && p.latestProgressDate && p.latestProgressDate >= cutPStr)
            .sort((a, b) => (b.latestProgressDate ?? '').localeCompare(a.latestProgressDate ?? ''))
          const recentProgressCard = (
            <div className="glass-card p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">最新進度回報 {recentProg.length > 0 && <span className="text-emerald-500">({recentProg.length})</span>}</p>
              {recentProg.length === 0 ? (
                <p className="text-sm text-gray-400">近兩天尚無進度回報</p>
              ) : (
                <div className="space-y-2">
                  {recentProg.map(p => (
                    <div key={p.id} className="group w-full flex items-start gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-emerald-50/60 transition-colors">
                      <button onClick={() => selectProject(p)} className="flex items-start gap-2 flex-1 min-w-0 text-left">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0 mt-0.5">{p.latestProgressDate?.slice(5)}</span>
                        {p.color && <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ background: p.color }} />}
                        <span className="font-medium text-gray-800 shrink-0">{p.name}</span>
                        <span className="text-gray-500 flex-1 truncate">{p.latestProgress}</span>
                      </button>
                      <button onClick={() => dismissProgress(p)} title="移除此筆（清掉最新進度標記）"
                        className="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 leading-none px-1">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
          return (
            <div className="flex flex-col 2xl:flex-row gap-4 2xl:items-start">
            <div className="flex flex-col gap-4 flex-1 min-w-0">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button onClick={() => { setView('daily'); fetchDailyTasks() }} className="glass-card p-4 text-left hover:border-indigo-300 transition-colors">
                  <p className="text-xs text-gray-400">今日待辦</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{todayTasks.length}</p>
                </button>
                <button onClick={() => { setView('search'); fetchInProgress() }} className={`border rounded-xl shadow-sm p-4 text-left transition-colors ${overdue.length > 0 ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-white border-gray-200/70 hover:border-indigo-300'}`}>
                  <p className={`text-xs ${overdue.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>逾期任務</p>
                  <p className={`text-3xl font-bold mt-1 ${overdue.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdue.length}</p>
                </button>
                <div className="glass-card p-4">
                  <p className="text-xs text-gray-400">本週完成率</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{rate}<span className="text-lg">%</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">{weekDone.length}/{weekTasks.length} 項</p>
                </div>
                <button onClick={() => setView('list')} className="glass-card p-4 text-left hover:border-indigo-300 transition-colors">
                  <p className="text-xs text-gray-400">進行中案件</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{projects.filter(p => !INACTIVE_STATUSES.includes(p.status)).length}</p>
                </button>
              </div>

              {/* 各狀態案件數 */}
              <div className="glass-card p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">案件狀態分布</p>
                {statusList.length === 0 ? (
                  <p className="text-sm text-gray-400">尚無案件</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {statusList.map(([s, n]) => (
                      <button key={s} onClick={() => { setView('list'); setFilterStatus(s) }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium ${STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-600'} hover:opacity-80`}>
                        {s} <span className="opacity-70 ml-0.5">{n}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 最新進度回報卡片已依需求在此頁隱藏（recentProgressCard 保留供其他用途） */}

              {/* 流程排程表（單一表格，用顏色區分案件） */}
              {(() => {
                const [gy, gm] = ganttMonth.split('-').map(Number)
                const daysInMonth = new Date(gy, gm, 0).getDate()
                const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
                const todayStr = todayISO()
                const prevMon = () => { const d = new Date(gy, gm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
                const nextMon = () => { const d = new Date(gy, gm, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
                const activeProj = projects.filter(p => !INACTIVE_STATUSES.includes(p.status))
                const CELL_W = 36
                const NAME_W = 140

                // 建立每格「擁有者」對照（哪個案件佔用了這格），render 用
                const owners: Record<string, { pid: string; color: string; name: string; text: string }> = {}
                for (const p of activeProj) {
                  const s = parseGanttSchedule(p)
                  for (const k in s) owners[k] = { pid: p.id, color: p.color || '#AEC6E8', name: p.name, text: s[k] }
                }

                return (
                  <div className="order-first glass-card p-4" data-tour="schedule">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-base font-semibold text-gray-800">流程排程表</p>
                        <p className={`text-sm mt-0.5 ${ganttActiveProject ? 'text-gray-400' : 'text-amber-600 font-medium'}`}>
                          {ganttActiveProject ? '在日期格子上「點一下」標記單格，或「按住拖過去」標記多天；點已標記的同案件格子可清除' : '① 先點一下下面的「案件」色塊　②再到日期格子上「點一下」或「按住拖曳」即可標記'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setGanttMonth(prevMon())}
                          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 text-base flex items-center justify-center">‹</button>
                        <span className="text-base font-semibold text-gray-700 w-24 text-center">{gy}年{gm}月</span>
                        <button onClick={() => setGanttMonth(nextMon())}
                          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 text-base flex items-center justify-center">›</button>
                      </div>
                    </div>

                    {activeProj.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">目前無進行中案件</p>
                    ) : (
                      <>
                        {/* 案件色塊選取列 */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {activeProj.map(p => {
                            const sel = ganttActiveProject === p.id
                            return (
                              <button key={p.id}
                                onClick={() => setGanttActiveProject(sel ? null : p.id)}
                                className={`text-base px-4 py-2 rounded-full font-medium border transition-all ${sel ? 'ring-2 ring-offset-1 ring-indigo-400 border-transparent' : 'border-gray-200 hover:border-gray-400'}`}
                                style={{ background: sel ? (p.color || '#AEC6E8') : `${p.color || '#AEC6E8'}33`, color: sel ? '#1a1a1a' : '#555' }}>
                                <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle" style={{ background: p.color || '#AEC6E8' }} />
                                {p.name}
                              </button>
                            )
                          })}
                        </div>

                        <div className="overflow-x-auto -mx-1 px-1 select-none">
                          <table className="border-collapse w-full" style={{ minWidth: NAME_W + daysInMonth * CELL_W }}>
                            <thead>
                              <tr>
                                <th className="text-left text-sm font-medium text-gray-400 pb-2 pr-2" style={{ width: NAME_W, minWidth: NAME_W }}>流程</th>
                                {days.map(d => {
                                  const ds = `${ganttMonth}-${String(d).padStart(2,'0')}`
                                  const isToday = ds === todayStr
                                  const dow = new Date(ds).getDay()
                                  const isWknd = dow === 0 || dow === 6
                                  return (
                                    <th key={d} style={{ minWidth: CELL_W }}
                                      className={`text-center pb-2 text-sm font-semibold ${isToday ? 'text-indigo-600' : isWknd ? 'text-purple-400' : 'text-gray-500'}`}>
                                      {d}
                                    </th>
                                  )
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {PROCESS_STEPS.map((proc, procIdx) => (
                                ['AM', 'PM'].map((ampm, ai) => (
                                  <tr key={`${procIdx}-${ampm}`} className={procIdx % 2 === 0 ? 'bg-gray-50/40' : ''}>
                                    <td className="whitespace-nowrap pr-2" style={{ width: NAME_W, minWidth: NAME_W }}>
                                      <div className="flex items-center gap-1.5 text-base">
                                        {ai === 0 ? (
                                          <span className="text-gray-800 font-bold" style={{ minWidth: 60, display: 'inline-block' }}>{proc}</span>
                                        ) : (
                                          <span style={{ minWidth: 60, display: 'inline-block' }} />
                                        )}
                                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${ampm === 'AM' ? 'bg-sky-50 text-sky-600' : 'bg-orange-50 text-orange-600'}`}>{ampm}</span>
                                      </div>
                                    </td>
                                    {days.map(d => {
                                      const ds = `${ganttMonth}-${String(d).padStart(2,'0')}`
                                      const isToday = ds === todayStr
                                      const dow = new Date(ds).getDay()
                                      const isWknd = dow === 0 || dow === 6
                                      const key = ganttCellKey(proc, ampm, ds)
                                      const owner = owners[key]
                                      // 判斷左右相鄰格是不是同一個案件（連在一起）→ 拿掉中間邊界、文字只顯示一次
                                      const ownerAt = (dd: number) => (dd >= 1 && dd <= daysInMonth)
                                        ? owners[ganttCellKey(proc, ampm, `${ganttMonth}-${String(dd).padStart(2,'0')}`)]
                                        : undefined
                                      const sameLeft = !!owner && ownerAt(d - 1)?.pid === owner.pid
                                      const sameRight = !!owner && ownerAt(d + 1)?.pid === owner.pid
                                      // 這格是連續區塊的開頭 → 算出整段長度，把名稱置中橫跨整段只顯示一次
                                      let runLen = 1
                                      if (owner && !sameLeft) {
                                        let dd = d + 1
                                        while (ownerAt(dd)?.pid === owner.pid) { runLen++; dd++ }
                                      }
                                      const inDragRow = ganttDragStart && ganttDragStart.proc === proc && ganttDragStart.ampm === ampm
                                      const isPreview = inDragRow && ganttDragOver &&
                                        ds >= (ganttDragStart!.date <= ganttDragOver ? ganttDragStart!.date : ganttDragOver) &&
                                        ds <= (ganttDragStart!.date <= ganttDragOver ? ganttDragOver : ganttDragStart!.date)
                                      return (
                                        <td key={d}
                                          data-gcell={`${proc}|${ampm}|${ds}`}
                                          onMouseDown={() => { if (ganttActiveProject) { ganttDragStartRef.current = { proc, ampm, date: ds }; ganttDragOverRef.current = ds; setGanttDragStart({ proc, ampm, date: ds }); setGanttDragOver(ds) } }}
                                          onMouseEnter={() => { if (inDragRow) { ganttDragOverRef.current = ds; setGanttDragOver(ds) } }}
                                          onTouchStart={() => { if (ganttActiveProject) { ganttDragStartRef.current = { proc, ampm, date: ds }; ganttDragOverRef.current = ds; setGanttDragStart({ proc, ampm, date: ds }); setGanttDragOver(ds) } }}
                                          title={owner ? owner.name : ganttActiveProject ? '按住拖曳塗色（手機可用手指）' : '請先點選上面的案件'}
                                          className={`relative border-y border-gray-100 ${sameLeft ? '' : 'border-l'} ${sameRight ? '' : 'border-r'} hover:opacity-70 ${ganttActiveProject ? 'cursor-pointer' : 'cursor-not-allowed'} ${isPreview ? 'ring-2 ring-inset ring-indigo-500' : isToday ? 'ring-1 ring-inset ring-indigo-300' : ''}`}
                                          style={{
                                            minWidth: CELL_W, touchAction: ganttActiveProject ? 'none' : undefined,
                                            background: isPreview ? `${(projects.find(p => p.id === ganttActiveProject)?.color) || '#AEC6E8'}99` : owner ? owner.color : isWknd ? '#F3F0FF22' : 'transparent',
                                          }}>
                                          <div className="h-10">
                                            {owner && !sameLeft && (
                                              <span className="absolute inset-y-0 left-0 flex items-center justify-center px-0.5 z-10 pointer-events-none"
                                                style={{ width: runLen * CELL_W }}>
                                                <span className="text-[9px] font-bold leading-tight text-center text-gray-800/80 whitespace-normal break-all">{owner.name}</span>
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* 寬螢幕右側「最新進度回報」欄已依需求隱藏 */}
            </div>
          )
        })()}

        {/* LIST */}
        {view === 'list' && (
          <div>
            <div className="relative mb-3">
              <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="搜尋案件名稱、聯絡人或地址..."
                className="w-full glass-card px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 pr-8" />
              {searchText && (
                <button onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              )}
            </div>

            <button onClick={() => { setView('create'); setCreateMsg(''); setCreateOk(false) }}
              className="w-full mb-3 border border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-1.5">
              + 新增專案
            </button>

            <div className="flex gap-1.5 flex-wrap mb-4" data-tour="case-filters">
              {FILTER_TABS.map(tab => {
                const count = tab === '全部' ? projects.filter(p => !INACTIVE_STATUSES.includes(p.status)).length : projects.filter(p => p.status === tab).length
                return (
                  <button key={tab} onClick={() => setFilterStatus(tab)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterStatus === tab ? 'aurora-grad text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                    {tab}
                    <span className={`ml-1 ${filterStatus === tab ? 'text-gray-300' : 'text-gray-400'}`}>{count}</span>
                  </button>
                )
              })}
              <button onClick={fetchProjects} className="ml-auto text-xs text-gray-400 hover:text-gray-700 px-2">↻ 重新整理</button>
            </div>

            {loading ? (
              <p className="text-gray-400 text-sm py-8 text-center">載入中...</p>
            ) : (() => {
              const filtered = projects.filter(p => {
                // 「全部」只看進行中（排除完成/請款保留款）；點該分頁才看那些
                const matchStatus = filterStatus === '全部' ? !INACTIVE_STATUSES.includes(p.status) : p.status === filterStatus
                const q = searchText.toLowerCase()
                const matchSearch = !q || p.name.toLowerCase().includes(q) || p.contact.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
                return matchStatus && matchSearch
              })
              return (
                <div className="space-y-2">
                  {filtered.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-8">
                      {searchText ? `找不到「${searchText}」相關案件` : '此分類無案件'}
                    </p>
                  )}
                  {filtered.map(p => (
                    <div key={p.id}
                      className="glass-card p-4 hover:border-gray-400 transition-colors flex items-center gap-3"
                      style={p.color ? { borderLeftWidth: 4, borderLeftColor: p.color } : {}}>
                      {/* 顏色圓點 + picker */}
                      <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          title="設定案件顏色"
                          onClick={() => setColorPickerOpenId(colorPickerOpenId === p.id ? null : p.id)}
                          className="w-5 h-5 rounded-full border-2 border-white shadow transition-transform hover:scale-110"
                          style={{ background: p.color || '#D5D8DC' }} />
                        {colorPickerOpenId === p.id && (
                          <div className="absolute left-0 top-7 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-2 grid grid-cols-5 gap-1.5 w-36">
                            {PROJECT_COLORS_LIST.map(c => (
                              <button key={c.bg} title={c.label}
                                onClick={() => {
                                  const color = p.color === c.bg ? '' : c.bg
                                  setProjects(prev => prev.map(x => x.id === p.id ? { ...x, color } : x))
                                  setColorPickerOpenId(null)
                                  fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, color }) })
                                }}
                                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-125"
                                style={{ background: c.bg, borderColor: p.color === c.bg ? '#1A1A1A' : 'transparent' }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setColorPickerOpenId(null); selectProject(p) }}>
                        <p className="font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5 truncate">{p.contact}{p.address ? ` · ${p.address}` : ''}</p>
                      </div>
                      {/* 負責人下拉（點擊不觸發進入案件） */}
                      <select
                        value={p.assignee ?? ''}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          e.stopPropagation()
                          const assignee = e.target.value
                          setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignee } : x))
                          fetch('/api/projects', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: p.id, assignee }),
                          })
                        }}
                        className={`shrink-0 text-xs border rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-indigo-400 cursor-pointer ${p.assignee ? 'border-indigo-200 text-indigo-700 font-medium' : 'border-gray-200 text-gray-400'}`}>
                        <option value="">負責人</option>
                        {PROJECT_ASSIGNEES.filter(a => a).map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <span onClick={() => selectProject(p)} className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 cursor-pointer ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {/* REPORT */}
        {view === 'report' && selected && (
          <div>
            <button onClick={() => setView('list')} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">← 返回清單</button>

            <div className="glass-card p-4 mb-4">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{selected.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{selected.contact}{selected.address ? ` · ${selected.address}` : ''}</p>
                </div>
                <button onClick={removeProject} title="刪除專案"
                  className="shrink-0 text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-2 py-1">🗑 刪除</button>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[selected.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {selected.status}
                </span>
                <span className="text-xs text-gray-400">改狀態：</span>
                <select value={selected.status} onChange={e => changeProjectStatus(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-indigo-400">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs text-gray-400 ml-2">負責人：</span>
                <select value={selected.assignee ?? ''} onChange={e => changeProjectAssignee(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-indigo-400">
                  {PROJECT_ASSIGNEES.map(a => <option key={a} value={a}>{a || '（未設定）'}</option>)}
                </select>
              </div>
            </div>

            {/* 專案已有資訊 */}
            {projectDetailLoading && <p className="text-sm text-gray-400 text-center py-3">載入專案資訊中...</p>}
            {projectDetail && (
              <div className="mb-4 space-y-3">
                {(projectDetail.itemRows ?? []).length > 0 && (
                  <div className="glass-card p-4 overflow-x-auto">
                    <p className="text-xs font-medium text-gray-500 mb-3">📋 項目清單（可直接修改／✕ 刪除）</p>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200">
                          {(projectDetail.itemHeaders ?? []).map((h: string, i: number) => (
                            <th key={i} className="text-left text-xs text-gray-400 font-medium pb-2 pr-2 whitespace-nowrap">{h}</th>
                          ))}
                          <th className="w-6"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectDetail.itemRows.map((row: string[], ri: number) => (
                          <tr key={projectDetail.itemRowIds?.[ri] ?? ri} className="border-b border-gray-50 last:border-0 group">
                            {row.map((cell: string, ci: number) => (
                              <td key={ci} className="py-0.5 pr-2 align-middle">
                                <input value={cell} onChange={e => setItemCell(ri, ci, e.target.value)} onBlur={() => saveItemRow(ri)}
                                  style={{ width: ci === 0 ? 'auto' : '8em', minWidth: ci === 0 ? '10em' : '5em' }}
                                  className="border border-transparent hover:border-gray-200 focus:border-indigo-400 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                              </td>
                            ))}
                            <td className="align-middle">
                              <button onClick={() => deleteItemRow(ri)} title="刪除此列" className="text-gray-300 hover:text-red-500 px-1 leading-none opacity-0 group-hover:opacity-100">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(projectDetail.progressRows ?? []).length > 0 && (
                  <div className="glass-card p-4">
                    <p className="text-xs font-medium text-gray-500 mb-3">📑 進度紀錄（可直接修改／✕ 刪除；最新在最下）</p>
                    <div className="space-y-1">
                      {projectDetail.progressRows.map((r: any, ri: number) => (
                        <div key={projectDetail.progressRowIds?.[ri] ?? ri} className="flex items-center gap-2 text-sm border-b border-gray-50 py-0.5 last:border-0 group">
                          <input value={r.date} onChange={e => setProgressField(ri, 'date', e.target.value)} onBlur={() => saveProgressRow(ri)}
                            className="shrink-0 w-24 border border-transparent hover:border-gray-200 focus:border-indigo-400 rounded px-1.5 py-1 text-xs text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                          <input value={r.desc} onChange={e => setProgressField(ri, 'desc', e.target.value)} onBlur={() => saveProgressRow(ri)}
                            className="flex-1 border border-transparent hover:border-gray-200 focus:border-indigo-400 rounded px-1.5 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                          <button onClick={() => deleteProgressRow(ri)} title="刪除此筆" className="shrink-0 text-gray-300 hover:text-red-500 px-1 leading-none opacity-0 group-hover:opacity-100">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(projectDetail.shippingRows ?? []).length > 0 && (
                  <SectionTable title="🚚 出貨紀錄" headers={projectDetail.shippingHeaders} rows={projectDetail.shippingRows} />
                )}
                {(projectDetail.paymentRows ?? []).length > 0 && (
                  <SectionTable title="💰 請款紀錄" headers={projectDetail.paymentHeaders} rows={projectDetail.paymentRows} />
                )}
              </div>
            )}

            <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
              <button onClick={() => { setReportTab('progress'); setSubmitMsg(''); setSubmitOk(false) }}
                className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${reportTab === 'progress' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                📑 回報進度
              </button>
              <button onClick={() => { setReportTab('item'); setSubmitMsg(''); setSubmitOk(false) }}
                className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${reportTab === 'item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                📋 新增品項
              </button>
            </div>

            {reportTab === 'progress' && (
              <div className="glass-card p-4 space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">日期</label>
                  <input type="text" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">進度描述</label>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                    placeholder="例：四色噴印完成，共28片"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">同時更新狀態（選填）</label>
                  <select value={progressStatus} onChange={e => setProgressStatus(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white">
                    <option value="">不更改</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button onClick={submitProgress} disabled={submitting || !desc.trim()}
                  className="w-full aurora-grad text-white shadow-sm rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:brightness-105 transition-colors">
                  {submitting ? '寫入中...' : '確認送出 → 寫入 Notion'}
                </button>
                {submitMsg && <p className={`text-sm text-center font-medium ${submitOk ? 'text-green-600' : 'text-red-500'}`}>{submitMsg}</p>}
              </div>
            )}

            {reportTab === 'item' && (
              <div className="glass-card p-4 space-y-3">
                {/* 上傳辨識 / 手動新增 */}
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-400 flex-1">📷 上傳報價單／材料清單照片，AI 自動辨識品項；可再編輯或新增，最後一次寫入</p>
                  <button type="button" onClick={() => itemFileRef.current?.click()} disabled={itemAnalyzing}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40">
                    {itemAnalyzing ? '辨識中...' : '📷 上傳辨識'}
                  </button>
                  <button type="button" onClick={() => setItemList(prev => [...prev, { item: '', content: '', spec: '', qty: '', unit: '', note: '' }])}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">＋ 手動新增</button>
                </div>
                <input ref={itemFileRef} type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" onChange={handleItemImage} className="hidden" />

                {itemList.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">尚無品項，請上傳圖片辨識或手動新增</p>
                ) : (
                  <div className="space-y-2">
                    {itemList.map((it, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-2 bg-gray-50/60">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs text-gray-400 shrink-0">{i + 1}.</span>
                          <input value={it.item} onChange={e => updateItemRow(i, 'item', e.target.value)} placeholder="品項名稱"
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          <button type="button" onClick={() => removeItemRow(i)} className="text-gray-300 hover:text-red-500 px-1 leading-none shrink-0">×</button>
                        </div>
                        <input value={it.content} onChange={e => updateItemRow(i, 'content', e.target.value)} placeholder="內容／材質說明"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm mb-1 focus:outline-none focus:border-indigo-400" />
                        <div className="flex gap-1.5">
                          <input value={it.spec} onChange={e => updateItemRow(i, 'spec', e.target.value)} placeholder="規格(cm)"
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          <input value={it.qty} onChange={e => updateItemRow(i, 'qty', e.target.value)} placeholder="數量"
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          <input value={it.unit} onChange={e => updateItemRow(i, 'unit', e.target.value)} placeholder="單位"
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          <input value={it.note} onChange={e => updateItemRow(i, 'note', e.target.value)} placeholder="備註"
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={submitItemBatch} disabled={submitting || itemList.filter(it => (it.item ?? '').trim()).length === 0}
                  className="w-full aurora-grad text-white shadow-sm rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:brightness-105 transition-colors">
                  {submitting ? '寫入中...' : `一次新增 ${itemList.filter(it => (it.item ?? '').trim()).length} 筆品項 → 寫入 Notion`}
                </button>
                {submitMsg && <p className={`text-sm text-center font-medium ${submitOk ? 'text-green-600' : 'text-red-500'}`}>{submitMsg}</p>}
              </div>
            )}
          </div>
        )}

        {/* SEARCH */}
        {view === 'search' && (
          <div>
            <div className="flex gap-2 mb-5">
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="輸入專案名稱、地址或人員姓名..."
                className="flex-1 border border-gray-200 rounded-xl px-5 py-3.5 text-base focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white shadow-sm" />
              <button onClick={doSearch} disabled={searching}
                className="aurora-grad text-white shadow-sm rounded-xl px-6 py-3.5 text-base font-medium hover:brightness-105 disabled:opacity-40">
                {searching ? '...' : '查詢'}
              </button>
            </div>

            {!searchDetail && (
              <>
                {/* 手動新增任務並指派 */}
                <div className="glass-card p-3 mb-4 flex flex-wrap items-center gap-2" data-tour="add-task">
                  <span className="text-sm text-gray-500 shrink-0">＋ 新增任務</span>
                  <select value={newTaskPerson} onChange={e => setNewTaskPerson(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:border-indigo-400 shrink-0">
                    {DAILY_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input value={newTaskText} onChange={e => setNewTaskText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addManualTask(todayISO(), fetchInProgress) }}
                    placeholder="任務內容…（指派給上方人員，截止日為今天）"
                    className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                  <button onClick={() => addManualTask(todayISO(), fetchInProgress)} disabled={addingTask || !newTaskText.trim()}
                    className="aurora-grad text-white shadow-sm rounded-lg px-4 py-2 text-sm font-medium hover:brightness-105 disabled:opacity-40 shrink-0">
                    {addingTask ? '新增中…' : '新增'}
                  </button>
                </div>

                {/* 進行中任務人名標籤 */}
                {inProgressTasks.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <p className="text-sm text-gray-500 font-medium">{showCompletedSearch ? '全部任務' : '進行中任務'} — 點選人名查看：</p>
                      <button onClick={() => { const next = !showCompletedSearch; setShowCompletedSearch(next); fetchInProgress(!next) }}
                        className={`ml-auto text-xs px-3 py-1 rounded-full transition-colors ${showCompletedSearch ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white border border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                        {showCompletedSearch ? '隱藏已完成' : '顯示已完成'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(inProgressTasks.filter(t => (showCompletedSearch || t.status !== '完成') && t.person !== PRIVATE_PERSON).map(t => t.person))).map(person => (
                        <button key={person}
                          onClick={() => { setSelectedPersonTag(selectedPersonTag === person ? null : person); setPersonFreqFilter(null) }}
                          className={`text-sm px-4 py-2 rounded-full font-medium transition-colors ${selectedPersonTag === person ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                          {person}
                          <span className="ml-1.5 opacity-70">{inProgressTasks.filter(t => (showCompletedSearch || t.status !== '完成') && t.person === person).length}</span>
                        </button>
                      ))}
                    </div>
                    {selectedPersonTag && (() => {
                      const personAll = inProgressTasks.filter(t => (showCompletedSearch || t.status !== '完成') && t.person === selectedPersonTag)
                      const getWeekKey = (d: string) => {
                        const dt = new Date(d); const dow = dt.getUTCDay()
                        const mon = new Date(dt); mon.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7))
                        return mon.toISOString().slice(0, 10)
                      }
                      // 依日期自動分組
                      const weekKeys = Array.from(new Set(personAll.map(t => t.date ? getWeekKey(t.date) : '').filter(Boolean))).sort()
                      const monthKeys = Array.from(new Set(personAll.map(t => t.date ? t.date.slice(0, 7) : '').filter(Boolean))).sort()
                      const filtered = personSubFilter
                        ? personFreqFilter === '每周'
                          ? personAll.filter(t => t.date && getWeekKey(t.date) === personSubFilter)
                          : personAll.filter(t => t.date && t.date.slice(0, 7) === personSubFilter)
                        : personAll
                      const toggleDone = (t: DailyTask) => {
                        const next = t.status === '完成' ? '進行中' : '完成'
                        setInProgressTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x))
                        fetch('/api/daily-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, status: next }) })
                      }
                      const renderTaskRow = (t: DailyTask) => (
                        <div key={t.id} className={`border-b border-blue-100 last:border-0 ${effectiveFlagged(t) && t.status !== '完成' ? 'bg-red-50 -mx-2 px-2 rounded' : ''}`}>
                          <div className="flex items-center gap-3 text-base py-2.5 group">
                            <button onClick={() => toggleFlag(t)} title={effectiveFlagged(t) ? '取消紅標' : '標為急件（紅標）'}
                              className={`shrink-0 leading-none ${effectiveFlagged(t) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 grayscale'}`}>🚩</button>
                            {isUrgentTask(t.task) && t.status !== '完成' && <span className="shrink-0" title="急件">🔥</span>}
                            {t.status !== '完成' && taskTags(t.task).map(tag => (
                              <span key={tag.label} className={`text-xs px-1.5 py-0.5 rounded shrink-0 font-medium ${tag.cls}`}>{tag.label}</span>
                            ))}
                            <button onClick={() => toggleDone(t)}
                              className={`text-sm px-2.5 py-1 rounded-md shrink-0 cursor-pointer font-medium transition-colors ${t.status === '完成' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                              {t.status}
                            </button>
                            {editingId === t.id ? (
                              <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                                onBlur={() => saveEdit(t.id)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') { setEditingId(null); setEditText('') } }}
                                className="flex-1 border border-gray-300 rounded px-2 py-1 text-base focus:outline-none focus:border-indigo-400" />
                            ) : (
                              <span className={`flex-1 cursor-text ${t.status === '完成' ? 'line-through text-gray-400' : 'text-gray-700'}`}
                                onClick={() => { setEditingId(t.id); setEditText(t.task) }}>{t.task}</span>
                            )}
                            <button onClick={() => toggleDetail(t)} title="詳情 / AI 規劃"
                              className={`text-base shrink-0 px-1 rounded hover:text-blue-600 ${(t.content || t.direction || t.aiPlan) ? 'text-blue-500' : 'text-gray-300'}`}>📝</button>
                            <button onClick={() => { if (window.confirm(`確定要刪除任務「${t.task}」嗎？`)) deleteTask(t.id) }} title="刪除任務"
                              className="text-gray-300 hover:text-red-500 shrink-0 leading-none px-1 text-lg">×</button>
                            {(() => { const b = dueBadge(t); return b ? <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${b.cls}`}>{b.label}</span> : null })()}
                            {editingDueDateId === t.id ? (
                              <input autoFocus type="date" value={editDueDateText}
                                onChange={e => setEditDueDateText(e.target.value)}
                                onBlur={() => saveDueDate(t.id)}
                                onKeyDown={e => { if (e.key === 'Enter') saveDueDate(t.id); if (e.key === 'Escape') { setEditingDueDateId(null) } }}
                                className="text-xs border border-indigo-300 rounded px-1 py-0.5 focus:outline-none w-28 shrink-0" />
                            ) : (
                              <span onClick={() => { setEditingDueDateId(t.id); setEditDueDateText(t.date) }}
                                title="點擊修改截止日期"
                                className="text-sm text-gray-400 shrink-0 cursor-pointer hover:text-indigo-500">
                                {t.date}
                              </span>
                            )}
                          </div>
                          {detailId === t.id && renderTaskDetail(t)}
                        </div>
                      )
                      return (
                        <div className="mt-3 bg-blue-50 rounded-xl p-4">
                          {/* 第一層篩選 */}
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-xs font-medium text-blue-700">{selectedPersonTag}（{personAll.length} 項）</p>
                            <div className="ml-auto flex gap-1">
                              <button onClick={() => { setPersonFreqFilter(null); setPersonSubFilter(null) }}
                                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${!personFreqFilter ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-200 hover:border-blue-400'}`}>
                                全部
                              </button>
                              <button onClick={() => { setPersonFreqFilter(personFreqFilter === '每周' ? null : '每周'); setPersonSubFilter(null) }}
                                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${personFreqFilter === '每周' ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border border-purple-200 hover:border-purple-400'}`}>
                                每周 {weekKeys.length}
                              </button>
                              <button onClick={() => { setPersonFreqFilter(personFreqFilter === '每月' ? null : '每月'); setPersonSubFilter(null) }}
                                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${personFreqFilter === '每月' ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border border-purple-200 hover:border-purple-400'}`}>
                                每月 {monthKeys.length}
                              </button>
                            </div>
                          </div>
                          {/* 第二層：週別 */}
                          {personFreqFilter === '每周' && (
                            <div className="flex gap-1 flex-wrap mb-2">
                              {weekKeys.map(wk => {
                                const cnt = personAll.filter(t => t.date && getWeekKey(t.date) === wk).length
                                return (
                                  <button key={wk} onClick={() => setPersonSubFilter(personSubFilter === wk ? null : wk)}
                                    className={`text-xs px-2 py-0.5 rounded-full transition-colors ${personSubFilter === wk ? 'bg-purple-500 text-white' : 'bg-white text-purple-600 border border-purple-200 hover:border-purple-400'}`}>
                                    {wk.slice(5)} 週（{cnt}）
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {/* 第二層：月份 */}
                          {personFreqFilter === '每月' && (
                            <div className="flex gap-1 flex-wrap mb-2">
                              {monthKeys.map(mk => {
                                const cnt = personAll.filter(t => t.date && t.date.slice(0, 7) === mk).length
                                return (
                                  <button key={mk} onClick={() => setPersonSubFilter(personSubFilter === mk ? null : mk)}
                                    className={`text-xs px-2 py-0.5 rounded-full transition-colors ${personSubFilter === mk ? 'bg-purple-500 text-white' : 'bg-white text-purple-600 border border-purple-200 hover:border-purple-400'}`}>
                                    {parseInt(mk.slice(5))}月（{cnt}）
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {filtered.length === 0
                            ? <p className="text-xs text-gray-400 py-2 text-center">無符合的進行中任務</p>
                            : <div>{filtered.map(t => renderTaskRow(t))}</div>
                          }
                        </div>
                      )
                    })()}
                  </div>
                )}

                {searchProjectResults.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-400 mb-2 px-1">專案 ({searchProjectResults.length})</p>
                    {searchProjectResults.map(p => (
                      <div key={p.id} onClick={() => loadDetail(p)}
                        className="glass-card p-4 mb-2 cursor-pointer hover:border-gray-400 transition-colors flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-sm text-gray-500">{p.contact}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                {searchTaskResults.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-2 px-1">任務事項 ({searchTaskResults.length})</p>
                    {searchTaskResults.map(t => (
                      <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                        className="glass-card p-4 mb-2 flex items-start gap-3 hover:border-gray-400 transition-colors block no-underline">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{t.taskName}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {t.assignees && <p className="text-sm text-gray-500">指派：{t.assignees}</p>}
                            {t.helpers && <p className="text-sm text-gray-500">協助：{t.helpers}</p>}
                            {t.dueDate && <p className="text-sm text-gray-400">截止：{t.dueDate}</p>}
                          </div>
                          {t.note && <p className="text-xs text-gray-400 mt-1 truncate">{t.note}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>{t.status || '未設定'}</span>
                          {t.priority && <span className="text-xs text-gray-400">{t.priority}</span>}
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {dailyTaskResults.filter(t => t.person !== PRIVATE_PERSON).length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-400 mb-2 px-1">今日工作項目 ({dailyTaskResults.filter(t => t.person !== PRIVATE_PERSON).length})</p>
                    {dailyTaskResults.filter(t => t.person !== PRIVATE_PERSON).map(t => {
                      const flagged = effectiveFlagged(t) && t.status !== '完成' && t.status !== '已封存'
                      return (
                      <div key={t.id} className={`border rounded-xl shadow-sm p-3 mb-2 flex items-start gap-2 ${flagged ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200/70'}`}>
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${t.status === '完成' || t.status === '已封存' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {t.status}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">
                            {flagged && isUrgentTask(t.task) && <span className="mr-1" title="急件">🔥</span>}
                            {t.task}
                            {flagged && taskTags(t.task).map(tag => (
                              <span key={tag.label} className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${tag.cls}`}>{tag.label}</span>
                            ))}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{t.person} · {t.date}</p>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}

                {searchProjectResults.length === 0 && searchTaskResults.length === 0 && dailyTaskResults.length === 0 && searchQ && !searching && (
                  <p className="text-sm text-gray-400 text-center py-8">找不到相關結果</p>
                )}
              </>
            )}

            {searchDetail && (
              <div>
                <button onClick={() => setSearchDetail(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-3 flex items-center gap-1">← 返回</button>

                {/* Header */}
                <div className="glass-card p-4 mb-3">
                  <h2 className="font-medium text-gray-900 text-base">{searchDetail.name}</h2>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[searchDetail.status] ?? 'bg-gray-100 text-gray-600'}`}>{searchDetail.status}</span>
                    {searchDetail.contact && <span className="text-xs text-gray-500 py-1">{searchDetail.contact}</span>}
                    {searchDetail.address && <span className="text-xs text-gray-500 py-1">{searchDetail.address}</span>}
                  </div>
                </div>

                {/* 📋 項目清單 */}
                {(searchDetail.itemRows ?? []).length > 0 && (
                  <SectionTable title="📋 項目清單" headers={searchDetail.itemHeaders} rows={searchDetail.itemRows} />
                )}

                {/* 📑 進度紀錄 */}
                <div className="glass-card p-4 mb-3">
                  <p className="text-xs font-medium text-gray-500 mb-3">📑 進度紀錄</p>
                  {(searchDetail.progressRows ?? []).length === 0
                    ? <p className="text-sm text-gray-400">尚無進度紀錄</p>
                    : <div className="space-y-2">
                      {[...(searchDetail.progressRows ?? [])].reverse().slice(0, 20).map((r: any, i: number) => (
                        <div key={i} className="flex gap-3 text-sm border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                          <span className="text-gray-400 shrink-0 w-24">{r.date}</span>
                          <span className="text-gray-700">{r.desc}</span>
                        </div>
                      ))}
                    </div>
                  }
                </div>

                {/* 🚚 出貨紀錄 */}
                {(searchDetail.shippingRows ?? []).length > 0 && (
                  <SectionTable title="🚚 出貨紀錄" headers={searchDetail.shippingHeaders} rows={searchDetail.shippingRows} />
                )}

                {/* 💰 請款紀錄 */}
                {(searchDetail.paymentRows ?? []).length > 0 && (
                  <SectionTable title="💰 請款紀錄" headers={searchDetail.paymentHeaders} rows={searchDetail.paymentRows} />
                )}

                <button onClick={() => {
                  const proj = projects.find(p => p.id === searchDetail.id)
                  setSelected(proj ?? { id: searchDetail.id, name: searchDetail.name, status: searchDetail.status, contact: searchDetail.contact, address: searchDetail.address, url: '' })
                  setView('report')
                }} className="w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-700 hover:bg-gray-50 mt-1">
                  回報進度 / 新增品項
                </button>
              </div>
            )}
          </div>
        )}

        {/* CREATE */}
        {view === 'create' && (
          <div>
            <button onClick={() => setView('list')} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">← 返回清單</button>
            <div className="glass-card p-4 space-y-4" data-tour="create-form">
              <p className="text-sm font-medium text-gray-700">新增專案</p>
              <div>
                <label className="block text-sm text-gray-600 mb-1">專案名稱 <span className="text-red-400">*</span></label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="例：台北信義案"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">聯絡人</label>
                <input type="text" value={newContact} onChange={e => setNewContact(e.target.value)}
                  placeholder="例：王先生"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">地址</label>
                <input type="text" value={newAddress} onChange={e => setNewAddress(e.target.value)}
                  placeholder="例：台北市信義區..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">狀態</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* 產品品項（圖片辨識自動填入） */}
              <div className="border-t border-gray-200 pt-3" data-tour="quote-upload">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-medium text-gray-700">產品品項</p>
                  <span className="text-xs text-gray-400">（可選，建立專案時一起寫入）</span>
                  <button type="button" onClick={() => createItemFileRef.current?.click()} disabled={newItemAnalyzing}
                    className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40">
                    {newItemAnalyzing ? '辨識中...' : '📷 上傳圖片辨識'}
                  </button>
                  <button type="button" onClick={() => setNewItems(prev => [...prev, { item: '', content: '', spec: '', qty: '', unit: '', note: '' }])}
                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">＋ 手動新增</button>
                </div>
                <input ref={createItemFileRef} type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" onChange={handleCreateItemImage} className="hidden" />

                {newItems.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">上傳報價單／材料清單照片，AI 會自動辨識品項填入下方。</p>
                ) : (
                  <div className="space-y-2">
                    {newItems.map((it, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-2 bg-gray-50/60">
                        <div className="flex items-center gap-1.5 mb-1">
                          <input value={it.item} onChange={e => updateNewItem(i, 'item', e.target.value)} placeholder="品項名稱"
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          <button type="button" onClick={() => removeNewItem(i)} className="text-gray-300 hover:text-red-500 px-1 leading-none shrink-0">×</button>
                        </div>
                        <input value={it.content} onChange={e => updateNewItem(i, 'content', e.target.value)} placeholder="材質／說明"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm mb-1 focus:outline-none focus:border-indigo-400" />
                        <div className="flex gap-1.5">
                          <input value={it.spec} onChange={e => updateNewItem(i, 'spec', e.target.value)} placeholder="規格"
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          <input value={it.qty} onChange={e => updateNewItem(i, 'qty', e.target.value)} placeholder="數量"
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                          <input value={it.unit} onChange={e => updateNewItem(i, 'unit', e.target.value)} placeholder="單位"
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={submitCreateProject} disabled={creating || !newName.trim()}
                className="w-full aurora-grad text-white shadow-sm rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:brightness-105 transition-colors">
                {creating ? '建立中...' : `建立專案${newItems.filter(it => (it.item ?? '').trim()).length ? `（含 ${newItems.filter(it => (it.item ?? '').trim()).length} 筆品項）` : ''} → 寫入 Notion`}
              </button>
              {createMsg && <p className={`text-sm text-center font-medium ${createOk ? 'text-green-600' : 'text-red-500'}`}>{createMsg}</p>}
            </div>
          </div>
        )}

        {/* DAILY */}
        {view === 'daily' && (() => {
          const addTaskCard = (
            <div className="glass-card p-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500 shrink-0">＋ 新增任務</span>
              <select value={newTaskPerson} onChange={e => setNewTaskPerson(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:border-indigo-400 shrink-0">
                {DAILY_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input value={newTaskText} onChange={e => setNewTaskText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addManualTask(selectedDate || todayISO(), fetchDailyTasks) }}
                placeholder="任務內容…（指派給上方人員）"
                className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              <button onClick={() => addManualTask(selectedDate || todayISO(), fetchDailyTasks)} disabled={addingTask || !newTaskText.trim()}
                className="aurora-grad text-white shadow-sm rounded-lg px-4 py-2 text-sm font-medium hover:brightness-105 disabled:opacity-40 shrink-0">
                {addingTask ? '新增中…' : '新增'}
              </button>
            </div>
          )
          return (
          <div className="flex flex-col 2xl:flex-row gap-4 2xl:items-start">
          <div className="flex flex-col gap-0 flex-1 min-w-0">
            <div className="flex items-center mb-4 gap-2 flex-wrap">
              <p className="text-sm text-gray-500">每日工作項目（依人員分類）</p>
              <div className="ml-auto flex items-center gap-1.5">
                <button onClick={fetchDailyTasks} className="text-xs text-gray-400 hover:text-gray-700 px-2">↻ 重新整理</button>
                <button
                  onClick={() => { if (window.confirm('確定要發送本週工作回報提醒到 LINE 群組嗎？')) sendWeeklyReminder() }}
                  disabled={sendingReminder}
                  title="發送本週工作回報提醒"
                  className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-40 whitespace-nowrap">
                  {sendingReminder ? '…' : '📣 提醒'}
                </button>

                <button
                  onClick={syncKnowledge}
                  disabled={kbSyncing}
                  title="同步檔案庫 + SOP知識庫（產生檢索摘要）"
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap">
                  {kbSyncing ? '…' : '📚 同步'}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => { if (window.confirm('把檔案庫既有內容在 Notion 內重新整理成「切塊」（每份標【第 i/n 段】）？此動作會改寫 Notion 頁面內文，已切塊的會自動略過。')) rechunkKnowledge() }}
                    disabled={kbSyncing}
                    title="把既有內容在 Notion 內整理成切塊"
                    className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 whitespace-nowrap">
                    {kbSyncing ? '…' : '🧩 整理切塊'}
                  </button>
                )}
              </div>
            </div>
            {/* 操作回饋訊息 */}
            {(reminderMsg || kbMsg) && (
              <div className="mb-3 space-y-1">
                {reminderMsg && <p className={`text-xs px-3 py-1.5 rounded-lg ${reminderOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{reminderMsg}</p>}
                {kbMsg && <p className={`text-xs px-3 py-1.5 rounded-lg ${kbOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{kbMsg}</p>}
              </div>
            )}

            {/* 貼上 Plaud 內容 → Gemini 整理 */}
            <div className="glass-card p-4 mb-4 space-y-3" data-tour="plaud">
              <p className="text-sm font-medium text-gray-700">📥 貼上 Plaud 逐字稿自動整理</p>
              <p className="text-xs text-gray-400 -mt-2">AI 會自動修正錯字、判斷負責人、拆解成可勾選的執行步驟；無法判斷負責人的項目會列在「待確認」欄，可拖曳指派</p>
              <textarea value={plaudText} onChange={e => setPlaudText(e.target.value)} rows={5}
                placeholder="把 Plaud 產生的逐字稿或摘要貼到這裡..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none" />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={sendLine} onChange={e => setSendLine(e.target.checked)} className="rounded" />
                整理完同時發送到 LINE 群組
              </label>
              <button onClick={organizePlaud} disabled={organizing || !plaudText.trim()}
                className="w-full aurora-grad text-white shadow-sm rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:brightness-105 transition-colors">
                {organizing ? '整理中...' : '✦ 整理並寫入今日工作'}
              </button>
              {organizeMsg && <p className={`text-sm text-center font-medium ${organizeOk ? 'text-green-600' : 'text-red-500'}`}>{organizeMsg}</p>}
            </div>

            {/* 日期標籤（含週導覽） */}
            {(() => {
              const now = new Date(Date.now() + 8 * 3600 * 1000)
              const dow = now.getUTCDay()
              const thisMon = new Date(now); thisMon.setUTCDate(now.getUTCDate() - ((dow + 6) % 7))
              const mon = new Date(thisMon); mon.setUTCDate(thisMon.getUTCDate() + weekOffset * 7)
              const weekStart = mon.toISOString().slice(0, 10)
              const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
              const weekEnd = sun.toISOString().slice(0, 10)
              const dates = Array.from(new Set(dailyAll.map(t => t.date).filter(Boolean)))
                .filter(d => d >= weekStart && d <= weekEnd)
                .sort()
              const fmt = (d: string) => d === todayISO() ? `今天 ${d.slice(5)}` : d.slice(5)
              const weekLabel = weekOffset === 0 ? '本週' : weekOffset === -1 ? '上週' : weekOffset < 0 ? `${-weekOffset}週前` : `${weekOffset}週後`
              return (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => setWeekOffset(w => w - 1)} className="text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100 text-base leading-none">‹</button>
                    <span className="text-xs text-gray-500 font-medium">{weekLabel}（{weekStart.slice(5)} — {weekEnd.slice(5)}）</span>
                    <button onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0} className="text-gray-400 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100 text-base leading-none disabled:opacity-30">›</button>
                    {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="ml-auto text-xs text-blue-500 hover:text-blue-700">回本週</button>}
                  </div>
                  {dates.length === 0
                    ? <p className="text-xs text-gray-300 py-1">此週無工作項目</p>
                    : <div className="flex gap-1.5 flex-wrap">
                      {dates.map(d => (
                        <button key={d} onClick={() => { setSelectedDate(d); setFilterPerson(null) }}
                          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selectedDate === d ? 'aurora-grad text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                          {fmt(d)}
                        </button>
                      ))}
                    </div>
                  }
                  {/* 人員快速篩選標籤 */}
                  {(() => {
                    const dayTasks = dailyAll.filter(t => t.date === selectedDate)
                    const people = Array.from(new Set(dayTasks.map(t => t.person))).filter(Boolean)
                    if (people.length < 2) return null
                    return (
                      <div className="flex gap-1.5 flex-wrap mt-2">
                        {filterPerson && (
                          <button onClick={() => setFilterPerson(null)}
                            className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                            全部
                          </button>
                        )}
                        {people.map(p => (
                          <button key={p} onClick={() => setFilterPerson(filterPerson === p ? null : p)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${filterPerson === p ? 'aurora-grad text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                            {p}
                            <span className={`ml-1 text-xs ${filterPerson === p ? 'opacity-60' : 'text-gray-400'}`}>
                              {dayTasks.filter(t => t.person === p).length}
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}

            {/* 手動新增任務並指派：窄螢幕內嵌顯示；寬螢幕移到右側欄 */}
            <div className="2xl:hidden mb-3">{addTaskCard}</div>

            <div className="flex items-center gap-1.5 flex-wrap mb-3" data-tour="task-drag">
              <p className="text-xs text-gray-400">💡 拖曳任務可換負責人；點狀態可切換；點任務文字可編輯（皆即時同步 Notion）</p>
              <div className="ml-auto flex gap-1 flex-wrap items-center">
                <button onClick={() => setShowCompleted(v => !v)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${showCompleted ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white border border-gray-200 text-gray-400 hover:border-gray-400'}`}>
                  {showCompleted ? '隱藏已完成' : '顯示已完成'}
                </button>
              </div>
            </div>
            {dailyLoading ? (
              <p className="text-gray-400 text-sm py-8 text-center">載入中...</p>
            ) : dailyAll.length === 0 ? (
              <div className="glass-card p-6 text-center">
                <p className="text-sm text-gray-400">目前沒有工作項目</p>
                <p className="text-xs text-gray-300 mt-2">貼上 Plaud 內容整理，或每天 9:30 自動生成</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const dayTasks = dailyAll.filter(t => t.date === selectedDate && (showCompleted || (t.status !== '完成' && t.status !== '已封存')))
                  const dailyGrouped: Record<string, DailyTask[]> = {}
                  for (const t of dayTasks) (dailyGrouped[t.person] ??= []).push(t)
                  const extraPeople = Object.keys(dailyGrouped).filter(p => !DAILY_PEOPLE.includes(p)).sort((a, b) => (a === '待確認' ? -1 : b === '待確認' ? 1 : 0))
                  const allPeople = [...extraPeople.filter(p => p === '待確認'), ...DAILY_PEOPLE, ...extraPeople.filter(p => p !== '待確認')].filter(p => p !== PRIVATE_PERSON && (!filterPerson || p === filterPerson))
                  return allPeople.map(person => {
                    const tasks = dailyGrouped[person] ?? []
                    const isOver = dragOverPerson === person
                    return (
                      <div key={person}
                        onDragOver={e => { e.preventDefault(); setDragOverPerson(person) }}
                        onDragLeave={() => setDragOverPerson(prev => prev === person ? null : prev)}
                        onDrop={e => { e.preventDefault(); setDragOverPerson(null); if (draggingId) reassignTask(draggingId, person); setDraggingId(null) }}
                        className={`bg-white border rounded-xl p-4 transition-colors ${isOver ? 'border-gray-900 bg-gray-50' : person === '待確認' ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-7 h-7 rounded-full text-white text-xs flex items-center justify-center font-medium shrink-0 ${person === '待確認' ? 'bg-amber-500' : 'aurora-grad'}`}>
                            {person === '待確認' ? '⚠️' : person.slice(0, 1)}
                          </span>
                          <p className="font-medium text-gray-900">{person}</p>
                          <span className="text-xs text-gray-400">{tasks.length} 項</span>
                          {person === '待確認' && <span className="text-xs text-amber-600">拖曳到正確人員即可指派</span>}
                        </div>
                        {tasks.length === 0 ? (
                          <p className="text-xs text-gray-300 py-1">（可拖任務到這裡）</p>
                        ) : (
                          <div className="space-y-2">
                            {tasks.map(t => (
                              <div key={t.id}>
                              <div draggable={editingId !== t.id}
                                onDragStart={() => setDraggingId(t.id)}
                                onDragEnd={() => { setDraggingId(null); setDragOverPerson(null) }}
                                className={`flex items-start gap-2 text-sm border rounded-lg px-1.5 py-1 group ${effectiveFlagged(t) && t.status !== '完成' ? 'border-red-200 bg-red-50 hover:bg-red-100' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'} ${editingId === t.id ? '' : 'cursor-grab active:cursor-grabbing'}`}>
                                <button onClick={() => toggleFlag(t)} title={effectiveFlagged(t) ? '取消紅標' : '標為急件（紅標）'}
                                  className={`shrink-0 mt-0.5 text-xs leading-none ${effectiveFlagged(t) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 grayscale'}`}>🚩</button>
                                {isUrgentTask(t.task) && t.status !== '完成' && <span className="shrink-0 mt-0.5" title="急件">🔥</span>}
                                {t.status !== '完成' && taskTags(t.task).map(tag => (
                                  <span key={tag.label} className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 font-medium ${tag.cls}`}>{tag.label}</span>
                                ))}
                                <button onClick={() => cycleStatus(t)} title="點擊切換狀態"
                                  className={`text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${t.status === '完成' || t.status === '已完成' ? 'bg-green-100 text-green-700' : t.status === '進行中' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {t.status}
                                </button>
                                {(() => { const b = dueBadge(t); return b ? <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${b.cls}`}>{b.label}</span> : null })()}
                                {(t.freq && t.freq !== '當日') && (
                                  <button onClick={() => cycleFreq(t)} title="點擊切換頻率"
                                    className="text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 bg-purple-100 text-purple-700">
                                    {t.freq}
                                  </button>
                                )}
                                {(t.freq === '當日' || !t.freq) && (
                                  <button onClick={() => cycleFreq(t)} title="點擊切換頻率（當日→每周→每月）"
                                    className="text-xs px-1 py-0.5 rounded shrink-0 mt-0.5 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100">
                                    ↻
                                  </button>
                                )}
                                {editingId === t.id ? (
                                  <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                                    onBlur={() => saveEdit(t.id)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') { setEditingId(null); setEditText('') } }}
                                    className="flex-1 border border-gray-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                                ) : (
                                  <span className="text-gray-700 flex-1 cursor-text" onClick={() => { setEditingId(t.id); setEditText(t.task) }}>{t.task}</span>
                                )}
                                <button onClick={() => toggleDetail(t)} title="詳情 / 內容與進度方向"
                                  className={`text-xs shrink-0 leading-none mt-0.5 px-1 rounded hover:text-blue-600 ${(t.content || t.direction) ? 'text-blue-500' : 'text-gray-300 opacity-0 group-hover:opacity-100'}`}>📝</button>
                                {editingDueDateId === t.id ? (
                                  <input autoFocus type="date" value={editDueDateText}
                                    onChange={e => setEditDueDateText(e.target.value)}
                                    onBlur={() => saveDueDate(t.id)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveDueDate(t.id); if (e.key === 'Escape') { setEditingDueDateId(null) } }}
                                    className="text-xs border border-indigo-300 rounded px-1 py-0.5 focus:outline-none w-28 shrink-0" />
                                ) : (
                                  <span onClick={() => { setEditingDueDateId(t.id); setEditDueDateText(t.date) }}
                                    title="點擊修改截止日期"
                                    className="text-xs text-gray-400 shrink-0 cursor-pointer hover:text-indigo-500 opacity-0 group-hover:opacity-100">
                                    {t.date || '截止日'}
                                  </span>
                                )}
                                <button onClick={() => deleteTask(t.id)} title="刪除"
                                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0 leading-none">×</button>
                              </div>
                              {(t.steps ?? []).length > 0 && (
                                <div className="ml-6 mt-0.5 mb-1 space-y-0.5">
                                  {(t.steps ?? []).map((s, si) => (
                                    <label key={si} className="flex items-start gap-1.5 text-xs cursor-pointer">
                                      <input type="checkbox" checked={s.done} onChange={() => toggleTaskStep(t, si)}
                                        className="mt-0.5 rounded shrink-0" />
                                      <span className={s.done ? 'line-through text-gray-300' : 'text-gray-500'}>{s.step}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                              {detailId === t.id && renderTaskDetail(t)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>

          {/* 寬螢幕：新增任務固定在右側灰色區（不置中） */}
          <div className="hidden 2xl:block 2xl:w-80 2xl:shrink-0 2xl:sticky 2xl:top-16">
            {addTaskCard}
          </div>
          </div>
          )
        })()}

        {/* AI 助理 */}
        {view === 'chat' && (
          <div className="flex flex-col h-[calc(100vh-200px)] md:h-[calc(100vh-130px)]">
            {chatMessages.length > 0 && (
              <div className="flex justify-end mb-2">
                <button onClick={() => { if (confirm('確定清除所有對話記錄？')) setChatMessages([]) }}
                  className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                  🗑 清除對話
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto space-y-3 pb-4">
              {chatMessages.length === 0 && (
                <div className="glass-card p-5 text-sm text-gray-600">
                  <p className="font-medium text-gray-800 mb-2">👋 我是公司 AI 助理</p>
                  <p className="text-gray-500 mb-2">我會優先用「檔案庫」裡的公司資料回答。你可以問我：</p>
                  <ul className="list-disc pl-5 space-y-1 text-gray-500">
                    <li>客戶通話的話術建議</li>
                    <li>公司機具的參數、保養方式</li>
                    <li>幫忙整理某項作業的 SOP、排除困難</li>
                  </ul>
                  <p className="text-gray-500 mt-3 mb-1">也可以<span className="font-medium text-emerald-700">直接記錄專案進度</span>，例如：</p>
                  <p className="text-gray-400 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">「冠德的箱蓋今天噴好了」→ 我會幫你對應專案、確認後寫進進度紀錄</p>
                  <p className="text-xs text-gray-400 mt-3">※ 公司內部資料若查不到，我會直接說不知道、不亂編；若引用網路資料會標註清楚。</p>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'aurora-grad text-white' : 'bg-white border border-gray-200/70 shadow-sm text-gray-800'}`}>
                    {m.content}
                    {m.files && m.files.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        <p className="text-xs text-gray-400 font-medium">📎 相關檔案</p>
                        {m.files.map((f, fi) => (
                          <a key={fi} href={f.url} download={f.name} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-colors no-underline group">
                            <span className="text-lg leading-none">📄</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-indigo-700 truncate">{f.title}</p>
                              {f.name !== f.title && <p className="text-xs text-indigo-400 truncate">{f.name}</p>}
                            </div>
                            <span className="text-xs text-indigo-500 shrink-0 group-hover:underline">下載 ↓</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {m.draft && !m.draftDone && (() => {
                      const d = m.draft!
                      const activeProjs = projects.filter(p => !INACTIVE_STATUSES.includes(p.status))
                      const pickList = d.candidates.length > 0 ? d.candidates : activeProjs.map(p => ({ id: p.id, name: p.name }))
                      return (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                          <div className="text-xs text-gray-500 space-y-0.5">
                            <p>📅 日期：<span className="font-medium text-gray-700">{d.date}</span></p>
                            <p>📝 內容：<span className="font-medium text-gray-700">{d.description}</span></p>
                          </div>
                          {d.matchedId ? (
                            <div className="flex gap-2">
                              <button onClick={() => confirmChatProgress(i, d, d.matchedId!, d.matchedName!)}
                                className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-emerald-700">✓ 確認新增到【{d.matchedName}】</button>
                              <button onClick={() => cancelChatProgress(i)}
                                className="text-gray-400 hover:text-gray-600 text-xs px-2">取消</button>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap gap-1.5">
                                {pickList.map(p => (
                                  <button key={p.id} onClick={() => confirmChatProgress(i, d, p.id, p.name)}
                                    className="bg-white border border-emerald-300 text-emerald-700 rounded-full px-3 py-1 text-xs font-medium hover:bg-emerald-50">{p.name}</button>
                                ))}
                              </div>
                              <button onClick={() => cancelChatProgress(i)}
                                className="text-gray-400 hover:text-gray-600 text-xs px-2">取消</button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {m.role === 'assistant' && m.suggestions && m.suggestions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-400 mb-1.5">💡 你可能還想問：</p>
                        <div className="flex flex-col items-start gap-1.5">
                          {m.suggestions.map((s, si) => (
                            <button key={si} onClick={() => sendChat(s)} disabled={chatLoading}
                              className="text-left text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5 hover:bg-indigo-100 disabled:opacity-40 transition-colors">
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200/70 shadow-sm rounded-2xl px-4 py-2.5 text-sm text-gray-400">思考中…（查詢公司資料）</div>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-200" data-tour="chat-input">
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                rows={1} placeholder="輸入問題…（Enter 送出、Shift+Enter 換行）"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white resize-none" />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                className="aurora-grad text-white shadow-sm rounded-xl px-5 text-sm font-medium hover:brightness-105 disabled:opacity-40">送出</button>
              {chatMessages.length > 0 && (
                <button onClick={() => setChatMessages([])} title="清空對話"
                  className="text-gray-400 hover:text-gray-700 text-sm px-2">清空</button>
              )}
            </div>
          </div>
        )}

        {/* PRIVATE CALENDAR（僅管理者） */}
        {view === 'private' && isAdmin && (() => {
          const [py, pm] = privateMonth.split('-').map(Number)
          const daysInMonth = new Date(py, pm, 0).getDate()
          const firstDow = new Date(py, pm - 1, 1).getDay() // 0=日
          const todayStr = todayISO()
          const prevMon = () => { const d = new Date(py, pm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
          const nextMon = () => { const d = new Date(py, pm, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
          const cells: (number | null)[] = []
          for (let i = 0; i < firstDow; i++) cells.push(null)
          for (let d = 1; d <= daysInMonth; d++) cells.push(d)
          while (cells.length % 7 !== 0) cells.push(null)
          const eventsOn = (d: number) => privateEvents.filter(e => e.date === `${privateMonth}-${String(d).padStart(2,'0')}`)
          const personActive = privatePersonTasks.filter(t => t.status !== '已封存' && (showPrivateDone || t.status !== '完成'))
          return (
            <div className="space-y-4">

            {/* 呂理論待辦（只有管理者看得到，公開區已隱藏） */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-base font-semibold text-gray-900">🙋 {PRIVATE_PERSON_LABEL} 待辦</p>
                  <p className="text-xs text-gray-400 mt-0.5">🔴 紅色底色＝急件或需優先處理的項目（急件／協作／丈量繪圖）</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={openAddPrivateTask} disabled={addingPrivateTask}
                    className="text-xs aurora-grad text-white rounded-lg px-2.5 py-1 hover:brightness-105 disabled:opacity-40">＋ 新增任務</button>
                  <button onClick={fetchPrivatePersonTasks} className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2 py-1">↻ 重新整理</button>
                  <button onClick={() => setShowPrivateDone(v => !v)}
                    className={`text-xs rounded-lg px-2 py-1 border ${showPrivateDone ? 'bg-green-100 text-green-700 border-green-200' : 'text-gray-400 border-gray-200 hover:border-gray-400'}`}>
                    {showPrivateDone ? '隱藏已完成' : '顯示已完成'}
                  </button>
                </div>
              </div>
              {personActive.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">目前沒有工作項目</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-3 gap-y-1.5">
                  {personActive.map(t => {
                    const flagged = effectiveFlagged(t) && t.status !== '完成'
                    return (
                      <div key={t.id} className={`group flex items-center gap-2 text-sm border rounded-lg px-2 py-1.5 ${flagged ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
                        <button onClick={() => togglePrivatePersonDone(t)}
                          className={`text-xs px-2 py-0.5 rounded shrink-0 font-medium ${t.status === '完成' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{t.status}</button>
                        {flagged && <span className="shrink-0" title="急件">🔥</span>}
                        {editingId === t.id ? (
                          <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                            onBlur={() => saveEdit(t.id)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') { setEditingId(null); setEditText('') } }}
                            className="flex-1 border border-gray-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                        ) : (
                          <span className={`flex-1 cursor-text ${t.status === '完成' ? 'line-through text-gray-400' : 'text-gray-800'}`}
                            onClick={() => { setEditingId(t.id); setEditText(t.task) }}>{t.task}</span>
                        )}
                        <button onClick={() => openEditPrivateTask(t)} title="點擊修改截止日期"
                          className="text-xs text-gray-400 hover:text-indigo-500 shrink-0">{t.date || '設定日期'}</button>
                        <button onClick={() => deletePrivatePersonTask(t)} title="刪除"
                          className="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 leading-none px-1">✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-base font-semibold text-gray-900">🔐 私人行事曆</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {gcalConnected ? '已連結 Google 日曆，雙向同步 · 點日期選取當天、下方清單可新增／編輯' : '只有登入的你看得到'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {gcalConnected && (
                    <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-1 mr-1">✓ Google 已連結</span>
                  )}
                  <button onClick={() => setPrivateMonth(prevMon())}
                    className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 flex items-center justify-center">‹</button>
                  <span className="text-sm font-medium text-gray-700 w-24 text-center">{py}年{pm}月</span>
                  <button onClick={() => setPrivateMonth(nextMon())}
                    className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 flex items-center justify-center">›</button>
                </div>
              </div>

              {gcalConnected === false && (
                <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-700 mb-1">尚未連結 Google 日曆</p>
                  <p className="text-xs text-gray-400 mb-3">連結後，這裡新增的行程會直接同步到你的 Google 日曆（雙向）</p>
                  <a href="/api/google/auth"
                    className="inline-block aurora-grad text-white rounded-lg px-4 py-2 text-sm font-medium hover:brightness-105">
                    🔗 連結 Google 日曆
                  </a>
                </div>
              )}

              {/* 每日行程待辦 */}
              {gcalConnected && (
                <div className="mb-4 border border-gray-200 rounded-xl p-3 bg-gray-50/60">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">📋 每日行程待辦</span>
                    <input type="date" value={agendaDate}
                      onChange={e => { const v = e.target.value; if (!v) return; setAgendaDate(v); setPrivateMonth(v.slice(0, 7)) }}
                      className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400" />
                    {gcalLoading && <span className="text-xs text-gray-400">讀取中…</span>}
                    <button onClick={() => openAddEvent(agendaDate)}
                      className="ml-auto text-xs aurora-grad text-white rounded px-2.5 py-1 hover:brightness-105">＋ 新增行程</button>
                  </div>
                  {(() => {
                    const list = privateEvents.filter(e => e.date === agendaDate)
                      .sort((a, b) => (a.allDay === b.allDay ? (a.time || '').localeCompare(b.time || '') : (a.allDay ? -1 : 1)))
                    if (list.length === 0) return <p className="text-xs text-gray-400 py-2">這天還沒有行程，點「＋ 新增行程」加入</p>
                    return (
                      <div className="space-y-1">
                        {list.map(ev => (
                          <button key={ev.id} onClick={() => openEditEvent(ev)}
                            className="w-full flex items-center gap-2 text-left bg-white border border-gray-100 rounded-lg px-2.5 py-1.5 hover:border-indigo-300 transition-colors">
                            <span className={`text-xs font-medium shrink-0 text-center rounded px-1.5 py-0.5 ${ev.allDay ? 'bg-purple-50 text-purple-600' : 'bg-indigo-50 text-indigo-600'}`}>
                              {ev.allDay ? '全天' : ev.endTime ? `${ev.time}–${ev.endTime}` : (ev.time || '—')}
                            </span>
                            <span className="text-sm text-gray-800 flex-1 truncate">{ev.title}</span>
                            {ev.note && <span className="text-xs text-gray-400 shrink-0 truncate max-w-[35%]">{ev.note}</span>}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              <div className={`grid grid-cols-7 gap-1 ${gcalConnected === false ? 'opacity-40 pointer-events-none' : ''}`}>
                {['日','一','二','三','四','五','六'].map((w, i) => (
                  <div key={w} className={`text-center text-xs font-medium pb-1 ${i === 0 || i === 6 ? 'text-purple-400' : 'text-gray-400'}`}>{w}</div>
                ))}
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} className="min-h-[112px]" />
                  const ds = `${privateMonth}-${String(d).padStart(2,'0')}`
                  const isToday = ds === todayStr
                  const isSelected = ds === agendaDate
                  const dow = new Date(ds).getDay()
                  const isWknd = dow === 0 || dow === 6
                  const evs = eventsOn(d)
                  return (
                    <div key={i} onClick={() => setAgendaDate(ds)}
                      className={`min-h-[112px] border rounded-lg p-1.5 cursor-pointer transition-colors ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-300 bg-indigo-50/60' : isToday ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-100 hover:border-gray-300'} ${isWknd && !isSelected ? 'bg-purple-50/30' : ''}`}>
                      <div className={`text-xs font-medium mb-1 ${isToday ? 'text-indigo-600' : isWknd ? 'text-purple-400' : 'text-gray-500'}`}>{d}</div>
                      <div className="space-y-0.5">
                        {evs.map(ev => (
                          <div key={ev.id} onClick={e => { e.stopPropagation(); openEditEvent(ev) }}
                            title={ev.note || ev.title}
                            className="text-[11px] leading-tight px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 truncate hover:bg-indigo-200">
                            {!ev.allDay && ev.time ? `${ev.time} ` : ''}{ev.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            </div>
          )
        })()}

        {/* 教育訓練 */}
        {view === 'training' && (() => {
          const course = trainingCourses.find(c => c.id === trainingCourseId)
          const lang = trainingLang
          const t = (o: TrainingBilingual) => o[lang]

          // ── 課程列表 ──
          if (!course) {
            return (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-base font-semibold text-gray-900">📚 教育訓練</p>
                  {isAdmin && (
                    <button onClick={() => setShowTrainingCreate(v => !v)}
                      className="text-sm aurora-grad text-white rounded-lg px-3 py-1.5 hover:brightness-105">
                      {showTrainingCreate ? '取消新增' : '＋ 新增課程'}
                    </button>
                  )}
                </div>

                {showTrainingCreate && (
                  <div className="glass-card p-4 mb-4 space-y-3">
                    <p className="text-sm font-medium text-gray-700">貼上教材內容，AI 會自動拆解成「生活案例 → 橋接案例 → 正式案例」三階段字卡</p>
                    <textarea value={trainingSourceText} onChange={e => setTrainingSourceText(e.target.value)} rows={6}
                      placeholder="貼上 SOP、規範、教材文字..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none" />
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={trainingIs5w2h} onChange={e => setTrainingIs5w2h(e.target.checked)} className="rounded" />
                      這是 5W2H 思考法課程（上課時顯示 5W2H · 人事時地物 對照標籤）
                    </label>
                    {trainingCreateErr && <p className="text-xs text-red-500">{trainingCreateErr}</p>}
                    <button onClick={createTrainingCourse2} disabled={trainingCreating || !trainingSourceText.trim()}
                      className="aurora-grad text-white rounded-lg px-4 py-2 text-sm font-medium hover:brightness-105 disabled:opacity-40">
                      {trainingCreating ? 'AI 生成中…（約需 10-20 秒）' : '生成課程'}
                    </button>
                  </div>
                )}

                {trainingLoading ? (
                  <p className="text-sm text-gray-400 text-center py-8">載入中...</p>
                ) : trainingCourses.length === 0 ? (
                  <div className="glass-card p-6 text-center">
                    <p className="text-sm text-gray-400">目前還沒有課程</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {trainingCourses.map(c => (
                      <div key={c.id} className="glass-card p-4 flex items-center gap-3">
                        {trainingEditId === c.id ? (
                          <div className="flex-1 flex gap-2">
                            <input autoFocus value={trainingEditTitle} onChange={e => setTrainingEditTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveTrainingTitle(c.id); if (e.key === 'Escape') setTrainingEditId(null) }}
                              className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500" />
                            <button onClick={() => saveTrainingTitle(c.id)}
                              className="aurora-grad text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:brightness-105 whitespace-nowrap">儲存</button>
                            <button onClick={() => setTrainingEditId(null)}
                              className="text-gray-400 hover:text-gray-600 text-sm px-1">取消</button>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => openTrainingCourse(c.id)} className="flex-1 text-left">
                              <p className="font-medium text-gray-900">{c.content?.courseTitle?.zh ?? c.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{c.content?.stages?.length ?? 0} 個學習階段</p>
                            </button>
                            {isAdmin && (
                              <>
                                <button onClick={() => { setTrainingEditId(c.id); setTrainingEditTitle(c.content?.courseTitle?.zh ?? c.name) }} title="修改標題"
                                  className="text-gray-300 hover:text-indigo-500 text-sm px-1">✎</button>
                                <button onClick={() => deleteTrainingCourseUI(c.id)} title="刪除課程"
                                  className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          const content = course.content
          if (!content) return <p className="text-sm text-gray-400 text-center py-8">這堂課程內容讀取失敗</p>

          // ── 上課中：字卡 or 測驗 ──
          const stages = content.stages
          const inQuiz = trainingStageIdx >= stages.length
          const show5w2h = !!content.is5w2h  // 只有 5W2H 課程才顯示對照標籤與白話對照表

          return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setTrainingCourseId(null)} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1">← 返回課程列表</button>
                <div className="flex items-center gap-2">
                  <button onClick={() => setTrainingLang('zh')} className={`text-sm px-2.5 py-1 rounded-lg ${lang === 'zh' ? 'aurora-grad text-white' : 'border border-gray-200 text-gray-500'}`}>中文</button>
                  <button onClick={() => setTrainingLang('id')} className={`text-sm px-2.5 py-1 rounded-lg ${lang === 'id' ? 'aurora-grad text-white' : 'border border-gray-200 text-gray-500'}`}>Indonesia</button>
                </div>
              </div>

              <div className="flex gap-2 mb-4 flex-wrap">
                {[...stages.map(s => lang === 'zh' ? s.stage : s.stageId), lang === 'zh' ? '小測驗' : 'Kuis'].map((label, i) => (
                  <span key={i} className={`text-xs px-3 py-1.5 rounded-full border ${i === trainingStageIdx ? 'bg-indigo-50 text-indigo-700 border-indigo-300 font-medium' : i < trainingStageIdx ? 'text-gray-400 border-gray-200' : 'text-gray-300 border-gray-100'}`}>
                    {i + 1}. {label}
                  </span>
                ))}
              </div>

              {/* 5W2H ↔ 人事時地物 白話對照（給長者秒懂）— 只在 5W2H 課程顯示 */}
              {show5w2h && lang === 'zh' && (
                <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-gray-700 mb-2">看懂這些詞就會了 👇</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-gray-600">
                    <span><b className="text-blue-600">What</b>＝發生什麼<b>事</b></span>
                    <span><b className="text-purple-600">Why</b>＝為什麼（<b>原因</b>）</span>
                    <span><b className="text-amber-700">How</b>＝怎麼<b>做</b></span>
                    <span><b className="text-amber-700">How&nbsp;much</b>＝<b>花多少</b>（時間/錢）</span>
                    <span><b className="text-teal-700">Who</b>＝<b>人</b></span>
                    <span><b className="text-teal-700">When</b>＝<b>時</b>間</span>
                    <span><b className="text-teal-700">Where</b>＝<b>地</b>點</span>
                  </div>
                </div>
              )}

              {!inQuiz ? (() => {
                const stage = stages[trainingStageIdx]
                const colorFor = (i: number) => i < 2 ? { bg: '#EAF2FB', bd: '#93C5FD', txt: '#1D4ED8' } : { bg: '#FEF3E2', bd: '#FBBF24', txt: '#92400E' }
                const allRevealed = trainingRevealed >= stage.fields.length
                const activeField = allRevealed ? null : stage.fields[trainingRevealed]
                const revealAnswer = () => {
                  const idx = trainingRevealed
                  const key = `${trainingStageIdx}-${idx}`
                  const ans = trainingGuessInput.trim()
                  if (ans) {
                    setTrainingGuesses(prev => ({ ...prev, [key]: ans }))
                    // 學員有寫想法 → 請 AI 判斷合不合理（沒有唯一標準答案）
                    evaluateThought(key, t(stage.title), t(stage.fields[idx].k), ans, t(stage.fields[idx].v))
                  }
                  setTrainingRevealed(r => r + 1); setTrainingGuessInput('')
                }
                return (
                  <div className="glass-card p-5">
                    <p className="text-lg font-semibold text-gray-900 mb-4">{t(stage.title)}</p>
                    <div className="space-y-2.5">
                      {stage.fields.slice(0, trainingRevealed).map((f, i) => {
                        const c = colorFor(i)
                        const fkey = `${trainingStageIdx}-${i}`
                        const guess = trainingGuesses[fkey]
                        const fb = trainingFeedbacks[fkey]
                        return (
                          <div key={i}>
                            {guess && (
                              <div className="border border-gray-200 bg-gray-50 rounded-xl px-4 py-2 mb-1">
                                <p className="text-xs text-gray-400 mb-0.5">{lang === 'zh' ? '你的想法' : 'Jawabanmu'}</p>
                                <p className="text-sm text-gray-600">{guess}</p>
                              </div>
                            )}
                            {guess && (
                              <div className="border border-green-200 bg-green-50 rounded-xl px-4 py-2 mb-1">
                                <p className="text-xs text-green-600 mb-0.5">🧑‍🏫 {lang === 'zh' ? '老師的回饋' : 'Komentar guru'}</p>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{trainingEvaluatingKey === fkey && !fb ? (lang === 'zh' ? '思考中…' : 'Sedang menilai…') : fb}</p>
                              </div>
                            )}
                            <div style={{ background: c.bg, borderColor: c.bd }} className="border rounded-xl px-4 py-3">
                              <p style={{ color: c.txt }} className="text-sm font-medium mb-1">{t(f.k)}{show5w2h && <Fw2hBadge labelZh={f.k.zh} showZh={lang === 'zh'} />}{i > 0 && guess ? (lang === 'zh' ? '（參考方向）' : ' (arah referensi)') : ''}</p>
                              <p className="text-sm text-gray-800">{t(f.v)}</p>
                              {f.alts && f.alts.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: c.bd }}>
                                  <p className="text-xs mb-1" style={{ color: c.txt }}>💭 {lang === 'zh' ? '也有可能是…（不只一種答案）' : 'Bisa juga karena… (bukan cuma satu jawaban)'}</p>
                                  <ul className="space-y-0.5">
                                    {f.alts.map((a, ai) => (
                                      <li key={ai} className="text-sm text-gray-600 flex gap-1.5">
                                        <span style={{ color: c.txt }}>•</span><span>{t(a)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {activeField && (
                      <div className="mt-3 border border-indigo-200 bg-indigo-50/40 rounded-xl px-4 py-3">
                        <p className="text-sm font-medium text-indigo-700 mb-2">{lang === 'zh' ? '換你想想看：' : 'Coba pikirkan: '}{t(activeField.k)}{show5w2h && <Fw2hBadge labelZh={activeField.k.zh} showZh={lang === 'zh'} />}</p>
                        <div className="flex gap-2">
                          <input value={trainingGuessInput} onChange={e => setTrainingGuessInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') revealAnswer() }}
                            placeholder={lang === 'zh' ? '先用自己的話寫寫看（也可以直接看答案）' : 'Tulis dengan kata-katamu sendiri'}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                          <button onClick={revealAnswer}
                            className="aurora-grad text-white rounded-lg px-3 py-2 text-sm font-medium hover:brightness-105 whitespace-nowrap">
                            {lang === 'zh' ? '看答案' : 'Lihat'}
                          </button>
                        </div>
                      </div>
                    )}

                    {allRevealed && (
                      <div className="mt-4">
                        <button onClick={() => {
                          if (trainingStageIdx === stages.length - 1) startTrainingQuiz(stage)
                          setTrainingStageIdx(i => i + 1); setTrainingRevealed(1); setTrainingGuessInput(''); setTrainingAskAnswer('')
                        }} className="aurora-grad text-white rounded-lg px-4 py-2 text-sm font-medium hover:brightness-105">
                          {trainingStageIdx === stages.length - 1 ? (lang === 'zh' ? '進入小測驗 →' : 'Mulai kuis →') : (lang === 'zh' ? '進入下一階段 →' : 'Ke tahap berikutnya →')}
                        </button>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex gap-2">
                        <input value={trainingAskInput} onChange={e => setTrainingAskInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') askTrainingAI(t(stage.title)) }}
                          placeholder={lang === 'zh' ? '看不懂可以問 AI...' : 'Tanya AI jika belum paham...'}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                        <button onClick={() => askTrainingAI(t(stage.title))} disabled={trainingAsking || !trainingAskInput.trim()}
                          className="bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap">
                          {trainingAsking ? '…' : (lang === 'zh' ? '問 AI' : 'Tanya AI')}
                        </button>
                      </div>
                      {trainingAskAnswer && (
                        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-lg p-3">{trainingAskAnswer}</p>
                      )}
                    </div>
                  </div>
                )
              })() : (
                <div className="glass-card p-5">
                  {trainingQuizLoading || !trainingQuiz ? (
                    <p className="text-sm text-gray-400 text-center py-8">{lang === 'zh' ? '出題中...' : 'Membuat soal...'}</p>
                  ) : (
                    <>
                      <p className="text-lg font-semibold text-gray-900 mb-4">{lang === 'zh' ? '小測驗：' : 'Kuis: '}{t(trainingQuiz.title)}</p>
                      <div className="border rounded-xl px-4 py-3 mb-4" style={{ background: '#EAF2FB', borderColor: '#93C5FD' }}>
                        <p className="text-sm font-medium mb-1" style={{ color: '#1D4ED8' }}>{lang === 'zh' ? '發生什麼事？' : 'Apa yang terjadi?'}{show5w2h && <Fw2hBadge labelZh="發生什麼事" showZh={lang === 'zh'} />}</p>
                        <p className="text-sm text-gray-800">{t(trainingQuiz.what)}</p>
                      </div>
                      {!trainingResult ? (
                        <>
                          <p className="text-sm text-gray-500 mb-2">{lang === 'zh' ? '換你想想看：為什麼會這樣？該怎麼辦？' : 'Giliranmu: kenapa ini terjadi? Bagaimana solusinya?'}</p>
                          <input value={trainingWhy} onChange={e => setTrainingWhy(e.target.value)} placeholder={lang === 'zh' ? '為什麼會這樣？' : 'Mengapa hal ini terjadi?'}
                            className="w-full mb-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                          <input value={trainingHow} onChange={e => setTrainingHow(e.target.value)} placeholder={lang === 'zh' ? '該怎麼辦？' : 'Bagaimana solusinya?'}
                            className="w-full mb-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                          <button onClick={submitTrainingAnswer} disabled={trainingGrading}
                            className="aurora-grad text-white rounded-lg px-4 py-2 text-sm font-medium hover:brightness-105 disabled:opacity-40">
                            {trainingGrading ? (lang === 'zh' ? '批改中...' : 'Menilai...') : (lang === 'zh' ? '對答案' : 'Lihat jawaban')}
                          </button>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className={`rounded-xl px-4 py-3 border ${trainingResult.pass ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                            <p className={`text-sm font-medium ${trainingResult.pass ? 'text-green-700' : 'text-amber-700'}`}>
                              {trainingResult.pass ? '✓ ' + (lang === 'zh' ? '通過！' : 'Lulus!') : (lang === 'zh' ? '再想想看' : 'Coba lagi')}
                            </p>
                            <p className="text-sm text-gray-700 mt-1">{trainingResult.feedback}</p>
                          </div>
                          <div className="border rounded-xl px-4 py-3" style={{ background: '#FEF3E2', borderColor: '#FBBF24' }}>
                            <p className="text-xs font-medium mb-1" style={{ color: '#92400E' }}>{lang === 'zh' ? '參考答案' : 'Jawaban referensi'}</p>
                            <p className="text-sm text-gray-800">{t(trainingQuiz.referenceWhy)}</p>
                            <p className="text-sm text-gray-800 mt-1">{t(trainingQuiz.referenceHow)}</p>
                          </div>
                          <button onClick={() => setTrainingCourseId(null)}
                            className="text-sm text-gray-500 hover:text-gray-800">{lang === 'zh' ? '完成，返回課程列表' : 'Selesai, kembali ke daftar'} →</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </main>
      </div>

      {/* 手機版：底部導覽列（電腦版隱藏）。用圖示＋短標籤，方便單手點選 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch pb-[env(safe-area-inset-bottom)]"
        style={{
          background: 'var(--glass-2)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid var(--glass-border)',
        }}>
        {NAV_ITEMS.map(item => {
          const on = view === item.v
          return (
            <button key={item.v} onClick={item.onClick} data-tour={`nav-${item.v}`}
              className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 transition-all">
              {/* 作用中：icon 原色、label 主色粗體；非作用中：icon 去飽和、label 次要色 */}
              <span className="text-lg leading-none" style={{ filter: on ? 'none' : 'grayscale(.5) opacity(.65)' }}>{item.icon}</span>
              <span className="text-[10px] leading-none" style={{ color: on ? '#4a7fd6' : 'var(--text-3)', fontWeight: on ? 700 : 500 }}>{item.short}</span>
            </button>
          )
        })}
      </nav>

      {/* 新手教學引導層 */}
      {tourStep >= 0 && (
        <Tour
          steps={TOUR_STEPS}
          step={tourStep}
          onNext={() => setTourStep(s => Math.min(s + 1, TOUR_STEPS.length - 1))}
          onPrev={() => setTourStep(s => Math.max(s - 1, 0))}
          onClose={() => setTourStep(-1)}
        />
      )}
    </div>
  )
}

function SectionTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="glass-card p-4 mb-3 overflow-x-auto">
      <p className="text-xs font-medium text-gray-500 mb-3">{title}</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            {headers.map((h, i) => (
              <th key={i} className="text-left text-xs text-gray-400 font-medium pb-2 pr-4 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="py-1.5 pr-4 text-gray-700 align-top whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
