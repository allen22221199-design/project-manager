import { NextRequest, NextResponse } from 'next/server'
import { addProgressRecord, addItemRecord, addItemRecords, updateProjectStatus, stampLatestProgress } from '@/lib/notion'

export async function POST(req: NextRequest) {
  try {
    const { pageId, date, description, newStatus, action, item, content, spec, qty, unit, note, items } = await req.json()
    if (!pageId) return NextResponse.json({ error: '缺少 pageId' }, { status: 400 })

    if (action === 'items') {
      if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: '缺少品項' }, { status: 400 })
      const written = await addItemRecords(pageId, items)
      return NextResponse.json({ ok: true, written })
    } else if (action === 'item') {
      if (!item?.trim()) return NextResponse.json({ error: '缺少品項名稱' }, { status: 400 })
      await addItemRecord(
        pageId,
        item.trim(),
        (content ?? '').trim(),
        (spec ?? '').trim(),
        (qty ?? '').trim(),
        (unit ?? '').trim(),
        (note ?? '').trim(),
      )
    } else {
      if (!date || !description) return NextResponse.json({ error: '缺少日期或進度描述' }, { status: 400 })
      await addProgressRecord(pageId, date, description)
      try { await stampLatestProgress(pageId, description) } catch {}
      if (newStatus) await updateProjectStatus(pageId, newStatus)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
