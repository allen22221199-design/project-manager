import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjects, countProjectItems } from '@/lib/notion'

// 掃描所有案件，回報哪些欄位沒填。
//
// 聯絡人在案件屬性上，拿案件清單的時候就有了，不必再問 Notion 一次；
// 品項在頁面內文的表格裡，每個案件要兩到三次呼叫才數得出來。七十幾個案件
// 乘下去就是兩百多次，Notion 每秒只讓過三次左右，所以限制同時只跑四個、
// 撞到 429 就退一步再試，整趟大約一分鐘。前端是背景呼叫，不擋畫面。
export const maxDuration = 300
// 這支一定要每次真的重跑。沒有這一行的話 Next/Vercel 會把它當成靜態內容快取起來
// （實測回來是 X-Vercel-Cache: HIT、Age: 365），於是你在 Notion 補好或刪掉資料，
// 畫面上的「資料不全」還是舊的——整個標記就失去意義了。
export const dynamic = 'force-dynamic'
export const revalidate = 0

const CONCURRENCY = 4

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// Notion 擋流量時回 429（或 conflict 的 409），等一下再試通常就過了
async function countWithRetry(id: string): Promise<number | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await countProjectItems(id)
    } catch (e: any) {
      const code = e?.status ?? e?.code
      if (code !== 429 && code !== 409 && code !== 'rate_limited') return null
      await sleep(800 * (attempt + 1))
    }
  }
  return null
}

export async function GET(_req: NextRequest) {
  try {
    const projects = await getActiveProjects()

    // 數不出來的案件回 null，前端就不會把它標成「缺品項」——
    // 讀取失敗跟真的沒填是兩回事，不能混為一談
    const items: Record<string, number | null> = {}
    for (let i = 0; i < projects.length; i += CONCURRENCY) {
      const batch = projects.slice(i, i + CONCURRENCY)
      const counts = await Promise.all(batch.map(p => countWithRetry(p.id)))
      batch.forEach((p, j) => { items[p.id] = counts[j] })
    }

    const failed = Object.values(items).filter(v => v === null).length
    return NextResponse.json({ items, scanned: projects.length, failed })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
