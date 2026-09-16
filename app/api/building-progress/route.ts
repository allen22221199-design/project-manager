import { NextRequest, NextResponse } from 'next/server'
import {
  getBuildingProgress, addBuilding, updateBuilding, deleteBuilding, BUILD_STEPS,
} from '@/lib/notion'

// 施工進度：一個案場底下每一棟各一列，五道工序完成就打勾。
export const maxDuration = 60

// GET ?site=<案場名稱>；不帶 site 就回全部（AI 助理要用）
export async function GET(req: NextRequest) {
  try {
    const site = req.nextUrl.searchParams.get('site') || undefined
    return NextResponse.json({ rows: await getBuildingProgress(site), steps: BUILD_STEPS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST 新增一棟
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const site = String(b.site ?? '').trim()
    const building = String(b.building ?? '').trim()
    if (!site || !building) return NextResponse.json({ error: '缺少案場或棟別' }, { status: 400 })

    // 同一個案場不要有兩個同名的棟，不然打勾會不知道打到哪一列
    const exists = (await getBuildingProgress(site)).some(r => r.building === building)
    if (exists) return NextResponse.json({ error: `${building} 已經在清單裡了` }, { status: 409 })

    return NextResponse.json({ ok: true, ...(await addBuilding(site, building)) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 日期欄位：空字串＝清掉，格式不對就當作沒送（不要把壞資料寫進 Notion）
function asDate(v: any): string | undefined {
  if (v === undefined) return undefined
  const s = String(v).trim()
  if (!s) return ''
  return DATE_RE.test(s) ? s : undefined
}

// PATCH 打勾／取消打勾、改備註、改棟別名稱、填箱體數量與日期
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json()
    const id = String(b.id ?? '')
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    if (b.step !== undefined && BUILD_STEPS.indexOf(b.step) < 0) {
      return NextResponse.json({ error: '不認得這個工序' }, { status: 400 })
    }
    // 數量：空字串／null 代表清掉；負數和非數字擋掉
    let boxQty: number | null | undefined
    if (b.boxQty !== undefined) {
      if (b.boxQty === null || String(b.boxQty).trim() === '') boxQty = null
      else {
        const n = Number(b.boxQty)
        if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: '箱體數量要填數字' }, { status: 400 })
        boxQty = Math.round(n)
      }
    }
    await updateBuilding(id, {
      step: b.step,
      done: b.done,
      today: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),   // 台北時區的今天
      note: b.note === undefined ? undefined : String(b.note),
      building: b.building === undefined ? undefined : String(b.building).trim(),
      boxQty,
      boxArrive: asDate(b.boxArrive),
      boxProduce: asDate(b.boxProduce),
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE ?id=<pageId>
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    await deleteBuilding(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
