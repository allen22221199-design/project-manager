import { NextRequest, NextResponse } from 'next/server'
import { addProgressRecord, addItemRecord, updateProjectStatus } from '@/lib/notion'

export async function POST(req: NextRequest) {
  try {
    const { pageId, date, description, newStatus, action, itemName, qty, note } = await req.json()
    if (!pageId) return NextResponse.json({ error: '缺少 pageId' }, { status: 400 })

    if (action === 'item') {
      if (!itemName?.trim()) return NextResponse.json({ error: '缺少品項名稱' }, { status: 400 })
      await addItemRecord(pageId, itemName.trim(), (qty ?? '').trim(), (note ?? '').trim())
    } else {
      if (!date || !description) return NextResponse.json({ error: '缺少日期或進度描述' }, { status: 400 })
      await addProgressRecord(pageId, date, description)
      if (newStatus) await updateProjectStatus(pageId, newStatus)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
