import { NextRequest, NextResponse } from 'next/server'
import { getProjectBundle, updateProject, deleteProject, cleanProjectInput } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET：專案＋它的紀錄＋它的檔案，專案頁一次拿齊
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const b = await getProjectBundle(params.id)
    if (!b) return fail('這個專案不存在或已被刪除', 404)
    return NextResponse.json(b)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const r = cleanProjectInput(await req.json().catch(() => null))
    if (!r) return fail('資料格式不對：「專案名稱」必填，連結要以 http 開頭', 400)
    const saved = await updateProject(params.id, r)
    if (!saved) return fail('這個專案已經被刪掉了，你的修改沒有存到。', 409)
    return NextResponse.json(saved)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

// 刪專案只有管理者能做；底下的紀錄和檔案都會留著
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  if (a.user.role !== 'admin') return fail('只有管理者能刪除專案', 403)
  try {
    await deleteProject(params.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
