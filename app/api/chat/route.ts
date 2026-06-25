import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeBase } from '@/lib/notion'
import { chatWithAssistant } from '@/lib/gemini'

export const maxDuration = 60

type KbItem = { id: string; title: string; tags: string[]; summary: string; text: string }

function rankKnowledge(query: string, items: KbItem[]): KbItem[] {
  const terms = Array.from(new Set((query.match(/[一-龥]{2,}|[a-zA-Z0-9]{2,}/g) || [])))
  if (terms.length === 0) return items.slice(0, 4)
  const scored = items.map(it => {
    const hay = `${it.title} ${it.tags.join(' ')} ${it.summary} ${it.text}`
    let score = 0
    for (const t of terms) if (hay.includes(t)) score++
    return { it, score }
  })
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map(s => s.it)
}

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
      const top = rankKnowledge(lastUser, kb)
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
