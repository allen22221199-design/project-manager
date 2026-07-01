import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: '尚未設定 BLOB_READ_WRITE_TOKEN' }, { status: 503 })
  }
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '未收到檔案' }, { status: 400 })

    const blob = await put(`task-attachments/${Date.now()}-${file.name}`, file, {
      access: 'public',
    })
    return NextResponse.json({ url: blob.url, name: file.name })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
