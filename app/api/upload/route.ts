import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json({ error: '尚未設定 BLOB_READ_WRITE_TOKEN' }, { status: 503 })
  }
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '未收到檔案' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const filename = `task-attachments/${Date.now()}-${file.name}`

    const res = await fetch(`https://blob.vercel-storage.com/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-version': '7',
        'content-type': file.type || 'application/octet-stream',
      },
      body: arrayBuffer,
    })

    if (!res.ok) {
      const msg = await res.text()
      return NextResponse.json({ error: msg }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ url: data.url, name: file.name })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
