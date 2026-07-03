import crypto from 'crypto'

// 用來簽章登入 token 的密鑰；優先用 AUTH_SECRET，其次用 ADMIN_PASS 衍生
const SECRET = process.env.AUTH_SECRET || process.env.ADMIN_PASS || 'insecure-dev-secret-change-me'
export const SESSION_COOKIE = 'admin_session'

// 產生一個有時效的簽章 token（payload.signature）
export function signSession(hoursValid = 24 * 7): string {
  const exp = Date.now() + hoursValid * 3600 * 1000
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// 驗證 token 是否有效且未過期
export function verifySession(token?: string): boolean {
  if (!token) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  try {
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof exp === 'number' && exp > Date.now()
  } catch {
    return false
  }
}
