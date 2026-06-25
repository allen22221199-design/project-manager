import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeBase } from '@/lib/notion'
import { generateAiPlan } from '@/lib/gemini'
import { rankKnowledge } from '@/lib/kbsearch'

export const maxDuration = 60

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
      const top = await rankKnowledge(`${task} ${content || ''} ${direction || ''} ${goal || ''}`, kb, 5)
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
