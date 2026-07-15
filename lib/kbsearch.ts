import { embedTexts } from './gemini'

export type KbItem = { id: string; title: string; tags: string[]; summary: string; text: string }
export type RankedItem = KbItem & { score: number }

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// 關鍵字檢索（語意失敗時的後備）
function keywordRank(query: string, items: KbItem[], k: number): RankedItem[] {
  const terms = Array.from(new Set((query.match(/[一-龥]{2,}|[a-zA-Z0-9]{2,}/g) || [])))
  if (terms.length === 0) return items.slice(0, k).map(it => ({ ...it, score: 0 }))
  const scored = items.map(it => {
    const hay = `${it.title} ${it.tags.join(' ')} ${it.summary} ${it.text}`
    let s = 0
    for (const t of terms) if (hay.includes(t)) s++
    return { it, s }
  })
  const hit = scored.filter(s => s.s > 0).sort((a, b) => b.s - a.s)
  return (hit.length ? hit : scored).slice(0, k).map(s => ({ ...s.it, score: s.s }))
}

// ===== 內容切塊（RAG chunking）=====
// 把長文切成「有重疊、彼此銜接」的段落：盡量在句子/換行處斷開避免切半句，
// 段落之間刻意保留重疊(overlap)，讓 AI 讀到相鄰段落時能接得起來、判斷內容是完整的。
export type Chunk = { docId: string; title: string; tags: string[]; idx: number; total: number; text: string }

export function chunkText(text: string, size = 900, overlap = 200): string[] {
  const clean = (text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]
  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length)
    if (end < clean.length) {
      // 從這一段的後半往回找最近的句子/段落邊界，讓每段盡量結束在完整句子
      const window = clean.slice(start, end)
      const boundary = Math.max(
        window.lastIndexOf('\n'), window.lastIndexOf('。'),
        window.lastIndexOf('！'), window.lastIndexOf('？'), window.lastIndexOf('. '),
      )
      if (boundary > size * 0.5) end = start + boundary + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = Math.max(end - overlap, start + 1)  // 下一段往回退 overlap，保留銜接
  }
  return chunks.filter(Boolean)
}

// 把多份文件切塊後，用語意相似度挑出最相關的「段落」（而不是整份文件）
export async function rankChunks(
  query: string,
  docs: { docId: string; title: string; tags: string[]; fullText: string }[],
  k = 8, minScore = 0.5, size = 900, overlap = 200,
): Promise<Chunk[]> {
  const all: Chunk[] = []
  for (const d of docs) {
    const parts = chunkText(d.fullText, size, overlap)
    parts.forEach((text, i) => all.push({ docId: d.docId, title: d.title, tags: d.tags, idx: i + 1, total: parts.length, text }))
  }
  if (all.length === 0) return []
  try {
    const vectors = await embedTexts([query, ...all.map(c => `${c.title} ${c.text}`.slice(0, 4000))])
    const qv = vectors[0]
    return all
      .map((c, i) => ({ c, score: cosine(qv, vectors[i + 1]) }))
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => s.c)
  } catch {
    // 後備：關鍵字挑段落
    const terms = Array.from(new Set((query.match(/[一-龥]{2,}|[a-zA-Z0-9]{2,}/g) || [])))
    return all
      .map(c => ({ c, s: terms.filter(t => c.text.includes(t)).length }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map(s => s.c)
  }
}

// 先用 AI 語意搜尋（向量相似度）；失敗就退回關鍵字
// minScore: 最低相似度門檻，低於此分數視為不相關不回傳
export async function rankKnowledge(query: string, items: KbItem[], k = 5, minScore = 0.55): Promise<RankedItem[]> {
  if (items.length === 0) return []
  try {
    const docs = items.map(it => `${it.title} ${it.tags.join(' ')} ${it.summary || it.text}`.slice(0, 4000))
    const vectors = await embedTexts([query, ...docs])
    const qv = vectors[0]
    return items
      .map((it, i) => ({ ...it, score: cosine(qv, vectors[i + 1]) }))
      .filter(s => s.score >= minScore)   // 低於門檻的直接排除
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  } catch {
    return keywordRank(query, items, k)
  }
}
