import { NextRequest, NextResponse } from 'next/server'
import { getDailyTasks } from '@/lib/notion'

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
