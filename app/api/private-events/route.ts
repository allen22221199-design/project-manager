import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { getPrivateEvents, addPrivateEvent, updatePrivateEvent, deletePrivateEvent } from '@/lib/notion'

// 所有操作都必須先通過登入驗證，未登入直接擋掉（私人資料不外流）
function guard(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value)
}

export async function GET(req: NextRequest) {
  if (!guard(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })
  try {
    return NextResponse.json({ events: await getPrivateEvents() })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!guard(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })
  try {
    const { title, date, note } = await req.json()
    if (!title?.trim() || !date) return NextResponse.json({ error: '缺少標題或日期' }, { status: 400 })
    const r = await addPrivateEvent(title.trim(), date, (note ?? '').trim())
    return NextResponse.json({ ok: true, id: r.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!guard(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })
  try {
    const { id, title, date, note } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await updatePrivateEvent(id, { title, date, note })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!guard(req)) return NextResponse.json({ error: '未授權' }, { status: 401 })
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await deletePrivateEvent(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
