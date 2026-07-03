import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const authed = verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  return NextResponse.json({ authed })
}
