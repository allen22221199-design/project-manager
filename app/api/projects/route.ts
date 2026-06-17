import { NextResponse } from 'next/server'
import { getActiveProjects } from '@/lib/notion'

export async function GET() {
  try {
    const projects = await getActiveProjects()
    return NextResponse.json(projects)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
