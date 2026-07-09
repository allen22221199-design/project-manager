import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { getTrainingRecords } from '@/lib/notion'

// 訓練完成紀錄：僅管理者可查看（誰完成了哪堂課、有沒有通過）
export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }
  try {
    const person = req.nextUrl.searchParams.get('person') ?? undefined
    const records = await getTrainingRecords(person)
    return NextResponse.json({ records })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
