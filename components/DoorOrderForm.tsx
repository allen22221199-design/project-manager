'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// 防火門訂料單。從 Desktop\防火門製圖\訂料單網頁.html 移植過來。
//
// 兩件事不能改，改了下游的製圖程式就會畫錯：
//   1. 存出去的鍵名（f_job、f_lw、f_ts0…）與「稀疏物件」的慣例——沒填的欄位整個不存在，
//      不是存空字串。製圖程式是用「有沒有這個鍵」在判斷這支料要不要畫。
//   2. 棟名() 的正規化規則，必須跟 door_draw.py 的 棟名() 一字不差，
//      否則網頁分到 A 棟的門，出圖會跑到別的檔案裡。

export type Door = Record<string, any>
export type DoorRow = { id: string; door: Door; updatedAt: string }

// ---------- 靜態資料（照原訂料單逐字搬過來）----------

// [代號, 適用, 信心]。信心「低」的會跳人工核對警告。
const LOCKS: [string, string, string][] = [
  ['陶大-單開門', '單開門（廊道、梯廳）', '高'],
  ['陶大-雙開門母扇', '雙開門母扇', '高'],
  ['陶大-雙開門子扇', '雙開門子扇', '高'],
  ['宏普時尚院-單開門', '單開門', '中'],
  ['宏普中央二期-雙開門子扇', '雙開門子扇', '中'],
  ['宏普中央二期-雙開門母扇', '雙開門母扇', '低'],
  ['華毅達-大門外框', '大門外框直料', '高'],
  ['冠德-框受口', '單開門框直料', '高'],
  ['冠德-上下栓受口', '門框直料', '高'],
  ['冠德-上段橢圓', '門框直料', '高'],
  ['惠宇-框對孔', '門框直料', '中'],
]

const 門型 = ['單開門', '雙開門母扇', '雙開門子扇']
const 位置建議 = ['梯廳', '廊道', '大門', '檢修', '後陽台', '機房', '大廳', '貨梯', '樓梯', '茶室']
const 左缺口角 = ['右上', '左上', '右下', '左下']
const 右缺口角 = ['左上', '右上', '左下', '右下']
const 孔件 = ['門扇', '左框', '右框', '上框', '檔板']
const 孔形 = ['圓', '橢圓', '方孔', '長圓孔']
const HOLE_COLS: [string, 'select' | 'num', string[]?][] = [
  ['件', 'select', 孔件], ['形狀', 'select', 孔形],
  ['直徑', 'num'], ['寬', 'num'], ['高', 'num'],
  ['距底', 'num'], ['距左', 'num'], ['距右', 'num'], ['距內', 'num'],
]

// 存進 JSON 的純量欄位，順序就是鍵的順序
const FIELDS = ['f_job', 'f_bldg', 'f_floor', 'f_qty', 'f_no', 'f_place', 'f_type',
  'f_tl', 'f_tw', 'f_lh', 'f_lw', 'f_ll', 'f_rl', 'f_lfw', 'f_rfw',
  'f_ts0', 'f_ts1', 'f_ts2', 'f_ts3', 'f_ls0', 'f_ls1', 'f_ls2', 'f_ls3',
  'f_lnc', 'f_lnw', 'f_lnh', 'f_rs0', 'f_rs1', 'f_rs2', 'f_rs3',
  'f_rnc', 'f_rnw', 'f_rnh', 'f_dw', 'f_dl', 'f_ds0', 'f_ds1', 'f_ds2',
  'f_lws0', 'f_lws1', 'f_lws2', 'f_lws3', 'f_lhs0', 'f_lhs1', 'f_lhs2', 'f_lhs3',
  'f_side', 'f_memo']

// 存完之後留在畫面上的欄位——同一批門這幾樣多半一樣，每樘重打很煩
const 留下 = ['f_job', 'f_bldg', 'f_floor', 'f_place', 'f_type', 'f_qty']

// ---------- 純函式（與 door_draw.py 對齊，不要改）----------

// 摺段相加。parseFloat 語意照舊："30abc"→30、空白跳過。全部沒填回 null。
function sumSegs(f: Record<string, string>, pre: string, n = 4): number | null {
  let sum = 0, any = false
  for (let i = 0; i < n; i++) {
    const v = parseFloat(f[pre + i] ?? '')
    if (!isNaN(v)) { sum += v; any = true }
  }
  return any ? Math.round(sum * 1000) / 1000 : null
}

function doorName(d: Door): string {
  const n = [String(d.f_place ?? '').trim(), String(d.f_type ?? '').trim()].filter(Boolean).join('-')
  return n || String(d.f_name ?? '').trim()
}

// 分組用的棟名。跟 door_draw.py 的 棟名() 同一套規則。
function 棟名(d: Door): string {
  let s = String(d.f_bldg ?? '').trim()
  if (s.includes('+')) {
    // 「C+D」「A+B+C+D」是拼版圖的標題，不是這一樘的棟別；真正的棟在圖號裡
    const no = String(d.f_no ?? '').trim().toUpperCase()
    if (no.length === 1 && 'ABCD'.includes(no)) return no
  }
  const u = s.toUpperCase().replace(/０/g, '0').replace(/Ｏ/g, 'O')
  if (['NO', 'N0', 'NONE', '無'].includes(u)) return '未標示'
  if (s.length > 1 && s.endsWith('棟')) s = s.slice(0, -1)
  return s || '未標示'
}

const 棟序 = (b: string) => { const k = 'ABCD'.indexOf(b); return k >= 0 ? '0' + k : '1' + b }

// 圖號排序：純數字照數值在前，其他字串居中，空白最後
function 圖號序(d: Door): [number, number, string] {
  const s = String(d.f_no ?? '').trim()
  if (!s) return [2, 0, '']
  if (/^\d+(\.\d+)?$/.test(s)) return [0, parseFloat(s), '']
  return [1, 0, s]
}

// ---------- 樣式（沿用 App 既有的寫法）----------
const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const SELECT = INPUT + ' bg-white'
const AUTO = 'w-full border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 italic'
const CAP = 'text-xs font-medium text-gray-600'
const HINT = 'text-xs text-gray-400 mt-1'
const CARD = 'glass-card p-4'

// 這兩個一定要定義在元件外面。放在元件裡面的話，每次 render 都是一個新的
// 函式型別，React 會把 input 整個重掛，打一個字游標就跳掉。
function Num({ v, on, ph }: { v: string; on: (s: string) => void; ph?: string }) {
  return <input className={INPUT} inputMode="decimal" placeholder={ph} value={v}
    onChange={e => on(e.target.value)} />
}

function Seg({ pre, n, f, set }: { pre: string; n?: number; f: Record<string, string>; set: (k: string, v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: n ?? 4 }, (_, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          {i > 0 && <span className="text-gray-300 text-xs shrink-0">＋</span>}
          <input className={INPUT + ' min-w-0'} inputMode="decimal" value={f[pre + i] ?? ''}
            onChange={e => set(pre + i, e.target.value)} />
        </span>
      ))}
    </div>
  )
}

export default function DoorOrderForm() {
  const [rows, setRows] = useState<DoorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState('')                 // 目前在看哪一張工單
  const [f, setF] = useState<Record<string, string>>({})
  const [holes, setHoles] = useState<Record<string, string>[]>([])
  const [locks, setLocks] = useState<string[]>([''])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [justId, setJustId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const msgTimer = useRef<any>(null)
  const 表單頂 = useRef<HTMLDivElement>(null)

  const toast = useCallback((m: string) => {
    setMsg(m)
    clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMsg(''), 3200)
  }, [])

  // 剛存的那一列先亮綠色再退掉。改了棟別或圖號的話那一列會跳到別的群組去，
  // 沒有這個提示，畫面看起來就像沒存成功。
  useEffect(() => {
    if (!justId) return
    const el = document.getElementById('door-' + justId)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setJustId(null), 2400)
    return () => clearTimeout(t)
  }, [justId])

  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  // ---------- 載入 ----------
  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch('/api/door-orders')
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || '讀取失敗')
      setRows(Array.isArray(d.rows) ? d.rows : [])
    } catch (e: any) { setErr(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 第一次載到資料時，自動跳到最後一樘所屬的工單，並把建案/棟別帶進表單
  const inited = useRef(false)
  useEffect(() => {
    if (inited.current || !rows.length) return
    inited.current = true
    const last = rows[rows.length - 1].door
    setJob(String(last.f_job ?? ''))
    setF(p => ({ ...p, f_job: String(last.f_job ?? ''), f_bldg: String(last.f_bldg ?? '') }))
  }, [rows])

  // ---------- 衍生值 ----------
  const 工單清單 = useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => { const j = String(r.door.f_job ?? '').trim(); if (j) s.add(j) })
    return [...s].sort()
  }, [rows])

  // 這張工單的門。分組與排序只影響畫面，不影響存出去的順序。
  const 本單 = useMemo(() => rows.filter(r => String(r.door.f_job ?? '').trim() === job.trim()), [rows, job])

  const 分組 = useMemo(() => {
    const g = new Map<string, DoorRow[]>()
    本單.forEach(r => {
      const b = 棟名(r.door)
      if (!g.has(b)) g.set(b, [])
      g.get(b)!.push(r)
    })
    const out = [...g.entries()].sort((a, b) => (棟序(a[0]) < 棟序(b[0]) ? -1 : 1))
    out.forEach(([, list]) => list.sort((a, b) => {
      const x = 圖號序(a.door), y = 圖號序(b.door)
      return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2])
    }))
    return out
  }, [本單])

  // 展開寬四個是硬自動，永遠等於摺段相加
  const 自動 = useMemo(() => ({
    f_tw: sumSegs(f, 'f_ts'), f_lfw: sumSegs(f, 'f_ls'),
    f_rfw: sumSegs(f, 'f_rs'), f_dw: sumSegs(f, 'f_ds', 3),
  }), [f])
  // 門扇寬高是軟自動：有填摺段才鎖起來，沒填就讓人自己打
  const 扇寬 = sumSegs(f, 'f_lws')
  const 扇高 = sumSegs(f, 'f_lhs')
  const 顯示寬 = 扇寬 !== null ? String(扇寬) : (f.f_lw ?? '')
  const 顯示高 = 扇高 !== null ? String(扇高) : (f.f_lh ?? '')

  // ---------- 組出要存的那一包 ----------
  function readForm(): Door {
    const d: Door = {}
    const 值: Record<string, string> = {
      ...f,
      f_tw: 自動.f_tw === null ? '' : String(自動.f_tw),
      f_lfw: 自動.f_lfw === null ? '' : String(自動.f_lfw),
      f_rfw: 自動.f_rfw === null ? '' : String(自動.f_rfw),
      f_dw: 自動.f_dw === null ? '' : String(自動.f_dw),
      f_lw: 顯示寬, f_lh: 顯示高,
    }
    // 稀疏：空的鍵整個不放進去
    FIELDS.forEach(k => { const v = String(值[k] ?? '').trim(); if (v) d[k] = v })
    const hs = holes.map(h => {
      const o: Record<string, string> = {}
      HOLE_COLS.forEach(([k]) => { const v = String(h[k] ?? '').trim(); if (v) o[k] = v })
      return o
    }).filter(h => Object.keys(h).length)
    if (hs.length) d.holes = hs
    const lk = locks.map(x => x.trim()).filter(Boolean)
    if (lk.length) d.locks = lk
    return d
  }

  function missing(d: Door): string[] {
    const m: string[] = []
    if (!d.f_job) m.push('建案/工單')
    if (!d.f_floor) m.push('樓層')
    if (!d.f_lw) m.push('門扇寬')
    if (!d.f_lh) m.push('門扇高')
    if ((d.locks || []).length && !d.f_side) m.push('鎖側')
    return m
  }

  function fillForm(d: Door | null) {
    const n: Record<string, string> = {}
    FIELDS.forEach(k => { n[k] = d ? String(d[k] ?? '') : '' })
    setF(n)
    setHoles(d && Array.isArray(d.holes) ? d.holes.map((h: any) => ({ ...h })) : [])
    setLocks(d && Array.isArray(d.locks) && d.locks.length ? [...d.locks] : [''])
  }

  // ---------- 動作 ----------
  async function save() {
    const d = readForm()

    // 棟別／樓層沒填就沿用上一樘，但一定要講出來補了什麼。
    // 安靜地補錯樓層，比擋下來讓人重填糟糕得多。
    const 參考 = editingId
      ? (() => { const i = rows.findIndex(r => r.id === editingId); return i > 0 ? rows[i - 1].door : null })()
      : (本單.length ? 本單[本單.length - 1].door : (rows.length ? rows[rows.length - 1].door : null))
    const 補了: string[] = []
    if (參考) {
      ;([['f_bldg', '棟別'], ['f_floor', '樓層']] as const).forEach(([k, 名]) => {
        if (!d[k] && 參考[k]) { d[k] = 參考[k]; 補了.push(名 + '＝' + 參考[k]) }
      })
    }

    const m = missing(d)
    if (m.length) { toast('還缺：' + m.join('、')); return }

    setBusy(true); setErr('')
    try {
      let id = editingId
      if (id) {
        const r = await fetch('/api/door-orders', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, door: d }),
        })
        const j = await r.json(); if (!r.ok) throw new Error(j.error || '存檔失敗')
        setRows(p => p.map(x => (x.id === id ? { ...x, door: d } : x)))
      } else {
        const r = await fetch('/api/door-orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ door: d }),
        })
        const j = await r.json(); if (!r.ok) throw new Error(j.error || '存檔失敗')
        id = j.id
        setRows(p => [...p, { id: j.id, door: d, updatedAt: '' }])
      }
      setEditingId(null)
      setJustId(id)
      setJob(String(d.f_job ?? ''))
      // 留下同一批常常一樣的那幾格，其餘清空
      const 留: Record<string, string> = {}
      留下.forEach(k => { 留[k] = String(d[k] ?? '') })
      fillForm(null)
      setF(p => ({ ...p, ...留 }))
      toast(`已存　歸到「${棟名(d)}」` + (補了.length ? '　自動補：' + 補了.join('、') : ''))
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  async function remove(r: DoorRow) {
    if (!window.confirm(`確定要刪除「${doorName(r.door) || r.door.f_no || '這一樘'}」嗎？`)) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/door-orders?id=' + encodeURIComponent(r.id), { method: 'DELETE' })
      const j = await res.json(); if (!res.ok) throw new Error(j.error || '刪除失敗')
      setRows(p => p.filter(x => x.id !== r.id))
      if (editingId === r.id) { setEditingId(null); fillForm(null) }
      toast('已刪除')
    } catch (e: any) { setErr(e.message) }
    finally { setBusy(false) }
  }

  function edit(r: DoorRow) {
    setEditingId(r.id)
    fillForm(r.door)
    表單頂.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function reuse() {
    const 來源 = 本單.length ? 本單[本單.length - 1].door : null
    if (!來源) { toast('這張工單還沒有可以沿用的門'); return }
    const d = JSON.parse(JSON.stringify(來源))
    delete d.f_no          // 圖號每樘不同，不沿用
    setEditingId(null)
    fillForm(d)
    toast(`已帶入「${doorName(d)}」，改掉不一樣的地方就好`)
  }

  function 門單JSON() {
    return JSON.stringify({ doors: 本單.map(r => r.door) }, null, 1)
  }

  function download() {
    if (!本單.length) { toast('這張工單還沒有門'); return }
    const name = (job.trim() || '門單').replace(/[\\/:*?"<>|]/g, '_') + '-門單.json'
    const url = URL.createObjectURL(new Blob([門單JSON()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast('已下載 ' + name + '，拖到製圖.exe 上面就會出圖')
  }

  async function copyAll() {
    if (!本單.length) { toast('這張工單還沒有門'); return }
    try {
      await navigator.clipboard.writeText(門單JSON())
      toast(`已複製 ${本單.length} 樘`)
    } catch { toast('複製失敗，請改用「下載門單」') }
  }

  // 有鎖具卻沒選鎖側——這個沒有預設值，選錯孔會切到門的另一邊
  const 鎖側警告 = locks.some(Boolean) && !f.f_side

  return (
    <div className="pb-4" ref={表單頂}>
      <p className="text-xl font-bold text-gray-900">🚪 門單</p>
      <p className="text-xs text-gray-400 mb-4">
        防火門訂料尺寸。一次填一樘，填了哪幾格就畫哪幾格，沒有的件整組留空。單位 mm，全部填「攤平之後」的尺寸。
      </p>

      {err && <div className="glass-card p-3 mb-3 text-sm text-red-600">{err}</div>}

      {/* ---- 這一批 ---- */}
      <div className={CARD + ' mb-3'}>
        <p className="text-sm font-medium text-gray-700 mb-3">這一批</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className={CAP}>建案 / 工單 <span className="text-red-400">*</span></span>
            <input className={INPUT + ' mt-1'} list="joblist" placeholder="大安一期"
              value={f.f_job ?? ''} onChange={e => { set('f_job', e.target.value); setJob(e.target.value) }} />
            <datalist id="joblist">{工單清單.map(j => <option key={j} value={j} />)}</datalist>
            <span className={HINT}>選既有的工單會把那一批的門叫出來；打新的就是開一張新單。</span>
          </label>
          <label className="block">
            <span className={CAP}>棟別</span>
            <input className={INPUT + ' mt-1'} placeholder="A棟（沒標就留空）"
              value={f.f_bldg ?? ''} onChange={e => set('f_bldg', e.target.value)} />
            <span className={HINT}>來源圖沒標棟別就留空，圖上會印「未標示」。沒填會沿用上一樘。</span>
          </label>
        </div>
      </div>

      {/* ---- 這一樘 ---- */}
      <div className={CARD + ' mb-3'}>
        <p className="text-sm font-medium text-gray-700 mb-3">
          這一樘{editingId && <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">修改中</span>}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="block">
            <span className={CAP}>樓層 <span className="text-red-400">*</span></span>
            <input className={INPUT + ' mt-1'} placeholder="B1（沒填沿用上一樘）"
              value={f.f_floor ?? ''} onChange={e => set('f_floor', e.target.value)} />
          </label>
          <label className="block">
            <span className={CAP}>圖號</span>
            <input className={INPUT + ' mt-1'} placeholder="可空" value={f.f_no ?? ''}
              onChange={e => set('f_no', e.target.value)} />
          </label>
          <label className="block">
            <span className={CAP}>份數</span>
            <input className={INPUT + ' mt-1'} inputMode="numeric" placeholder="1"
              value={f.f_qty ?? ''} onChange={e => set('f_qty', e.target.value)} />
          </label>
          <label className="block">
            <span className={CAP}>位置</span>
            <input className={INPUT + ' mt-1'} list="placelist" placeholder="梯廳（可自己打）"
              value={f.f_place ?? ''} onChange={e => set('f_place', e.target.value)} />
            <datalist id="placelist">{位置建議.map(p => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="block">
            <span className={CAP}>門型</span>
            <select className={SELECT + ' mt-1'} value={f.f_type ?? ''} onChange={e => set('f_type', e.target.value)}>
              <option value="">—</option>
              {門型.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={CAP}>印在圖上的名稱</span>
            <input className={AUTO + ' mt-1'} readOnly tabIndex={-1} placeholder="位置 ＋ 門型 自動組合"
              value={doorName({ f_place: f.f_place, f_type: f.f_type })} />
          </label>
        </div>
      </div>

      {/* ---- 門扇和框料 ---- */}
      <div className={CARD + ' mb-3'}>
        <p className="text-sm font-medium text-gray-700 mb-3">門扇和框料</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className={CAP}>門扇　寬 <span className="text-red-400">*</span></span>
            {扇寬 !== null
              ? <input className={AUTO + ' mt-1'} readOnly tabIndex={-1} value={顯示寬} />
              : <input className={INPUT + ' mt-1'} inputMode="decimal" value={f.f_lw ?? ''} onChange={e => set('f_lw', e.target.value)} />}
          </label>
          <label className="block">
            <span className={CAP}>門扇　高 <span className="text-red-400">*</span></span>
            {扇高 !== null
              ? <input className={AUTO + ' mt-1'} readOnly tabIndex={-1} value={顯示高} />
              : <input className={INPUT + ' mt-1'} inputMode="decimal" value={f.f_lh ?? ''} onChange={e => set('f_lh', e.target.value)} />}
          </label>
          <label className="block"><span className={CAP}>上框　長</span><div className="mt-1"><Num v={f.f_tl ?? ''} on={v => set('f_tl', v)} /></div></label>
          <label className="block">
            <span className={CAP}>上框　展開寬</span>
            <input className={AUTO + ' mt-1'} readOnly tabIndex={-1} placeholder="摺段相加"
              value={自動.f_tw === null ? '' : String(自動.f_tw)} />
          </label>
          <label className="block"><span className={CAP}>左框　長</span><div className="mt-1"><Num v={f.f_ll ?? ''} on={v => set('f_ll', v)} /></div></label>
          <label className="block">
            <span className={CAP}>左框　展開寬</span>
            <input className={AUTO + ' mt-1'} readOnly tabIndex={-1} placeholder="摺段相加"
              value={自動.f_lfw === null ? '' : String(自動.f_lfw)} />
          </label>
          <label className="block"><span className={CAP}>右框　長</span><div className="mt-1"><Num v={f.f_rl ?? ''} on={v => set('f_rl', v)} /></div></label>
          <label className="block">
            <span className={CAP}>右框　展開寬</span>
            <input className={AUTO + ' mt-1'} readOnly tabIndex={-1} placeholder="摺段相加"
              value={自動.f_rfw === null ? '' : String(自動.f_rfw)} />
          </label>
        </div>
      </div>

      {/* ---- 摺段 ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className={CARD}>
          <p className="text-sm font-medium text-gray-700">門扇</p>
          <p className="text-xs text-gray-400 mb-3">門扇要反折才填，沒折就整組留空。</p>
          <span className={CAP}>摺段（由左而右）</span>
          <div className="mt-1 mb-1"><Seg pre="f_lws" f={f} set={set} /></div>
          <p className={HINT}>例：兩側各反折 30 就填 30／942／30，門扇寬自動變成 1002。</p>
          <span className={CAP + ' block mt-3'}>摺段（由下而上）</span>
          <div className="mt-1 mb-1"><Seg pre="f_lhs" f={f} set={set} /></div>
          <p className={HINT}>上下也要折才填。填了門扇高就自動相加。</p>
        </div>

        <div className={CARD}>
          <p className="text-sm font-medium text-gray-700">上框</p>
          <p className="text-xs text-gray-400 mb-3">單片不折就只填第一格。展開寬會自動相加，不用填。</p>
          <span className={CAP}>摺段（由下而上）</span>
          <div className="mt-1"><Seg pre="f_ts" f={f} set={set} /></div>
        </div>

        <div className={CARD}>
          <p className="text-sm font-medium text-gray-700 mb-3">左框</p>
          <span className={CAP}>摺段（由左而右）</span>
          <div className="mt-1 mb-3"><Seg pre="f_ls" f={f} set={set} /></div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block"><span className={CAP}>缺口角</span>
              <select className={SELECT + ' mt-1'} value={f.f_lnc ?? ''} onChange={e => set('f_lnc', e.target.value)}>
                <option value="">無</option>{左缺口角.map(c => <option key={c} value={c}>{c}</option>)}
              </select></label>
            <label className="block"><span className={CAP}>缺口寬</span><div className="mt-1"><Num v={f.f_lnw ?? ''} on={v => set('f_lnw', v)} /></div></label>
            <label className="block"><span className={CAP}>缺口高</span><div className="mt-1"><Num v={f.f_lnh ?? ''} on={v => set('f_lnh', v)} /></div></label>
          </div>
        </div>

        <div className={CARD}>
          <p className="text-sm font-medium text-gray-700 mb-3">右框</p>
          <span className={CAP}>摺段（由左而右）</span>
          <div className="mt-1 mb-3"><Seg pre="f_rs" f={f} set={set} /></div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block"><span className={CAP}>缺口角</span>
              <select className={SELECT + ' mt-1'} value={f.f_rnc ?? ''} onChange={e => set('f_rnc', e.target.value)}>
                <option value="">無</option>{右缺口角.map(c => <option key={c} value={c}>{c}</option>)}
              </select></label>
            <label className="block"><span className={CAP}>缺口寬</span><div className="mt-1"><Num v={f.f_rnw ?? ''} on={v => set('f_rnw', v)} /></div></label>
            <label className="block"><span className={CAP}>缺口高</span><div className="mt-1"><Num v={f.f_rnh ?? ''} on={v => set('f_rnh', v)} /></div></label>
          </div>
        </div>

        <div className={CARD}>
          <p className="text-sm font-medium text-gray-700">檔板</p>
          <p className="text-xs text-gray-400 mb-3">雙開門母扇才有，沒有就整組留空。</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <label className="block"><span className={CAP}>展開寬</span>
              <input className={AUTO + ' mt-1'} readOnly tabIndex={-1} placeholder="摺段相加"
                value={自動.f_dw === null ? '' : String(自動.f_dw)} /></label>
            <label className="block"><span className={CAP}>長</span><div className="mt-1"><Num v={f.f_dl ?? ''} on={v => set('f_dl', v)} /></div></label>
          </div>
          <span className={CAP}>摺段</span>
          <div className="mt-1"><Seg pre="f_ds" n={3} f={f} set={set} /></div>
        </div>

        {/* ---- 門鎖 ---- */}
        <div className={CARD}>
          <p className="text-sm font-medium text-gray-700">門鎖</p>
          <p className="text-xs text-gray-400 mb-3">選了型號，孔位會在出圖時自動帶出來。</p>
          {locks.map((code, i) => {
            const t = LOCKS.find(l => l[0] === code)
            return (
              <div key={i} className="mb-2">
                <div className="flex items-center gap-2">
                  <select className={SELECT} value={code}
                    onChange={e => setLocks(p => p.map((x, j) => (j === i ? e.target.value : x)))}>
                    <option value="">—</option>
                    {LOCKS.map(([c, use, conf]) => <option key={c} value={c}>{`${c}　（${use}・信心${conf}）`}</option>)}
                  </select>
                  <button type="button" onClick={() => setLocks(p => (p.length > 1 ? p.filter((_, j) => j !== i) : ['']))}
                    className="shrink-0 text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-2 py-1">移除</button>
                </div>
                {t && (t[2] === '低'
                  ? <p className="text-xs text-amber-700 mt-1">⚠ 這個型號樣本很少，出圖後請人工核對孔位。</p>
                  : <p className={HINT}>適用：{t[1]}</p>)}
              </div>
            )
          })}
          <button type="button" onClick={() => setLocks(p => [...p, ''])}
            className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50">＋ 再加一組鎖具</button>

          <label className="block mt-3">
            <span className={CAP}>鎖側 <span className="text-red-400">*</span>（選了鎖具就必填）</span>
            <select className={SELECT + ' mt-1'} value={f.f_side ?? ''} onChange={e => set('f_side', e.target.value)}>
              <option value="">—</option><option value="左">左</option><option value="右">右</option>
            </select>
          </label>
          {鎖側警告 && (
            <p className="text-xs text-red-600 mt-2">
              選了鎖具就一定要選鎖側。這個沒有預設值，選錯孔會切到門的另一邊。
            </p>
          )}
        </div>
      </div>

      {/* ---- 其他孔 ---- */}
      <div className={CARD + ' mb-3'}>
        <p className="text-sm font-medium text-gray-700">其他孔</p>
        <p className="text-xs text-gray-400 mb-3">
          量到孔的<b>邊緣</b>，不是孔的中心。距左和距右擇一；距內＝靠門扇那側（框料專用）。
        </p>
        {holes.map((h, i) => (
          <div key={i} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
            <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
              {HOLE_COLS.map(([k, type, opts]) => (
                <label key={k} className="block">
                  <span className={CAP}>{k}</span>
                  {type === 'select'
                    ? <select className={SELECT + ' mt-1'} value={h[k] ?? ''}
                        onChange={e => setHoles(p => p.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}>
                        <option value="">—</option>
                        {(opts || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    : <input className={INPUT + ' mt-1'} inputMode="decimal" value={h[k] ?? ''}
                        onChange={e => setHoles(p => p.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />}
                </label>
              ))}
            </div>
            <button type="button" onClick={() => setHoles(p => p.filter((_, j) => j !== i))}
              className="mt-2 text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-2 py-1">刪掉這個孔</button>
          </div>
        ))}
        <button type="button" onClick={() => setHoles(p => [...p, {}])}
          className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50">＋ 再加一個孔</button>
      </div>

      {/* ---- 備註 ---- */}
      <div className={CARD + ' mb-3'}>
        <p className="text-sm font-medium text-gray-700">備註</p>
        <p className="text-xs text-gray-400 mb-2">不確定的地方寫這裡，出圖前會有人回頭確認。</p>
        <textarea rows={2} className={INPUT + ' resize-none'} value={f.f_memo ?? ''}
          onChange={e => set('f_memo', e.target.value)} />
      </div>

      {/* ---- 動作 ---- */}
      <div className="glass-card p-3 mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy}
          className="aurora-grad text-white shadow-sm rounded-lg px-4 py-2 text-sm font-medium hover:brightness-105 disabled:opacity-40 shrink-0">
          {busy ? '存檔中…' : editingId ? '儲存修改' : '存這一樘'}
        </button>
        <button type="button" onClick={reuse}
          className="bg-white border border-indigo-300 text-indigo-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-50">沿用上一樘</button>
        <button type="button" onClick={() => { setEditingId(null); fillForm(null) }}
          className="text-sm text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5">清空欄位</button>
        <span className="flex-1" />
        <button type="button" onClick={download}
          className="bg-white border border-indigo-300 text-indigo-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-50">下載門單</button>
        <button type="button" onClick={copyAll}
          className="text-sm text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5">複製全部</button>
      </div>

      {/* ---- 清單 ---- */}
      <p className="text-sm font-medium text-gray-700 mb-1">
        {job.trim() ? `「${job.trim()}」已填 ${本單.length} 樘` : '已填的門'}
      </p>
      <p className="text-xs text-gray-400 mb-3">照棟分組，棟裡面依圖號排。點「改」可以回頭修改。</p>

      {loading && <div className="glass-card p-4 text-sm text-gray-400">讀取中…</div>}
      {!loading && !本單.length && (
        <div className="glass-card p-4 text-sm text-gray-400">
          {job.trim() ? '這張工單還沒有門。填好上面的欄位，按「存這一樘」。' : '上面先填「建案 / 工單」。'}
        </div>
      )}

      {分組.map(([棟, list]) => (
        <div key={棟} className="mb-3">
          <div className="flex items-baseline gap-2 mb-1.5 px-1">
            <span className="text-xs font-bold text-gray-500">{/^[A-Za-z0-9]$/.test(棟) ? 棟 + ' 棟' : 棟}</span>
            <span className="text-xs text-gray-400">{list.length} 樘</span>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            {list.map(r => {
              const d = r.door
              const sz = (a: string, b: string) => (d[a] && d[b]) ? `${d[a]}×${d[b]}` : (d[a] || '')
              return (
                <div key={r.id} id={'door-' + r.id}
                  className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0 text-sm transition-colors ${
                    r.id === editingId ? 'bg-indigo-50' : r.id === justId ? 'bg-emerald-50' : ''}`}>
                  <span className="w-10 shrink-0 text-xs text-gray-400">{d.f_floor || ''}</span>
                  <span className="w-10 shrink-0 text-xs mono-num text-gray-500">{d.f_no || ''}</span>
                  <span className="flex-1 min-w-0 truncate">{doorName(d) || <span className="text-gray-300">未命名</span>}</span>
                  <span className="hidden md:inline text-xs mono-num text-gray-500 w-24 text-right">{sz('f_lw', 'f_lh')}</span>
                  <span className="hidden lg:inline text-xs mono-num text-gray-400 w-20 text-right">{sz('f_tl', 'f_tw')}</span>
                  {(d.locks || []).length > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800 shrink-0">鎖</span>}
                  <button type="button" onClick={() => edit(r)}
                    className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">改</button>
                  <button type="button" onClick={() => remove(r)}
                    className="shrink-0 text-gray-300 hover:text-red-500 px-1 leading-none">✕</button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* 提示條。固定在手機底部導覽列上方。 */}
      {msg && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 z-30 pointer-events-none
                        rounded-full px-4 py-2 text-sm text-white shadow-lg bg-gray-900/90 max-w-[92vw] text-center">
          {msg}
        </div>
      )}
    </div>
  )
}
