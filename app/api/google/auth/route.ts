import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { buildAuthUrl, googleConfigured } from '@/lib/google'
import crypto from 'crypto'

// 開始 Google OAuth 授權（僅管理者可發起）
export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }
  if (!googleConfigured()) {
    return NextResponse.json({ error: '尚未設定 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET' }, { status: 503 })
  }
  const state = crypto.randomBytes(16).toString('hex')
  const url = buildAuthUrl(req.nextUrl.origin, state)
  const res = NextResponse.redirect(url)
  // 存 state 供 callback 驗證（防 CSRF）
  res.cookies.set('gcal_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 })
  return res
}
