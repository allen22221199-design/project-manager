import { NextRequest, NextResponse } from 'next/server'
import { getDailyTasks, updateDailyTask, deleteDailyTask, syncHistoryForDate, getTasksByPerson } from '@/lib/notion'

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

export async function PATCH(req: NextRequest) {
  try {
    const { id, person, task, status, freq, date, content, direction } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await updateDailyTask(id, { person, task, status, freq, content, direction })
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
