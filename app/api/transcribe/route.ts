import { NextRequest, NextResponse } from 'next/server'
import { transcribeSpeech } from '@/lib/gemini'

export const maxDuration = 120

// 聊天室的「按住講話」語音輸入：收下錄音、交給 AI 轉成文字，回傳給前端填進輸入框。
// 不直接送出，讓使用者自己看過、必要時改字再送（案場名稱聽錯會記到別的案子）。
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const form = await req.formData()
    const file = form.get('audio') as File | null
    if (!file) return NextResponse.json({ error: '沒有收到錄音' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const sizeMB = buf.byteLength / (1024 * 1024)
    if (sizeMB > 18) {
      return NextResponse.json({ error: `錄音太長（約 ${sizeMB.toFixed(1)}MB），請分段錄` }, { status: 413 })
    }
    if (buf.byteLength < 1200) {
      return NextResponse.json({ error: '沒有錄到聲音，請再按一次並靠近手機講話' }, { status: 400 })
    }

    // 前端會把「目前進行中的案場名稱＋工序＋人名」一起送來，用來修正同音錯字
    let terms: string[] = []
    try {
      const raw = form.get('terms')
      if (typeof raw === 'string' && raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) terms = parsed.map(String).filter(Boolean)
      }
    } catch { /* 沒帶或格式錯就當沒有，仍可轉文字 */ }

    const base64 = buf.toString('base64')
    // 手機錄下來的格式各家不同：Android/Chrome 多為 webm(opus)、iPhone 多為 mp4(aac)。
    // Gemini 對 webm 走影片管道比較穩，所以先用原始格式，失敗再退回 video/webm 重試一次。
    const raw = (file.type || '').split(';')[0].toLowerCase()
    const primary = raw || 'audio/webm'
    try {
      return NextResponse.json({ text: await transcribeSpeech(base64, primary, terms) })
    } catch (e: any) {
      const fallback = primary.includes('webm') ? 'video/webm'
        : primary.includes('mp4') || primary.includes('m4a') ? 'video/mp4'
        : 'audio/mp3'
      if (fallback === primary) throw e
      return NextResponse.json({ text: await transcribeSpeech(base64, fallback, terms) })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '轉文字失敗' }, { status: 500 })
  }
}
