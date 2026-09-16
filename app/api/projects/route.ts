import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjects, createProject, updateProjectStatus, updateProjectAssignee, updateProjectColor, updateProjectGantt, updateProjectSchedule, recomputeLatestProgress, deleteProject } from '@/lib/notion'

// 案件清單（含聯絡人）也不能被快取，否則剛在 Notion 改完的資料看不到
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const projects = await getActiveProjects()
    return NextResponse.json(projects)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, contact, address, status } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: '缺少專案名稱' }, { status: 400 })
    const page = await createProject(name.trim(), contact?.trim() ?? '', address?.trim() ?? '', status || '報價中')
    return NextResponse.json({ ok: true, id: page.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, assignee, color, ganttStart, ganttEnd, schedule, recomputeProgress } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    if (status) await updateProjectStatus(id, status)
    if (assignee !== undefined) await updateProjectAssignee(id, assignee)
    if (color !== undefined) await updateProjectColor(id, color)
    if (ganttStart !== undefined || ganttEnd !== undefined) await updateProjectGantt(id, ganttStart ?? '', ganttEnd ?? '')
    if (schedule !== undefined) await updateProjectSchedule(id, schedule)
    if (recomputeProgress) await recomputeLatestProgress(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await deleteProject(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
