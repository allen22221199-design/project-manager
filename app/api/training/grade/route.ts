import { NextRequest, NextResponse } from 'next/server'
import { gradeTrainingAnswer } from '@/lib/gemini'
import { saveTrainingRecord } from '@/lib/notion'

// 批改測驗作答，並把結果寫入訓練紀錄（開放給所有員工，上課流程需要）
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { person, courseId, why, how, referenceWhy, referenceHow, lang } = await req.json()
    if (!person?.trim() || !courseId) return NextResponse.json({ error: '缺少 person 或 courseId' }, { status: 400 })
    const result = await gradeTrainingAnswer({ why: why ?? '', how: how ?? '', referenceWhy: referenceWhy ?? '', referenceHow: referenceHow ?? '', lang })
    try { await saveTrainingRecord(person.trim(), courseId, result.pass, result.feedback) } catch { /* 紀錄失敗不影響回饋顯示 */ }
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
