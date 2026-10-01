import { NextRequest, NextResponse } from 'next/server'
import { resolveFileUrl } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

// 檔案本體：/api/jilugui/file/<頁面id>/<第幾個>?download=1
// 放在 Vercel Blob 的直接轉址過去（加 download=1 會變成下載）；
// 存在 Notion 裡的（Cloudflare 版時期上傳的）每次跟 Notion 拿一個新的臨時網址再轉址，所以舊檔案照樣開得起來。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string; idx: string } }) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const idx = Math.max(0, Number(params.idx) || 0)
    const f = await resolveFileUrl(params.id, idx)
    if (!f) return fail('找不到這個檔案', 404)
    // raw=1：把檔案內容直接吐回來（同網域），給瀏覽器產生縮圖用——
    // 存在 Notion 的檔案網址沒有 CORS，瀏覽器直接抓會被擋，只能經這裡轉一手。
    if (req.nextUrl.searchParams.get('raw') === '1') {
      const up = await fetch(f.url)
      if (!up.ok || !up.body) return fail('讀取檔案失敗（' + up.status + '）', 502)
      return new NextResponse(up.body, {
        headers: { 'content-type': up.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=300' },
      })
    }
    let url = f.url
    if (req.nextUrl.searchParams.get('download') === '1' && f.external) {
      try {
        const u = new URL(url)
        if (u.hostname.endsWith('blob.vercel-storage.com')) { u.searchParams.set('download', '1'); url = u.toString() }
      } catch { /* 網址怪怪的就原樣轉址 */ }
    }
    return NextResponse.redirect(url, 302)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
