import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeBase } from '@/lib/notion'
import { chatWithAssistant } from '@/lib/gemini'
import { rankKnowledge } from '@/lib/kbsearch'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { messages } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: '沒有訊息' }, { status: 400 })
    }
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''

    let knowledge = ''
    try {
      const kb = await getKnowledgeBase()
      const top = await rankKnowledge(lastUser, kb, 6)
      knowledge = top
        .map(it => `【${it.title}】${it.tags.length ? `(${it.tags.join('/')})` : ''}\n${(it.text || it.summary).slice(0, 1500)}`)
        .join('\n\n---\n\n')
    } catch { /* 知識庫讀取失敗不影響對話 */ }

    const reply = await chatWithAssistant(messages, knowledge)
    return NextResponse.json({ reply })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
