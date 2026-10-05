import { NextRequest, NextResponse } from 'next/server'
import { uploadToNotion } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

// 小檔（≤4MB）上傳：瀏覽器把檔案本體 POST 過來，這裡轉送進 Notion，回傳 file upload id，前端再拿它建檔案頁。
// 不用 Vercel Blob、不用 token；大於 4.5MB 的請求 Vercel 本身就會擋掉，所以大檔仍走 /upload（Blob）。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const name = (req.nextUrl.searchParams.get('name') || '').slice(0, 200)
    const type = (req.nextUrl.searchParams.get('type') || '').slice(0, 100)
    if (!name) return fail('缺少檔名', 400)
    const buf = Buffer.from(await req.arrayBuffer())
    if (!buf.length) return fail('沒有收到檔案內容', 400)
    if (buf.length > MAX_BYTES) return fail('這條路只收 4MB 以下的檔案', 413)
    const r = await uploadToNotion(buf, name, type)
    return NextResponse.json({ uploadId: r.id, name, size: buf.length, type: r.contentType })
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
