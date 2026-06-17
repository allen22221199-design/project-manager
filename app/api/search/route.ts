import { NextRequest, NextResponse } from 'next/server'
import { searchProjects, getProjectDetails } from '@/lib/notion'

export async function POST(req: NextRequest) {
  try {
    const { query, pageId } = await req.json()
    if (pageId) {
      const detail = await getProjectDetails(pageId)
      return NextResponse.json(detail)
    }
    const results = await searchProjects(query ?? '')
    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
