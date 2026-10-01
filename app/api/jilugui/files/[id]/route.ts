import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { getFile, updateFile, deleteFile, cleanFileEdit } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const f = await getFile(params.id)
    if (!f) return fail('這個檔案不存在或已被刪除', 404)
    return NextResponse.json(f)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const f = cleanFileEdit(await req.json().catch(() => null))
    if (!f) return fail('資料格式不對：日期要是 YYYY-MM-DD', 400)
    const saved = await updateFile(params.id, f)
    if (!saved) return fail('這個檔案已經被刪掉了，你的修改沒有存到。', 409)
    return NextResponse.json(saved)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

// 刪檔：封存 Notion 頁面，放在 Vercel Blob 的檔案本體也一起刪。
// 刪 Blob 失敗不擋整個請求——紀錄已經刪了，孤兒檔案頂多佔一點空間。
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const f = await getFile(params.id)
    if (f && a.user.role !== 'admin' && f.by !== a.user.name) return fail('只能刪除自己上傳的檔案', 403)
    const { blobUrls } = await deleteFile(params.id)
    if (blobUrls.length) {
      try { await del(blobUrls) } catch (e) { console.error('[jilugui] 刪 Blob 失敗', e) }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
