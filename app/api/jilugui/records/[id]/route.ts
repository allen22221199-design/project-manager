import { NextRequest, NextResponse } from 'next/server'
import { getRecord, updateRecord, deleteRecord, cleanRecordInput } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const r = await getRecord(params.id)
    if (!r) return fail('這筆紀錄不存在或已被刪除', 404)
    return NextResponse.json(r)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const r = cleanRecordInput(await req.json().catch(() => null))
    if (!r) return fail('資料格式不對：「做了什麼」必填，日期要是 YYYY-MM-DD，連結要以 http 開頭', 400)
    const saved = await updateRecord(params.id, r)
    if (!saved) return fail('這筆紀錄已經被刪掉了，你的修改沒有存到。請重新整理再確認一次。', 409)
    return NextResponse.json(saved)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

// 只有管理者、或自己記的才能刪（前端也擋，這裡再擋一次）
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const r = await getRecord(params.id)
    if (r && a.user.role !== 'admin' && r.by !== a.user.name) return fail('只能刪除自己記的紀錄', 403)
    await deleteRecord(params.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
