import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeBase } from '@/lib/notion'
import { chatWithAssistant, routeChatIntent } from '@/lib/gemini'
import { rankKnowledge } from '@/lib/kbsearch'

// 進度回報草稿：聊天室偵測到「要記進度」時回傳給前端，讓使用者確認後才真正寫入
export type ProgressDraft = {
  date: string
  description: string
  matchedId: string | null
  matchedName: string | null
  candidates: { id: string; name: string }[]
}

// 台北時區今天 YYYY/MM/DD
function taipeiToday(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}

export const maxDuration = 60

export type FileResult = { title: string; name: string; url: string }

// 依排名給不同文字長度：第1名最多、之後遞減
const TEXT_LIMITS = [3000, 2000, 1500, 1200, 1000, 800]

// 判斷使用者是否在詢問/提及某個檔案（提到檔名、「檔案」、「文件」、「PDF」等關鍵字）
function isAskingForFile(query: string): boolean {
  const fileKeywords = ['檔案', '文件', 'pdf', 'PDF', '報告', '資料', '合約', '圖面', '圖檔', '附件', 'doc', 'xls', '下載']
  const lq = query.toLowerCase()
  return fileKeywords.some(k => lq.includes(k.toLowerCase()))
}

// 依檔名匹配：在已排名的語意結果中，優先把與查詢詞匹配的檔名項目排到最前面
function boostByFilename(query: string, items: Awaited<ReturnType<typeof rankKnowledge>>) {
  const terms = (query.match(/[一-龥a-zA-Z0-9]{2,}/g) ?? []).map(t => t.toLowerCase())
  if (terms.length === 0) return items
  return [...items].sort((a, b) => {
    const scoreA = terms.filter(t => a.title.toLowerCase().includes(t)).length
    const scoreB = terms.filter(t => b.title.toLowerCase().includes(t)).length
    return scoreB - scoreA  // 檔名命中多的排前面，分數相同則維持語意排序
  })
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const { messages, projects } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: '沒有訊息' }, { status: 400 })
    }
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''

    // ① 先判斷這句是「要記進度」還是「要問問題」。是進度就回傳草稿讓前端確認，不直接寫入。
    const projList: { id: string; name: string }[] = Array.isArray(projects)
      ? projects.filter((p: any) => p?.id && p?.name).map((p: any) => ({ id: String(p.id), name: String(p.name) }))
      : []
    if (projList.length > 0 && lastUser.trim()) {
      const intent = await routeChatIntent(lastUser, projList.map(p => p.name), taipeiToday())
      if (intent.intent === 'progress' && intent.description.trim()) {
        // 把 AI 對應到的專案名稱，比對回實際專案（完全相符 → 包含關係 → 都沒有就列候選）
        const norm = (s: string) => s.replace(/\s/g, '').toLowerCase()
        const hint = intent.project ? norm(intent.project) : ''
        let matched = hint ? projList.find(p => norm(p.name) === hint) : undefined
        let candidates: { id: string; name: string }[] = []
        if (!matched && hint) {
          candidates = projList.filter(p => norm(p.name).includes(hint) || hint.includes(norm(p.name)))
          if (candidates.length === 1) { matched = candidates[0]; candidates = [] }
        }
        const draft: ProgressDraft = {
          date: intent.date || taipeiToday(),
          description: intent.description.trim(),
          matchedId: matched?.id ?? null,
          matchedName: matched?.name ?? null,
          candidates,
        }
        const reply = matched
          ? `我看起來你是要記一筆進度到【${matched.name}】。確認一下內容，沒問題就按「確認新增」👇`
          : candidates.length > 0
            ? '這筆進度要記到哪個專案？請點選一個👇'
            : '這筆進度要記到哪個專案？我沒對應到，請從清單選一個👇'
        return NextResponse.json({ reply, progressDraft: draft })
      }
    }

    let knowledge = ''
    const fileResults: FileResult[] = []
    try {
      const kb = await getKnowledgeBase()
      const top = await rankKnowledge(lastUser, kb, 6, 0.62)
      // 在語意排序結果中，額外依檔名相關度做提升
      const boosted = boostByFilename(lastUser, top)

      knowledge = boosted
        .map((it, idx) => {
          const limit = TEXT_LIMITS[idx] ?? 800
          const body = (it.text || it.summary).slice(0, limit)
          const rank = idx === 0 ? '⭐ 最相關' : `參考${idx + 1}`
          const tags = it.tags.length ? `(${it.tags.join('/')})` : ''
          return `[${rank}] 【${it.title}】${tags}\n${body}`
        })
        .join('\n\n---\n\n')

      // 只有問到檔案相關內容時，才附上下載連結
      if (isAskingForFile(lastUser)) {
        const topFiles = await rankKnowledge(lastUser, kb, 4, 0.65)
        const boostedFiles = boostByFilename(lastUser, topFiles)
        for (const it of boostedFiles) {
          const kbItem = kb.find(k => k.id === it.id) as any
          if (!kbItem) continue
          if (kbItem.externalUrl) {
            fileResults.push({ title: kbItem.title, name: kbItem.title, url: kbItem.externalUrl })
          }
          for (const att of (kbItem.attachments ?? [])) {
            if (att.url) fileResults.push({ title: kbItem.title, name: att.name || kbItem.title, url: att.url })
          }
        }
      }
    } catch { /* 知識庫讀取失敗不影響對話 */ }

    const reply = await chatWithAssistant(messages, knowledge)
    return NextResponse.json({ reply, files: fileResults })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
