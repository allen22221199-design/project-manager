import { embedTexts } from './gemini'

export type KbItem = { id: string; title: string; tags: string[]; summary: string; text: string }
export type RankedItem = KbItem & { score: number }

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// 取關鍵字：英數詞照舊；中文因為沒空格，改取「2 字滑動窗（bigram）」，
// 否則整串中文會被當成一個詞，比對不到任何文件（導致後備檢索永遠找不到）。
export function extractTerms(query: string): string[] {
  const terms = new Set<string>()
  for (const m of query.match(/[a-zA-Z0-9]{2,}/g) || []) terms.add(m.toLowerCase())
  for (const run of query.match(/[一-龥]{2,}/g) || []) {
    for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2))
  }
  return Array.from(terms)
}

// 關鍵字檢索（語意失敗時的後備）
function keywordRank(query: string, items: KbItem[], k: number): RankedItem[] {
  const terms = extractTerms(query)
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
      const seg = clean.slice(start, end)
      const boundary = Math.max(
        seg.lastIndexOf('\n'), seg.lastIndexOf('。'),
        seg.lastIndexOf('！'), seg.lastIndexOf('？'), seg.lastIndexOf('. '),
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
  // 多樣化挑選：先給「每份相關文件」各挑最高分的 1 段（確保所有相關 SOP 都被涵蓋、能通盤彙整），
  // 再用剩餘名額補上全域最高分的段落。避免前 k 段全被 1～2 份文件佔滿、漏掉其他相關 SOP。
  const pickDiverse = <T extends { c: Chunk }>(scored: T[]): Chunk[] => {
    const best = new Map<string, T>()
    for (const s of scored) if (!best.has(s.c.docId)) best.set(s.c.docId, s)  // scored 已排序 → 每 doc 首個即最高分
    const diverse = Array.from(best.values())
    const rest = scored.filter(s => best.get(s.c.docId) !== s)
    return [...diverse, ...rest].slice(0, k).map(s => s.c)
  }
  try {
    const vectors = await embedTexts([query, ...all.map(c => `${c.title} ${c.text}`.slice(0, 4000))])
    const qv = vectors[0]
    const scored = all
      .map((c, i) => ({ c, score: cosine(qv, vectors[i + 1]) }))
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
    return pickDiverse(scored)
  } catch {
    // 後備：關鍵字挑段落（中文用 bigram，否則比對不到）
    const terms = extractTerms(query)
    const scored = all
      .map(c => ({ c, s: terms.filter(t => c.text.includes(t)).length }))
      .sort((a, b) => b.s - a.s)
    return pickDiverse(scored)
  }
}

// 先用 AI 語意搜尋（向量相似度）；失敗就退回關鍵字
// minScore: 最低相似度門檻，低於此分數視為不相關不回傳
export async function rankKnowledge(query: string, items: KbItem[], k = 5, minScore = 0.55): Promise<RankedItem[]> {
  if (items.length === 0) return []
  // 語料很大時，先用關鍵字(bigram)粗篩到 ~110 篇候選，再做語意排序 →
  // 只嵌入候選而非全部數百篇，大幅降低延遲，且相關文件通常都有詞彙重疊不會被漏掉。
  const pool: KbItem[] = items.length > 130 ? keywordRank(query, items, 110) : items
  try {
    const docs = pool.map(it => `${it.title} ${it.tags.join(' ')} ${it.summary || it.text}`.slice(0, 4000))
    const vectors = await embedTexts([query, ...docs])
    const qv = vectors[0]
    return pool
      .map((it, i) => ({ ...it, score: cosine(qv, vectors[i + 1]) }))
      .filter(s => s.score >= minScore)   // 低於門檻的直接排除
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  } catch {
    return keywordRank(query, pool, k)
  }
}
