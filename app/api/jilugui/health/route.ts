import { NextResponse } from 'next/server'
import { AI_ON, APP_NAME } from '@/lib/jilugui'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, mode: 'notion', ai: AI_ON, app: APP_NAME })
}
