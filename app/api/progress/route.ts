import { NextRequest, NextResponse } from 'next/server'
import { addProgressRecord, updateProjectStatus } from '@/lib/notion'

export async function POST(req: NextRequest) {
  try {
    const { pageId, date, description, newStatus } = await req.json()
    if (!pageId || !date || !description) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }
    await addProgressRecord(pageId, date, description)
    if (newStatus) await updateProjectStatus(pageId, newStatus)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
