import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjects, createProject, updateProjectStatus, updateProjectAssignee, updateProjectColor, updateProjectGantt, updateProjectSchedule, updateProjectBasics, renameBuildingSite, recomputeLatestProgress, deleteProject } from '@/lib/notion'

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
    const { id, status, assignee, color, ganttStart, ganttEnd, schedule, recomputeProgress,
      name, contact, address } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

    // 抬頭三欄。改名要特別小心：施工進度是用案場「名稱」對回案件的，
    // 所以改完名字要把那些棟別的案場名一起換掉，否則會查不到。
    if (name !== undefined || contact !== undefined || address !== undefined) {
      const all = await getActiveProjects()
      const me = all.find(p => p.id === id)
      const newName = name === undefined ? undefined : String(name).trim()

      if (newName !== undefined) {
        if (!newName) return NextResponse.json({ error: '專案名稱不能空白' }, { status: 400 })
        // 同名的話，施工進度和 AI 助理都分不出是哪一個案子
        if (all.some(p => p.id !== id && p.name.trim() === newName)) {
          return NextResponse.json({ error: `已經有一個案件叫「${newName}」了` }, { status: 409 })
        }
      }

      await updateProjectBasics(id, {
        name: newName,
        contact: contact === undefined ? undefined : String(contact).trim(),
        address: address === undefined ? undefined : String(address).trim(),
      })

      let movedBuildings = 0
      if (newName !== undefined && me && me.name !== newName) {
        movedBuildings = await renameBuildingSite(me.name, newName)
      }
      if (!status && assignee === undefined && color === undefined && schedule === undefined
        && ganttStart === undefined && ganttEnd === undefined && !recomputeProgress) {
        return NextResponse.json({ ok: true, movedBuildings })
      }
    }

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
