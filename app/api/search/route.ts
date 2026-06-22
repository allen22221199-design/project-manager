import { NextRequest, NextResponse } from 'next/server'
import { searchProjects, searchTasks, getProjectDetails, getDailyTasks } from '@/lib/notion'

export async function POST(req: NextRequest) {
  try {
    const { query, pageId } = await req.json()
    if (pageId) {
      const detail = await getProjectDetails(pageId)
      return NextResponse.json(detail)
    }
    const q = (query ?? '').toLowerCase().trim()
    const [projects, tasks, allDaily] = await Promise.all([
      searchProjects(query ?? ''),
      searchTasks(query ?? ''),
      getDailyTasks(),
    ])
    const dailyTasks = q
      ? allDaily.filter(t =>
          t.task?.toLowerCase().includes(q) ||
          t.person?.toLowerCase().includes(q)
        )
      : []
    return NextResponse.json({
      projects: projects.map(p => ({ ...p, type: 'project' })),
      tasks,
      dailyTasks,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
