import { NextRequest, NextResponse } from 'next/server'
import { getThumbData, saveThumbData, getFile, getProject, thumbPath, type ThumbKind } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }
const kindOf = (req: NextRequest): ThumbKind => (req.nextUrl.searchParams.get('kind') === 'project' ? 'project' : 'file')

// 縮圖本體：GET 回 JPEG（存在 Notion「縮圖資料」／「封面資料」），POST 收瀏覽器做好的 JPEG 存進去。
// 不走 Vercel Blob，所以不用設 token；圖片一樣要登入才看得到。
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const buf = await getThumbData(kindOf(req), params.id)
    if (!buf) return fail('這個檔案還沒有縮圖', 404)
    return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(buf.length), 'Cache-Control': 'private, max-age=604800' } })
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const buf = Buffer.from(await req.arrayBuffer())
    if (!buf.length) return fail('沒有收到圖片', 400)
    if (buf.length > 150 * 1024) return fail('縮圖太大（上限 150KB）', 413)
    const kind = kindOf(req)
    const url = await saveThumbData(kind, params.id, buf)
    const obj = kind === 'project' ? await getProject(params.id) : await getFile(params.id)
    return NextResponse.json(obj ?? { thumb: url, cover: url })
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
