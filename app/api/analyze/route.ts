import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      error: '圖片辨識功能未啟用（尚未設定 ANTHROPIC_API_KEY）',
      disabled: true,
    }, { status: 503 })
  }
  try {
    const { analyzeProgressImage } = await import('@/lib/claude')
    const { base64, mediaType } = await req.json()
    if (!base64) return NextResponse.json({ error: '缺少圖片' }, { status: 400 })
    const result = await analyzeProgressImage(base64, mediaType ?? 'image/jpeg')
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
