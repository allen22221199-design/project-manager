import { NextRequest, NextResponse } from 'next/server'
import { changeCode } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// POST { current, next }：改自己的登入碼
export async function POST(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const body = await req.json().catch(() => ({}))
    const r = await changeCode(a.user, String(body?.current ?? ''), String(body?.next ?? ''))
    if (!r.ok) return fail(r.error, 400)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
