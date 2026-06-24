import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeBase } from '@/lib/notion'
import { generateAiPlan } from '@/lib/gemini'

export const maxDuration = 60

type KbItem = { id: string; title: string; tags: string[]; summary: string; text: string }

// 依關鍵字重疊度，從知識庫挑出最相關的幾筆
function rankKnowledge(query: string, items: KbItem[]): KbItem[] {
  const terms = Array.from(new Set((query.match(/[一-龥]{2,}|[a-zA-Z0-9]{2,}/g) || [])))
  if (terms.length === 0) return items.slice(0, 3)
  const scored = items.map(it => {
    const hay = `${it.title} ${it.tags.join(' ')} ${it.summary} ${it.text}`
    let score = 0
    for (const t of terms) if (hay.includes(t)) score++
    return { it, score }
  })
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(s => s.it)
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { task, content, direction, goal } = await req.json()
    if (!task?.trim()) return NextResponse.json({ error: '缺少任務名稱' }, { status: 400 })

    // 查知識庫，挑相關內容當作上下文
    let knowledge = ''
    let usedTitles: string[] = []
    try {
      const kb = await getKnowledgeBase()
      const top = rankKnowledge(`${task} ${content || ''} ${direction || ''} ${goal || ''}`, kb)
      usedTitles = top.map(it => it.title)
      knowledge = top
        .map(it => `【${it.title}】${it.tags.length ? `(${it.tags.join('/')})` : ''}\n${(it.text || it.summary).slice(0, 1500)}`)
        .join('\n\n---\n\n')
    } catch { /* 知識庫讀取失敗不影響主流程 */ }

    const plan = await generateAiPlan({ task, content, direction, goal }, knowledge)
    return NextResponse.json({ plan, usedKnowledge: usedTitles })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
