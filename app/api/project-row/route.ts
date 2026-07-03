import { NextRequest, NextResponse } from 'next/server'
import { updateTableRow, deleteTableRow, recomputeLatestProgress } from '@/lib/notion'

export async function PATCH(req: NextRequest) {
  try {
    const { rowId, cells, pageId, kind } = await req.json()
    if (!rowId || !Array.isArray(cells)) return NextResponse.json({ error: '缺少 rowId 或 cells' }, { status: 400 })
    await updateTableRow(rowId, cells)
    if (kind === 'progress' && pageId) { try { await recomputeLatestProgress(pageId) } catch {} }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { rowId, pageId, kind } = await req.json()
    if (!rowId) return NextResponse.json({ error: '缺少 rowId' }, { status: 400 })
    await deleteTableRow(rowId)
    if (kind === 'progress' && pageId) { try { await recomputeLatestProgress(pageId) } catch {} }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
