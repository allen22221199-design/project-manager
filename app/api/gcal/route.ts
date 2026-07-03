import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { GCAL_COOKIE, googleConfigured, refreshAccessToken, listEvents, insertEvent, patchEvent, deleteEvent } from '@/lib/google'

function admin(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value)
}
function refreshToken(req: NextRequest) {
  return req.cookies.get(GCAL_COOKIE)?.value
}

// GET ?month=YYYY-MM  → 該月事件；或 ?status=1 → 是否已連結
export async function GET(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })
  const rt = refreshToken(req)
  if (req.nextUrl.searchParams.get('status')) {
    return NextResponse.json({ configured: googleConfigured(), connected: !!rt })
  }
  if (!rt) return NextResponse.json({ error: '尚未連結 Google 日曆', connected: false }, { status: 400 })
  try {
    const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
    const [y, m] = month.split('-').map(Number)
    const timeMin = new Date(Date.UTC(y, m - 1, 1)).toISOString()
    const timeMax = new Date(Date.UTC(y, m, 1)).toISOString()
    const access = await refreshAccessToken(rt)
    const events = await listEvents(access, timeMin, timeMax)
    return NextResponse.json({ events, connected: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })
  const rt = refreshToken(req)
  if (!rt) return NextResponse.json({ error: '尚未連結 Google 日曆' }, { status: 400 })
  try {
    const { title, date, note } = await req.json()
    if (!title?.trim() || !date) return NextResponse.json({ error: '缺少標題或日期' }, { status: 400 })
    const access = await refreshAccessToken(rt)
    const ev = await insertEvent(access, title.trim(), date, (note ?? '').trim())
    return NextResponse.json({ ok: true, event: ev })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })
  const rt = refreshToken(req)
  if (!rt) return NextResponse.json({ error: '尚未連結 Google 日曆' }, { status: 400 })
  try {
    const { id, title, date, note } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    const access = await refreshAccessToken(rt)
    await patchEvent(access, id, { title, date, note })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })
  const rt = refreshToken(req)
  if (!rt) return NextResponse.json({ error: '尚未連結 Google 日曆' }, { status: 400 })
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    const access = await refreshAccessToken(rt)
    await deleteEvent(access, id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
