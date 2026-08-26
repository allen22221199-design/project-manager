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

type StepKind = 'people' | 'help' | 'propose'
type Step = {
  key: StepKind
  icon: string
  title: string
  min: number          // 預計分鐘數
  who: string          // 這一步誰講話
  talk: string[]       // 該說什麼
  act: string[]        // 該做什麼（會後要留下的東西）
}

// 三步：先各自報自己手上的、再喬需要別人幫忙的、最後才提新的。
// 順序刻意這樣排——沒先聽完現況就開始提新案，會變成舊案一直沒人收尾。
const STEPS: Step[] = [
  {
    key: 'people', icon: '🧑‍🔧', title: '逐人回報任務與進度', min: 30, who: '每個人輪流講自己名下的（含支線任務的執行人）',
    talk: [
      '一個人一個人講，把自己負責的議題與支線任務唸過一遍',
      '每一筆稍微解釋：這件事在做什麼、現在做到哪',
      '講事實與數字，不要說「有在處理」',
    ],
    act: ['講完當場更新「進度更新」與「預計日」', '名下沒有東西的人也要出聲，不要跳過'],
  },
  {
    key: 'help', icon: '🤝', title: '協助需求與難題討論', min: 15, who: '需要別人幫忙的人，以及被點到名的人',
    talk: [
      '照這句話講：「我需要〈誰〉在〈哪一天前〉幫我〈做什麼〉，因為〈卡在哪〉」',
      '被點名的人當場回一句做不做得到、哪一天可以給',
      '一時喬不定的難題就攤開來討論，不要私下再約',
    ],
    act: ['喬好的當場開一條支線任務：執行人｜任務｜預計日', '做不到就當場改日期，會議上改沒關係，會後跳票才有關係'],
  },
  {
    key: 'propose', icon: '💡', title: '新的提議項目', min: 15, who: '提案人（任何人都可以提）',
    talk: [
      '照 5W2H 講一遍，七項缺一項大家就聽不懂在講什麼',
      '原因還沒查清楚就直接說「未確認」，不要用猜的當結論',
    ],
    act: ['當場按「＋ 新增議題」建檔，選類別、寫提案人', '當場指定負責人與預計日，沒指定的不准離開這一步'],
  },
]

// 第一步：每個人照這幾句話把自己名下的東西講一遍
const REPORT_TEMPLATE = [
  '① 這件事在做什麼：一句話讓沒碰過的人也聽得懂',
  '② 現在做到哪：講事實與數字，不要說「有在處理」',
  '③ 下一步要做什麼：講得出可以驗收的結果',
  '④ 預計哪一天完成：講一個日期，不要說「盡快」',
]

// 第三步：新提議要講滿的 7 個必問項（跟教材那套 5W2H 同一組，講法一致）
const PROPOSE_5W2H = [
  { en: 'What', zh: '什麼事', q: '哪個工序、哪一批、什麼現象', color: '#2563EB' },
  { en: 'When', zh: '何時', q: '什麼時候發現、發生幾次、多久一次', color: '#0F766E' },
  { en: 'Where', zh: '何地', q: '哪一台機、哪一區、哪個工地', color: '#0F766E' },
  { en: 'Who', zh: '誰', q: '誰發現的、誰經手的（對事不對人）', color: '#0F766E' },
  { en: 'Why', zh: '為什麼', q: '目前判斷的原因；還沒查清楚就說「未確認」', color: '#7C3AED' },
  { en: 'How', zh: '怎麼辦', q: '建議的對策，越具體越好', color: '#B45309' },
  { en: 'How much', zh: '花多少', q: '影響幾片／幾坪／多少錢／多少工時', color: '#B45309' },
]

type Sub = { who: string; what: string; when: string; done: boolean }
function parseSubs(it: FlowItem): Sub[] {
  return (it.subtasks || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const done = l.startsWith('✔')
    const p = l.replace(/^\s*✔\s*/, '').split('｜').map(x => (x ?? '').trim())
    return { who: p[0] || '', what: p[1] || '', when: p[2] || '', done }
  })
}
// 負責人欄位常寫成「王仕華、賴漢量」，拆開才算得出每個人各自有多少
function splitNames(s: string): string[] {
  return (s || '').split(/[、,，/／\s]+/).map(x => x.trim()).filter(Boolean)
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
  open, categories, catColor, loading, onRefresh, onAddIssue,
}: {
  open: FlowItem[]
  categories: string[]
  catColor: Record<string, string>
  loading?: boolean
  onRefresh: () => void
  onAddIssue: () => void
}) {
  const [meetDate, setMeetDate] = useState(defaultMondayISO)
  // flow=整份流程一次看完；run=開始開會，一次只出現一步
  const [tab, setTab] = useState<'flow' | 'run'>('flow')
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
  const latestProgress = (it: FlowItem) =>
    (it.progress || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || ''

  // ── 第一步：每個人名下有什麼（議題 ＋ 支線任務）──────
  const people = useMemo(() => {
    const map = new Map<string, { name: string; reports: FlowItem[]; tasks: { it: FlowItem; s: Sub }[] }>()
    const slot = (name: string) => {
      if (!map.has(name)) map.set(name, { name, reports: [], tasks: [] })
      return map.get(name)!
    }
    open.forEach(it => {
      splitNames(it.owner).forEach(n => slot(n).reports.push(it))
      parseSubs(it).forEach(s => { if (!s.done && s.who) splitNames(s.who).forEach(n => slot(n).tasks.push({ it, s })) })
    })
    return Array.from(map.values()).sort((a, b) =>
      (b.reports.length + b.tasks.length) - (a.reports.length + a.tasks.length) || a.name.localeCompare(b.name))
  }, [open])
  // 沒掛到任何人身上的，第一步結束前要有人認領
  const orphans = useMemo(() => open.filter(it =>
    !splitNames(it.owner).length && !parseSubs(it).some(s => !s.done && s.who)), [open])

  // ── 第二步：需要別人幫忙的、以及卡住的 ───────────────
  // 支線任務的執行人不是議題負責人 → 這條就是「A 需要 B 在某天前幫忙做某事」
  const crossHelp = useMemo(() => {
    const rows: { it: FlowItem; s: Sub }[] = []
    open.forEach(it => {
      const owners = splitNames(it.owner)
      parseSubs(it).forEach(s => {
        if (s.done || !s.who) return
        if (splitNames(s.who).every(n => !owners.includes(n))) rows.push({ it, s })
      })
    })
    return rows.sort((a, b) => (a.s.when || '9999').localeCompare(b.s.when || '9999'))
  }, [open])
  const overdue = useMemo(
    () => open.filter(it => isOverdue(it.due)).sort((a, b) => (a.due || '').localeCompare(b.due || '')),
    [open, today])
  // 逾期的支線任務要跟逾期的議題一起看。只看議題的預計日會漏掉一整批——
  // 支線任務常常是最先跳票的那一層，議題本身的日期還沒到。
  const overdueSubs = useMemo(() => {
    const rows: { it: FlowItem; s: Sub }[] = []
    open.forEach(it => parseSubs(it).forEach(s => { if (!s.done && isOverdue(s.when)) rows.push({ it, s }) }))
    return rows.sort((a, b) => (a.s.when || '').localeCompare(b.s.when || ''))
  }, [open, today])
  const noDate = useMemo(() => open.filter(it => !it.due), [open])
  const stalled = useMemo(() => open.filter(it => !it.progress.trim()), [open])

  // ── 第三步：今天這場提出來的新議題 ──────────────────
  const newToday = useMemo(() => open.filter(it => it.meetDate === meetDate), [open, meetDate])

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
  const Empty = ({ children }: { children: ReactNode }) => (
    <p className="text-sm text-gray-400 py-1.5">{children}</p>
  )
  const Head = ({ children }: { children: ReactNode }) => (
    <p className="text-xs font-bold text-gray-500 mt-3 mb-1.5">{children}</p>
  )
  function ItemRow({ it, showCat }: { it: FlowItem; showCat?: boolean }) {
    const od = isOverdue(it.due)
    const latest = latestProgress(it)
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
          <span className={`block text-xs mt-0.5 ${latest ? 'text-gray-500' : 'text-amber-600'}`}>
            {latest ? '最新進度：' + latest : '還沒有任何進度紀錄'}
          </span>
        </span>
      </label>
    )
  }
  // 一條支線任務（第一步、第二步共用）
  function SubRow({ it, s, idx, showFrom }: { it: FlowItem; s: Sub; idx: string; showFrom?: boolean }) {
    const od = isOverdue(s.when)
    const k = 'sub:' + idx
    return (
      <label className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer
        ${ticked[k] ? 'bg-gray-50 border-gray-200 opacity-60' : od ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
        <input type="checkbox" checked={!!ticked[k]} onChange={() => tick(k)} className="mt-1 w-4 h-4 accent-indigo-600 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="text-sm">
            <span className="font-bold text-gray-900">{s.who || '未指定執行人'}</span>
            <span className="text-gray-800 ml-1.5">{s.what}</span>
          </span>
          <span className="flex items-center gap-2 flex-wrap text-xs mt-0.5">
            <span className={od ? 'text-red-600 font-semibold' : 'text-gray-400'}>
              {s.when ? (od ? `🔴 逾期 ${s.when}` : s.when) : '未定日期'}
            </span>
            {showFrom && <span className="text-gray-400 truncate">來自 {it.owner || '無主'} 的：{it.issue}</span>}
          </span>
        </span>
      </label>
    )
  }

  // 第一步的主體：一個人一塊，議題與支線任務都在自己名下
  function PeopleBoard() {
    if (people.length === 0) return <Empty>目前沒有指定到人的議題。</Empty>
    return (
      <div className="space-y-2.5">
        {people.map(p => {
          const od = p.reports.filter(it => isOverdue(it.due)).length + p.tasks.filter(t => isOverdue(t.s.when)).length
          const k = 'person:' + p.name
          return (
            <div key={p.name} className={`rounded-2xl border ${ticked[k] ? 'border-emerald-200 bg-emerald-50/30' : od ? 'border-red-200 bg-red-50/20' : 'border-gray-200 bg-white'}`}>
              <div className="px-3 py-2 border-b border-gray-200/70 flex items-center gap-2 flex-wrap">
                <button onClick={() => tick(k)}
                  className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center border-2
                    ${ticked[k] ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-400 border-gray-300 hover:border-indigo-400'}`}
                  title={ticked[k] ? '取消「講完了」' : '標記這個人講完了'}>
                  {ticked[k] ? '✓' : ''}
                </button>
                <p className="font-bold text-gray-900 text-lg">{p.name}</p>
                <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">負責議題 {p.reports.length}</span>
                <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">支線任務 {p.tasks.length}</span>
                {od > 0 && <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-bold">逾期 {od}</span>}
              </div>
              <div className="p-2 space-y-2">
                <div>
                  <p className="text-xs font-bold text-gray-400 mb-1">🎤 負責的議題（說明內容與進度）</p>
                  {p.reports.length === 0 ? <p className="text-xs text-gray-300 pl-1">無</p> : (
                    <div className="space-y-1.5">{p.reports.map(it => <ItemRow key={it.id} it={it} showCat />)}</div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 mb-1">🛠 名下的支線任務</p>
                  {p.tasks.length === 0 ? <p className="text-xs text-gray-300 pl-1">無</p> : (
                    <div className="space-y-1.5">{p.tasks.map(({ it, s }, i) =>
                      <SubRow key={it.id + i} it={it} s={s} idx={`${p.name}:${it.id}:${i}`} showFrom />)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // 每一步下面自動帶出來的實際資料
  function StepData({ kind }: { kind: StepKind }) {
    if (kind === 'people') return (
      <>
        <div className="mt-3 rounded-xl bg-indigo-50 border border-indigo-100 p-3">
          <p className="text-xs font-bold text-indigo-800 mb-1.5">📣 每一筆照這四句話講</p>
          <ul className="space-y-1">{REPORT_TEMPLATE.map(t => (
            <li key={t} className="text-sm text-gray-700 leading-snug">{t}</li>))}</ul>
        </div>
        <Head>👥 逐人清單（{people.length} 人）— 講完一個就打勾</Head>
        <PeopleBoard />
        {orphans.length > 0 && (
          <>
            <Head>⚠️ 沒掛在任何人身上的（{orphans.length} 件）— 這一步結束前要有人認領</Head>
            <div className="space-y-1.5">{orphans.map(it => <ItemRow key={it.id} it={it} showCat />)}</div>
          </>
        )}
      </>
    )
    if (kind === 'help') return (
      <>
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-bold text-amber-800 mb-1">🗣 提協助需求就照這句話講</p>
          <p className="text-base text-gray-800 leading-snug">
            「我需要 <span className="font-bold text-amber-800">〈誰〉</span> 在 <span className="font-bold text-amber-800">〈哪一天前〉</span> 幫我 <span className="font-bold text-amber-800">〈做什麼〉</span>，因為 <span className="font-bold text-amber-800">〈卡在哪〉</span>」
          </p>
          <p className="text-xs text-gray-500 mt-1">被點名的人當場回一句：做得到／做不到、哪一天可以給。喬好就開一條支線任務。</p>
        </div>

        <Head>🤝 已經在等別人的（{crossHelp.length} 條）— 執行人不是該議題的負責人</Head>
        {crossHelp.length === 0 ? <Empty>目前沒有跨人協助的任務。</Empty> : (
          <div className="space-y-1.5">{crossHelp.map(({ it, s }, i) =>
            <SubRow key={it.id + i} it={it} s={s} idx={`help:${it.id}:${i}`} showFrom />)}
          </div>
        )}

        <Head>🔴 逾期（{overdue.length + overdueSubs.length} 件，含支線任務）— 卡在哪，當場講，當場改日期</Head>
        {overdue.length + overdueSubs.length === 0 ? <Empty>沒有逾期項目。</Empty> : (
          <div className="space-y-1.5">
            {overdue.map(it => <ItemRow key={it.id} it={it} showCat />)}
            {overdueSubs.map(({ it, s }, i) =>
              <SubRow key={'od' + it.id + i} it={it} s={s} idx={`od:${it.id}:${i}`} showFrom />)}
          </div>
        )}

        <Head>😴 完全沒有進度紀錄（{stalled.length} 件）— 通常就是卡住沒人動</Head>
        {stalled.length === 0 ? <Empty>每件都有進度紀錄。</Empty>
          : <div className="space-y-1.5">{stalled.map(it => <ItemRow key={it.id} it={it} showCat />)}</div>}

        <Head>📅 還沒訂預計日（{noDate.length} 件）— 當場喬一個日期出來</Head>
        {noDate.length === 0 ? <Empty>每件都有預計日。</Empty>
          : <div className="space-y-1.5">{noDate.map(it => <ItemRow key={it.id} it={it} showCat />)}</div>}
      </>
    )
    return (
      <>
        <div className="mt-3 rounded-xl bg-white border border-gray-200 p-3">
          <p className="text-xs font-bold text-gray-500 mb-2">🗣 提案人要講滿這七項，主席逐項確認</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {PROPOSE_5W2H.map(f => (
              <label key={f.en} className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={!!ticked['5w2h:' + f.en]} onChange={() => tick('5w2h:' + f.en)}
                  className="mt-1 w-4 h-4 accent-indigo-600 shrink-0" />
                <span className="min-w-0">
                  <span style={{ background: `${f.color}18`, color: f.color }}
                    className="inline-block text-xs font-bold px-2 py-0.5 rounded-full">{f.en} · {f.zh}</span>
                  <span className="block text-sm text-gray-700 leading-snug mt-0.5">{f.q}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <Head>📝 今天（{zhDate(meetDate)}）新增的議題（{newToday.length} 件）</Head>
        {newToday.length === 0
          ? <Empty>還沒建檔。講完就當場建，散會後沒人會記得。</Empty>
          : <div className="space-y-1.5">{newToday.map(it => <ItemRow key={it.id} it={it} showCat />)}</div>}
        <button onClick={onAddIssue}
          className="mt-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700">
          ＋ 當場新增議題
        </button>
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

  // ── 一般模式：整份流程攤開來看 ──────────────────────
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
      <p className="text-xs text-gray-400 mb-3">照這三步跑：先逐人報自己手上的、再喬需要別人幫忙的、最後才提新的。每一步下面就是今天該講的內容，全部取自「會議事項」的即時資料。打勾只存在這台裝置上。</p>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={enterRun}
          className="bg-indigo-600 text-white rounded-full px-4 py-1.5 text-sm font-bold hover:bg-indigo-700">
          ▶ 開始開會
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
    </div>
  )
}
