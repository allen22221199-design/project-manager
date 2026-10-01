import { NextRequest, NextResponse } from 'next/server'
import { AI_ON, APP_NAME, loginByCode } from '@/lib/jilugui'
import { setSession, fail, errMsg } from '@/lib/jilugui-http'

// 只輸入登入碼就能登入：伺服器拿登入碼去比對每一位成員，認出是誰。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const r = await loginByCode(String(body?.code ?? ''))
    if (!r.ok) return fail(r.error, 401)
    const res = NextResponse.json({ user: r.user, mode: 'notion', ai: AI_ON, app: APP_NAME })
    setSession(res, r.user)
    return res
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
