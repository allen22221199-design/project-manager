import { NextRequest, NextResponse } from 'next/server'
import { getDailyTasks, updateDailyTask, deleteDailyTask } from '@/lib/notion'

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') ?? undefined
    const tasks = await getDailyTasks(date)
    // Group by person
    const grouped: Record<string, typeof tasks> = {}
    for (const t of tasks) {
      ;(grouped[t.person] ??= []).push(t)
    }
    return NextResponse.json({ grouped, all: tasks })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, person, task, status } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await updateDailyTask(id, { person, task, status })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await deleteDailyTask(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
