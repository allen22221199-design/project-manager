import { NextRequest, NextResponse } from 'next/server'
import { shareKeyOk } from '@/lib/jilugui'
import { buildPortfolio, originOf } from '@/lib/jilugui-share'
import { projectHtml } from '@/lib/jilugui-portfolio-html'
import { errMsg } from '@/lib/jilugui-http'

// 給人看的作品集專案頁：GET /portfolio/<金鑰>/<專案 id>
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300', 'X-Robots-Tag': 'noindex, nofollow' }
const norm = (id: string) => String(id || '').replace(/-/g, '').toLowerCase()

export async function GET(req: NextRequest, { params }: { params: { key: string; id: string } }) {
  if (!shareKeyOk(params.key)) return new NextResponse('not found', { status: 404 })
  try {
    const p = await buildPortfolio(originOf(req))
    const pr = p.projects.find(x => norm(x.id) === norm(params.id))
    if (!pr) return new NextResponse('not found', { status: 404 })
    return new NextResponse(projectHtml(p, pr, params.key), { headers: HEADERS })
  } catch (e: any) {
    return new NextResponse('error: ' + errMsg(e), { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
}
