import { NextRequest, NextResponse } from 'next/server'
import { shareKeyOk } from '@/lib/jilugui'
import { buildPortfolio, originOf } from '@/lib/jilugui-share'
import { portfolioIndexHtml } from '@/lib/jilugui-portfolio-html'
import { errMsg } from '@/lib/jilugui-http'

// 給人看的作品集首頁：GET /portfolio/<金鑰>。資料與「分享給 AI」同一份，只是排成網頁。
// 金鑰不對一律 404；不需要登入；檔案與縮圖連結另外帶 7 天簽章。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300', 'X-Robots-Tag': 'noindex, nofollow' }

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  if (!shareKeyOk(params.key)) return new NextResponse('not found', { status: 404 })
  try {
    const p = await buildPortfolio(originOf(req))
    return new NextResponse(portfolioIndexHtml(p, params.key), { headers: HEADERS })
  } catch (e: any) {
    return new NextResponse('error: ' + errMsg(e), { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
