import { NextRequest, NextResponse } from 'next/server'
import { signSession, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const U = process.env.ADMIN_USER
  const P = process.env.ADMIN_PASS
  if (!U || !P) {
    return NextResponse.json({ error: '尚未設定管理者帳密（ADMIN_USER / ADMIN_PASS）' }, { status: 503 })
  }
  const { username, password } = await req.json()
  if (username !== U || password !== P) {
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, signSession(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  })
  return res
}
