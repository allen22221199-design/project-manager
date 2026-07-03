import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { exchangeCode, GCAL_COOKIE } from '@/lib/google'

// Google OAuth 回呼：換取 refresh_token 並存入 httpOnly cookie
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const back = (msg: string) => NextResponse.redirect(`${origin}/?gcal=${msg}`)

  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return back('unauth')

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const savedState = req.cookies.get('gcal_state')?.value
  if (!code) return back('nocode')
  if (!state || state !== savedState) return back('badstate')

  try {
    const tokens = await exchangeCode(code, origin)
    if (!tokens.refresh_token) return back('norefresh')
    const res = NextResponse.redirect(`${origin}/?gcal=ok`)
    res.cookies.set(GCAL_COOKIE, tokens.refresh_token, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 180 * 24 * 3600,
    })
    res.cookies.set('gcal_state', '', { path: '/', maxAge: 0 })
    return res
  } catch {
    return back('error')
  }
}
