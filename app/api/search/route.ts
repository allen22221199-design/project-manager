import { NextRequest, NextResponse } from 'next/server'
import { searchProjects, searchTasks, getProjectDetails } from '@/lib/notion'

export async function POST(req: NextRequest) {
  try {
    const { query, pageId } = await req.json()
    if (pageId) {
      const detail = await getProjectDetails(pageId)
      return NextResponse.json(detail)
    }
    const [projects, tasks] = await Promise.all([
      searchProjects(query ?? ''),
      searchTasks(query ?? ''),
    ])
    return NextResponse.json({
      projects: projects.map(p => ({ ...p, type: 'project' })),
      tasks,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
