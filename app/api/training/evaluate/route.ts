import { NextRequest, NextResponse } from 'next/server'
import { evaluateTrainingThought } from '@/lib/gemini'

// 學員在字卡寫下想法後，AI 判斷思考是否合理（沒有唯一標準答案，鼓勵導向）
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { cardTitle, question, learnerAnswer, referenceAnswer, lang } = await req.json()
    if (!learnerAnswer?.trim()) return NextResponse.json({ error: '沒有作答內容' }, { status: 400 })
    const feedback = await evaluateTrainingThought({
      cardTitle: (cardTitle ?? '').trim(),
      question: (question ?? '').trim(),
      learnerAnswer: learnerAnswer.trim(),
      referenceAnswer: (referenceAnswer ?? '').trim(),
      lang,
    })
    return NextResponse.json({ ok: true, feedback })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
