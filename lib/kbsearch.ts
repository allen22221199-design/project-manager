import { embedTexts } from './gemini'

export type KbItem = { id: string; title: string; tags: string[]; summary: string; text: string }

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// 關鍵字檢索（語意失敗時的後備）
function keywordRank(query: string, items: KbItem[], k: number): KbItem[] {
  const terms = Array.from(new Set((query.match(/[一-龥]{2,}|[a-zA-Z0-9]{2,}/g) || [])))
  if (terms.length === 0) return items.slice(0, k)
  const scored = items.map(it => {
    const hay = `${it.title} ${it.tags.join(' ')} ${it.summary} ${it.text}`
    let s = 0
    for (const t of terms) if (hay.includes(t)) s++
    return { it, s }
  })
  const hit = scored.filter(s => s.s > 0).sort((a, b) => b.s - a.s)
  return (hit.length ? hit : scored).slice(0, k).map(s => s.it)
}

// 先用 AI 語意搜尋（向量相似度）；失敗就退回關鍵字
export async function rankKnowledge(query: string, items: KbItem[], k = 5): Promise<KbItem[]> {
  if (items.length === 0) return []
  if (items.length <= k) return items
  try {
    const docs = items.map(it => `${it.title} ${it.tags.join(' ')} ${it.summary || it.text}`.slice(0, 4000))
    const vectors = await embedTexts([query, ...docs])
    const qv = vectors[0]
    return items
      .map((it, i) => ({ it, score: cosine(qv, vectors[i + 1]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => s.it)
  } catch {
    return keywordRank(query, items, k)
  }
}
