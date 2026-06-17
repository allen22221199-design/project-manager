import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const hasGemini = !!process.env.GEMINI_API_KEY
  const hasClaude = !!process.env.ANTHROPIC_API_KEY
  if (!hasGemini && !hasClaude) {
    return NextResponse.json({
      error: '圖片辨識功能未啟用（尚未設定 GEMINI_API_KEY）',
      disabled: true,
    }, { status: 503 })
  }
  try {
    const { base64, mediaType, type } = await req.json()
    if (!base64) return NextResponse.json({ error: '缺少圖片' }, { status: 400 })

    if (hasGemini) {
      if (type === 'item') {
        const { analyzeItemImage } = await import('@/lib/gemini')
        const result = await analyzeItemImage(base64, mediaType ?? 'image/jpeg')
        return NextResponse.json(result)
      } else {
        const { analyzeProgressImage } = await import('@/lib/gemini')
        const result = await analyzeProgressImage(base64, mediaType ?? 'image/jpeg')
        return NextResponse.json(result)
      }
    } else {
      if (type === 'item') {
        const { analyzeItemImage } = await import('@/lib/claude')
        const result = await analyzeItemImage(base64, mediaType ?? 'image/jpeg')
        return NextResponse.json(result)
      } else {
        const { analyzeProgressImage } = await import('@/lib/claude')
        const result = await analyzeProgressImage(base64, mediaType ?? 'image/jpeg')
        return NextResponse.json(result)
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
