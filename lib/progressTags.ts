// 進度紀錄的自動辨識：從描述文字判斷「這是哪一類工作」「講的是哪一棟」。
//
// 刻意做成純函式、在畫面上當場算，不寫回 Notion，也不另外開欄位。理由：
//   ・現場的人照舊用原本的方式打字，不必多填任何東西；
//   ・在 Notion 直接改一筆，App 一重整標籤就跟著變，不會有「標籤跟內文對不上」的情況；
//   ・規則寫錯了改這個檔就好，不用回頭去修幾百筆資料。
// 代價是每次 render 都要跑一遍——一個案場最多一兩百筆字串比對，可以忽略。

export type ProgressCat = '施工' | '噴印' | '加工' | '量測' | '打樣' | '進料' | '溝通' | '其他'

// 由具體到籠統，先命中的先算。順序會影響結果，改的時候注意：
// 例如「雷切」排在「樣品」前面，所以「樣品層的鋁板已經給銘剛雷切」算加工不算打樣。
const RULES: { cat: ProgressCat; re: RegExp }[] = [
  { cat: '噴印', re: /噴印|四色|面漆|前處理|過白|烤漆|印刷/ },
  { cat: '加工', re: /裁切|雷切|裁版|開孔|沖孔|折板|加工|做好|做完/ },
  { cat: '施工', re: /施工|施作|安裝|裝上|完工|完畢|組合|自組|上工/ },
  { cat: '量測', re: /量測|丈量|場勘|尺寸|尺吋|覆查|複查|對縫/ },
  { cat: '打樣', re: /打樣|取樣|樣品|樣板|樣版|對色|確認樣|簽名樣|接圖|分色|顏色確認/ },
  // 「載」單獨放行：現場講「來載」「讓載」「去載」都是叫車來搬貨。
  // 排在加工後面，所以「載去裁切」那種會先算成加工，不會搶走。
  { cat: '進料', re: /進廠|進場|進到|鋁料|材料|派車|載|送到|回工廠|出貨|交貨/ },
  { cat: '溝通', re: /開會|討論|主任|設計師|副理|經理|回覆|通知/ },
]

export function catOf(desc: string): ProgressCat {
  for (const r of RULES) if (r.re.test(desc)) return r.cat
  return '其他'
}

// 抓得到 A棟、a棟、A+B棟、AB棟、C、D棟、cd棟 這些寫法。
// 「量測 4 棟」不會被誤判，因為棟前面必須是 A-D 的字母。
const BLDG_RE = /([A-Da-d](?:\s*[+＋、,，/／和跟與]?\s*[A-Da-d])*)\s*棟/g

export function buildingsOf(desc: string): string[] {
  const found = new Set<string>()
  let m: RegExpExecArray | null
  BLDG_RE.lastIndex = 0
  while ((m = BLDG_RE.exec(desc)) !== null) {
    for (const ch of m[1].toUpperCase()) if (ch >= 'A' && ch <= 'D') found.add(ch)
  }
  return Array.from(found).sort()
}

// 日期寫法很雜：2026/01/07、2026/3/20、2026-08-04 都有。
// 統一拆成數字，排序和分組都用這個，畫面上再自己組成想要的樣子。
export function parseDate(s: string): { y: number; m: number; d: number } | null {
  const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null
}

const pad = (n: number) => String(n).padStart(2, '0')

// 月份標題用的鍵：2026-09。認不出日期的丟到最後一組。
export function monthKey(s: string): string {
  const p = parseDate(s)
  return p ? `${p.y}-${pad(p.m)}` : ''
}

export function monthLabel(key: string): string {
  if (!key) return '日期不明'
  const [y, m] = key.split('-')
  return `${y} 年 ${+m} 月`
}

// 年份已經在月份標題上了，每一列再重複一次只是雜訊，所以只留月/日
export function shortDate(s: string): string {
  const p = parseDate(s)
  return p ? `${pad(p.m)}/${pad(p.d)}` : (s || '—')
}

export function sortKey(s: string): number {
  const p = parseDate(s)
  return p ? p.y * 10000 + p.m * 100 + p.d : 0
}
