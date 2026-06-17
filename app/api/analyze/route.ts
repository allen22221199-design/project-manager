import { NextRequest, NextResponse } from 'next/server'
import { analyzeProgressImage } from '@/lib/claude'

export async function POST(req: NextRequest) {
  try {
    const { base64, mediaType } = await req.json()
    if (!base64) return NextResponse.json({ error: '缺少圖片' }, { status: 400 })
    const result = await analyzeProgressImage(base64, mediaType ?? 'image/jpeg')
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
