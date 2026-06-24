import { NextResponse } from 'next/server'
import { getDailyTasks } from '@/lib/notion'
import { sendEmail } from '@/lib/email'

export const maxDuration = 60

const REPORT_TO = 'all16889@gmail.com'

// 本週一～週日（台灣時間）
function weekRange() {
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const dow = now.getUTCDay()
  const mon = new Date(now); mon.setUTCDate(now.getUTCDate() - ((dow + 6) % 7))
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET() {
  try {
    const { start, end } = weekRange()
    const tasks = await getDailyTasks()
    const incomplete = tasks.filter(t => t.date >= start && t.date <= end && t.status !== '完成' && t.status !== '已封存')

    const grouped: Record<string, typeof incomplete> = {}
    for (const t of incomplete) (grouped[t.person] ??= []).push(t)
    const people = Object.keys(grouped).sort()

    let body = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;color:#18181b;max-width:640px">
      <h2 style="margin:0 0 4px">📋 本週未完成事項報表</h2>
      <p style="color:#71717a;margin:0 0 16px">期間：${start} ~ ${end}　共 <b>${incomplete.length}</b> 項未完成</p>`

    if (people.length === 0) {
      body += `<p style="padding:16px;background:#f0fdf4;border-radius:8px;color:#166534">🎉 本週所有事項都已完成！</p>`
    } else {
      for (const p of people) {
        const list = grouped[p]
        body += `<div style="margin-bottom:14px;border:1px solid #e4e4e7;border-radius:10px;padding:12px 14px">
          <div style="font-weight:600;margin-bottom:6px">${esc(p)} <span style="color:#a1a1aa;font-weight:400">（${list.length} 項）</span></div>
          <ul style="margin:0;padding-left:18px;color:#3f3f46">`
        for (const t of list) {
          body += `<li style="margin:3px 0">${esc(t.task)} <span style="color:#a1a1aa">— ${esc(t.status || '進行中')}，截止 ${t.date || '未定'}</span></li>`
        }
        body += `</ul></div>`
      }
    }
    body += `<p style="color:#a1a1aa;font-size:12px;margin-top:16px">由「專案進度管理」系統於每週五自動發送</p></div>`

    await sendEmail(REPORT_TO, `【本週未完成事項】${start}~${end}（${incomplete.length} 項）`, body)
    return NextResponse.json({ ok: true, total: incomplete.length, people: people.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
