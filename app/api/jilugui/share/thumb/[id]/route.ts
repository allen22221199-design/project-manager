import { NextRequest, NextResponse } from 'next/server'
import { getThumbData, shareSigOk, getFile, type ThumbKind } from '@/lib/jilugui'
import { isConfidential } from '@/lib/jilugui-share'
import { errMsg } from '@/lib/jilugui-http'

// 分享頁裡的縮圖／封面：/api/jilugui/share/thumb/<id>?kind=file|project&exp=&sig=
export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const q = req.nextUrl.searchParams
  const kind: ThumbKind = q.get('kind') === 'project' ? 'project' : 'file'
  if (!shareSigOk(`thumb:${kind}:${params.id}`, q.get('exp'), q.get('sig'))) return new NextResponse('not found', { status: 404 })
  try {
    if (kind === 'file') {
      const jf = await getFile(params.id).catch(() => null)
      if (jf && isConfidential(jf.tags)) return new NextResponse('not found', { status: 404 })   // 機密資料不給縮圖
    }
    const buf = await getThumbData(kind, params.id)
    if (!buf) return new NextResponse('not found', { status: 404 })
    return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(buf.length), 'Cache-Control': 'private, max-age=86400' } })
  } catch (e: any) {
    return new NextResponse('error: ' + errMsg(e), { status: 500 })
  }
}
