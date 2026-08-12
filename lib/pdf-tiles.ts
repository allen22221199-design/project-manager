// 心智圖 PDF → 一疊「看得清楚」的 JPEG 切片。整段都在瀏覽器裡做完，伺服器不碰原始檔。
//
// 為什麼需要這一層（實測 20260504.pdf，XMind 匯出的待辦心智圖）：
//   ・一頁 9.4MB，整張都是向量線條，沒有文字圖層也沒有內嵌圖片。
//   ・Vercel 的請求上限實測約 4MB，原檔根本送不進去。
//   ・就算送得進去也讀不出來：整張圖被壓在一張 A4 橫式裡，真正有畫東西的範圍
//     只有 148x552pt（不到整頁的六分之一），字小到約 1pt，AI 拿到的解析度看不到字。
// 所以改成：先量出「真正有畫東西的那一塊」，只把那一塊放大重畫，再切成幾張大小適中的
// JPEG。實測 9.4MB 的向量圖最後大約 1.4MB、5 張，字清清楚楚。
//
// pdf.js 走 CDN 用 <script> 載入，不進 npm 依賴：這個專案沒辦法在本機跑 build，
// pdf.js 的 worker 設定又是打包器最容易出事的地方，多一個建置風險不划算。

const PDFJS_VERSION = '3.11.174'
const PDFJS_LIB = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`

const TARGET_CONTENT_W = 1900   // 內容區放大後的目標寬度；實測這個寬度下中文字約 14px，AI 讀得很穩
const MIN_SCALE = 1.5
const MAX_SCALE = 22
const MAX_PAGE_PX = 30000000    // 單頁重畫後的總像素上限，太大手機記憶體會撐不住
const TILE_W = 2000
const TILE_H = 1700
const TILE_OVERLAP = 200        // 相鄰切片重疊一段，避免項目剛好被切斷（重複的由後端去掉）
const MAX_PAGES = 6
const MAX_TILES = 14
const BUDGET_BYTES = 3.2 * 1024 * 1024   // 留一點餘裕給 Vercel 約 4MB 的請求上限

// 一定要用 'print' 這個 intent 畫圖，這裡踩過坑：
// pdf.js 畫圖是分段做的，預設（display）用 requestAnimationFrame 排下一段——而瀏覽器在
// 分頁被切走／App 被切到背景時會把 rAF 停掉，畫到一半就整個卡住不動（實測掛了兩分鐘還在第一張）。
// 'print' 改用 microtask 排程，使用者中途去看別的東西也會照跑完。
// 實測這份 9.4MB 的心智圖：不管放大幾倍，每張都約 300ms，5 張大概兩秒。
const PRINT_INTENT = 'print'

export type TileProgress = (msg: string) => void
// skipped：超過 MAX_PAGES 而沒處理的頁數。呼叫端一定要講出來，
// 不然使用者會以為整份都讀完了，實際上後面幾頁根本沒送。
export type TileResult = { tiles: Blob[]; pages: number; skipped: number; scale: number }

type InkBox = { x: number; y: number; w: number; h: number }
type PagePlan = { page: any; scale: number; ox: number; oy: number; fullW: number; fullH: number; xs: number[]; ys: number[] }

let libPromise: Promise<any> | null = null

function loadPdfJs(): Promise<any> {
  if (libPromise) return libPromise
  libPromise = new Promise((resolve, reject) => {
    const ready = (window as any).pdfjsLib
    if (ready) {
      ready.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      resolve(ready)
      return
    }
    const s = document.createElement('script')
    s.src = PDFJS_LIB
    s.async = true
    s.crossOrigin = 'anonymous'
    s.onload = () => {
      const lib = (window as any).pdfjsLib
      if (!lib) { libPromise = null; reject(new Error('PDF 元件載入失敗，請重新整理再試')); return }
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      resolve(lib)
    }
    s.onerror = () => { libPromise = null; reject(new Error('載不到 PDF 元件，請確認網路連線後再試一次')) }
    document.head.appendChild(s)
  })
  return libPromise
}

function freeCanvas(c: HTMLCanvasElement) { c.width = 0; c.height = 0 }

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('圖片轉檔失敗'))), 'image/jpeg', quality)
  })
}

// 量出這一頁「真正有畫東西」的範圍（回傳 scale=1 的座標）。
// 先用小尺寸描一次、掃非白色像素就夠了，精度差幾點無所謂，外圍還會再補邊。
async function inkBox(page: any): Promise<InkBox | null> {
  const base = page.getViewport({ scale: 1 })
  const probeScale = Math.min(1.4, 1100 / base.width)
  const vp = page.getViewport({ scale: probeScale })
  const c = document.createElement('canvas')
  const w = Math.max(1, Math.ceil(vp.width))
  const h = Math.max(1, Math.ceil(vp.height))
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff', intent: PRINT_INTENT }).promise
  const d = ctx.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y += 2) {
    const row = y * w * 4
    for (let x = 0; x < w; x += 2) {
      const i = row + x * 4
      if (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  freeCanvas(c)
  if (x1 < 0) return null              // 整頁空白
  const pad = 6 * probeScale
  x0 = Math.max(0, x0 - pad)
  y0 = Math.max(0, y0 - pad)
  x1 = Math.min(w, x1 + pad)
  y1 = Math.min(h, y1 + pad)
  return {
    x: x0 / probeScale,
    y: y0 / probeScale,
    w: Math.max(1, (x1 - x0) / probeScale),
    h: Math.max(1, (y1 - y0) / probeScale),
  }
}

// 一條軸上的切片起點；最後一片往回貼齊邊界，不要留一條細細的殘片
function steps(total: number, tile: number): number[] {
  if (total <= tile) return [0]
  const stride = tile - TILE_OVERLAP
  const out: number[] = []
  let s = 0
  while (true) {
    const start = Math.min(s, total - tile)
    if (out.length === 0 || start > out[out.length - 1]) out.push(start)
    if (start + tile >= total) break
    s += stride
  }
  return out
}

function planPage(page: any, box: InkBox, shrink: number): PagePlan {
  let scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, TARGET_CONTENT_W / box.w)) * shrink
  if (box.w * box.h * scale * scale > MAX_PAGE_PX) scale = Math.sqrt(MAX_PAGE_PX / (box.w * box.h))
  const fullW = Math.max(1, Math.round(box.w * scale))
  const fullH = Math.max(1, Math.round(box.h * scale))
  return {
    page, scale,
    ox: box.x * scale, oy: box.y * scale,
    fullW, fullH,
    xs: steps(fullW, TILE_W),
    ys: steps(fullH, TILE_H),
  }
}

// JPEG 重壓：直接把已經編好的圖解回來再壓一次，不用重跑一次 PDF 描繪（那才是慢的部分）
async function recompress(blob: Blob, quality: number): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return blob
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const out = await toJpeg(c, quality)
  freeCanvas(c)
  return out.size < blob.size ? out : blob
}

export async function pdfToTiles(file: File, onProgress: TileProgress): Promise<TileResult> {
  const pdfjsLib = await loadPdfJs()
  onProgress('讀取 PDF…')
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise
  try {
    const pageCount = Math.min(pdf.numPages, MAX_PAGES)
    onProgress('計算清晰度…')
    const pages: { page: any; box: InkBox }[] = []
    for (let p = 1; p <= pageCount; p++) {
      const page = await pdf.getPage(p)
      const box = await inkBox(page)
      if (box) pages.push({ page, box })
      else page.cleanup()
    }
    if (pages.length === 0) throw new Error('這份 PDF 每一頁都是空白的，沒有東西可以讀')

    // 切太多張會超過請求上限、AI 也讀得慢；超過就整體縮小重算（只是算數字，不用重畫）
    let shrink = 1
    let plans: PagePlan[] = []
    for (let attempt = 0; attempt < 4; attempt++) {
      plans = pages.map(p => planPage(p.page, p.box, shrink))
      const n = plans.reduce((s, p) => s + p.xs.length * p.ys.length, 0)
      if (n <= MAX_TILES) break
      shrink *= 0.75
    }
    const totalTiles = plans.reduce((s, p) => s + p.xs.length * p.ys.length, 0)

    const tiles: Blob[] = []
    let done = 0
    for (const plan of plans) {
      const vp = plan.page.getViewport({ scale: plan.scale })
      for (const ty of plan.ys) {
        for (const tx of plan.xs) {
          done++
          onProgress(`轉成圖片… ${done}/${totalTiles}`)
          const tw = Math.min(TILE_W, plan.fullW - tx)
          const th = Math.min(TILE_H, plan.fullH - ty)
          const c = document.createElement('canvas')
          c.width = tw
          c.height = th
          const ctx = c.getContext('2d') as CanvasRenderingContext2D
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, tw, th)
          await plan.page.render({
            canvasContext: ctx,
            viewport: vp,
            background: '#ffffff',
            intent: PRINT_INTENT,
            // 只畫這一塊：把整頁往左上推，畫布外的部分瀏覽器自己會裁掉
            transform: [1, 0, 0, 1, -(plan.ox + tx), -(plan.oy + ty)],
          }).promise
          tiles.push(await toJpeg(c, 0.82))
          freeCanvas(c)
        }
      }
      plan.page.cleanup()
    }

    let bytes = tiles.reduce((s, b) => s + b.size, 0)
    for (const q of [0.68, 0.5]) {
      if (bytes <= BUDGET_BYTES) break
      onProgress('圖片偏大，重新壓縮…')
      for (let i = 0; i < tiles.length; i++) tiles[i] = await recompress(tiles[i], q)
      bytes = tiles.reduce((s, b) => s + b.size, 0)
    }
    if (bytes > BUDGET_BYTES) {
      throw new Error(`這份 PDF 內容太多（壓縮後仍有 ${(bytes / 1024 / 1024).toFixed(1)}MB），請分成兩份再上傳`)
    }

    return {
      tiles,
      pages: pages.length,
      skipped: Math.max(0, pdf.numPages - pageCount),
      scale: plans[0] ? plans[0].scale : 1,
    }
  } finally {
    try { await pdf.destroy() } catch { /* 關檔失敗不影響已經產出的圖 */ }
  }
}
