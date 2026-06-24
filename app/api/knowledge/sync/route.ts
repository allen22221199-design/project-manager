import { NextResponse } from 'next/server'
import { getKnowledgeQueue, readPagePlainText, saveKnowledgeResult } from '@/lib/notion'
import { extractTextFromMedia } from '@/lib/gemini'

export const maxDuration = 60

function extOf(name: string) {
  return (name.split('?')[0].split('.').pop() || '').toLowerCase()
}

async function fetchAsBase64(url: string): Promise<{ data: string; mime: string }> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`下載檔案失敗 (${r.status})`)
  const mime = r.headers.get('content-type') || 'application/octet-stream'
  const buf = Buffer.from(await r.arrayBuffer())
  return { data: buf.toString('base64'), mime }
}

async function fetchWebText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProjectManagerBot/1.0)' } })
  if (!r.ok) throw new Error(`抓取網頁失敗 (${r.status})`)
  let html = await r.text()
  html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  return text.slice(0, 20000)
}

export async function POST() {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: '尚未設定 GEMINI_API_KEY' }, { status: 503 })
  }
  try {
    const queue = await getKnowledgeQueue()
    const results: any[] = []
    for (const item of queue) {
      try {
        let text = ''
        if (item.type === '筆記') {
          text = await readPagePlainText(item.id)
        } else if (item.type === 'YouTube') {
          throw new Error('YouTube 逐字稿目前尚未支援，請改貼文字摘要或一般網頁連結')
        } else if (item.type === '網頁') {
          if (!item.url) throw new Error('缺少「連結」欄位')
          text = await fetchWebText(item.url)
        } else if (item.type === '圖片' || item.type === '檔案') {
          const f = item.files[0]
          if (!f?.url) throw new Error('沒有附加檔案（請在「檔案」欄位上傳）')
          const ext = extOf(f.name || f.url)
          if (['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext)) {
            throw new Error('Office 檔（Word/Excel/PPT）請先另存為 PDF 再上傳，目前最穩定')
          }
          const { data, mime } = await fetchAsBase64(f.url)
          const finalMime = mime.startsWith('image/') || mime === 'application/pdf'
            ? mime
            : (ext === 'pdf' ? 'application/pdf' : 'image/png')
          text = await extractTextFromMedia(data, finalMime)
        } else {
          throw new Error('請先在「類型」欄位選擇：筆記 / 網頁 / 圖片 / 檔案')
        }
        if (!text.trim()) throw new Error('未取得任何文字內容')
        await saveKnowledgeResult(item.id, true, text, '處理成功')
        results.push({ title: item.title, ok: true })
      } catch (e: any) {
        try { await saveKnowledgeResult(item.id, false, '', e.message ?? '處理失敗') } catch {}
        results.push({ title: item.title, ok: false, error: e.message })
      }
    }
    const okCount = results.filter(r => r.ok).length
    return NextResponse.json({ ok: true, processed: results.length, success: okCount, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
