import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    await req.json()
  } catch {}
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
