import { NextRequest, NextResponse } from 'next/server'
import { getKnowledgeBase, readPagePlainText, getPageMedia, getImageLibrary, classifyMedia, type MediaKind } from '@/lib/notion'
import { chatWithAssistant, routeChatIntent, suggestFollowups } from '@/lib/gemini'
import { rankKnowledge, rankChunks, type Chunk } from '@/lib/kbsearch'

// 進度回報草稿：聊天室偵測到「要記進度」時回傳給前端，讓使用者確認後才真正寫入
export type ProgressDraft = {
  date: string
  description: string
  matchedId: string | null
  matchedName: string | null
  candidates: { id: string; name: string }[]
}

// 隨手記任務草稿：偵測到「要交辦一件事」時回傳給前端，一律要按確認才寫入
export type TaskDraft = {
  task: string
  date: string             // YYYY-MM-DD（截止日，沒講就今天）
  owner: string | null     // 已經確定的人（話裡明講、或「我自己」）
  ownerReason: string      // 為什麼是他：'明確指定' / '你自己' / '依專長建議'
  suggested: string | null // 依專長建議、還需要確認的人選
  why: string
}

// 台北時區今天 YYYY/MM/DD
function taipeiToday(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}

export const maxDuration = 60

export type FileResult = { title: string; name: string; url: string }
// AI 回答時附帶的相關圖片／影片（來自圖庫，或它引用的 SOP／檔案庫頁面）
export type ImageResult = { source: string; url: string; caption: string; kind: MediaKind }

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
    const { messages, projects, people, isAdmin, selfName } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: '沒有訊息' }, { status: 400 })
    }
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')?.content ?? ''
    // 檢索用查詢：合併最近 3 則使用者訊息，讓「給我內容」「詳細說」這類追問也能帶到前文主題
    const recentUserMsgs: string[] = messages.filter((m: any) => m.role === 'user').map((m: any) => String(m.content ?? ''))
    const retrievalQuery = recentUserMsgs.slice(-3).join('\n').trim() || lastUser

    // ① 先判斷這句是「要記進度」還是「要問問題」。是進度就回傳草稿讓前端確認，不直接寫入。
    const projList: { id: string; name: string }[] = Array.isArray(projects)
      ? projects.filter((p: any) => p?.id && p?.name).map((p: any) => ({ id: String(p.id), name: String(p.name) }))
      : []
    // 可指派的人員名單由前端帶上來（單一來源：app/page.tsx 的名單），
    // 私人身分（總經理自己）只有管理者登入時才會出現在名單裡
    const roster: { name: string; skill: string }[] = Array.isArray(people)
      ? people.filter((p: any) => p?.name).map((p: any) => ({ name: String(p.name), skill: String(p.skill ?? '') }))
      : []
    if (lastUser.trim() && (projList.length > 0 || roster.length > 0)) {
      const intent = await routeChatIntent(lastUser, projList.map(p => p.name), taipeiToday(), roster)

      // ── 隨手記任務 ──────────────────────────────────────────
      if (intent.intent === 'task' && intent.tasks.length > 0) {
        const todayDash = taipeiToday().replace(/\//g, '-')
        const drafts: TaskDraft[] = intent.tasks.map(t => {
          // 「我自己」只有在管理者登入時才對得到人；一般員工講「我」我們無從得知是誰
          const selfOwner = t.self && isAdmin && selfName ? String(selfName) : null
          const owner = t.owner ?? selfOwner
          return {
            task: t.task,
            date: (t.due || taipeiToday()).replace(/\//g, '-') || todayDash,
            owner,
            ownerReason: t.owner ? '明確指定' : selfOwner ? '你自己' : '',
            // 已經有確定的人就不需要建議；建議人選也不能等於已確定的人
            suggested: owner ? null : (t.suggested && t.suggested !== owner ? t.suggested : null),
            why: owner ? '' : t.why,
          }
        })
        const named = drafts.filter(d => d.owner).length
        const guessed = drafts.filter(d => !d.owner && d.suggested).length
        const blank = drafts.length - named - guessed
        const parts: string[] = []
        if (named) parts.push(`${named} 筆已經有指定的人`)
        if (guessed) parts.push(`${guessed} 筆我依專長幫你建議了人選，要你確認`)
        if (blank) parts.push(`${blank} 筆我判斷不出來該給誰，請你點選`)
        const reply = drafts.length === 1 && named === 1
          ? `好，這件事我記下來了，確認一下要不要派給【${drafts[0].owner}】👇`
          : `我從你這段話整理出 ${drafts.length} 件待辦（${parts.join('、')}）。確認後按下面的按鈕才會真的派下去👇`
        return NextResponse.json({ reply, taskDrafts: drafts })
      }

      if (intent.intent === 'progress' && intent.items.length > 0 && projList.length > 0) {
        // 把 AI 對應到的專案名稱，比對回實際專案（完全相符 → 包含關係 → 都沒有就列候選）
        const norm = (s: string) => s.replace(/[\s\-－_（）()]/g, '').toLowerCase()
        // 師傅講的名稱通常很簡略（「冠德」「桃大」），用「最長共同片段」幫忙猜，
        // 猜不準也要把最可能的排在前面，讓他從短清單挑，而不是從 20 個裡面找。
        const longestCommon = (a: string, b: string) => {
          for (let len = Math.min(a.length, b.length); len >= 2; len--) {
            for (let i = 0; i + len <= a.length; i++) if (b.includes(a.slice(i, i + len))) return len
          }
          return 0
        }
        // 回傳兩字串最長的共同片段本身（用來判斷師傅講的字是不是只對應到一個案場）
        const commonFragment = (a: string, b: string) => {
          for (let len = Math.min(a.length, b.length); len >= 2; len--) {
            for (let i = 0; i + len <= a.length; i++) {
              const frag = a.slice(i, i + len)
              if (b.includes(frag)) return frag
            }
          }
          return ''
        }
        const userNorm = norm(lastUser)
        const drafts: ProgressDraft[] = intent.items.map(item => {
          const hint = item.project ? norm(item.project) : ''
          let matched = hint ? projList.find(p => norm(p.name) === hint) : undefined
          let candidates: { id: string; name: string }[] = []
          if (!matched && hint) {
            candidates = projList.filter(p => norm(p.name).includes(hint) || hint.includes(norm(p.name)))
            if (candidates.length === 1) { matched = candidates[0]; candidates = [] }
          }
          // 安全防護：模型可能自作主張補成完整案名（師傅只講「惠宇」，它卻挑了「惠宇-大然」）。
          // 檢查師傅原話與該案名的共同片段，若那片段同時符合多個案場，就不自動對應，改讓他選。
          // 記錯案場比多問一次嚴重得多。
          if (matched) {
            const frag = commonFragment(userNorm, norm(matched.name))
            const sharing = frag ? projList.filter(p => norm(p.name).includes(frag)) : []
            if (!frag || sharing.length > 1) {
              candidates = (sharing.length > 1 ? sharing : projList).slice(0, 8).map(p => ({ id: p.id, name: p.name }))
              matched = undefined
            }
          }
          if (!matched && candidates.length === 0) {
            // 完全沒對應：拿「AI 猜的名稱 + 師傅原話 + 進度描述」去比對，取分數最高的前 8 個當候選。
            // 一定要含師傅原話——他打「惠宇的門片打樣好了」，清單就該把所有惠宇的案子排最前面。
            const hints = [hint, userNorm, norm(item.description)].filter(Boolean)
            const scored = projList
              .map(p => ({ p, s: Math.max(...hints.map(h => longestCommon(h, norm(p.name)))) }))
              .sort((a, b) => b.s - a.s)
            candidates = (scored[0]?.s >= 2 ? scored.filter(x => x.s >= 2) : scored)
              .slice(0, 8).map(x => ({ id: x.p.id, name: x.p.name }))
          }
          return {
            date: item.date || taipeiToday(),
            description: item.description.trim(),
            matchedId: matched?.id ?? null,
            matchedName: matched?.name ?? null,
            candidates,
          }
        })
        const auto = drafts.filter(d => d.matchedId).length
        const need = drafts.length - auto
        const reply = drafts.length === 1
          ? (drafts[0].matchedId
              ? `我看起來你是要記一筆進度到【${drafts[0].matchedName}】。確認一下內容，沒問題就按「確認新增」👇`
              : '這筆進度要記到哪個專案？請點選一個👇')
          : `我從你這段話裡整理出 ${drafts.length} 筆進度，已經幫你分好各自的專案${need > 0 ? `（其中 ${need} 筆我不確定，請你點選）` : ''}。確認後按「全部確認新增」👇`
        // progressDraft（單數）保留給舊版前端，避免使用者還沒重新整理就壞掉
        return NextResponse.json({ reply, progressDrafts: drafts, progressDraft: drafts.length === 1 ? drafts[0] : undefined })
      }
    }

    let knowledge = ''
    const fileResults: FileResult[] = []
    const imageResults: ImageResult[] = []
    let topSources: { id: string; title: string }[] = []  // AI 主要引用的來源頁（用來抓相關圖片）
    // 圖庫先載（與知識庫平行），它同時是「圖片來源」也是「知識來源」：
    // 例如「防火標章」這一列的說明，要讓 AI 能拿來回答，而不只是當圖片標題
    const imageLibPromise = getImageLibrary().catch(() => [])
    try {
      const kb = await getKnowledgeBase()

      // ── 兩階段 RAG 檢索 ──────────────────────────────────────
      // 階段①：先用「摘要」語意排序，挑出最相關的候選文件（便宜、避免每篇都讀全文）
      // 知識庫已達數百筆、同類 SOP 很多，候選數放寬到 14；門檻放低(0.3)靠「排名」取前段，
      // 避免換個問法、相似度略低就整批被濾掉而「找不到」（提高檢索敏感度）
      const candDocs = await rankKnowledge(retrievalQuery, kb, 14, 0.3)
      // 階段②：只對候選文件抓「完整內文」，切成有重疊、彼此銜接的段落，再用語意挑最相關的段落
      // 去掉 Notion 內文裡的切塊標記（標題、〔第 i/n 段〕），避免污染送進 AI 的內容
      const stripMarkers = (s: string) => s
        .replace(/【AI 萃取內容（已切塊）】/g, '')
        .replace(/【AI 萃取內容】/g, '')
        .replace(/〔第\s*\d+\s*\/\s*\d+\s*段〕/g, '')
        .trim()
      const withFull = await Promise.all(candDocs.map(async (d, idx) => {
        const stored = stripMarkers(d.text || d.summary || '')
        // 短文件：儲存的摘要通常就等於全文 → 直接用，不再讀 Notion（大幅省時、避免逾時）。
        // 只有「儲存內容接近上限(疑似被截斷的長文)」且排名前段(前6)時，才即時讀完整內文補齊。
        let fullText = stored
        if (stored.length >= 1800 && idx < 4) {
          try {
            const body = stripMarkers(await readPagePlainText(d.id))
            if (body.length > stored.length) fullText = body
          } catch { /* 讀取失敗就用儲存摘要 */ }
        }
        return { docId: d.id, title: d.title, tags: d.tags, fullText }
      }))
      // 每份相關 SOP 至少貢獻最相關的一段（多樣化），再補全域最高分，讓 AI 能通盤彙整
      const chunks = await rankChunks(retrievalQuery, withFull, 16, 0.3)

      if (chunks.length > 0) {
        // 依文件分組、段落依序排列，讓相鄰段落接在一起（AI 才能判斷是完整內容）
        const byDoc = new Map<string, Chunk[]>()
        for (const c of chunks) {
          const list = byDoc.get(c.docId) ?? []
          list.push(c); byDoc.set(c.docId, list)
        }
        const header = '以下是從公司資料庫依相關度找到的內容片段。同一份資料會標【第 i/n 段】，段落之間有刻意重疊銜接；看到相鄰的段落編號代表那是同一份完整內容的接續部分，請合併理解後再回答；若某份資料只回傳部分段落，回答時要留意可能還有未顯示的內容。'
        knowledge = header + '\n\n' + Array.from(byDoc.values()).map(list => {
          const sorted = list.slice().sort((a, b) => a.idx - b.idx)
          const title = sorted[0].title
          const tags = sorted[0].tags.length ? `(${sorted[0].tags.join('/')})` : ''
          return `【${title}】${tags}\n` + sorted.map(c => `〔第 ${c.idx}/${c.total} 段〕\n${c.text}`).join('\n（…接續…）\n')
        }).join('\n\n---\n\n')
        // 依相關度排序的來源頁（byDoc 的插入順序 = 段落分數順序），供抓圖用
        topSources = Array.from(byDoc.entries()).map(([id, list]) => ({ id, title: list[0].title }))
      } else {
        // 後備：沿用舊的「摘要」組裝（切塊沒抓到內容時）
        const boosted = boostByFilename(retrievalQuery, candDocs)
        topSources = boosted.map(it => ({ id: it.id, title: it.title }))
        knowledge = boosted
          .map((it, idx) => {
            const limit = TEXT_LIMITS[idx] ?? 800
            const body = (it.text || it.summary).slice(0, limit)
            const rank = idx === 0 ? '⭐ 最相關' : `參考${idx + 1}`
            const tags = it.tags.length ? `(${it.tags.join('/')})` : ''
            return `[${rank}] 【${it.title}】${tags}\n${body}`
          })
          .join('\n\n---\n\n')
      }

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
      // 附上「相關圖片／影片」：來自 AI 主要引用的來源頁，兩種來源都抓——
      //   (1) 頁面內文的圖片/影片/YouTube 區塊；(2) 檔案庫該筆「檔案」欄位上傳的圖片或影片檔
      // 只取「最相關的那一份」：取前三份會把不相干的影片也附上來（使用者回報「給的影片有錯誤」）。
      try {
        const picks = topSources.slice(0, 1)
        const imgLists = await Promise.all(picks.map(s => getPageMedia(s.id, 4).catch(() => [])))
        picks.forEach((s, i) => {
          for (const im of imgLists[i]) imageResults.push({ source: s.title, url: im.url, caption: im.caption, kind: im.kind })
          const kbItem = kb.find(k => k.id === s.id) as any
          for (const att of (kbItem?.attachments ?? [])) {
            const kind = att.url ? classifyMedia(att.name || att.url) : null
            if (kind) imageResults.push({ source: s.title, url: att.url, caption: att.name || '', kind })
          }
        })
        // 去重（同網址只留一張）+ 上限 6 張
        const seen = new Set<string>()
        const dedup = imageResults.filter(im => { const k = im.url.split('?')[0]; if (seen.has(k)) return false; seen.add(k); return true })
        imageResults.length = 0
        imageResults.push(...dedup.slice(0, 3))  // 自動抓的圖最多 3 張，避免洗版（圖庫的精準圖之後會排前面）
      } catch { /* 抓圖失敗不影響對話 */ }
    } catch { /* 知識庫讀取失敗不影響對話 */ }

    // 圖庫也是知識來源：問題命中關鍵字時，把該列的「名稱＋說明」一起給 AI，
    // 這樣像「防火標章是什麼」這種問題，AI 能用你寫的說明回答（再配上你指定的圖）
    const imageLib = await imageLibPromise
    try {
      const q = retrievalQuery.toLowerCase()
      const hit = imageLib.filter(r => r.caption && r.keywords.some(k => q.includes(k)))
      if (hit.length > 0) {
        const block = hit.slice(0, 6).map(r => `【${r.name}】\n${r.caption}`).join('\n\n')
        knowledge = (knowledge ? knowledge + '\n\n---\n\n' : '')
          + '以下是公司「圖庫」中對應名詞／項目的說明（已附上對應圖片給使用者看，回答時可直接引用這些說明）：\n\n' + block
      }
    } catch { /* 圖庫知識注入失敗不影響對話 */ }

    // 圖庫比對要在「產生回答之前」做完，AI 才知道有哪些素材可用、能把圖插在對應的步驟旁邊。
    // 比對範圍用「問題＋檢索到的知識庫內容」（內容就是答案會取材的地方），
    // 效果接近以前用回答比對，但可以提前拿到清單。
    try {
      if (imageLib.length > 0) {
        // 比對要分兩種份量：命中「使用者問題本身」的最準，命中「檢索到的內容」只能當輔助。
        // 早期兩者混在一起比對，結果問「防火標章」也附上鎖孔的圖——因為知識庫內容裡
        // 到處都有「位置」「方向」這種通用關鍵字。改成計分後只取前段。
        const q = retrievalQuery.toLowerCase()
        const kbText = knowledge.toLowerCase()
        const scored = imageLib
          .map(row => {
            const qHits = row.keywords.filter(k => q.includes(k)).length
            const kHits = row.keywords.filter(k => kbText.includes(k)).length
            // 檢索到的內容很長，單獨命中一個通用字幾乎一定是巧合
            // （防火標章那列只因為丈量 SOP 提到「防火門」就跟著跑出來）。
            // 要兩個以上不同關鍵字都出現，才算這一列真的跟內容有關。
            return { row, score: qHits * 5 + (kHits >= 2 ? kHits : 0) }
          })
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score)
        // 只留跟第一名同一個量級的（四成以上）。問單一名詞時就只會有那一張；
        // 問整份 SOP 時，該 SOP 的圖分數都相近，會一起留下來插在各步驟旁邊。
        const cut = scored.length ? scored[0].score * 0.4 : 0
        const keep = scored.filter(x => x.score >= cut).slice(0, 8)
        // 有些列的影片是放在「頁面內文」而不是「圖片／檔案」欄位——資料庫的檔案欄位無法用
        // API 寫入，內文可以。只對「有命中、而且欄位是空的」那幾列即時去讀內文，
        // 才不會每次對話都把整個圖庫的頁面掃一遍。
        const bodyMedia = await Promise.all(
          keep.map(x => x.row.images.length > 0 ? Promise.resolve([]) : getPageMedia(x.row.id, 4).catch(() => []))
        )
        const libImages: ImageResult[] = []
        keep.forEach(({ row }, ri) => {
          for (const im of (row.images.length > 0 ? row.images : bodyMedia[ri])) {
            libImages.push({ source: row.name, url: im.url, caption: im.caption || row.caption || row.name, kind: im.kind })
          }
        })
        // 圖庫有命中就「只用」圖庫：那是你親手指定的素材，一定對得上。
        // 另一批是從被引用的知識庫頁面自動掃出來的，常常掃到不相干的影片
        // （問鎖孔卻附上拍攝技巧的片段），有精準來源時就不該再混進來。
        const merged = libImages.length > 0 ? libImages : imageResults
        const seen = new Set<string>()
        const dedup = merged.filter(im => { const k = im.url.split('?')[0]; if (seen.has(k)) return false; seen.add(k); return true })
        imageResults.length = 0
        imageResults.push(...dedup.slice(0, 6))
      }
    } catch { /* 圖庫比對失敗不影響對話 */ }

    const reply = await chatWithAssistant(messages, knowledge, imageResults)

    // 回答本身就說「知識庫查不到」時，就不要再附自動抓來的圖片／影片——
    // 那些是從被引用頁面掃出來的，跟問題無關，只會讓人以為那支影片有答案。
    if (/查不到|找不到|無法確定|沒有找到|不在.{0,6}知識庫/.test(reply)) {
      imageResults.length = 0
    }

    // 產生「後續追問」建議按鈕（失敗不影響回覆）
    let suggestions: string[] = []
    try { suggestions = await suggestFollowups(lastUser, reply) } catch {}
    return NextResponse.json({ reply, files: fileResults, images: imageResults, suggestions })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
