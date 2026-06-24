import { NextRequest, NextResponse } from 'next/server'
import { organizeDailyTasks } from '@/lib/gemini'
import { addDailyTask, deleteDailyTasksByDate, writeHistorySection } from '@/lib/notion'
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

    // 從內容標題解析日期（支援 YYYY/MM/DD、YYYY-MM-DD、M月D日、MM/DD 等格式）
    const nowTW = new Date(Date.now() + 8 * 3600 * 1000)
    const todayStr = nowTW.toISOString().slice(0, 10)
    const yr = nowTW.getUTCFullYear()
    let today = todayStr
    const firstLine = text.trim().split('\n')[0]
    const validMD = (mo: number, d: number) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31
    const pad = (n: string | number) => String(n).padStart(2, '0')

    // 1) 完整日期 YYYY/M/D 或 YYYY-M-D（明確，最可信）
    const m1 = firstLine.match(/(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
    // 2) 中文 M月D日（明確）
    const m3 = firstLine.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
    // 3) 純 M/D（模糊：避免抓到內文裡的 6/20、比例等；前後須是邊界）
    const m2 = firstLine.match(/(?:^|[\s　])(\d{1,2})\/(\d{1,2})(?![\/\d])/)

    if (m1 && validMD(+m1[2], +m1[3])) {
      today = `${m1[1]}-${pad(m1[2])}-${pad(m1[3])}`
    } else if (m3 && validMD(+m3[1], +m3[2])) {
      today = `${yr}-${pad(m3[1])}-${pad(m3[2])}`
    } else if (m2 && validMD(+m2[1], +m2[2])) {
      const cand = `${yr}-${pad(m2[1])}-${pad(m2[2])}`
      // 純 M/D 太容易誤判：解析結果離今天超過 14 天就視為誤判，改用今天
      const diffDays = Math.abs((new Date(cand).getTime() - new Date(todayStr).getTime()) / 86400000)
      today = diffDays <= 14 ? cand : todayStr
    }

    // 依人員分組（給 LINE、歷史頁面用）
    const grouped: Record<string, string[]> = {}
    for (const it of items) {
      ;(grouped[it.person?.trim() || '未分類'] ??= []).push(it.task?.trim() || '')
    }

    // 2. 重寫當天：先刪掉今天的舊資料，再寫入新版
    await deleteDailyTasksByDate(today)
    for (const it of items) {
      await addDailyTask(it.person?.trim() || '未分類', it.task?.trim() || '', today, 'Plaud')
    }

    // 3. 寫入歷史頁面（以日期分段，重寫同一天會替換）
    try { await writeHistorySection(today, grouped) } catch (e) { /* 歷史頁面失敗不影響主流程 */ }

    // 4. 整理成 LINE 訊息（依人員分組）並推播
    let lineResult: any = null
    if (sendLine !== false) {
      const msg = `📋 今日工作日誌已完成（${today}）\n請至以下網址查看：\nhttps://project-manager-theta-nine.vercel.app`
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
