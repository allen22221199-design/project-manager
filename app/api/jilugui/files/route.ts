import { NextRequest, NextResponse } from 'next/server'
import { listFiles, createFile, cleanFileInput } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// GET ?q=&category=&cursor=&limit=
export async function GET(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const p = req.nextUrl.searchParams
    const out = await listFiles({
      q: (p.get('q') || '').trim().slice(0, 100),
      category: (p.get('category') || '').trim().slice(0, 50),
      project: (p.get('project') || '').trim().slice(0, 64) || undefined,
      cursor: p.get('cursor') || undefined,
      limit: Number(p.get('limit')) || 30,
    })
    return NextResponse.json(out)
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

// POST { name, uploads:[{url,name,size,type}], category, date, note, tags, recordIds } → 新建的檔案資料
// 檔案本體已經由瀏覽器直接傳到 Vercel Blob，這裡只收網址。
export async function POST(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const f = cleanFileInput(await req.json().catch(() => null))
    if (!f) return fail('資料格式不對：至少要有一個已上傳的檔案網址', 400)
    return NextResponse.json(await createFile(f, a.user.name))
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
