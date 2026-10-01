import { NextRequest, NextResponse } from 'next/server'
import { COOKIE, readUser, signUser, type JUser } from './jilugui'

// 紀錄櫃 API 共用的小工具：登入狀態 cookie、統一的錯誤回應。
// 這一組 API 跟 App 其他地方不一樣，「要登入」——紀錄櫃裡有合約、報價，不能像門單那樣對外開著。

export function userOf(req: NextRequest): JUser | null {
  return readUser(req.cookies.get(COOKIE)?.value)
}

export function fail(msg: string, status = 500): NextResponse {
  return NextResponse.json({ error: msg }, { status })
}

// 沒登入就回 401；前端收到 401 會自動跳回登入畫面
export function needUser(req: NextRequest): { user: JUser; res?: undefined } | { user?: undefined; res: NextResponse } {
  const user = userOf(req)
  if (!user) return { res: fail('請先登入', 401) }
  return { user }
}

export function setSession(res: NextResponse, user: JUser) {
  res.cookies.set(COOKIE, signUser(user), { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 30 * 86400 })
}

export function clearSession(res: NextResponse) {
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0 })
}

export function errMsg(e: any): string {
  const msg = String(e?.message ?? e)
  if (/object_not_found|Could not find database|Could not find data source/i.test(msg)) {
    return '找不到 Notion 的紀錄櫃資料庫。請到 Notion 打開「紀錄櫃」頁面，右上角「•••」→「連接」，加上這個 App 用的整合。（' + msg + '）'
  }
  return msg
}
