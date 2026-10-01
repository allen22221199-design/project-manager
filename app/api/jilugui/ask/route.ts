import { NextRequest, NextResponse } from 'next/server'
import { askVault } from '@/lib/jilugui'
import { needUser, fail, errMsg } from '@/lib/jilugui-http'

// 問紀錄櫃：用講的找檔案或紀錄。有 Gemini 金鑰就用 AI 挑，沒有就用關鍵字。
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  try {
    const body = await req.json().catch(() => ({}))
    const history = Array.isArray(body?.history)
      ? body.history.slice(-8).map((m: any) => ({ role: m?.role === 'user' ? 'user' : 'model', text: String(m?.text ?? '').slice(0, 500) }))
      : []
    return NextResponse.json(await askVault(String(body?.question ?? ''), history))
  } catch (e: any) {
    return fail(errMsg(e))
  }
}
