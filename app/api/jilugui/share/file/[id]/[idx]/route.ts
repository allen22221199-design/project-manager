import { NextRequest, NextResponse } from 'next/server'
import { resolveFileUrl, shareSigOk } from '@/lib/jilugui'
import { errMsg } from '@/lib/jilugui-http'

// 分享頁裡的檔案連結：/api/jilugui/share/file/<頁面id>/<第幾個>?exp=&sig=[&download=1]
// 簽章由分享頁產生時算好，過期或簽章不對就 404；通過就跟登入版一樣轉址到檔案本體。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string; idx: string } }) {
  const idx = Math.max(0, Number(params.idx) || 0)
  const q = req.nextUrl.searchParams
  if (!shareSigOk(`file:${params.id}:${idx}`, q.get('exp'), q.get('sig'))) return new NextResponse('not found', { status: 404 })
  try {
    const f = await resolveFileUrl(params.id, idx)
    if (!f) return new NextResponse('not found', { status: 404 })
    let url = f.url
    if (q.get('download') === '1' && f.external) {
      try { const u = new URL(url); if (u.hostname.endsWith('blob.vercel-storage.com')) { u.searchParams.set('download', '1'); url = u.toString() } } catch { /* 原樣轉址 */ }
    }
    return NextResponse.redirect(url, 302)
  } catch (e: any) {
    return new NextResponse('error: ' + errMsg(e), { status: 500 })
  }
}
