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
}

const STATUS_OPTIONS = ['報價中', '等待中', '打樣中', '對色中', '生產中', '施工中', '請款中含保留款', '完成']
const FILTER_TABS = ['全部', '報價中', '打樣中', '對色中', '生產中', '施工中', '等待中']
const DAILY_PEOPLE = ['呂理論', '徐碧惠', '黃湘婷', '廖淑慧', '吳哲緯', '王治先', '黃文彬', '艾里', '阿蔡']
const DAILY_STATUS_CYCLE = ['進行中', '已完成']

type Project = { id: string; name: string; status: string; contact: string; address: string; url: string }
type Task = { type: 'task'; id: string; taskName: string; status: string; assignees: string; helpers: string; dueDate: string; priority: string; note: string; url: string }
type ReportTab = 'progress' | 'item'
type View = 'list' | 'report' | 'search' | 'create' | 'daily'
type DailyTask = { id: string; task: string; person: string; date: string; status: string; source: string }

export default function Page() {
  const [view, setView] = useState<View>('list')
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
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverPerson, setDragOverPerson] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [inProgressTasks, setInProgressTasks] = useState<DailyTask[]>([])
  const [selectedPersonTag, setSelectedPersonTag] = useState<string | null>(null)
  const [dailyTaskResults, setDailyTaskResults] = useState<DailyTask[]>([])

  // create project form
  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newStatus, setNewStatus] = useState('報價中')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
  const [createOk, setCreateOk] = useState(false)

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

  useEffect(() => { fetchProjects() }, [])

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
      setProjects(await r.json())
    } finally { setLoading(false) }
  }

  function selectProject(p: Project) {
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
    setReportTab('progress')
    setView('report')
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
      const data = await r.json()
      if (r.ok) {
        setSubmitMsg('進度已寫入 Notion ✓')
        setSubmitOk(true)
        setDesc('')
        setProgressStatus('')
        fetchProjects()
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
      const data = await r.json()
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
      const data = await r.json()
      setSearchProjectResults(data.projects ?? [])
      setSearchTaskResults(data.tasks ?? [])
      setDailyTaskResults(data.dailyTasks ?? [])
    } finally { setSearching(false) }
  }

  async function fetchInProgress() {
    try {
      const r = await fetch('/api/daily-tasks')
      const data = await r.json()
      setInProgressTasks((data.all ?? []).filter((t: DailyTask) => t.status === '進行中'))
    } catch {}
  }

  async function loadDetail(p: { id: string }) {
    setSearching(true)
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: p.id }),
      })
      setSearchDetail(await r.json())
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
        setAnalyzed(await r.json())
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
        const data = await r.json()
        setItemAnalyzed(Array.isArray(data) ? data : null)
      } finally { setItemAnalyzing(false) }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
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
      const data = await r.json()
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
      const data = await r.json()
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
  async function reassignTask(taskId: string, newPerson: string) {
    setDailyAll(prev => prev.map(t => t.id === taskId ? { ...t, person: newPerson } : t))
    await fetch('/api/daily-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, person: newPerson, date: selectedDate }),
    })
    fetchDailyTasks()
  }

  // 切換狀態
  async function cycleStatus(t: DailyTask) {
    const idx = DAILY_STATUS_CYCLE.indexOf(t.status)
    const next = DAILY_STATUS_CYCLE[(idx + 1) % DAILY_STATUS_CYCLE.length]
    await fetch('/api/daily-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, status: next, date: selectedDate }),
    })
    fetchDailyTasks()
  }

  // 編輯任務文字
  async function saveEdit(taskId: string) {
    if (editText.trim()) {
      await fetch('/api/daily-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, task: editText.trim(), date: selectedDate }),
      })
    }
    setEditingId(null)
    setEditText('')
    fetchDailyTasks()
  }

  // 刪除任務
  async function deleteTask(taskId: string) {
    await fetch('/api/daily-tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, date: selectedDate }),
    })
    fetchDailyTasks()
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
      const data = await r.json()
      if (r.ok) {
        setCreateMsg('專案已建立 ✓')
        setCreateOk(true)
        setNewName('')
        setNewContact('')
        setNewAddress('')
        setNewStatus('報價中')
        fetchProjects()
      } else {
        setCreateMsg('錯誤：' + (data.error ?? '未知錯誤'))
        setCreateOk(false)
      }
    } finally { setCreating(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="text-lg font-medium text-gray-900">專案進度管理</div>
        <div className="ml-auto flex gap-2">
          <NavBtn active={view === 'list'} onClick={() => setView('list')}>案件清單</NavBtn>
          <NavBtn active={view === 'daily'} onClick={() => { setView('daily'); fetchDailyTasks() }}>今日工作</NavBtn>
          <NavBtn active={view === 'search'} onClick={() => { setView('search'); fetchInProgress() }}>查詢</NavBtn>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">

        {/* LIST */}
        {view === 'list' && (
          <div>
            <div className="relative mb-3">
              <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                placeholder="搜尋案件名稱、聯絡人或地址..."
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400 pr-8" />
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
                const count = tab === '全部' ? projects.length : projects.filter(p => p.status === tab).length
                return (
                  <button key={tab} onClick={() => setFilterStatus(tab)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterStatus === tab ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
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
                const matchStatus = filterStatus === '全部' || p.status === filterStatus
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
                    <div key={p.id} onClick={() => selectProject(p)}
                      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-gray-400 transition-colors flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{p.contact}{p.address ? ` · ${p.address}` : ''}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
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

            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
              <p className="font-medium text-gray-900">{selected.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{selected.contact}{selected.address ? ` · ${selected.address}` : ''}</p>
              <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[selected.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {selected.status}
              </span>
            </div>

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
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">日期</label>
                  <input type="text" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">進度描述</label>
                  <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                    placeholder="例：四色噴印完成，共28片"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 resize-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">同時更新狀態（選填）</label>
                  <select value={progressStatus} onChange={e => setProgressStatus(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                    <option value="">不更改</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button onClick={submitProgress} disabled={submitting || !desc.trim()}
                  className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors">
                  {submitting ? '寫入中...' : '確認送出 → 寫入 Notion'}
                </button>
                {submitMsg && <p className={`text-sm text-center font-medium ${submitOk ? 'text-green-600' : 'text-red-500'}`}>{submitMsg}</p>}
              </div>
            )}

            {reportTab === 'item' && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">項目 <span className="text-red-400">*</span></label>
                    <input type="text" value={itemName} onChange={e => setItemName(e.target.value)}
                      placeholder="例：消防箱蓋板、維修門"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">內容</label>
                    <input type="text" value={itemContent} onChange={e => setItemContent(e.target.value)}
                      placeholder="例：戴固煥盛烤漆、單開門貼板"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">規格(cm)</label>
                    <input type="text" value={itemSpec} onChange={e => setItemSpec(e.target.value)}
                      placeholder="例：92*129、60*80"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">數量</label>
                    <input type="text" value={itemQty} onChange={e => setItemQty(e.target.value)}
                      placeholder="例：23、28"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">單位</label>
                    <input type="text" value={itemUnit} onChange={e => setItemUnit(e.target.value)}
                      placeholder="例：組、片、扇"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">備註</label>
                    <input type="text" value={itemNote} onChange={e => setItemNote(e.target.value)}
                      placeholder="其他說明"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                  </div>
                </div>
                {/* Image upload */}
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-400 mb-2">📷 上傳圖片或 PDF 自動辨識品項（支援 PNG、JPG、PDF）</p>
                  <div className="flex gap-2 items-center">
                    <button type="button" onClick={() => itemFileRef.current?.click()}
                      className="flex-1 border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors">
                      {itemImgPreview ? '重新上傳檔案' : '選擇圖片或 PDF...'}
                    </button>
                    {itemImgPreview && (
                      <button type="button" onClick={() => { setItemImgPreview(''); setItemAnalyzed(null) }}
                        className="text-gray-400 hover:text-gray-600 px-2 py-2 text-lg leading-none">×</button>
                    )}
                  </div>
                  <input ref={itemFileRef} type="file" accept="image/png,image/jpeg,image/jpg,application/pdf" onChange={handleItemImage} className="hidden" />

                  {itemImgPreview && !itemAnalyzing && !itemAnalyzed && (
                    itemImgPreview.startsWith('pdf:')
                      ? <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">📄 {itemImgPreview.slice(4)}</p>
                      : <img src={itemImgPreview} className="mt-2 max-h-32 rounded-lg object-contain" alt="preview" />
                  )}
                  {itemAnalyzing && (
                    <p className="text-sm text-gray-400 text-center py-3 mt-2">辨識中...</p>
                  )}

                  {/* Analyzed results — one card per detected item */}
                  {itemAnalyzed && itemAnalyzed.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-gray-500 font-medium">辨識到 {itemAnalyzed.length} 筆品項，點選套用：</p>
                      {itemAnalyzed.map((row, i) => (
                        <button key={i} type="button" onClick={() => applyItemAnalyzed(row)}
                          className="w-full text-left border border-gray-200 rounded-lg px-3 py-2 hover:border-gray-900 hover:bg-gray-50 transition-colors">
                          <p className="text-sm font-medium text-gray-900">{row.item || '(未辨識)'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[row.content, row.spec, row.qty && row.unit ? `${row.qty} ${row.unit}` : row.qty, row.note]
                              .filter(Boolean).join(' · ')}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {itemAnalyzed && itemAnalyzed.length === 0 && (
                    <p className="text-xs text-red-400 mt-2">未能從圖片辨識出品項，請手動填寫</p>
                  )}
                </div>

                <button onClick={submitItem} disabled={submitting || !itemName.trim()}
                  className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors">
                  {submitting ? '寫入中...' : '新增品項 → 寫入 Notion'}
                </button>
                {submitMsg && <p className={`text-sm text-center font-medium ${submitOk ? 'text-green-600' : 'text-red-500'}`}>{submitMsg}</p>}
              </div>
            )}
          </div>
        )}

        {/* SEARCH */}
        {view === 'search' && (
          <div>
            <div className="flex gap-2 mb-4">
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="輸入專案名稱、地址或人員姓名..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white" />
              <button onClick={doSearch} disabled={searching}
                className="bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40">
                {searching ? '...' : '查詢'}
              </button>
            </div>

            {!searchDetail && (
              <>
                {/* 進行中任務人名標籤 */}
                {inProgressTasks.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-400 mb-2">進行中任務 — 點選人名查看：</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(new Set(inProgressTasks.map(t => t.person))).map(person => (
                        <button key={person}
                          onClick={() => setSelectedPersonTag(selectedPersonTag === person ? null : person)}
                          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selectedPersonTag === person ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                          {person}
                          <span className="ml-1 opacity-70">{inProgressTasks.filter(t => t.person === person).length}</span>
                        </button>
                      ))}
                    </div>
                    {selectedPersonTag && (
                      <div className="mt-3 bg-blue-50 rounded-xl p-3 space-y-1.5">
                        <p className="text-xs font-medium text-blue-700 mb-2">{selectedPersonTag} 的進行中任務：</p>
                        {inProgressTasks.filter(t => t.person === selectedPersonTag).map(t => (
                          <div key={t.id} className="flex items-start gap-2 text-sm">
                            <span className="text-blue-400 shrink-0 mt-0.5">·</span>
                            <span className="text-gray-700 flex-1">{t.task}</span>
                            <span className="text-xs text-gray-400 shrink-0">{t.date}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {searchProjectResults.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-400 mb-2 px-1">專案 ({searchProjectResults.length})</p>
                    {searchProjectResults.map(p => (
                      <div key={p.id} onClick={() => loadDetail(p)}
                        className="bg-white border border-gray-200 rounded-xl p-4 mb-2 cursor-pointer hover:border-gray-400 transition-colors flex items-center gap-3">
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
                        className="bg-white border border-gray-200 rounded-xl p-4 mb-2 flex items-start gap-3 hover:border-gray-400 transition-colors block no-underline">
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

                {dailyTaskResults.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-400 mb-2 px-1">今日工作項目 ({dailyTaskResults.length})</p>
                    {dailyTaskResults.map(t => (
                      <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-3 mb-2 flex items-start gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${t.status === '已完成' || t.status === '完成' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                          {t.status}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">{t.task}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{t.person} · {t.date}</p>
                        </div>
                      </div>
                    ))}
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
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
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
                <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
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
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
              <p className="text-sm font-medium text-gray-700">新增專案</p>
              <div>
                <label className="block text-sm text-gray-600 mb-1">專案名稱 <span className="text-red-400">*</span></label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="例：台北信義案"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">聯絡人</label>
                <input type="text" value={newContact} onChange={e => setNewContact(e.target.value)}
                  placeholder="例：王先生"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">地址</label>
                <input type="text" value={newAddress} onChange={e => setNewAddress(e.target.value)}
                  placeholder="例：台北市信義區..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">狀態</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={submitCreateProject} disabled={creating || !newName.trim()}
                className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors">
                {creating ? '建立中...' : '建立專案 → 寫入 Notion'}
              </button>
              {createMsg && <p className={`text-sm text-center font-medium ${createOk ? 'text-green-600' : 'text-red-500'}`}>{createMsg}</p>}
            </div>
          </div>
        )}

        {/* DAILY */}
        {view === 'daily' && (
          <div>
            <div className="flex items-center mb-4">
              <p className="text-sm text-gray-500">每日工作項目（依人員分類）</p>
              <button onClick={fetchDailyTasks} className="ml-auto text-xs text-gray-400 hover:text-gray-700 px-2">↻ 重新整理</button>
            </div>

            {/* 貼上 Plaud 內容 → Gemini 整理 */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">📥 貼上 Plaud 內容自動整理</p>
              <textarea value={plaudText} onChange={e => setPlaudText(e.target.value)} rows={5}
                placeholder="把 Plaud 生成好的摘要內容貼到這裡，Gemini 會自動整理成每個人的工作項目..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 resize-none" />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={sendLine} onChange={e => setSendLine(e.target.checked)} className="rounded" />
                整理完同時發送到 LINE 群組
              </label>
              <button onClick={organizePlaud} disabled={organizing || !plaudText.trim()}
                className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors">
                {organizing ? '整理中...' : '✦ 整理並寫入今日工作'}
              </button>
              {organizeMsg && <p className={`text-sm text-center font-medium ${organizeOk ? 'text-green-600' : 'text-red-500'}`}>{organizeMsg}</p>}
            </div>
            {/* 日期標籤 */}
            {(() => {
              const now = new Date(Date.now() + 8 * 3600 * 1000)
              const dow = now.getUTCDay()
              const mon = new Date(now); mon.setUTCDate(now.getUTCDate() - ((dow + 6) % 7))
              const weekStart = mon.toISOString().slice(0, 10)
              const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
              const weekEnd = sun.toISOString().slice(0, 10)
              const dates = Array.from(new Set(dailyAll.map(t => t.date).filter(Boolean)))
                .filter(d => d >= weekStart && d <= weekEnd)
                .sort().reverse()
              if (dates.length === 0) return null
              const fmt = (d: string) => d === todayISO() ? `今天 ${d.slice(5)}` : d.slice(5)
              return (
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {dates.map(d => (
                    <button key={d} onClick={() => setSelectedDate(d)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${selectedDate === d ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                      {fmt(d)}
                    </button>
                  ))}
                </div>
              )
            })()}
            <p className="text-xs text-gray-400 mb-3">💡 拖曳任務可換負責人；點狀態可切換；點任務文字可編輯（皆即時同步 Notion）</p>
            {dailyLoading ? (
              <p className="text-gray-400 text-sm py-8 text-center">載入中...</p>
            ) : dailyAll.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                <p className="text-sm text-gray-400">目前沒有工作項目</p>
                <p className="text-xs text-gray-300 mt-2">貼上 Plaud 內容整理，或每天 9:30 自動生成</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const dayTasks = dailyAll.filter(t => t.date === selectedDate)
                  const dailyGrouped: Record<string, DailyTask[]> = {}
                  for (const t of dayTasks) (dailyGrouped[t.person] ??= []).push(t)
                  const extraPeople = Object.keys(dailyGrouped).filter(p => !DAILY_PEOPLE.includes(p))
                  const allPeople = [...DAILY_PEOPLE, ...extraPeople]
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
                          <span className="w-7 h-7 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-medium shrink-0">
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
                              <div key={t.id} draggable={editingId !== t.id}
                                onDragStart={() => setDraggingId(t.id)}
                                onDragEnd={() => { setDraggingId(null); setDragOverPerson(null) }}
                                className={`flex items-start gap-2 text-sm border border-transparent rounded-lg px-1.5 py-1 hover:border-gray-200 hover:bg-gray-50 group ${editingId === t.id ? '' : 'cursor-grab active:cursor-grabbing'}`}>
                                <button onClick={() => cycleStatus(t)} title="點擊切換狀態"
                                  className={`text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${t.status === '完成' || t.status === '已完成' ? 'bg-green-100 text-green-700' : t.status === '進行中' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {t.status}
                                </button>
                                {editingId === t.id ? (
                                  <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                                    onBlur={() => saveEdit(t.id)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') { setEditingId(null); setEditText('') } }}
                                    className="flex-1 border border-gray-300 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:border-gray-500" />
                                ) : (
                                  <span className="text-gray-700 flex-1 cursor-text" onClick={() => { setEditingId(t.id); setEditText(t.task) }}>{t.task}</span>
                                )}
                                <button onClick={() => deleteTask(t.id)} title="刪除"
                                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0 leading-none">×</button>
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
      </main>
    </div>
  )
}

function SectionTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3 overflow-x-auto">
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
      className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
      {children}
    </button>
  )
}
