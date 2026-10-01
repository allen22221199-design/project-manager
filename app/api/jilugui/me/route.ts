import { NextRequest, NextResponse } from 'next/server'
import { AI_ON, APP_NAME } from '@/lib/jilugui'
import { userOf, fail } from '@/lib/jilugui-http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = userOf(req)
  if (!user) return fail('請先登入', 401)
  return NextResponse.json({ user, mode: 'notion', ai: AI_ON, app: APP_NAME })
}
