import { NextResponse } from 'next/server'
import { getKnowledgeQueue, readPagePlainText, saveKnowledgeResult } from '@/lib/notion'
import { extractTextFromMedia, extractTextFromVideo, extractTextFromAudio, extractTextFromYouTube } from '@/lib/gemini'
import { extractOfficeText, OFFICE_EXTS } from '@/lib/officetext'

export const maxDuration = 300   // 大型 PDF／影片辨識很慢，需要比預設 60 秒更長

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

// 下載檔案並轉 base64。務必「先看大小再下載」——過大的檔案若整個讀進記憶體，
// 函式會直接被系統砍掉(記憶體不足)，變成沒有錯誤訊息的 500，該筆也永遠卡在佇列裡。
async function fetchAsBase64(url: string, maxBytes: number): Promise<{ data: string; mime: string }> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`下載檔案失敗 (${r.status})`)
  const mime = r.headers.get('content-type') || 'application/octet-stream'
  const declared = Number(r.headers.get('content-length') || 0)
  const overLimit = (bytes: number) =>
    new Error(`檔案過大（約 ${(bytes / 1048576).toFixed(1)}MB，上限約 ${Math.round(maxBytes / 1048576)}MB）。請壓縮、剪短或分批後再上傳`)
  if (declared > maxBytes) {
    try { await r.body?.cancel() } catch { /* 取消下載失敗就算了 */ }
    throw overLimit(declared)
  }
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.byteLength > maxBytes) throw overLimit(buf.byteLength)   // 沒有 content-length 時的第二道防線
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

const IMAGE_MIMES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
}
// Gemini 可直接理解的影片格式
const VIDEO_MIMES: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/mov', webm: 'video/webm', avi: 'video/avi',
  mpeg: 'video/mpeg', mpg: 'video/mpeg', wmv: 'video/wmv', flv: 'video/x-flv', '3gp': 'video/3gpp',
}
// Gemini 可直接聆聽的音訊格式（會議錄音、口述 SOP）
const AUDIO_MIMES: Record<string, string> = {
  mp3: 'audio/mp3', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', ogg: 'audio/ogg', aiff: 'audio/aiff',
}

// 讀取單一附件的文字內容（依副檔名決定用哪種方式）
async function readOneFile(f: { name: string; url: string }): Promise<string> {
  if (!f?.url) throw new Error('沒有附加檔案（請在「檔案」欄位上傳）')
  const ext = extOf(f.name || f.url)
  // 舊版 Office（.doc/.xls/.ppt）是二進位格式，無法解析
  if (['doc', 'xls', 'ppt'].includes(ext)) {
    throw new Error(`舊版 Office 檔（.${ext}）無法讀取。請用 Word/Excel 開啟後另存為 .${ext}x（例如 .docx）或 PDF 再上傳`)
  }
  const isOffice = OFFICE_EXTS.includes(ext)
  const isText = ['txt', 'csv', 'md', 'markdown', 'json', 'log', 'tsv'].includes(ext)
  // 依類型決定可下載的上限：送 AI 的檔案本來就有約 20MB 限制，Office 只需讀內部 XML 可放寬些
  const maxBytes = isOffice ? 30 * 1048576 : isText ? 10 * 1048576 : 20 * 1048576
  const { data, mime } = await fetchAsBase64(f.url, maxBytes)
  // Word / Excel / PowerPoint：直接解壓讀出文字，不必先轉 PDF、也不必經過 AI
  if (isOffice) {
    return extractOfficeText(Buffer.from(data, 'base64'), ext)
  }
  // 純文字類：直接讀，不必經過 AI
  if (isText) {
    return Buffer.from(data, 'base64').toString('utf8')
  }
  // Gemini 內嵌檔案上限約 20MB（base64 長度 × 0.75 ≈ 原始位元組）
  const sizeMB = (data.length * 0.75) / (1024 * 1024)
  // 影片：直接讓 AI 看影片內容整理成文字（不必先上傳 YouTube）
  if (VIDEO_MIMES[ext]) {
    if (sizeMB > 18) {
      throw new Error(`影片過大（約 ${sizeMB.toFixed(1)}MB，直接上傳上限約 18MB）。請壓縮或剪短後再上傳；長片建議上傳到 YouTube（可設非公開）後，把網址貼在「連結」欄`)
    }
    return await extractTextFromVideo(data, VIDEO_MIMES[ext])
  }
  // 錄音檔：直接讓 AI 聽完整理成文字
  if (AUDIO_MIMES[ext]) {
    if (sizeMB > 18) {
      throw new Error(`錄音檔過大（約 ${sizeMB.toFixed(1)}MB，上限約 18MB）。請壓縮或分段後再上傳`)
    }
    return await extractTextFromAudio(data, AUDIO_MIMES[ext])
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
  else if (IMAGE_MIMES[ext]) finalMime = IMAGE_MIMES[ext]
  else if (mime.startsWith('image/') || mime === 'application/pdf') finalMime = mime
  else throw new Error(`不支援的檔案格式（${ext || mime}）。可用：Word、Excel、PPT、PDF、圖片、影片`)
  return await extractTextFromMedia(data, finalMime)
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
      // 時間預算：50 秒後不再開始新項目，加上單項最多 240 秒 < 函式 300 秒上限（剩下的下批再處理）
      if (Date.now() - started > 50000) break
      try {
        // 自動判斷：有附檔→辨識檔案/圖片；有連結→抓網頁；都沒有→讀頁面內文
        const text = (await withTimeout((async (): Promise<string> => {
          if (item.files.length > 0) {
            // 一筆可能附多個檔案（例如影片切成多段、多份 PDF）→ 依序全部讀取後合併，
            // 不再只讀第一個。時間快用完就先停，剩下的下次同步再補。
            const MAX_FILES = 6
            // 留足餘裕給「最後一個開始的檔案」跑完，否則外層逾時會把已讀到的內容一起丟掉
            const fileDeadline = Date.now() + 170000
            const parts: string[] = []
            const errs: string[] = []
            const picked = item.files.slice(0, MAX_FILES)
            for (const file of picked) {
              if (Date.now() > fileDeadline) { errs.push('（時間不足，其餘檔案下次同步再處理）'); break }
              try {
                const one = (await readOneFile(file)).trim()
                if (one) parts.push(picked.length > 1 ? `【${file.name || '附件'}】\n${one}` : one)
              } catch (e: any) {
                errs.push(`${file.name || '附件'}：${e?.message ?? '讀取失敗'}`)
              }
            }
            if (item.files.length > MAX_FILES) errs.push(`（僅處理前 ${MAX_FILES} 個檔案）`)
            if (parts.length === 0) throw new Error(errs.join('；') || '未取得內容')
            return parts.join('\n\n---\n\n')
          } else if (item.url) {
            if (/youtube\.com|youtu\.be/i.test(item.url)) {
              return await extractTextFromYouTube(item.url)
            }
            return await fetchWebText(item.url)
          } else {
            return await readPagePlainText(item.id)
          }
        })(), 240000)).trim()
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
