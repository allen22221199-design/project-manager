'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

// 週一晨會（品質會議）的標準流程。
// 資料完全沿用「會議事項」那一份 Notion，不另外開資料庫——
// 開會要看的東西本來就都在議題裡，再開一份就會有兩套進度互相打架。
export type FlowItem = {
  id: string; no: string; meetDate: string; category: string; issue: string
  proposer: string; discussion: string; suggester: string
  owner: string; subtasks: string; due: string; progress: string
  status: string; closedDate: string
}

type StepKind = 'review' | 'category' | 'wrap'
type Step = {
  key: StepKind
  icon: string
  title: string
  min: number          // 預計分鐘數
  who: string          // 這一步誰講話
  talk: string[]       // 該說什麼
  act: string[]        // 該做什麼（會後要留下的東西）
}

// 流程步驟固定三段。第二段的順序刻意跟生產工序一致（前處理→…→施工），
// 讓現場的人照著自己站的位置報，不用在腦袋裡跳來跳去。
const STEPS: Step[] = [
  {
    key: 'review', icon: '🔔', title: '開場・上週回顧', min: 5, who: '主席（會議召集人）',
    talk: [
      '宣布開會：唸出今天的會議日期、出席與缺席的人',
      '唸出上週結案的項目，逐筆確認「真的解決了」，不是拖到沒人提',
      '唸出逾期紅燈清單，先講今天要盯的是哪幾件',
    ],
    act: ['缺席者的議題由主席代唸，會後補追，不可以跳過'],
  },
  {
    key: 'category', icon: '🏭', title: '逐工序檢討（主戲）', min: 25, who: '各類別的負責人，依工序順序輪流',
    talk: [
      '照下面的五句話報告，講完就換下一個，不要在細節上打轉',
      '對事不對人：講現象、講數據，不要講「他都沒做」',
      '不是自己負責的工序，有意見等該工序報完再補充',
    ],
    act: ['每一筆當場更新「進度更新」與「預計日」', '講不出可驗收結果的，當場拆成支線任務'],
  },
  {
    key: 'wrap', icon: '📌', title: '結尾・下週重點', min: 5, who: '主席',
    talk: [
      '唸出今天談過幾件、還有幾件逾期沒解決',
      '講出下週一要優先追的三件事',
    ],
    act: ['確認下週會議日期', '確認會議紀錄由誰發送'],
  },
]

// 逐工序檢討時，每個人照這五句話講，講完換人。
const REPORT_TEMPLATE = [
  '① 上週做到哪：講事實與數字，不要說「有在處理」',
  '② 現在卡在哪：卡料／卡人／卡設備／卡技術／卡錢，講清楚是哪一種',
  '③ 這週要做到什麼：講得出可以驗收的結果',
  '④ 需要誰配合：當場點名，不要會後再去找人',
  '⑤ 預計完成日：講一個日期，不要說「盡快」',
]

type Sub = { who: string; what: string; when: string; done: boolean }
function parseSubs(it: FlowItem): Sub[] {
  return (it.subtasks || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const done = l.startsWith('✔')
    const p = l.replace(/^\s*✔\s*/, '').split('｜').map(x => (x ?? '').trim())
    return { who: p[0] || '', what: p[1] || '', when: p[2] || '', done }
  })
}

// 台北時間的今天；跟 page.tsx 的 todayISO 同一個算法
function todayISO() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}
// 預設會議日：週一到週五抓「本週一」，週六日抓「下週一」——
// 週末在家打開這頁，看到的應該是即將要開的那一場，不是已經開完的。
function defaultMondayISO(): string {
  const t = new Date(Date.now() + 8 * 3600 * 1000)
  const dow = t.getUTCDay()                      // 0=日
  const shift = dow === 0 ? 1 : dow === 6 ? 2 : -(dow - 1)
  t.setUTCDate(t.getUTCDate() + shift)
  return t.toISOString().slice(0, 10)
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function zhDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${'日一二三四五六'[d.getUTCDay()]}）`
}
function mmss(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function MeetingFlow({
  open, closed, categories, catColor, loading, closedLoaded, onRefresh,
}: {
  open: FlowItem[]
  closed: FlowItem[]
  categories: string[]
  catColor: Record<string, string>
  loading?: boolean
  closedLoaded?: boolean
  onRefresh: () => void
}) {
  const [meetDate, setMeetDate] = useState(defaultMondayISO)
  // flow=整份流程一次看完；run=開始開會，一次只出現一步；people=分工總表
  const [tab, setTab] = useState<'flow' | 'run' | 'people'>('flow')
  const [cur, setCur] = useState(0)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})

  // 打勾狀態存在這台裝置上（照流程跑到一半重新整理不會全部歸零）。
  // 不寫回 Notion：這是「今天講到哪」的暫存，不是議題本身的進度。
  const storeKey = 'meetingFlow:' + meetDate
  useEffect(() => {
    try { setTicked(JSON.parse(localStorage.getItem(storeKey) || '{}')) } catch { setTicked({}) }
  }, [storeKey])
  function tick(k: string) {
    setTicked(prev => {
      const next = { ...prev, [k]: !prev[k] }
      try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch { /* 無痕模式寫不進去就算了 */ }
      return next
    })
  }
  function markStep(i: number, done: boolean) {
    const k = 'step:' + STEPS[i].key
    setTicked(prev => {
      if (!!prev[k] === done) return prev
      const next = { ...prev, [k]: done }
      try { localStorage.setItem(storeKey, JSON.stringify(next)) } catch { /* 同上 */ }
      return next
    })
  }

  const today = todayISO()
  const isOverdue = (d: string) => !!d && d < today

  // ── 各步驟要吃的資料 ────────────────────────────────
  const overdue = useMemo(
    () => open.filter(it => isOverdue(it.due)).sort((a, b) => (a.due || '').localeCompare(b.due || '')),
    [open, today])
  const noOwner = useMemo(() => open.filter(it => !it.owner.trim()), [open])
  // 上週結案：結案日落在會議日前 7 天內
  const lastWeekClosed = useMemo(() => {
    const from = addDaysISO(meetDate, -7)
    return closed.filter(it => it.closedDate && it.closedDate >= from && it.closedDate <= meetDate)
  }, [closed, meetDate])
  const byCategory = useMemo(() => [
    ...categories.map(c => ({ cat: c, items: open.filter(it => it.category === c) })),
    { cat: '未分類', items: open.filter(it => !categories.includes(it.category)) },
  ].filter(g => g.items.length > 0), [open, categories])
  const openSubs = useMemo(() => {
    const rows: { it: FlowItem; s: Sub }[] = []
    open.forEach(it => parseSubs(it).forEach(s => { if (!s.done) rows.push({ it, s }) }))
    return rows
  }, [open])

  // ── 分工總表：誰要報告、誰要交東西 ──────────────────
  const people = useMemo(() => {
    const map = new Map<string, { name: string; reports: FlowItem[]; tasks: { it: FlowItem; s: Sub }[] }>()
    const slot = (name: string) => {
      const k = name.trim()
      if (!map.has(k)) map.set(k, { name: k, reports: [], tasks: [] })
      return map.get(k)!
    }
    open.forEach(it => {
      // 負責人欄位可能寫成「王仕華、賴漢量」，拆開才算得出每個人的量
      it.owner.split(/[、,，/／\s]+/).map(s => s.trim()).filter(Boolean).forEach(n => slot(n).reports.push(it))
      parseSubs(it).forEach(s => { if (!s.done && s.who) slot(s.who).tasks.push({ it, s }) })
    })
    return Array.from(map.values()).sort((a, b) =>
      (b.reports.length + b.tasks.length) - (a.reports.length + a.tasks.length) || a.name.localeCompare(b.name))
  }, [open])

  const totalMin = STEPS.reduce((a, s) => a + s.min, 0)
  const doneSteps = STEPS.filter(s => ticked['step:' + s.key]).length

  // ── 開會模式的計時器：進到哪一步就從零開始算，超時轉紅 ──
  const [stepStart, setStepStart] = useState<number>(0)
  const [now, setNow] = useState<number>(0)
  useEffect(() => {
    if (tab !== 'run') return
    setStepStart(Date.now()); setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [tab, cur])
  const elapsed = stepStart ? Math.max(0, Math.floor((now - stepStart) / 1000)) : 0

  // 開會模式的前後切換。按「下一步」時順手把這一步標成完成——
  // 開會的人手上還拿著筆，不會記得回頭補打勾。
  function goNext() {
    markStep(cur, true)
    setCur(Math.min(cur + 1, STEPS.length - 1))
  }
  function goPrev() { setCur(Math.max(cur - 1, 0)) }
  // 鍵盤左右鍵切換（接投影機時最好用），在輸入框裡打字時不攔
  useEffect(() => {
    if (tab !== 'run') return
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [tab, cur])
  // 進入開會模式時，從第一個還沒完成的步驟開始，不用每次從頭點
  function enterRun() {
    const i = STEPS.findIndex(s => !ticked['step:' + s.key])
    setCur(i < 0 ? 0 : i)
    setTab('run')
  }

  // ── 小元件 ────────────────────────────────────────
  const Cat = ({ c }: { c: string }) => (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${catColor[c] ?? 'bg-gray-200 text-gray-600'}`}>{c}</span>
  )
  function ItemRow({ it, showCat }: { it: FlowItem; showCat?: boolean }) {
    const od = isOverdue(it.due)
    const latest = (it.progress || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || ''
    return (
      <label className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer
        ${ticked['it:' + it.id] ? 'bg-gray-50 border-gray-200 opacity-60' : od ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
        <input type="checkbox" checked={!!ticked['it:' + it.id]} onChange={() => tick('it:' + it.id)}
          className="mt-1 w-4 h-4 accent-indigo-600 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 flex-wrap">
            {showCat && <Cat c={it.category || '未分類'} />}
            <span className={`text-base leading-snug ${ticked['it:' + it.id] ? 'line-through text-gray-400' : 'text-gray-900'}`}>{it.issue}</span>
          </span>
          <span className="flex items-center gap-2 flex-wrap text-xs mt-0.5">
            {it.owner
              ? <span className="text-gray-700 font-semibold">👤 {it.owner}</span>
              : <span className="text-amber-600 font-semibold">👤 未指定負責人</span>}
            {it.due
              ? <span className={od ? 'text-red-600 font-semibold' : 'text-gray-400'}>{od ? `🔴 逾期 ${it.due}` : `預計 ${it.due}`}</span>
              : <span className="text-amber-600">未定預計日</span>}
            <span className="font-mono text-gray-300">{it.no}</span>
          </span>
          {latest && <span className="block text-xs text-gray-500 mt-0.5 truncate">最新進度：{latest}</span>}
        </span>
      </label>
    )
  }
  const Empty = ({ children }: { children: ReactNode }) => (
    <p className="text-sm text-gray-400 py-1.5">{children}</p>
  )
  const Head = ({ children }: { children: ReactNode }) => (
    <p className="text-xs font-bold text-gray-500 mt-3 mb-1.5">{children}</p>
  )

  // 每一步下面自動帶出來的實際資料
  function StepData({ kind }: { kind: StepKind }) {
    if (kind === 'review') return (
      <>
        <Head>✅ 上週結案（{lastWeekClosed.length} 件）— 逐筆唸出來確認</Head>
        {!closedLoaded ? <Empty>已結案資料還沒載入，按上面的「↻ 重新整理」。</Empty>
          : lastWeekClosed.length === 0 ? <Empty>上週沒有結案的項目——這件事本身就值得在會議上問一句。</Empty>
          : <div className="space-y-1">{lastWeekClosed.map(it => (
              <div key={it.id} className="flex items-start gap-2 text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                <span className="shrink-0 text-emerald-600">✔</span>
                <span className="flex-1 min-w-0"><span className="text-gray-800">{it.issue}</span>
                  <span className="text-xs text-gray-400 ml-1">{it.owner} · 結案 {it.closedDate}</span></span>
              </div>))}
            </div>}
        <Head>🔴 逾期紅燈（{overdue.length} 件）— 今天一定要處理掉</Head>
        {overdue.length === 0 ? <Empty>沒有逾期項目。</Empty>
          : <div className="space-y-1.5">{overdue.map(it => <ItemRow key={it.id} it={it} showCat />)}</div>}
      </>
    )
    if (kind === 'category') return (
      <>
        <div className="mt-3 rounded-xl bg-indigo-50 border border-indigo-100 p-3">
          <p className="text-xs font-bold text-indigo-800 mb-1.5">📣 報告的人照這五句話講（每人 2 分鐘）</p>
          <ul className="space-y-1">{REPORT_TEMPLATE.map(t => (
            <li key={t} className="text-sm text-gray-700 leading-snug">{t}</li>))}</ul>
        </div>
        {byCategory.length === 0 ? <Empty>目前沒有進行中的議題。</Empty> : byCategory.map(g => {
          const owners = Array.from(new Set(g.items.map(i => i.owner.trim()).filter(Boolean)))
          return (
            <div key={g.cat} className="mt-3">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <Cat c={g.cat} />
                <span className="text-xs text-gray-400">{g.items.length} 件</span>
                <span className="text-xs text-gray-600">
                  發言：{owners.length ? owners.join('、') : <span className="text-amber-600">未指定，這一輪要指定出來</span>}
                </span>
              </div>
              <div className="space-y-1.5">{g.items.map(it => <ItemRow key={it.id} it={it} />)}</div>
            </div>
          )
        })}
      </>
    )
    return (
      <>
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          {[
            { l: '進行中議題', v: open.length, c: 'text-gray-900' },
            { l: '今天談過', v: open.filter(it => ticked['it:' + it.id]).length, c: 'text-indigo-700' },
            { l: '待辦支線任務', v: openSubs.length, c: 'text-gray-900' },
            { l: '逾期紅燈', v: overdue.length, c: overdue.length ? 'text-red-600' : 'text-gray-400' },
            { l: '沒有負責人', v: noOwner.length, c: noOwner.length ? 'text-amber-600' : 'text-gray-400' },
          ].map(s => (
            <div key={s.l} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
              <p className="text-xs text-gray-400">{s.l}</p>
              <p className={`text-2xl font-bold ${s.c}`}>{s.v}</p>
            </div>
          ))}
        </div>
        <Head>📅 下週會議：{zhDate(addDaysISO(meetDate, 7))} {addDaysISO(meetDate, 7)}</Head>
        <Empty>散會前確認：會議紀錄由誰發、下週一要優先追的三件事是哪三件。</Empty>
      </>
    )
  }

  // 「該說什麼／該做什麼」兩欄，流程模式與開會模式共用
  function StepGuide({ s, big }: { s: Step; big?: boolean }) {
    const li = big ? 'text-base' : 'text-sm'
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1">💬 該說什麼</p>
          <ul className="space-y-1">{s.talk.map(t => (
            <li key={t} className={`${li} text-gray-700 leading-snug flex gap-1.5`}><span className="text-gray-300">・</span><span>{t}</span></li>))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-500 mb-1">🛠 該做什麼</p>
          <ul className="space-y-1">{s.act.map(t => (
            <li key={t} className={`${li} text-gray-700 leading-snug flex gap-1.5`}><span className="text-gray-300">・</span><span>{t}</span></li>))}
          </ul>
        </div>
      </div>
    )
  }

  // ── 開會模式：一次只出現一步 ──────────────────────
  if (tab === 'run') {
    const s = STEPS[cur]
    const last = cur === STEPS.length - 1
    const over = elapsed > s.min * 60
    const NavBtns = (
      <div className="flex items-center gap-2">
        <button onClick={goPrev} disabled={cur === 0}
          className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm font-medium hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-30">
          ← 上一步
        </button>
        {last ? (
          <button onClick={() => { markStep(cur, true); setTab('flow') }}
            className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-bold hover:bg-emerald-700">
            ✓ 結束會議
          </button>
        ) : (
          <button onClick={goNext}
            className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-bold hover:bg-indigo-700">
            下一步 →
          </button>
        )}
      </div>
    )
    return (
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <button onClick={() => setTab('flow')}
            className="text-sm text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-1.5">
            ✕ 離開開會畫面
          </button>
          <span className="text-sm text-gray-500">{zhDate(meetDate)} 晨會</span>
          <span className={`ml-auto text-sm font-mono font-bold px-3 py-1.5 rounded-lg
            ${over ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}
            title={over ? '已超過這一步的預計時間' : '這一步已經進行的時間'}>
            ⏱ {mmss(elapsed)} / {s.min}:00
          </span>
        </div>

        {/* 步驟進度條：點圓點可以直接跳步 */}
        <div className="flex items-center gap-1.5 mb-3">
          {STEPS.map((st, i) => (
            <button key={st.key} onClick={() => setCur(i)} title={st.title}
              className={`flex-1 h-2 rounded-full transition-colors
                ${i === cur ? 'bg-indigo-600' : ticked['step:' + st.key] ? 'bg-emerald-400' : 'bg-gray-200 hover:bg-gray-300'}`} />
          ))}
        </div>

        <div className="rounded-2xl border-2 border-indigo-300 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-indigo-50/60 border-b border-indigo-100">
            <p className="text-xs font-bold text-indigo-500">第 {cur + 1} 步 / 共 {STEPS.length} 步</p>
            <p className="text-2xl font-bold text-gray-900 leading-snug mt-0.5">{s.icon} {s.title}</p>
            <p className="text-sm text-gray-600 mt-1">🎤 {s.who}　·　預計 {s.min} 分鐘</p>
          </div>
          <div className="px-4 py-3">
            <StepGuide s={s} big />
            <StepData kind={s.key} />
          </div>
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50/60 flex items-center gap-3 flex-wrap">
            {NavBtns}
            <span className="text-xs text-gray-400">也可以用鍵盤 ← → 切換</span>
          </div>
        </div>

        <div className="mt-3 flex justify-end">{NavBtns}</div>
      </div>
    )
  }

  // ── 一般模式：整份流程／分工總表 ────────────────────
  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h2 className="text-xl font-bold text-gray-900">📅 週一晨會流程</h2>
        <span className="text-sm text-gray-500">{zhDate(meetDate)} · 共 {totalMin} 分鐘 · 已完成 {doneSteps}/{STEPS.length} 步</span>
        <button onClick={onRefresh}
          className="ml-auto text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:border-indigo-400 hover:text-indigo-600">
          ↻ 重新整理
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">照著這三步跑，每一步下面就是今天該講的議題與該點名的人，全部取自「會議事項」的即時資料。打勾只存在這台裝置上。</p>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={enterRun}
          className="bg-indigo-600 text-white rounded-full px-4 py-1.5 text-sm font-bold hover:bg-indigo-700">
          ▶ 開始開會
        </button>
        <button onClick={() => setTab('flow')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border ${tab === 'flow'
            ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          流程步驟
        </button>
        <button onClick={() => setTab('people')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border ${tab === 'people'
            ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          分工總表（{people.length} 人）
        </button>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          會議日期
          <input type="date" value={meetDate} onChange={e => e.target.value && setMeetDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        {doneSteps > 0 && (
          <button onClick={() => { setTicked({}); try { localStorage.removeItem(storeKey) } catch { /* 忽略 */ } }}
            className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg px-2 py-1.5">
            清除今天的打勾
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400 py-2">讀取中…</p>}

      {tab === 'flow' ? (
        <div className="space-y-3">
          {STEPS.map((s, i) => {
            const done = !!ticked['step:' + s.key]
            return (
              <div key={s.key}
                className={`rounded-2xl border overflow-hidden ${done ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-start gap-3 px-3 py-2.5 border-b border-gray-200/70">
                  <button onClick={() => tick('step:' + s.key)}
                    className={`shrink-0 w-8 h-8 rounded-full font-bold text-sm flex items-center justify-center border-2
                      ${done ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-500 border-gray-300 hover:border-indigo-400'}`}
                    title={done ? '取消完成' : '標記這一步完成'}>
                    {done ? '✓' : i + 1}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900 text-lg leading-snug">{s.icon} {s.title}
                      <span className="text-xs font-normal text-gray-400 ml-2">{s.min} 分鐘</span></p>
                    <p className="text-xs text-gray-500 mt-0.5">🎤 {s.who}</p>
                  </div>
                  <button onClick={() => { setCur(i); setTab('run') }}
                    className="shrink-0 text-xs border border-indigo-300 text-indigo-700 rounded-lg px-2.5 py-1.5 font-medium hover:bg-indigo-50">
                    ▶ 從這步開始
                  </button>
                </div>
                <div className="px-3 py-2.5">
                  <StepGuide s={s} />
                  <StepData kind={s.key} />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div>
          <p className="text-xs text-gray-400 mb-2">
            名單直接從議題的「負責人」與支線任務的「執行人」算出來，不用另外維護。多人共同負責時用頓號分開就會各自算一份。
          </p>
          {people.length === 0 ? <Empty>目前沒有指定到人的議題。</Empty> : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {people.map(p => {
                const od = p.reports.filter(it => isOverdue(it.due)).length + p.tasks.filter(t => isOverdue(t.s.when)).length
                return (
                  <div key={p.name} className={`rounded-2xl border ${od ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-white'}`}>
                    <div className="px-3 py-2 border-b border-gray-200/70 flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 text-lg">{p.name}</p>
                      <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">報告 {p.reports.length}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">任務 {p.tasks.length}</span>
                      {od > 0 && <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-bold">逾期 {od}</span>}
                    </div>
                    <div className="p-2.5 space-y-2">
                      <div>
                        <p className="text-xs font-bold text-gray-400 mb-1">🎤 這場要報告的議題</p>
                        {p.reports.length === 0 ? <p className="text-xs text-gray-300">無</p> : (
                          <ul className="space-y-1">{p.reports.map(it => (
                            <li key={it.id} className="text-sm leading-snug flex items-start gap-1.5">
                              <Cat c={it.category || '未分類'} />
                              <span className="min-w-0">
                                <span className="text-gray-800">{it.issue}</span>
                                {it.due && <span className={`text-xs ml-1 ${isOverdue(it.due) ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{it.due}</span>}
                              </span>
                            </li>))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 mb-1">🛠 這場要交代的任務</p>
                        {p.tasks.length === 0 ? <p className="text-xs text-gray-300">無</p> : (
                          <ul className="space-y-1">{p.tasks.map(({ it, s }, i) => (
                            <li key={it.id + i} className="text-sm leading-snug text-gray-800">
                              {s.what}
                              <span className={`text-xs ml-1 ${isOverdue(s.when) ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{s.when || '未定日期'}</span>
                            </li>))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
