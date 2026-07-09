import { NextRequest, NextResponse } from 'next/server'
import { generateTrainingQuiz } from '@/lib/gemini'

// 依課程的「正式工作案例」階段，生成一題新情境測驗（開放給所有員工，上課流程需要）
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { formalCase } = await req.json()
    if (!formalCase) return NextResponse.json({ error: '缺少 formalCase' }, { status: 400 })
    const quiz = await generateTrainingQuiz(formalCase)
    return NextResponse.json({ ok: true, quiz })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
