import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjects, createProject, updateProjectStatus, updateProjectAssignee, deleteProject } from '@/lib/notion'

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
    const { id, status, assignee } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    if (status) await updateProjectStatus(id, status)
    if (assignee !== undefined) await updateProjectAssignee(id, assignee)
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
