import { NextRequest, NextResponse } from 'next/server'
import { readHistorySection } from '@/lib/notion'

// 唯讀：把「工作歷史」頁面上某一天的區塊原文讀出來。
// 用途是救援——每日工作被覆蓋掉時，歷史頁面還留著當時的任務清單，
// 可以照著把資料補回去。這支不會寫入任何東西。
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date')
    if (!date) return NextResponse.json({ error: '缺少 date' }, { status: 400 })
    return NextResponse.json({ date, lines: await readHistorySection(date) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
