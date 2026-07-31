import { NextResponse } from 'next/server'
import { getKnowledgeQueue, readPagePlainText, saveKnowledgeResult } from '@/lib/notion'
import { extractTextFromMedia, extractTextFromVideo, extractTextFromYouTube } from '@/lib/gemini'
import { extractOfficeText, OFFICE_EXTS } from '@/lib/officetext'

export const maxDuration = 60

function extOf(name: string) {
  return (name.split('?')[0].split('.').pop() || '').toLowerCase()
}

// 單一項目處理上限，避免某個大檔/卡住的請求拖垮整個函式（逾時回 HTML）
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('處理逾時（檔案過大或來源無回應）')), ms)),
  ])
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
    const started = Date.now()
    const results: any[] = []
    for (const item of queue) {
      // 時間預算：12 秒後不再開始新項目，加上單項最多 45 秒 < 函式 60 秒上限（剩下的下批再處理）
      if (Date.now() - started > 12000) break
      try {
        // 自動判斷：有附檔→辨識檔案/圖片；有連結→抓網頁；都沒有→讀頁面內文
        const text = (await withTimeout((async (): Promise<string> => {
          if (item.files.length > 0) {
            const f = item.files[0]
            if (!f?.url) throw new Error('沒有附加檔案（請在「檔案」欄位上傳）')
            const ext = extOf(f.name || f.url)
            const imageMimes: Record<string, string> = {
              jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
              webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
            }
            // Gemini 可直接理解的影片格式
            const videoMimes: Record<string, string> = {
              mp4: 'video/mp4', mov: 'video/mov', webm: 'video/webm', avi: 'video/avi',
              mpeg: 'video/mpeg', mpg: 'video/mpeg', wmv: 'video/wmv', flv: 'video/x-flv', '3gp': 'video/3gpp',
            }
            // 舊版 Office（.doc/.xls/.ppt）是二進位格式，無法解析
            if (['doc', 'xls', 'ppt'].includes(ext)) {
              throw new Error(`舊版 Office 檔（.${ext}）無法讀取。請用 Word/Excel 開啟後另存為 .${ext}x（例如 .docx）或 PDF 再上傳`)
            }
            const { data, mime } = await fetchAsBase64(f.url)
            // Word / Excel / PowerPoint：直接解壓讀出文字，不必先轉 PDF、也不必經過 AI
            if (OFFICE_EXTS.includes(ext)) {
              return extractOfficeText(Buffer.from(data, 'base64'), ext)
            }
            // 純文字類：直接讀，不必經過 AI
            if (['txt', 'csv', 'md', 'markdown', 'json', 'log', 'tsv'].includes(ext)) {
              return Buffer.from(data, 'base64').toString('utf8')
            }
            // Gemini 內嵌檔案上限約 20MB（base64 長度 × 0.75 ≈ 原始位元組）
            const sizeMB = (data.length * 0.75) / (1024 * 1024)
            // 影片：直接讓 AI 看影片內容整理成文字（不必先上傳 YouTube）
            if (videoMimes[ext]) {
              if (sizeMB > 18) {
                throw new Error(`影片過大（約 ${sizeMB.toFixed(1)}MB，直接上傳上限約 18MB）。請壓縮或剪短後再上傳；長片建議上傳到 YouTube（可設非公開）後，把網址貼在「連結」欄`)
              }
              return await extractTextFromVideo(data, videoMimes[ext])
            }
            if (['mkv', 'm4v'].includes(ext)) {
              throw new Error(`此影片格式（.${ext}）不支援。請轉存為 MP4 再上傳，或上傳到 YouTube 後把網址貼在「連結」欄`)
            }
            if (sizeMB > 18) {
              throw new Error(`檔案過大（約 ${sizeMB.toFixed(1)}MB，上限約 20MB）。請壓縮、降低解析度或拆分後再上傳`)
            }
            // 依副檔名精準判斷類型；副檔名不明時才退回下載到的 content-type
            let finalMime = ''
            if (ext === 'pdf') finalMime = 'application/pdf'
            else if (imageMimes[ext]) finalMime = imageMimes[ext]
            else if (mime.startsWith('image/') || mime === 'application/pdf') finalMime = mime
            else throw new Error(`不支援的檔案格式（${ext || mime}）。可用：Word、Excel、PPT、PDF、圖片、影片`)
            return await extractTextFromMedia(data, finalMime)
          } else if (item.url) {
            if (/youtube\.com|youtu\.be/i.test(item.url)) {
              return await extractTextFromYouTube(item.url)
            }
            return await fetchWebText(item.url)
          } else {
            return await readPagePlainText(item.id)
          }
        })(), 45000)).trim()
        if (!text) throw new Error('未取得內容（請確認有上傳檔案、填連結，或在頁面內文輸入文字）')
        await saveKnowledgeResult(item.id, true, text, '處理成功')
        results.push({ title: item.title, ok: true })
      } catch (e: any) {
        try { await saveKnowledgeResult(item.id, false, '', e.message ?? '處理失敗') } catch {}
        results.push({ title: item.title, ok: false, error: e.message })
      }
    }
    const okCount = results.filter(r => r.ok).length
    const remaining = queue.length - results.length
    return NextResponse.json({ ok: true, processed: results.length, success: okCount, remaining, more: remaining > 0, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
