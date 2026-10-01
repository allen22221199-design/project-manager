import { NextRequest, NextResponse } from 'next/server'
import { readSession, SESSION_COOKIE } from '@/lib/auth'

// authed＝有沒有登入（管理者或行銷都算），role 才是看得到什麼的依據。
export async function GET(req: NextRequest) {
  const s = readSession(req.cookies.get(SESSION_COOKIE)?.value)
  return NextResponse.json({ authed: !!s, role: s?.role ?? null })
}
