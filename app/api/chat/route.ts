import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeBase } from '@/lib/notion'
import { chatWithAssistant } from '@/lib/gemini'
import { rankKnowledge } from '@/lib/kbsearch'

export const maxDuration = 60

export type FileResult = { title: string; name: string; url: string }

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
      const top = await rankKnowledge(lastUser, kb, 6)           // 知識內容門檻 0.55
      const topFiles = await rankKnowledge(lastUser, kb, 4, 0.65) // 檔案連結門檻更高 0.65
      knowledge = top
        .map(it => `【${it.title}】${it.tags.length ? `(${it.tags.join('/')})` : ''}\n${(it.text || it.summary).slice(0, 1500)}`)
        .join('\n\n---\n\n')

      // 只有相似度 >= 0.65 的項目才附上下載按鈕
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
