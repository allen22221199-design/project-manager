'use client'
import { useState, useEffect, useRef } from 'react'

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
const DAILY_PEOPLE = ['呂理論', '徐碧惠', '黃湘婷', '廖淑慧', '吳哲緯', '王治先', '黃文彬', '艾里', '阿蔡']
const PROJECT_ASSIGNEES = ['', '黃文彬', '王志先', '廖淑慧', '呂理論', '呂敏紅']
const DAILY_STATUS_CYCLE = ['進行中', '完成']
// 此人員的工作項目不在公開區顯示，只在管理者登入後的私人區可見
const PRIVATE_PERSON = '呂理論'          // 對應 Notion 的人員名稱（勿改）
const PRIVATE_PERSON_LABEL = 'Alen'      // 畫面上顯示的名稱
const PROCESS_STEPS = ['丈量', '製圖', '訂料', '噴印檔', '前處理', '環氧白', '四色', '烘乾', '面漆', '包裝', '施工']
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
type View = 'list' | 'report' | 'search' | 'create' | 'daily' | 'chat' | 'dashboard' | 'private'
type PrivateEvent = { id: string; title: string; date: string; note?: string; time?: string; allDay?: boolean }
type FileResult = { title: string; name: string; url: string }
type ChatMsg = { role: 'user' | 'assistant'; content: string; files?: FileResult[] }
type TaskAttachment = { name: string; url: string }
type DailyTask = { id: string; task: string; person: string; date: string; createdAt?: string; status: string; source: string; freq: string; content?: string; direction?: string; aiPlan?: string; attachments?: TaskAttachment[]; flag?: string }

// 安全解析回應：伺服器逾時/出錯時回的是 HTML，不要讓 JSON.parse 噴出難懂的錯誤
async function readJson(r: Response): Promise<any> {
  const raw = await r.text()
  try { return JSON.parse(raw) }
  catch { throw new Error('伺服器忙碌或處理逾時，請稍後再試一次') }
}

export default function Page() {
  const [view, setView] = useState<View>('dashboard')
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
  const [evSaving, setEvSaving] = useState(false)
  const [privatePersonTasks, setPrivatePersonTasks] = useState<DailyTask[]>([])
  const [showPrivateDone, setShowPrivateDone] = useState(false)
  const [addingPrivateTask, setAddingPrivateTask] = useState(false)
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
  const [ganttRangeStart, setGanttRangeStart] = useState<{ procIdx: number; ampm: string; date: string } | null>(null)

  // 知識庫同步
  const [kbSyncing, setKbSyncing] = useState(false)
  const [kbMsg, setKbMsg] = useState('')
  const [kbOk, setKbOk] = useState(false)

  // AI 助理對話
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatInitialized = useRef(false)

  // 手動新增任務
  const [newTaskText, setNewTaskText] = useState('')
  const [newTaskPerson, setNewTaskPerson] = useState(DAILY_PEOPLE[0])
  const [addingTask, setAddingTask] = useState(false)

  // 匯出昨日工作報告
  const [reportPerson, setReportPerson] = useState(DAILY_PEOPLE[0])
  const [reportMsg, setReportMsg] = useState('')

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

  // AI 規劃
  const [aiPlanning, setAiPlanning] = useState(false)
  const [aiPlanText, setAiPlanText] = useState('')
  const [aiUsedKb, setAiUsedKb] = useState<string[]>([])
  const [aiPlanSaving, setAiPlanSaving] = useState(false)
  const [aiPlanSaved, setAiPlanSaved] = useState(false)

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
  // 甘特圖格子單擊/雙擊判斷用
  const ganttCellTimer = useRef<any>(null)

  useEffect(() => { fetchProjects(); fetchDailyTasks() }, [])
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
  async function addPrivatePersonTask() {
    const task = window.prompt(`新增 ${PRIVATE_PERSON_LABEL} 的工作項目：`)
    if (!task?.trim() || addingPrivateTask) return
    setAddingPrivateTask(true)
    try {
      const today = todayISO()
      await fetch('/api/daily-tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: PRIVATE_PERSON, task: task.trim(), date: today }),
      })
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
    setEvId(null); setEvTitle(''); setEvDate(date); setEvTime(''); setShowEventForm(true)
  }
  function openEditEvent(ev: PrivateEvent) {
    setEvId(ev.id); setEvTitle(ev.title); setEvDate(ev.date); setEvTime(ev.allDay ? '' : (ev.time ?? '')); setShowEventForm(true)
  }
  async function saveEventForm() {
    if (!evTitle.trim() || !evDate || evSaving) return
    setEvSaving(true)
    try {
      const body = { id: evId ?? undefined, title: evTitle.trim(), date: evDate, time: evTime }
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

  async function fetchInProgress() {
    try {
      const r = await fetch('/api/daily-tasks')
      const data = await readJson(r)
      // 抓全部（不含已封存）；是否顯示「完成」由切換鈕決定
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
      if (r.ok && data.count > 0) {
        const lineNote = data.line?.ok ? '，已發送 LINE ✓'
          : data.line?.skipped ? '（LINE 未設定，略過）'
          : data.line?.error ? `（LINE 發送失敗：${data.line.error}）` : ''
        setOrganizeMsg(`已整理 ${data.count} 筆工作項目並寫入 Notion ✓${lineNote}`)
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
  async function sendChat() {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    const next: ChatMsg[] = [...chatMessages, { role: 'user', content: text, _ts: Date.now() } as any]
    setChatMessages(next)
    setChatInput('')
    setChatLoading(true)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await readJson(r)
      const reply = r.ok ? (data.reply || '（沒有回覆）') : ('錯誤：' + (data.error ?? '回覆失敗'))
      const files: FileResult[] = r.ok ? (data.files ?? []) : []
      setChatMessages([...next, { role: 'assistant', content: reply, files }])
    } catch (e: any) {
      setChatMessages([...next, { role: 'assistant', content: '錯誤：' + e.message }])
    } finally { setChatLoading(false) }
  }

  // 一鍵匯出「昨日」指定人員的工作報告（含任務內容）成檔案下載
  // 若昨天是週六或週日（假日），自動往回找最近的週五
  function exportYesterdayReport() {
    const y = new Date(Date.now() + 8 * 3600 * 1000)
    y.setUTCDate(y.getUTCDate() - 1)
    // 週日=0, 週六=6 → 往回找週五
    const dow = y.getUTCDay()
    if (dow === 0) y.setUTCDate(y.getUTCDate() - 2)      // 週日 → 退2天到週五
    else if (dow === 6) y.setUTCDate(y.getUTCDate() - 1) // 週六 → 退1天到週五
    const yStr = y.toISOString().slice(0, 10)
    const isWeekend = dow === 0 || dow === 6
    const dayLabel = isWeekend ? `${yStr}（上週五）` : `${yStr}（昨日）`
    const tasks = dailyAll.filter(t => t.date === yStr && t.person === reportPerson)
    let txt = `工作進度報告\n人員：${reportPerson}\n日期：${dayLabel}\n${'='.repeat(28)}\n\n`
    if (tasks.length === 0) {
      txt += '（昨日沒有工作項目）\n'
    } else {
      tasks.forEach((t, i) => {
        txt += `${i + 1}. ${t.task}　［${t.status || '進行中'}］\n`
        if ((t.content ?? '').trim()) txt += `   內容：${t.content}\n`
        if ((t.direction ?? '').trim()) txt += `   方向／需求：${t.direction}\n`
        txt += '\n'
      })
      txt += `共 ${tasks.length} 項。\n`
    }
    try {
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `工作報告_${reportPerson}_${yStr}.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setReportMsg(`已匯出 ${reportPerson} ${yStr} 的工作報告（${tasks.length} 項）`)
    } catch (e: any) {
      setReportMsg('匯出失敗：' + e.message)
    }
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
      if (totalProcessed === 0) {
        setKbMsg('沒有待處理的項目（檔案庫都是最新的）')
        setKbOk(true)
      } else {
        setKbMsg(`完成：成功 ${totalOk} 筆${allFails.length ? `；失敗 ${allFails.length} 筆：${allFails.map((x: any) => `${x.title}(${x.error})`).join('、')}` : ' ✓'}`)
        setKbOk(allFails.length === 0)
      }
    } catch (e: any) {
      setKbMsg('錯誤：' + e.message)
      setKbOk(false)
    } finally { setKbSyncing(false) }
  }

  // 開啟/關閉任務詳情面板
  function toggleDetail(t: DailyTask) {
    if (detailId === t.id) { setDetailId(null); setSaveDetailOk(false); setSaveDetailErr(''); return }
    setDetailId(t.id)
    setDetailContent(t.content ?? '')
    setDetailDirection(t.direction ?? '')
    setAiPlanText(t.aiPlan ?? '')
    setAiUsedKb([])
    setAiPlanSaved(!!(t.aiPlan ?? '').trim())
    setDetailAttachments(t.attachments ?? [])
    setSaveDetailOk(false)
    setSaveDetailErr('')
  }

  // AI 規劃：思考 + 查知識庫 + 上網搜尋（生成後由使用者決定是否存入 Notion）
  async function runAiPlan(t: DailyTask) {
    setAiPlanning(true)
    setAiPlanText('')
    setAiUsedKb([])
    setAiPlanSaved(false)
    try {
      const r = await fetch('/api/ai-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: t.task, content: detailContent, direction: detailDirection, goal: detailDirection }),
      })
      const data = await readJson(r)
      if (r.ok) {
        setAiPlanText(data.plan || '（沒有產生內容）')
        setAiUsedKb(data.usedKnowledge ?? [])
      } else {
        setAiPlanText('錯誤：' + (data.error ?? '規劃失敗'))
      }
    } catch (e: any) {
      setAiPlanText('錯誤：' + e.message)
    } finally { setAiPlanning(false) }
  }

  // 使用者按下後，才把任務內容、AI需求、AI規劃結果寫回 Notion
  async function savePlan(t: DailyTask) {
    setAiPlanSaving(true)
    setDailyAll(prev => prev.map(x => x.id === t.id ? { ...x, content: detailContent, direction: detailDirection, aiPlan: aiPlanText } : x))
    setInProgressTasks(prev => prev.map(x => x.id === t.id ? { ...x, content: detailContent, direction: detailDirection, aiPlan: aiPlanText } : x))
    try {
      await fetch('/api/daily-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, content: detailContent, direction: detailDirection, aiPlan: aiPlanText }),
      })
      setAiPlanSaved(true)
    } finally { setAiPlanSaving(false) }
  }

  // 手動切換紅標（急件）：on=強制紅、off=強制不紅
  function toggleFlag(t: DailyTask) {
    const nextFlag = effectiveFlagged(t) ? 'off' : 'on'
    setDailyAll(prev => prev.map(x => x.id === t.id ? { ...x, flag: nextFlag } : x))
    setInProgressTasks(prev => prev.map(x => x.id === t.id ? { ...x, flag: nextFlag } : x))
    setDailyTaskResults(prev => prev.map(x => x.id === t.id ? { ...x, flag: nextFlag } : x))
    fetch('/api/daily-tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, flag: nextFlag }) })
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
        <div>
          <label className="text-xs text-gray-500">希望 AI 幫你做什麼</label>
          <textarea value={detailDirection} onChange={e => setDetailDirection(e.target.value)} rows={4}
            placeholder={'清楚說明要 AI 做什麼，越具體越準：\n① 想要的產出（規劃步驟／找廠商／寫文案／比價…）\n② 限制（預算、時間、地點、規格、數量）\n③ 偏好或方向\n例：幫我規劃這支產品影片的拍攝流程，並找台中 3 家能配合的攝影團隊比價，預算 2 萬內。'}
            className="w-full mt-0.5 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => saveDetail(t.id)} disabled={savingDetail}
            className="bg-indigo-600 text-white shadow-sm rounded px-3 py-1 text-xs font-medium hover:bg-indigo-700 disabled:opacity-40">
            {savingDetail ? '儲存中...' : '儲存'}
          </button>
          {saveDetailOk && <span className="text-xs text-green-600 font-medium">✓ 已儲存</span>}
          {saveDetailErr && <span className="text-xs text-red-500">{saveDetailErr}</span>}
          <button onClick={() => { setDetailId(null); setSaveDetailOk(false); setSaveDetailErr('') }} className="text-xs text-gray-400 hover:text-gray-600 px-1">關閉</button>
          <button onClick={() => runAiPlan(t)} disabled={aiPlanning}
            className="ml-auto bg-blue-600 text-white rounded px-3 py-1 text-xs font-medium hover:bg-blue-700 disabled:opacity-40">
            {aiPlanning ? 'AI 思考中…' : '🤖 開始 AI 規劃'}
          </button>
        </div>
        {aiPlanText && (
          <div className="mt-1 border-t border-gray-200 pt-2">
            {aiUsedKb.length > 0 && (
              <p className="text-xs text-gray-400 mb-1">參考知識庫：{aiUsedKb.join('、')}</p>
            )}
            <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 max-h-80 overflow-auto">{aiPlanText}</div>
            {!aiPlanning && !aiPlanText.startsWith('錯誤：') && (
              aiPlanSaved
                ? <p className="mt-1 text-xs text-green-600">✓ 已存入 Notion「AI規劃」欄位</p>
                : <button onClick={() => savePlan(t)} disabled={aiPlanSaving}
                    className="mt-1 bg-indigo-600 text-white shadow-sm rounded px-3 py-1 text-xs font-medium hover:bg-indigo-700 disabled:opacity-40">
                    {aiPlanSaving ? '存入中...' : '存入 Notion'}
                  </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200/80 px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">煌</div>
          <div className="text-base font-semibold text-gray-900 tracking-tight">專案進度管理</div>
        </div>
        <div className="ml-auto flex gap-1 bg-gray-100/80 rounded-xl p-1">
          <NavBtn active={view === 'dashboard'} onClick={() => { setView('dashboard'); fetchProjects(); fetchDailyTasks() }}>總覽</NavBtn>
          <NavBtn active={view === 'list'} onClick={() => setView('list')}>案件清單</NavBtn>
          <NavBtn active={view === 'daily'} onClick={() => { setView('daily'); fetchDailyTasks() }}>今日工作</NavBtn>
          <NavBtn active={view === 'search'} onClick={() => { setView('search'); fetchInProgress() }}>任務查詢</NavBtn>
          <NavBtn active={view === 'chat'} onClick={() => setView('chat')}>AI 助理</NavBtn>
          {isAdmin && <NavBtn active={view === 'private'} onClick={() => { setView('private'); fetchPrivateEvents(); fetchPrivatePersonTasks() }}>🔐 私人行事曆</NavBtn>}
        </div>
        {isAdmin ? (
          <button onClick={doLogout} title="登出管理者"
            className="ml-2 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5">登出</button>
        ) : (
          <button onClick={() => { setShowLogin(true); setLoginErr('') }} title="管理者登入"
            className="ml-2 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-2 py-1.5">🔒 登入</button>
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
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
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
            <div className="flex gap-2 mb-1">
              <div className="flex-1">
                <label className="text-xs text-gray-500">日期</label>
                <input type="date" value={evDate} onChange={e => setEvDate(e.target.value)}
                  className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div className="w-28">
                <label className="text-xs text-gray-500">時間</label>
                <input type="time" value={evTime} onChange={e => setEvTime(e.target.value)}
                  className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">留空時間＝全天行程；填時間＝該時段（預設 1 小時）</p>
            <div className="flex items-center gap-2">
              <button onClick={saveEventForm} disabled={evSaving || !evTitle.trim()}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
                {evSaving ? '儲存中…' : '儲存'}
              </button>
              {evId && <button onClick={deleteEventForm} className="text-xs text-red-500 hover:text-red-600 border border-red-200 rounded-lg px-2.5 py-2">刪除</button>}
              <button onClick={() => setShowEventForm(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2">取消</button>
            </div>
          </div>
        </div>
      )}

      <main className={`mx-auto p-4 animate-fade-in ${view === 'dashboard' || view === 'private' ? 'max-w-7xl' : view === 'search' ? 'max-w-4xl' : view === 'chat' ? 'max-w-3xl' : 'max-w-2xl'}`}>

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
          return (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button onClick={() => { setView('daily'); fetchDailyTasks() }} className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 text-left hover:border-indigo-300 transition-colors">
                  <p className="text-xs text-gray-400">今日待辦</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{todayTasks.length}</p>
                </button>
                <button onClick={() => { setView('search'); fetchInProgress() }} className={`border rounded-xl shadow-sm p-4 text-left transition-colors ${overdue.length > 0 ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-white border-gray-200/70 hover:border-indigo-300'}`}>
                  <p className={`text-xs ${overdue.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>逾期任務</p>
                  <p className={`text-3xl font-bold mt-1 ${overdue.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdue.length}</p>
                </button>
                <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4">
                  <p className="text-xs text-gray-400">本週完成率</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{rate}<span className="text-lg">%</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">{weekDone.length}/{weekTasks.length} 項</p>
                </div>
                <button onClick={() => setView('list')} className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 text-left hover:border-indigo-300 transition-colors">
                  <p className="text-xs text-gray-400">進行中案件</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{projects.filter(p => !INACTIVE_STATUSES.includes(p.status)).length}</p>
                </button>
              </div>

              {/* 各狀態案件數 */}
              <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4">
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

              {/* 最新進度回報（保留兩天） */}
              {(() => {
                const now2 = new Date(Date.now() + 8 * 3600 * 1000)
                const cutoff = new Date(now2); cutoff.setUTCDate(now2.getUTCDate() - 2)
                const cutoffStr = cutoff.toISOString().slice(0, 10)
                const recent = projects
                  .filter(p => p.latestProgress && p.latestProgressDate && p.latestProgressDate >= cutoffStr)
                  .sort((a, b) => (b.latestProgressDate ?? '').localeCompare(a.latestProgressDate ?? ''))
                return (
                  <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">最新進度回報 {recent.length > 0 && <span className="text-emerald-500">({recent.length})</span>}</p>
                    {recent.length === 0 ? (
                      <p className="text-sm text-gray-400">近兩天尚無進度回報</p>
                    ) : (
                      <div className="space-y-2">
                        {recent.map(p => (
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
              })()}

              {/* 流程排程表（單一表格，用顏色區分案件） */}
              {(() => {
                const [gy, gm] = ganttMonth.split('-').map(Number)
                const daysInMonth = new Date(gy, gm, 0).getDate()
                const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
                const todayStr = todayISO()
                const prevMon = () => { const d = new Date(gy, gm - 2, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
                const nextMon = () => { const d = new Date(gy, gm, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
                const activeProj = projects.filter(p => !INACTIVE_STATUSES.includes(p.status))
                const CELL_W = 30
                const NAME_W = 120

                // ── 排程資料（每個案件各自存 schedule，畫面合併成一張表）──
                function parseSchedule(p: Project): Record<string, string> {
                  try { return p.schedule ? JSON.parse(p.schedule) : {} } catch { return {} }
                }
                function saveSchedule(p: Project, obj: Record<string, string>) {
                  const json = JSON.stringify(obj)
                  setProjects(prev => prev.map(x => x.id === p.id ? { ...x, schedule: json } : x))
                  fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, schedule: json }) })
                }
                function cellKey(procIdx: number, ampm: string, dateStr: string) {
                  return `${procIdx}|${ampm}|${dateStr}`
                }

                // 建立每格「擁有者」對照（哪個案件佔用了這格）
                const owners: Record<string, { pid: string; color: string; name: string; text: string }> = {}
                for (const p of activeProj) {
                  const s = parseSchedule(p)
                  for (const k in s) owners[k] = { pid: p.id, color: p.color || '#AEC6E8', name: p.name, text: s[k] }
                }

                // 點格子：第一下設起點，第二下（同一列）設終點 → 整段一次填起來
                function handleCellClick(procIdx: number, ampm: string, ds: string) {
                  if (!ganttActiveProject) return
                  if (!ganttRangeStart || ganttRangeStart.procIdx !== procIdx || ganttRangeStart.ampm !== ampm) {
                    // 尚未設起點，或點到不同列 → 設為新的起點
                    setGanttRangeStart({ procIdx, ampm, date: ds })
                  } else {
                    // 同一列的第二下 → 套用範圍
                    applyRange(procIdx, ampm, ganttRangeStart.date, ds)
                    setGanttRangeStart(null)
                  }
                }
                // 對某列 [d1..d2] 整段填色 / 清除（依起點格目前狀態決定）
                function applyRange(procIdx: number, ampm: string, d1: string, d2: string) {
                  const ap = activeProj.find(p => p.id === ganttActiveProject)
                  if (!ap) return
                  const lo = d1 <= d2 ? d1 : d2
                  const hi = d1 <= d2 ? d2 : d1
                  const startKey = cellKey(procIdx, ampm, d1)
                  const clearMode = owners[startKey]?.pid === ap.id  // 起點已是此案件 → 清除整段
                  const apSched = parseSchedule(ap)
                  const otherEdits: Record<string, Record<string, string>> = {}
                  for (const d of days) {
                    const ds = `${ganttMonth}-${String(d).padStart(2, '0')}`
                    if (ds < lo || ds > hi) continue
                    const key = cellKey(procIdx, ampm, ds)
                    if (clearMode) {
                      if (owners[key]?.pid === ap.id) delete apSched[key]
                    } else {
                      const ow = owners[key]
                      if (ow && ow.pid !== ap.id) {
                        const op = activeProj.find(p => p.id === ow.pid)
                        if (op) {
                          if (!otherEdits[op.id]) otherEdits[op.id] = parseSchedule(op)
                          delete otherEdits[op.id][key]
                        }
                      }
                      if (!(key in apSched)) apSched[key] = ''
                    }
                  }
                  saveSchedule(ap, apSched)
                  for (const pid in otherEdits) {
                    const op = activeProj.find(p => p.id === pid)
                    if (op) saveSchedule(op, otherEdits[pid])
                  }
                }
                // 雙擊：編輯格內小字（寫到擁有者，或目前選取案件）
                function editCellText(key: string) {
                  const owner = owners[key]
                  const target = owner ? activeProj.find(p => p.id === owner.pid)
                    : (ganttActiveProject ? activeProj.find(p => p.id === ganttActiveProject) : null)
                  if (!target) return
                  const s = parseSchedule(target)
                  const txt = window.prompt('輸入格內小字（縮寫／備註），留空僅填色：', s[key] ?? '')
                  if (txt === null) return
                  s[key] = txt.trim()
                  saveSchedule(target, s)
                }

                return (
                  <div className="order-first bg-white border border-gray-200/70 rounded-xl shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700">流程排程表</p>
                        {ganttRangeStart ? (
                          <p className="text-xs text-indigo-500 mt-0.5">已設起點，點選同一列的結束格 → 整段填色（雙擊格子加小字）</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">先選下方案件，再點「起點」格、再點「結束」格 → 一整排填起來</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setGanttRangeStart(null); setGanttMonth(prevMon()) }}
                          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 text-sm flex items-center justify-center">‹</button>
                        <span className="text-sm font-medium text-gray-700 w-20 text-center">{gy}年{gm}月</span>
                        <button onClick={() => { setGanttRangeStart(null); setGanttMonth(nextMon()) }}
                          className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 text-sm flex items-center justify-center">›</button>
                      </div>
                    </div>

                    {activeProj.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">目前無進行中案件</p>
                    ) : (
                      <>
                        {/* 案件色塊選取列 */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {activeProj.map(p => {
                            const sel = ganttActiveProject === p.id
                            return (
                              <button key={p.id}
                                onClick={() => { setGanttRangeStart(null); setGanttActiveProject(sel ? null : p.id) }}
                                className={`text-sm px-3 py-1.5 rounded-full font-medium border transition-all ${sel ? 'ring-2 ring-offset-1 ring-indigo-400 border-transparent' : 'border-gray-200 hover:border-gray-400'}`}
                                style={{ background: sel ? (p.color || '#AEC6E8') : `${p.color || '#AEC6E8'}33`, color: sel ? '#1a1a1a' : '#555' }}>
                                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: p.color || '#AEC6E8' }} />
                                {p.name}
                              </button>
                            )
                          })}
                        </div>

                        <div className="overflow-x-auto -mx-1 px-1">
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
                                      className={`text-center pb-2 text-sm font-medium ${isToday ? 'text-indigo-600' : isWknd ? 'text-purple-400' : 'text-gray-400'}`}>
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
                                      <div className="flex items-center gap-1.5 text-sm">
                                        {ai === 0 ? (
                                          <span className="text-gray-700 font-semibold" style={{ minWidth: 56, display: 'inline-block' }}>{proc}</span>
                                        ) : (
                                          <span style={{ minWidth: 56, display: 'inline-block' }} />
                                        )}
                                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${ampm === 'AM' ? 'bg-sky-50 text-sky-600' : 'bg-orange-50 text-orange-600'}`}>{ampm}</span>
                                      </div>
                                    </td>
                                    {days.map(d => {
                                      const ds = `${ganttMonth}-${String(d).padStart(2,'0')}`
                                      const isToday = ds === todayStr
                                      const dow = new Date(ds).getDay()
                                      const isWknd = dow === 0 || dow === 6
                                      const key = cellKey(procIdx, ampm, ds)
                                      const owner = owners[key]
                                      const isAnchor = ganttRangeStart?.procIdx === procIdx && ganttRangeStart?.ampm === ampm && ganttRangeStart?.date === ds
                                      return (
                                        <td key={d}
                                          onClick={() => {
                                            if (ganttCellTimer.current) return
                                            ganttCellTimer.current = setTimeout(() => { ganttCellTimer.current = null; handleCellClick(procIdx, ampm, ds) }, 200)
                                          }}
                                          onDoubleClick={() => {
                                            if (ganttCellTimer.current) { clearTimeout(ganttCellTimer.current); ganttCellTimer.current = null }
                                            editCellText(key)
                                          }}
                                          title={owner ? `${owner.name}${owner.text ? '：' + owner.text : ''}（點起點格再點結束格可整段清除・雙擊編輯小字）` : ganttActiveProject ? '點起點格 → 再點結束格 → 整段填色（雙擊加小字）' : '請先選擇上方案件'}
                                          className={`cursor-pointer border border-gray-100 hover:opacity-70 ${isAnchor ? 'ring-2 ring-inset ring-indigo-500' : isToday ? 'ring-1 ring-inset ring-indigo-300' : ''}`}
                                          style={{
                                            minWidth: CELL_W,
                                            background: owner ? owner.color : isAnchor ? '#C7D2FE' : isWknd ? '#F3F0FF22' : 'transparent',
                                          }}>
                                          <div className="h-8 flex items-center justify-center text-[11px] leading-none text-gray-800 overflow-hidden">{owner?.text ?? ''}</div>
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
          )
        })()}

        {/* LIST */}
        {view === 'list' && (
          <div>
            <div className="relative mb-3">
              <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="搜尋案件名稱、聯絡人或地址..."
                className="w-full bg-white border border-gray-200/70 rounded-xl shadow-sm px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 pr-8" />
              {searchText && (
                <button onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              )}
            </div>

            <button onClick={() => { setView('create'); setCreateMsg(''); setCreateOk(false) }}
              className="w-full mb-3 border border-dashed border-gray-300 rounded-xl py-2.5 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-1.5">
              + 新增專案
            </button>

            <div className="flex gap-1.5 flex-wrap mb-4">
              {FILTER_TABS.map(tab => {
                const count = tab === '全部' ? projects.filter(p => !INACTIVE_STATUSES.includes(p.status)).length : projects.filter(p => p.status === tab).length
                return (
                  <button key={tab} onClick={() => setFilterStatus(tab)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterStatus === tab ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
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
                      className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 hover:border-gray-400 transition-colors flex items-center gap-3"
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

            <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 mb-4">
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
                  <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 overflow-x-auto">
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
                  <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4">
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
              <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 space-y-4">
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
                  className="w-full bg-indigo-600 text-white shadow-sm rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors">
                  {submitting ? '寫入中...' : '確認送出 → 寫入 Notion'}
                </button>
                {submitMsg && <p className={`text-sm text-center font-medium ${submitOk ? 'text-green-600' : 'text-red-500'}`}>{submitMsg}</p>}
              </div>
            )}

            {reportTab === 'item' && (
              <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 space-y-3">
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
                  className="w-full bg-indigo-600 text-white shadow-sm rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors">
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
                className="bg-indigo-600 text-white shadow-sm rounded-xl px-6 py-3.5 text-base font-medium hover:bg-indigo-700 disabled:opacity-40">
                {searching ? '...' : '查詢'}
              </button>
            </div>

            {!searchDetail && (
              <>
                {/* 手動新增任務並指派 */}
                <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
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
                    className="bg-indigo-600 text-white shadow-sm rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 shrink-0">
                    {addingTask ? '新增中…' : '新增'}
                  </button>
                </div>

                {/* 進行中任務人名標籤 */}
                {inProgressTasks.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <p className="text-sm text-gray-500 font-medium">{showCompletedSearch ? '全部任務' : '進行中任務'} — 點選人名查看：</p>
                      <button onClick={() => setShowCompletedSearch(v => !v)}
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
                        className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 mb-2 cursor-pointer hover:border-gray-400 transition-colors flex items-center gap-3">
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
                        className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 mb-2 flex items-start gap-3 hover:border-gray-400 transition-colors block no-underline">
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
                <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 mb-3">
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
                <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 mb-3">
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
            <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 space-y-4">
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
              <div className="border-t border-gray-200 pt-3">
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
                className="w-full bg-indigo-600 text-white shadow-sm rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors">
                {creating ? '建立中...' : `建立專案${newItems.filter(it => (it.item ?? '').trim()).length ? `（含 ${newItems.filter(it => (it.item ?? '').trim()).length} 筆品項）` : ''} → 寫入 Notion`}
              </button>
              {createMsg && <p className={`text-sm text-center font-medium ${createOk ? 'text-green-600' : 'text-red-500'}`}>{createMsg}</p>}
            </div>
          </div>
        )}

        {/* DAILY */}
        {view === 'daily' && (
          <div>
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
                  title="同步檔案庫"
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap">
                  {kbSyncing ? '…' : '📚 同步'}
                </button>
              </div>
            </div>
            {/* 操作回饋訊息 */}
            {(reminderMsg || kbMsg) && (
              <div className="mb-3 space-y-1">
                {reminderMsg && <p className={`text-xs px-3 py-1.5 rounded-lg ${reminderOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{reminderMsg}</p>}
                {kbMsg && <p className={`text-xs px-3 py-1.5 rounded-lg ${kbOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{kbMsg}</p>}
              </div>
            )}

            {/* 一鍵匯出昨日工作報告 */}
            <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500 shrink-0">📄 匯出昨日工作報告</span>
              <select value={reportPerson} onChange={e => setReportPerson(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:border-indigo-400 shrink-0">
                {DAILY_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button onClick={exportYesterdayReport}
                className="bg-indigo-600 text-white shadow-sm rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 shrink-0">
                下載報告
              </button>
              {reportMsg && <span className="text-xs text-gray-500 basis-full">{reportMsg}</span>}
            </div>

            {/* 貼上 Plaud 內容 → Gemini 整理 */}
            <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 mb-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">📥 貼上 Plaud 內容自動整理</p>
              <textarea value={plaudText} onChange={e => setPlaudText(e.target.value)} rows={5}
                placeholder="把 Plaud 生成好的摘要內容貼到這裡，Gemini 會自動整理成每個人的工作項目..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none" />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={sendLine} onChange={e => setSendLine(e.target.checked)} className="rounded" />
                整理完同時發送到 LINE 群組
              </label>
              <button onClick={organizePlaud} disabled={organizing || !plaudText.trim()}
                className="w-full bg-indigo-600 text-white shadow-sm rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors">
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
                          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selectedDate === d ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
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
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${filterPerson === p ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
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

            {/* 手動新增任務並指派 */}
            <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-3 mb-3 flex flex-wrap items-center gap-2">
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
                className="bg-indigo-600 text-white shadow-sm rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 shrink-0">
                {addingTask ? '新增中…' : '新增'}
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap mb-3">
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
              <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-6 text-center">
                <p className="text-sm text-gray-400">目前沒有工作項目</p>
                <p className="text-xs text-gray-300 mt-2">貼上 Plaud 內容整理，或每天 9:30 自動生成</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const dayTasks = dailyAll.filter(t => t.date === selectedDate && (showCompleted || (t.status !== '完成' && t.status !== '已封存')))
                  const dailyGrouped: Record<string, DailyTask[]> = {}
                  for (const t of dayTasks) (dailyGrouped[t.person] ??= []).push(t)
                  const extraPeople = Object.keys(dailyGrouped).filter(p => !DAILY_PEOPLE.includes(p))
                  const allPeople = [...DAILY_PEOPLE, ...extraPeople].filter(p => p !== PRIVATE_PERSON && (!filterPerson || p === filterPerson))
                  return allPeople.map(person => {
                    const tasks = dailyGrouped[person] ?? []
                    const isOver = dragOverPerson === person
                    return (
                      <div key={person}
                        onDragOver={e => { e.preventDefault(); setDragOverPerson(person) }}
                        onDragLeave={() => setDragOverPerson(prev => prev === person ? null : prev)}
                        onDrop={e => { e.preventDefault(); setDragOverPerson(null); if (draggingId) reassignTask(draggingId, person); setDraggingId(null) }}
                        className={`bg-white border rounded-xl p-4 transition-colors ${isOver ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-medium shrink-0">
                            {person.slice(0, 1)}
                          </span>
                          <p className="font-medium text-gray-900">{person}</p>
                          <span className="text-xs text-gray-400">{tasks.length} 項</span>
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
        )}

        {/* AI 助理 */}
        {view === 'chat' && (
          <div className="flex flex-col" style={{ height: 'calc(100vh - 130px)' }}>
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
                <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-5 text-sm text-gray-600">
                  <p className="font-medium text-gray-800 mb-2">👋 我是公司 AI 助理</p>
                  <p className="text-gray-500 mb-2">我會優先用「檔案庫」裡的公司資料回答。你可以問我：</p>
                  <ul className="list-disc pl-5 space-y-1 text-gray-500">
                    <li>客戶通話的話術建議</li>
                    <li>公司機具的參數、保養方式</li>
                    <li>幫忙整理某項作業的 SOP</li>
                  </ul>
                  <p className="text-xs text-gray-400 mt-3">※ 公司內部資料若查不到，我會直接說不知道、不亂編；若引用網路資料會標註清楚。</p>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200/70 shadow-sm text-gray-800'}`}>
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
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200/70 shadow-sm rounded-2xl px-4 py-2.5 text-sm text-gray-400">思考中…（查詢公司資料）</div>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                rows={1} placeholder="輸入問題…（Enter 送出、Shift+Enter 換行）"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white resize-none" />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                className="bg-indigo-600 text-white shadow-sm rounded-xl px-5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">送出</button>
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
            <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-base font-semibold text-gray-900">🙋 {PRIVATE_PERSON_LABEL} 待辦</p>
                  <p className="text-xs text-gray-400 mt-0.5">此人員的工作項目只在這裡顯示，公開的今日工作／任務查詢已隱藏</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={addPrivatePersonTask} disabled={addingPrivateTask}
                    className="text-xs bg-indigo-600 text-white rounded-lg px-2.5 py-1 hover:bg-indigo-700 disabled:opacity-40">＋ 新增任務</button>
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
                        {t.date && <span className="text-xs text-gray-400 shrink-0">{t.date}</span>}
                        <button onClick={() => deletePrivatePersonTask(t)} title="刪除"
                          className="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 leading-none px-1">✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4">
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
                    className="inline-block bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700">
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
                      className="ml-auto text-xs bg-indigo-600 text-white rounded px-2.5 py-1 hover:bg-indigo-700">＋ 新增行程</button>
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
                            <span className={`text-xs font-medium shrink-0 w-12 text-center rounded px-1 py-0.5 ${ev.allDay ? 'bg-purple-50 text-purple-600' : 'bg-indigo-50 text-indigo-600'}`}>{ev.allDay ? '全天' : (ev.time || '—')}</span>
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
      </main>
    </div>
  )
}

function SectionTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="bg-white border border-gray-200/70 rounded-xl shadow-sm p-4 mb-3 overflow-x-auto">
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

function NavBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-all ${active ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
      {children}
    </button>
  )
}
