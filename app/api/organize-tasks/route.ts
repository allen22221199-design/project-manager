import { NextRequest, NextResponse } from 'next/server'
import { organizeDailyTasks } from '@/lib/gemini'
import { addDailyTask } from '@/lib/notion'
import { pushToLine } from '@/lib/line'

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { text, sendLine } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: '請貼上 Plaud 內容' }, { status: 400 })

    // 1. Gemini 整理成每人工作項目
    const items = await organizeDailyTasks(text.trim())
    if (items.length === 0) {
      return NextResponse.json({ error: '無法從內容整理出工作項目，請確認內容', count: 0 }, { status: 200 })
    }

    // 2. 寫進 Notion 每日工作項目
    const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD（本地時區）
    for (const it of items) {
      await addDailyTask(it.person?.trim() || '未分類', it.task?.trim() || '', today, 'Plaud')
    }

    // 3. 整理成 LINE 訊息（依人員分組）並推播
    let lineResult: any = null
    if (sendLine !== false) {
      const grouped: Record<string, string[]> = {}
      for (const it of items) {
        ;(grouped[it.person?.trim() || '未分類'] ??= []).push(it.task?.trim() || '')
      }
      let msg = `📋 今日工作項目（${today}）\n`
      for (const [person, tasks] of Object.entries(grouped)) {
        msg += `\n【${person}】\n` + tasks.map(t => `・${t}`).join('\n') + '\n'
      }
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
