import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { needUser } from '@/lib/jilugui-http'

// 紀錄櫃的檔案上傳：瀏覽器先來這裡換一把短效的上傳 token，再把檔案「直接」送到 Vercel Blob。
// 檔案本體不經過這支函式，所以沒有 Vercel 伺服器函式 4.5MB 的請求上限，幾百 MB 的影片也上得去。
// 要登入才能拿 token；路徑只允許 jilugui/ 開頭，單檔上限 2GB。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_BYTES = 2 * 1024 * 1024 * 1024

export async function POST(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null
  if (!body) return NextResponse.json({ error: '請求格式不對' }, { status: 400 })
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('jilugui/')) throw new Error('上傳路徑不對')
        return { addRandomSuffix: true, maximumSizeInBytes: MAX_BYTES, tokenPayload: a.user.name }
      },
      // 上傳完成後由前端把網址存進檔案庫，這裡不用做事
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 })
  }
}
