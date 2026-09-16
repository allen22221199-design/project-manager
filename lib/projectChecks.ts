// 案件資料完整度的判斷規則。前端要即時標記、後端掃描也要用同一套，
// 所以放在共用的檔案，不要各寫一份——兩邊標準不一樣會很難解釋。

// 聯絡人欄位裡要有電話。半形、全形數字都算。
// 只有名字（「吳所長」「陳設計師」）不算填完整——真的要聯絡的時候找不到人。
export function hasPhone(contact: string): boolean {
  const digits = (contact.match(/[0-9０-９]/g) ?? []).length
  return digits >= 7   // 分機、樓層那種一兩位數字不算電話
}

export type MissingKind = '聯絡人' | '電話' | '品項'

export function missingOf(p: { contact?: string }, itemCount?: number): MissingKind[] {
  const out: MissingKind[] = []
  const contact = (p.contact ?? '').trim()
  if (!contact) out.push('聯絡人')
  else if (!hasPhone(contact)) out.push('電話')
  // itemCount 是 undefined 代表還沒掃到，不能當成「沒有品項」
  if (itemCount === 0) out.push('品項')
  return out
}
