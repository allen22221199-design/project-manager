import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeBase } from '@/lib/notion'
import { chatWithAssistant } from '@/lib/gemini'
import { rankKnowledge } from '@/lib/kbsearch'

export const maxDuration = 60

export type FileResult = { title: string; name: string; url: string }

// 依排名給不同文字長度：第1名最多、之後遞減
const TEXT_LIMITS = [3000, 2000, 1500, 1200, 1000, 800]

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
    const fileResults: FileResult[] = []
    try {
      const kb = await getKnowledgeBase()
      const top = await rankKnowledge(lastUser, kb, 6, 0.62)      // 門檻提高到 0.62
      const topFiles = await rankKnowledge(lastUser, kb, 4, 0.65) // 檔案連結門檻 0.65

      knowledge = top
        .map((it, idx) => {
          const limit = TEXT_LIMITS[idx] ?? 800
          const body = (it.text || it.summary).slice(0, limit)
          const rank = idx === 0 ? '⭐ 最相關' : `參考${idx + 1}`
          const tags = it.tags.length ? `(${it.tags.join('/')})` : ''
          return `[${rank}] 【${it.title}】${tags}\n${body}`
        })
        .join('\n\n---\n\n')

      for (const it of topFiles) {
        const kbItem = kb.find(k => k.id === it.id) as any
        if (!kbItem) continue
        if (kbItem.externalUrl) {
          fileResults.push({ title: kbItem.title, name: kbItem.title, url: kbItem.externalUrl })
        }
        for (const att of (kbItem.attachments ?? [])) {
          if (att.url) fileResults.push({ title: kbItem.title, name: att.name || kbItem.title, url: att.url })
        }
      }
    } catch { /* 知識庫讀取失敗不影響對話 */ }

    const reply = await chatWithAssistant(messages, knowledge)
    return NextResponse.json({ reply, files: fileResults })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
