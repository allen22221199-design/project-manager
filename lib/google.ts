// Google Calendar OAuth + API 封裝（私人行事曆雙向同步用）
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export const GCAL_COOKIE = 'gcal_refresh'

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function buildAuthUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: `${origin}/api/google/callback`,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

// 用授權碼換 token（含 refresh_token）
export async function exchangeCode(code: string, origin: string) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || '交換 token 失敗')
  return data as { access_token: string; refresh_token?: string; expires_in: number }
}

// 用 refresh_token 換新的 access_token
export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || '刷新 token 失敗')
  return data.access_token as string
}

type GEvent = { id: string; title: string; date: string; note?: string }

// 列出某區間的事件（timeMin/timeMax 為 ISO 日期）
export async function listEvents(accessToken: string, timeMin: string, timeMax: string): Promise<GEvent[]> {
  const params = new URLSearchParams({
    timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
  })
  const res = await fetch(`${CAL_BASE}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || '讀取事件失敗')
  return (data.items ?? []).map((e: any) => ({
    id: e.id,
    title: e.summary ?? '(無標題)',
    date: e.start?.date ?? (e.start?.dateTime ? e.start.dateTime.slice(0, 10) : ''),
    note: e.description ?? '',
  }))
}

// 新增全天事件（end.date 為隔天，Google 全天事件結束日為排他）
export async function insertEvent(accessToken: string, title: string, date: string, note = ''): Promise<GEvent> {
  const next = new Date(date + 'T00:00:00Z')
  next.setUTCDate(next.getUTCDate() + 1)
  const endDate = next.toISOString().slice(0, 10)
  const res = await fetch(CAL_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: title, description: note, start: { date }, end: { date: endDate } }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || '新增事件失敗')
  return { id: data.id, title, date, note }
}

export async function patchEvent(accessToken: string, id: string, fields: { title?: string; date?: string; note?: string }) {
  const body: any = {}
  if (fields.title !== undefined) body.summary = fields.title
  if (fields.note !== undefined) body.description = fields.note
  if (fields.date !== undefined) {
    const next = new Date(fields.date + 'T00:00:00Z')
    next.setUTCDate(next.getUTCDate() + 1)
    body.start = { date: fields.date }
    body.end = { date: next.toISOString().slice(0, 10) }
  }
  const res = await fetch(`${CAL_BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error?.message || '更新事件失敗') }
}

export async function deleteEvent(accessToken: string, id: string) {
  const res = await fetch(`${CAL_BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 410) { const d = await res.json().catch(() => ({})); throw new Error(d.error?.message || '刪除事件失敗') }
}
