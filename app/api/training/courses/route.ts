import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth'
import { generateTrainingCards } from '@/lib/gemini'
import { getTrainingCourses, createTrainingCourse, deleteTrainingCourse } from '@/lib/notion'

// 課程清單：所有員工都能看（不需登入），用來上課
export async function GET() {
  try {
    const courses = await getTrainingCourses()
    return NextResponse.json({ courses })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// 建立課程：僅管理者可用（AI 自動把教材拆解成三階段字卡）
export async function POST(req: NextRequest) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: '未授權（請先登入管理者）' }, { status: 401 })
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { sourceText } = await req.json()
    if (!sourceText?.trim()) return NextResponse.json({ error: '請貼入教材內容' }, { status: 400 })
    const content = await generateTrainingCards(sourceText.trim())
    const name = content.courseTitle?.zh || '(未命名課程)'
    const r = await createTrainingCourse(name, content)
    return NextResponse.json({ ok: true, id: r.id, content })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// 刪除課程：僅管理者可用
export async function DELETE(req: NextRequest) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 })
  }
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await deleteTrainingCourse(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
