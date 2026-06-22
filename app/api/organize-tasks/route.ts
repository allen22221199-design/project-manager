import { NextRequest, NextResponse } from 'next/server'
import { organizeDailyTasks } from '@/lib/gemini'
import { addDailyTask, deleteDailyTasksByDate, writeHistorySection } from '@/lib/notion'
import { pushToLine } from '@/lib/line'

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '撠閮剖? GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { text, sendLine } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: '隢票銝?Plaud ?批捆' }, { status: 400 })

    // 1. Gemini ?渡???鈭箏極雿???    const items = await organizeDailyTasks(text.trim())
    if (items.length === 0) {
      return NextResponse.json({ error: '?⊥?敺摰寞?撌乩??嚗?蝣箄??批捆', count: 0 }, { status: 200 })
    }

    // ?啁???交?嚗TC+8嚗?    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

    // 靘犖?∪?蝯?蝯?LINE?風?脤??Ｙ嚗?    const grouped: Record<string, string[]> = {}
    for (const it of items) {
      ;(grouped[it.person?.trim() || '?芸?憿?] ??= []).push(it.task?.trim() || '')
    }

    // 2. ?神?嗅予嚗??芣?隞予??鞈?嚗?撖怠?啁?
    await deleteDailyTasksByDate(today)
    for (const it of items) {
      await addDailyTask(it.person?.trim() || '?芸?憿?, it.task?.trim() || '', today, 'Plaud')
    }

    // 3. 撖怠甇瑕?嚗誑?交??挾嚗?撖怠?銝憭拇??踵?嚗?    try { await writeHistorySection(today, grouped) } catch (e) { /* 甇瑕?憭望?銝蔣?蹂蜓瘚? */ }

    // 4. ?渡???LINE 閮嚗?鈭箏??嚗蒂?冽
    let lineResult: any = null
    if (sendLine !== false) {
      const msg = `?? 隞撌乩??亥?撌脣???${today}嚗n隢隞乩?蝬脣??亦?嚗nhttps://project-manager-theta-nine.vercel.app`
      try {
        lineResult = await pushToLine(msg)
      } catch (e: any) {
        lineResult = { error: e.message }
      }
    }

    return NextResponse.json({ ok: true, count: items.length, items, line: lineResult })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
