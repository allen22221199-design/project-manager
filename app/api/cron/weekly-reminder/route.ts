import { NextResponse } from 'next/server'
import { pushToLine } from '@/lib/line'

export async function GET() {
  const msg = `📋 本週工作回報提醒

各位同仁好，本週即將結束！
請上網確認本週工作項目是否都已完成，並更新狀態。

👉 https://project-manager-theta-nine.vercel.app`
  try {
    await pushToLine(msg)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
