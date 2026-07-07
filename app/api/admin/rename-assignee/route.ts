import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { getActiveProjects, updateProjectAssignee } from '@/lib/notion'

// 批次改名：把所有案件裡「負責人」等於 from 的一律改成 to（僅管理者可用）
// 用途：統一別名/暱稱，例如把「王大哥」統一改成正式姓名「王志先」
async function rename(from?: string, to?: string) {
  if (!from?.trim() || !to?.trim()) return { error: '缺少 from 或 to' }
  const projects = await getActiveProjects()
  const matched = projects.filter((p: any) => (p.assignee ?? '').trim() === from.trim())
  for (const p of matched) {
    await updateProjectAssignee(p.id, to.trim())
  }
  return { ok: true, count: matched.length, projects: matched.map((p: any) => p.name) }
}

export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }
  const { from, to } = await req.json()
  const result = await rename(from, to)
  return NextResponse.json(result, { status: (result as any).error ? 400 : 200 })
}

// 方便直接在瀏覽器貼網址觸發（登入管理者後開啟即可）：
// /api/admin/rename-assignee?from=王大哥&to=王志先
export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: '未授權（請先在網站登入管理者）' }, { status: 401 })
  }
  const from = req.nextUrl.searchParams.get('from') ?? undefined
  const to = req.nextUrl.searchParams.get('to') ?? undefined
  const result = await rename(from, to)
  return NextResponse.json(result, { status: (result as any).error ? 400 : 200 })
}
