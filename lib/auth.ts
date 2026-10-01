import crypto from 'crypto'

// 用來簽章登入 token 的密鑰；優先用 AUTH_SECRET，其次用 ADMIN_PASS 衍生
const SECRET = process.env.AUTH_SECRET || process.env.ADMIN_PASS || 'insecure-dev-secret-change-me'
export const SESSION_COOKIE = 'admin_session'

// 帳號角色。admin＝老闆／管理者，看得到全部；marketing＝行銷人員，
// 只多開「管理」那一頁的對外工具（客服後台、LINE、Meta、官網），
// 碰不到私人行事曆、Google 授權、知識庫重建這些管理者專屬的東西。
export type Role = 'admin' | 'marketing'

type Payload = { exp: number; role?: Role }

// 產生一個有時效的簽章 token（payload.signature）
export function signSession(role: Role = 'admin', hoursValid = 24 * 7): string {
  const exp = Date.now() + hoursValid * 3600 * 1000
  const body: Payload = { exp, role }
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// 讀出 token 的角色。簽章錯或過期都回 null。
// 舊 token 裡沒有 role 欄位（行銷帳號上線前簽的），一律當管理者——
// 那時候只有管理者能登入，這樣既正確又不會把現有的人踢出去重登。
export function readSession(token?: string): { role: Role } | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  try {
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const { exp, role } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Payload
    if (typeof exp !== 'number' || exp <= Date.now()) return null
    return { role: role === 'marketing' ? 'marketing' : 'admin' }
  } catch {
    return null
  }
}

// 這是「是不是管理者」，不是「有沒有登入」。
//
// 不要把它放寬成「只要登入就算數」：全站有 9 支 API 拿它當守門員，
// 包含私人行事曆、Google OAuth、知識庫重建、改承辦人。行銷帳號一旦
// 在這裡回 true，就等於拿到老闆的私人行事曆和 Google 帳號。
// 要判斷「有沒有登入（含行銷）」請改用 readSession()。
export function verifySession(token?: string): boolean {
  return readSession(token)?.role === 'admin'
}
