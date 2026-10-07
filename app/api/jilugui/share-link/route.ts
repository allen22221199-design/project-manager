import { NextRequest, NextResponse } from 'next/server'
import { shareKey } from '@/lib/jilugui'
import { originOf } from '@/lib/jilugui-share'
import { needUser, fail } from '@/lib/jilugui-http'

// 管理者在 App 裡按「分享給 AI」拿連結；一般成員看不到金鑰。
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const a = needUser(req)
  if (a.res) return a.res
  if (a.user.role !== 'admin') return fail('只有管理者可以拿分享連結', 403)
  const origin = originOf(req)
  const key = shareKey()
  const url = `${origin}/api/jilugui/share/${key}`
  return NextResponse.json({ page: `${origin}/portfolio/${key}`, url, json: url + '?format=json', note: '三個網址都是唯讀，用同一把金鑰；文字全部給、檔案與縮圖連結 7 天有效。要讓舊連結失效，在 Vercel 設環境變數 JILUGUI_SHARE_SALT 換一個值。' })
}
