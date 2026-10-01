import { NextRequest, NextResponse } from 'next/server'
import { signSession, SESSION_COOKIE, type Role } from '@/lib/auth'

// 兩種帳號：管理者（ADMIN_USER／ADMIN_PASS）與行銷人員（MARKETING_USER／MARKETING_PASS）。
// 行銷帳號沒設就只是不能用，不影響管理者登入。
export async function POST(req: NextRequest) {
  const U = process.env.ADMIN_USER
  const P = process.env.ADMIN_PASS
  if (!U || !P) {
    return NextResponse.json({ error: '尚未設定管理者帳密（ADMIN_USER / ADMIN_PASS）' }, { status: 503 })
  }
  const MU = process.env.MARKETING_USER
  const MP = process.env.MARKETING_PASS

  const { username, password } = await req.json()

  let role: Role | null = null
  if (username === U && password === P) role = 'admin'
  else if (MU && MP && username === MU && password === MP) role = 'marketing'

  if (!role) {
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true, role })
  res.cookies.set(SESSION_COOKIE, signSession(role), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  })
  return res
}
