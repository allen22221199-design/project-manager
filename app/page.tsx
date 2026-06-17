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

type Project = { id: string; name: string; status: string; contact: string; address: string; url: string }
type View = 'list' | 'report' | 'search' | 'image'

export default function Page() {
  const [view, setView] = useState<View>('list')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Project | null>(null)

  // progress form
  const [date, setDate] = useState(today())
  const [desc, setDesc] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')

  // search
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<Project[]>([])
  const [searchDetail, setSearchDetail] = useState<any>(null)
  const [searching, setSearching] = useState(false)

  // image
  const [imgPreview, setImgPreview] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzed, setAnalyzed] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchProjects() }, [])

  function today() {
    const d = new Date()
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
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
    setNewStatus('')
    setSubmitMsg('')
    setView('report')
  }

  async function submitProgress() {
    if (!selected || !desc.trim()) return
    setSubmitting(true)
    setSubmitMsg('')
    try {
      const r = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: selected.id, date, description: desc, newStatus: newStatus || undefined }),
      })
      if (r.ok) {
        setSubmitMsg('已成功寫入 Notion')
        setDesc('')
        setNewStatus('')
        fetchProjects()
      } else {
        const e = await r.json()
        setSubmitMsg('錯誤：' + e.error)
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
      setSearchResults(await r.json())
    } finally { setSearching(false) }
  }

  async function loadDetail(p: Project) {
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
      setImgPreview(dataUrl)
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

  async function applyAnalyzed() {
    if (!analyzed || !selected) return
    setDesc(analyzed.description ?? '')
    if (analyzed.date) setDate(analyzed.date)
    setView('report')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <div className="text-lg font-medium text-gray-900">專案進度管理</div>
        <div className="ml-auto flex gap-2">
          <NavBtn active={view === 'list'} onClick={() => setView('list')}>案件清單</NavBtn>
          <NavBtn active={view === 'search'} onClick={() => setView('search')}>查詢</NavBtn>
          <NavBtn active={view === 'image'} onClick={() => setView('image')}>上傳截圖</NavBtn>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">

        {/* LIST */}
        {view === 'list' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">點選案子開始回報進度</p>
              <button onClick={fetchProjects} className="text-sm text-blue-600 hover:underline">重新整理</button>
            </div>
            {loading ? <p className="text-gray-400 text-sm py-8 text-center">載入中...</p> : (
              <div className="space-y-2">
                {projects.length === 0 && <p className="text-gray-400 text-sm text-center py-8">無進行中的案件</p>}
                {projects.map(p => (
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
            )}
          </div>
        )}

        {/* REPORT */}
        {view === 'report' && selected && (
          <div>
            <button onClick={() => setView('list')} className="text-sm text-gray-500 hover:text-gray-800 mb-4 flex items-center gap-1">
              ← 返回清單
            </button>
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
              <p className="font-medium text-gray-900">{selected.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">{selected.contact}</p>
              <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[selected.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {selected.status}
              </span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">日期</label>
                <input type="text" value={date} onChange={e => setDate(e.target.value)}
                  placeholder="2026/06/17"
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
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 bg-white">
                  <option value="">不更改</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={submitProgress} disabled={submitting || !desc.trim()}
                className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors">
                {submitting ? '寫入中...' : '確認送出 → 寫入 Notion'}
              </button>
              {submitMsg && (
                <p className={`text-sm text-center ${submitMsg.startsWith('已成功') ? 'text-green-600' : 'text-red-500'}`}>
                  {submitMsg}
                </p>
              )}
            </div>
          </div>
        )}

        {/* SEARCH */}
        {view === 'search' && (
          <div>
            <div className="flex gap-2 mb-4">
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="輸入專案名稱或人員..."
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white" />
              <button onClick={doSearch} disabled={searching}
                className="bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-gray-700 disabled:opacity-40">
                {searching ? '...' : '查詢'}
              </button>
            </div>

            {!searchDetail && searchResults.map(p => (
              <div key={p.id} onClick={() => loadDetail(p)}
                className="bg-white border border-gray-200 rounded-xl p-4 mb-2 cursor-pointer hover:border-gray-400 transition-colors flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-sm text-gray-500">{p.contact}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
              </div>
            ))}

            {searchDetail && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <button onClick={() => setSearchDetail(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-3 block">← 返回</button>
                <h2 className="font-medium text-gray-900 text-base">{searchDetail.name}</h2>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[searchDetail.status] ?? 'bg-gray-100 text-gray-600'}`}>{searchDetail.status}</span>
                  {searchDetail.contact && <span className="text-xs text-gray-500 py-1">{searchDetail.contact}</span>}
                  {searchDetail.address && <span className="text-xs text-gray-500 py-1">{searchDetail.address}</span>}
                </div>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">進度紀錄</p>
                  <div className="space-y-2">
                    {(searchDetail.progressRows ?? []).length === 0 && <p className="text-sm text-gray-400">無紀錄</p>}
                    {(searchDetail.progressRows ?? []).slice(-10).reverse().map((r: any, i: number) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <span className="text-gray-400 shrink-0 w-24">{r.date}</span>
                        <span className="text-gray-700">{r.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={() => { setSelected(projects.find(p => p.id === searchDetail.id) || { id: searchDetail.id, name: searchDetail.name, status: searchDetail.status, contact: searchDetail.contact, address: searchDetail.address, url: '' }); setView('report') }}
                  className="mt-4 w-full border border-gray-200 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
                  回報此案進度
                </button>
              </div>
            )}
          </div>
        )}

        {/* IMAGE */}
        {view === 'image' && (
          <div>
            <p className="text-sm text-gray-500 mb-4">上傳 LINE 截圖或文件，自動辨識進度資訊</p>

            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 transition-colors mb-4">
              {imgPreview
                ? <img src={imgPreview} className="max-h-48 mx-auto rounded-lg" alt="preview" />
                : <div className="text-gray-400 text-sm">點此選擇圖片<br/>支援 JPG、PNG</div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />

            {analyzing && <p className="text-sm text-gray-500 text-center py-4">辨識中...</p>}

            {analyzed && (
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mb-4">
                <p className="text-xs font-medium text-gray-500">辨識結果</p>
                {analyzed.projectHint && (
                  <div><span className="text-xs text-gray-400">專案提示：</span><span className="text-sm text-gray-800">{analyzed.projectHint}</span></div>
                )}
                <div><span className="text-xs text-gray-400">日期：</span><span className="text-sm text-gray-800">{analyzed.date}</span></div>
                <div><span className="text-xs text-gray-400">進度描述：</span><span className="text-sm text-gray-800">{analyzed.description}</span></div>
                {analyzed.contact && (
                  <div><span className="text-xs text-gray-400">聯絡人：</span><span className="text-sm text-gray-800">{analyzed.contact}</span></div>
                )}
                <p className="text-xs text-gray-400">信心度：{analyzed.confidence}</p>
                <p className="text-xs text-gray-500">請先從清單選擇對應案件，再套用此內容</p>
                <div className="flex gap-2">
                  <button onClick={() => setView('list')}
                    className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700">
                    選擇案件套用
                  </button>
                  <button onClick={() => { setImgPreview(''); setAnalyzed(null) }}
                    className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                    清除
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
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
