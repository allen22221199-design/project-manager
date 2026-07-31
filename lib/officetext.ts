// 直接讀取 Office 檔（Word / Excel / PowerPoint）的文字，不需要任何額外套件。
// 原理：.docx/.xlsx/.pptx 本質上就是 ZIP 壓縮檔，裡面放的是 XML；
// 用 Node 內建的 zlib 解壓後，把 XML 轉成純文字即可。
// （所以使用者可以直接上傳 Word，不必先另存成 PDF）
import { inflateRawSync } from 'zlib'

type ZipEntry = { name: string; method: number; compSize: number; localOffset: number }

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

// ZIP 的目錄放在檔案結尾，從尾端往前找
function findEOCD(buf: Buffer): number {
  const maxScan = Math.min(buf.length, 0xffff + 22)
  for (let i = buf.length - 22; i >= buf.length - maxScan && i >= 0; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i
  }
  return -1
}

function readEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEOCD(buf)
  if (eocd < 0) throw new Error('檔案格式不正確（不是有效的 Office 檔）')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out: ZipEntry[] = []
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const cmtLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    out.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), method, compSize, localOffset })
    p += 46 + nameLen + extraLen + cmtLen
  }
  return out
}

function readEntry(buf: Buffer, e: ZipEntry): string {
  const p = e.localOffset
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== SIG_LOCAL) throw new Error('壓縮內容損毀')
  const nameLen = buf.readUInt16LE(p + 26)
  const extraLen = buf.readUInt16LE(p + 28)
  const start = p + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + e.compSize)
  if (e.method === 0) return data.toString('utf8')          // 未壓縮
  if (e.method === 8) return inflateRawSync(data).toString('utf8')  // deflate
  throw new Error(`不支援的壓縮方式 (${e.method})`)
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')   // 最後才還原 &，避免二次解析
}

function tidy(s: string): string {
  return s.replace(/\r/g, '')
    .split('\n').map(l => l.replace(/[ \t]+$/g, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Word：段落 → 換行；表格儲存格 → 用 | 分隔，保留表格的可讀性
function docxToText(xml: string): string {
  let s = xml
  s = s.replace(/<w:tab[^>]*\/?>/g, '\t')
  s = s.replace(/<w:br[^>]*\/?>/g, '\n')
  // 表格：先吃掉儲存格內最後一個段落結尾，否則每格都會多一個換行，變成「項目\n | 規格」
  s = s.replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>')
  s = s.replace(/<\/w:tc>\s*<\/w:tr>/g, '</w:tr>')  // 每列最後一格不留分隔符
  s = s.replace(/<\/w:tc>/g, ' | ')
  s = s.replace(/<\/w:tr>/g, '\n')
  s = s.replace(/<\/w:p>/g, '\n')
  s = s.replace(/<[^>]+>/g, '')
  return tidy(decodeEntities(s))
}

// PowerPoint：每個文字框 <a:t> 一段
function pptxSlideToText(xml: string): string {
  const parts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map(m => decodeEntities(m[1]))
  return tidy(parts.join('\n'))
}

// Excel：先讀共用字串表，再依欄位還原每一列（t="s" 代表值是字串表的索引）
function xlsxSheetToText(sheetXml: string, shared: string[]): string {
  const rows: string[] = []
  for (const rowM of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cM of rowM[1].matchAll(/<c[^>]*?(?:\s+t="([^"]*)")?[^>]*>([\s\S]*?)<\/c>/g)) {
      const type = cM[1] || ''
      const inner = cM[2] || ''
      let val = ''
      if (type === 'inlineStr') {
        val = Array.from(inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map(m => m[1]).join('')
      } else {
        const v = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/)
        val = v ? v[1] : ''
        if (type === 's') val = shared[Number(val)] ?? ''
      }
      cells.push(decodeEntities(val).trim())
    }
    if (cells.some(Boolean)) rows.push(cells.join(' | '))
  }
  return tidy(rows.join('\n'))
}

export const OFFICE_EXTS = ['docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm']

// 從 Office 檔的位元組取出純文字。丟出的錯誤訊息是給使用者看的中文說明。
export function extractOfficeText(buf: Buffer, ext: string): string {
  const entries = readEntries(buf)
  const get = (name: string) => entries.find(e => e.name === name)
  const e = ext.toLowerCase()

  if (e === 'docx' || e === 'docm') {
    const doc = get('word/document.xml')
    if (!doc) throw new Error('Word 檔內容讀取失敗（找不到內文）')
    let text = docxToText(readEntry(buf, doc))
    // 附註／頁首頁尾等補充內容一併帶入
    for (const extra of entries.filter(x => /^word\/(footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(x.name))) {
      try {
        const t = docxToText(readEntry(buf, extra))
        if (t) text += '\n' + t
      } catch { /* 單一區塊讀不到就略過 */ }
    }
    return tidy(text)
  }

  if (e === 'pptx' || e === 'pptm') {
    const slides = entries
      .filter(x => /^ppt\/slides\/slide\d+\.xml$/.test(x.name))
      .sort((a, b) => (Number(a.name.match(/(\d+)/)![1]) - Number(b.name.match(/(\d+)/)![1])))
    if (slides.length === 0) throw new Error('PowerPoint 檔內容讀取失敗（找不到投影片）')
    return tidy(slides.map((s, i) => {
      try { return `【第 ${i + 1} 張投影片】\n` + pptxSlideToText(readEntry(buf, s)) } catch { return '' }
    }).filter(Boolean).join('\n\n'))
  }

  if (e === 'xlsx' || e === 'xlsm') {
    let shared: string[] = []
    const ss = get('xl/sharedStrings.xml')
    if (ss) {
      const xml = readEntry(buf, ss)
      shared = Array.from(xml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map(m =>
        Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map(t => t[1]).join(''))
    }
    const sheets = entries
      .filter(x => /^xl\/worksheets\/sheet\d+\.xml$/.test(x.name))
      .sort((a, b) => (Number(a.name.match(/(\d+)/)![1]) - Number(b.name.match(/(\d+)/)![1])))
    if (sheets.length === 0) throw new Error('Excel 檔內容讀取失敗（找不到工作表）')
    return tidy(sheets.map((s, i) => {
      try { return `【工作表 ${i + 1}】\n` + xlsxSheetToText(readEntry(buf, s), shared) } catch { return '' }
    }).filter(Boolean).join('\n\n'))
  }

  throw new Error(`不支援的 Office 格式（${ext}）`)
}
