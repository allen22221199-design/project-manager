import { NextRequest, NextResponse } from 'next/server'
import {
  getMeetingItems, addMeetingItem, updateMeetingProgress, getMeetingHistory, deleteMeetingItem,
} from '@/lib/notion'

// 會議事項（品質會議的問題追蹤）。跟每日工作是兩個獨立資料庫，互不影響。
export const maxDuration = 60

const CATEGORIES = ['前處理', '底漆', '噴印', '面漆', '包裝', '施工', '品管', '研發', '廠務', '其他']

function taipeiTodayISO(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

// GET ?closed=1 取已結案；?history=<id> 取單筆的完整進度歷程
export async function GET(req: NextRequest) {
  try {
    const historyId = req.nextUrl.searchParams.get('history')
    if (historyId) {
      return NextResponse.json({ history: await getMeetingHistory(historyId) })
    }
    const closed = req.nextUrl.searchParams.get('closed') === '1'
    const items = await getMeetingItems({ closed })
    return NextResponse.json({ items, categories: CATEGORIES })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST 新增項目
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const issue = String(b.issue ?? '').trim()
    if (!issue) return NextResponse.json({ error: '請填「檢討及提案項目」' }, { status: 400 })
    const category = String(b.category ?? '').trim()
    if (CATEGORIES.indexOf(category) < 0) {
      return NextResponse.json({ error: '請選一個類別' }, { status: 400 })
    }
    const r = await addMeetingItem({
      meetDate: String(b.meetDate ?? '').trim() || taipeiTodayISO(),
      category,
      issue,
      proposer: String(b.proposer ?? '').trim(),
      discussion: String(b.discussion ?? '').trim(),
      suggester: String(b.suggester ?? '').trim(),
      owner: String(b.owner ?? '').trim(),
      due: String(b.due ?? '').trim(),
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH 更新進度／改預計日／改執行人／結案
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json()
    const id = String(b.id ?? '')
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    const progress = String(b.progress ?? '').trim()
    const close = b.close === true
    // 結案時不強迫寫進度，但一般更新至少要有一項變動，否則就是空按
    if (!progress && !close && b.due === undefined && b.owner === undefined && b.subtasks === undefined) {
      return NextResponse.json({ error: '沒有要更新的內容' }, { status: 400 })
    }
    await updateMeetingProgress(id, {
      progress,
      due: b.due,
      owner: b.owner === undefined ? undefined : String(b.owner).trim(),
      subtasks: b.subtasks === undefined ? undefined : String(b.subtasks),
      close,
      today: taipeiTodayISO(),
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE ?id=<pageId> 刪除一筆（誤填時用）
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await deleteMeetingItem(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
