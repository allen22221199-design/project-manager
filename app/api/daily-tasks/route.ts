import { NextRequest, NextResponse } from 'next/server'
import { getDailyTasks, updateDailyTask, deleteDailyTask, syncHistoryForDate, getTasksByPerson, addDailyTask } from '@/lib/notion'

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') ?? undefined
    const person = req.nextUrl.searchParams.get('person') ?? undefined
    const freq = req.nextUrl.searchParams.get('freq') ?? undefined

    if (person) {
      const tasks = await getTasksByPerson(person)
      return NextResponse.json({ tasks })
    }

    const tasks = await getDailyTasks(date)
    const grouped: Record<string, typeof tasks> = {}
    for (const t of tasks) {
      ;(grouped[t.person] ??= []).push(t)
    }
    return NextResponse.json({ grouped, all: tasks })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// 手動新增任務並指派人員
export async function POST(req: NextRequest) {
  try {
    const { person, task, date } = await req.json()
    if (!task?.trim()) return NextResponse.json({ error: '缺少任務內容' }, { status: 400 })
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
    await addDailyTask((person || '未分類').trim(), task.trim(), date || today, '手動新增')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, person, task, status, freq, date, dueDate, content, direction, aiPlan, attachments } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await updateDailyTask(id, { person, task, status, freq, dueDate, content, direction, aiPlan, attachments })
    if (date) { try { await syncHistoryForDate(date) } catch {} }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id, date } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await deleteDailyTask(id)
    if (date) { try { await syncHistoryForDate(date) } catch {} }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
