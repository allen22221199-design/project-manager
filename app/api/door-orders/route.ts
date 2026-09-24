import { NextRequest, NextResponse } from 'next/server'
import { getDoors, addDoor, updateDoor, deleteDoor, Door } from '@/lib/notion'

// 門單：一張工單底下每一扇防火門各一列。
export const maxDuration = 60

// 這裡刻意不擋登入。整個 App 本來就沒有逐人帳號（只有一組共用的管理者密碼，
// 用途是藏總經理的私人行事曆），而門單的重點就是讓現場人員不用申請任何帳號就能填。
// 加上 verifySession 會讓沒登入過的平板每次都吃 401，功能直接廢掉。
// 施工進度（building-progress）也是同樣的判斷。

// 一扇門最多允許的鍵數與 JSON 大小。不是怕使用者，是怕壞掉的前端把垃圾灌進 Notion。
const MAX_KEYS = 200
const MAX_BYTES = 60_000

// 只收「一層扁平字串 ＋ holes/locks 兩個陣列」這種形狀。
// 不認得的鍵照收（訂料單以後加欄位不用改這裡），但型別要對。
function cleanDoor(v: any): Door | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const d: Door = {}
  for (const [k, val] of Object.entries(v)) {
    if (Object.keys(d).length >= MAX_KEYS) break
    if (k === 'holes') {
      if (!Array.isArray(val)) continue
      const holes = val
        .filter(h => h && typeof h === 'object' && !Array.isArray(h))
        .slice(0, 200)
        .map(h => {
          const o: Record<string, string> = {}
          for (const [hk, hv] of Object.entries(h as object)) {
            const s = String(hv ?? '').trim()
            if (s) o[hk] = s
          }
          return o
        })
        .filter(h => Object.keys(h).length)
      if (holes.length) d.holes = holes
      continue
    }
    if (k === 'locks') {
      if (!Array.isArray(val)) continue
      const locks = val.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 20)
      if (locks.length) d.locks = locks
      continue
    }
    if (val === null || val === undefined) continue
    if (typeof val === 'object') continue          // 只有 holes/locks 可以是結構
    const s = String(val).trim()
    // 空字串整個不存。訂料單存的就是稀疏物件，下游用 if not d.get(k) 判斷有沒有填，
    // 塞一堆 "" 進去會讓「沒填」變成「填了空的」。
    if (s) d[k] = s
  }
  if (!Object.keys(d).length) return null
  if (JSON.stringify(d).length > MAX_BYTES) return null
  return d
}

// GET ?order=<工單>；不帶就回全部
export async function GET(req: NextRequest) {
  try {
    const order = req.nextUrl.searchParams.get('order') || undefined
    return NextResponse.json({ rows: await getDoors(order) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST 新增一樘
export async function POST(req: NextRequest) {
  try {
    const d = cleanDoor((await req.json())?.door)
    if (!d) return NextResponse.json({ error: '門的資料格式不對' }, { status: 400 })
    if (!d.f_job) return NextResponse.json({ error: '缺少建案/工單' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await addDoor(d)) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH 覆寫一樘
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json()
    const id = String(b?.id ?? '').trim()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    const d = cleanDoor(b?.door)
    if (!d) return NextResponse.json({ error: '門的資料格式不對' }, { status: 400 })
    if (!d.f_job) return NextResponse.json({ error: '缺少建案/工單' }, { status: 400 })
    await updateDoor(id, d)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE ?id=<pageId>
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await deleteDoor(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
