import { NextRequest, NextResponse } from 'next/server'
import { listRecords, createRecord, cleanRecordInput } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// GET ?q=&status=&cursor=&limit=
export async function GET(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const p = req.nextUrl.searchParams
    const out = await listRecords({
      q: (p.get('q') || '').trim().slice(0, 100),
      status: (p.get('status') || '').trim().slice(0, 50),
      project: (p.get('project') || '').trim().slice(0, 64) || undefined,
      cursor: p.get('cursor') || undefined,
      limit: Number(p.get('limit')) || 30,
    })
    return NextResponse.json(out)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

// POST 紀錄內容 → 回傳新建的那一筆
export async function POST(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const r = cleanRecordInput(await req.json().catch(() => null))
    if (!r) return fail('資料格式不對：「做了什麼」必填，日期要是 YYYY-MM-DD，連結要以 http 開頭', 400)
    return NextResponse.json(await createRecord(r, a.user.name))
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
