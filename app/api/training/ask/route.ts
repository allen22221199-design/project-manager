import { NextRequest, NextResponse } from 'next/server'
import { answerTrainingQuestion } from '@/lib/gemini'

export const maxDuration = 60

// 訓練中的「問 AI」：教學導向，可自行上網查通用知識來解釋（開放給所有員工）
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { cardTitle, question } = await req.json()
    if (!question?.trim()) return NextResponse.json({ error: '請輸入問題' }, { status: 400 })
    const answer = await answerTrainingQuestion((cardTitle ?? '').trim(), question.trim())
    return NextResponse.json({ ok: true, answer })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
