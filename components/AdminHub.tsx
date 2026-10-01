'use client'

// 管理者專用的系統入口。公司的後台不只這一套——客服機器人、紀錄櫃、官網、
// LINE 與 Meta 的官方後台各自散在不同網址，平常要靠記憶或書籤找。
// 這一頁把它們收在同一個地方，登入管理者之後就看得到。
//
// 只放「連結」，不代理也不嵌 iframe：
// 這些系統各自有自己的登入（客服後台是獨立密碼、LINE/Meta 是官方帳號），
// 用 iframe 包起來只會被對方的 X-Frame-Options 擋掉，或是 cookie 過不去變成白畫面。
// 開新分頁最誠實，也不會讓人以為資料是從這裡來的。

type Link = {
  name: string
  desc: string
  href: string
  icon: string
  /** 內部路徑（同一個網站）走同分頁，外部系統開新分頁 */
  internal?: boolean
  /** 需要另外登入的，先講清楚，不要讓人點進去才發現又要打密碼 */
  note?: string
}

type Group = { title: string; hint: string; links: Link[] }

const GROUPS: Group[] = [
  {
    title: '每天會用到的',
    hint: '客戶進線與公司紀錄，這兩個最常開',
    links: [
      {
        name: '客服管理後台',
        desc: 'LINE／IG／FB 進線的客戶、待跟進名單、對話紀錄、機器人設定',
        href: 'https://line-customer-bot.vercel.app/admin',
        icon: '💬',
        note: '第一次要輸入客服後台的密碼，之後記住 30 天',
      },
      {
        name: '紀錄櫃',
        desc: '公司文件與工作紀錄，可用問的找資料',
        href: '/jilugui',
        icon: '🗄️',
        internal: true,
        note: '用登入碼進入',
      },
    ],
  },
  {
    title: '官方帳號後台',
    hint: '要改粉專設定、看廣告成效或好友來源時才進去',
    links: [
      {
        name: 'LINE 官方帳號',
        desc: '好友數、加入管道分析、群發訊息、圖文選單',
        href: 'https://manager.line.biz/',
        icon: '🟢',
        note: '用 LINE 帳號登入',
      },
      {
        name: 'Meta Business Suite',
        desc: 'FB／IG 粉專貼文、留言、廣告與表單名單',
        href: 'https://business.facebook.com/latest/home',
        icon: '🔵',
        note: '用 Facebook 帳號登入',
      },
    ],
  },
  {
    title: '對外網站',
    hint: '客戶看到的樣子',
    links: [
      {
        name: '煌盛官網',
        desc: '產品介紹、實績案例、競品比較',
        href: 'https://egrra.com',
        icon: '🌐',
      },
    ],
  },
]

export default function AdminHub() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>管理</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
          公司各個後台的入口。點了會另開分頁，這一頁不會跑掉。
        </p>
      </div>

      {GROUPS.map(g => (
        <section key={g.title}>
          <div className="flex items-baseline gap-2 mb-2 px-0.5">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>{g.title}</h2>
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{g.hint}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {g.links.map(l => (
              <a
                key={l.name}
                href={l.href}
                {...(l.internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                className="glass-card p-4 flex gap-3 items-start transition-colors hover:border-indigo-300"
              >
                <span className="text-2xl leading-none shrink-0 mt-0.5">{l.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{l.name}</span>
                    {!l.internal && (
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--text-3)' }} aria-label="另開分頁">↗</span>
                    )}
                  </span>
                  <span className="block text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>{l.desc}</span>
                  {l.note && (
                    <span className="block text-[11px] mt-1.5" style={{ color: 'var(--text-3)', opacity: 0.8 }}>
                      · {l.note}
                    </span>
                  )}
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
        這些是各自獨立的系統，各有自己的帳號密碼，這一頁只負責帶你過去，不會幫你登入。
      </p>
    </div>
  )
}
