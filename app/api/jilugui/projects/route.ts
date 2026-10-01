import { NextRequest, NextResponse } from 'next/server'
import { listProjects, createProject, cleanProjectInput } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

// 專案：紀錄和檔案的上一層。清單一次全給（專案數量不會多到要分頁）。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    return NextResponse.json({ items: await listProjects() })
  } catch (e: any) {
    return fail(errMsg(e))
  }
}

// POST { name, status, category, note, link } → 新建的專案
export async function POST(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const r = cleanProjectInput(await req.json().catch(() => null), true)
    if (!r) return fail('資料格式不對：「專案名稱」必填，連結要以 http 開頭', 400)
    return NextResponse.json(await createProject(r))
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
