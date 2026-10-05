import { NextRequest, NextResponse } from 'next/server'
import { shareKeyOk } from '@/lib/jilugui'
import { buildPortfolio, portfolioMarkdown, originOf } from '@/lib/jilugui-share'
import { errMsg } from '@/lib/jilugui-http'

// 分享給 AI 的唯讀作品集：GET /api/jilugui/share/<金鑰> 回 Markdown，加 ?format=json 回 JSON。
// 金鑰不對一律 404（不透露這個網址存在）。不需要登入；檔案與縮圖連結另外帶時效簽章。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  if (!shareKeyOk(params.key)) return new NextResponse('not found', { status: 404 })
  try {
    const p = await buildPortfolio(originOf(req))
    const common = { 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow' }
    if (req.nextUrl.searchParams.get('format') === 'json') return NextResponse.json(p, { headers: common })
    return new NextResponse(portfolioMarkdown(p), { headers: { ...common, 'Content-Type': 'text/markdown; charset=utf-8' } })
  } catch (e: any) {
    return new NextResponse('error: ' + errMsg(e), { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
