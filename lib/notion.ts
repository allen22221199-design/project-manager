import { Client } from '@notionhq/client'

export const notion = new Client({ auth: process.env.NOTION_TOKEN })
export const DATABASE_ID = process.env.NOTION_PROJECTS_DATABASE_ID || '25d2cda48d7781a6bec3f101d8c9a872'

const INACTIVE_STATUSES = ['完成', '請款中含保留款']

export async function getActiveProjects() {
  const res = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: INACTIVE_STATUSES.map(s => ({
        property: '狀態',
        status: { does_not_equal: s },
      })),
    },
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
  })
  return res.results.map((page: any) => ({
    id: page.id,
    url: page.url,
    name: page.properties['專案名稱']?.title?.[0]?.plain_text ?? '(未命名)',
    status: page.properties['狀態']?.status?.name ?? '',
    contact: page.properties['聯絡人']?.rich_text?.[0]?.plain_text ?? '',
    address: page.properties['地址']?.rich_text?.[0]?.plain_text ?? '',
  }))
}

// Reads all rows from a table block as string[][]
async function readTableRows(tableId: string): Promise<string[][]> {
  const res = await notion.blocks.children.list({ block_id: tableId, page_size: 100 })
  return (res.results as any[])
    .map(row => (row.table_row?.cells ?? []).map((cell: any) => cell[0]?.plain_text ?? ''))
    .filter(row => row.some((c: string) => c.trim() !== ''))
}

// Section keywords → section name mapping
const SECTION_KEYWORDS: Record<string, string> = {
  '進度紀錄': 'progress',
  '項目清單': 'item',
  '出貨紀錄': 'shipping',
  '請款紀錄': 'payment',
}

function detectSection(headingText: string): string | null {
  for (const [kw, name] of Object.entries(SECTION_KEYWORDS)) {
    if (headingText.includes(kw)) return name
  }
  return null
}

// Find a named section table, returns { id, width } or null
async function findSectionTable(pageId: string, keyword: string): Promise<{ id: string; width: number } | null> {
  const res = await notion.blocks.children.list({ block_id: pageId, page_size: 100 })
  const blocks = res.results as any[]
  let foundSection = false
  for (const block of blocks) {
    if (['heading_1', 'heading_2', 'heading_3'].includes(block.type)) {
      const text = block[block.type]?.rich_text?.[0]?.plain_text ?? ''
      foundSection = text.includes(keyword)
      continue
    }
    if (foundSection && block.type === 'table') {
      return { id: block.id, width: block.table?.table_width ?? 2 }
    }
    if (!foundSection && block.type === 'table') {
      // keep looking
    }
  }
  return null
}

export async function addProgressRecord(pageId: string, date: string, description: string) {
  const tableInfo = await findSectionTable(pageId, '進度紀錄')

  if (tableInfo) {
    await notion.blocks.children.append({
      block_id: tableInfo.id,
      children: [{
        type: 'table_row',
        table_row: {
          cells: [
            [{ type: 'text', text: { content: date } }],
            [{ type: 'text', text: { content: description } }],
          ],
        },
      }] as any,
    })
  } else {
    // Auto-create 進度紀錄 section
    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          type: 'heading_1',
          heading_1: { rich_text: [{ type: 'text', text: { content: '📑 進度紀錄' } }], color: 'default' },
        },
        {
          type: 'table',
          table: {
            table_width: 2,
            has_column_header: false,
            has_row_header: false,
            children: [
              { type: 'table_row', table_row: { cells: [[{ type: 'text', text: { content: '日期' } }], [{ type: 'text', text: { content: '進度描述' } }]] } },
              { type: 'table_row', table_row: { cells: [[{ type: 'text', text: { content: date } }], [{ type: 'text', text: { content: description } }]] } },
            ],
          },
        },
      ] as any,
    })
  }
}

export async function addItemRecord(
  pageId: string,
  item: string,
  content: string,
  spec: string,
  qty: string,
  unit: string,
  note: string,
) {
  const tableInfo = await findSectionTable(pageId, '項目清單')

  // All 6 values in order: 項目 | 內容 | 規格(cm) | 數量 | 單位 | 備註
  const allValues = [item, content, spec, qty, unit, note]

  if (tableInfo) {
    const width = tableInfo.width
    const cells = Array.from({ length: width }, (_, i) =>
      [{ type: 'text', text: { content: allValues[i] ?? '' } }]
    )
    await notion.blocks.children.append({
      block_id: tableInfo.id,
      children: [{ type: 'table_row', table_row: { cells } }] as any,
    })
  } else {
    // Auto-create 項目清單 section (6 columns)
    const makeCell = (v: string) => [{ type: 'text', text: { content: v } }]
    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          type: 'heading_2',
          heading_2: { rich_text: [{ type: 'text', text: { content: '📋項目清單' } }], color: 'default' },
        },
        {
          type: 'table',
          table: {
            table_width: 6,
            has_column_header: false,
            has_row_header: false,
            children: [
              { type: 'table_row', table_row: { cells: ['項目','內容','規格(cm)','數量','單位','備註'].map(makeCell) } },
              { type: 'table_row', table_row: { cells: allValues.map(makeCell) } },
            ],
          },
        },
      ] as any,
    })
  }
}

export async function createProject(name: string, contact: string, address: string, status: string) {
  return await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      專案名稱: { title: [{ text: { content: name } }] },
      聯絡人: { rich_text: [{ text: { content: contact } }] },
      地址: { rich_text: [{ text: { content: address } }] },
      狀態: { status: { name: status } },
    },
  }) as any
}

export async function updateProjectStatus(pageId: string, status: string) {
  await notion.pages.update({
    page_id: pageId,
    properties: { 狀態: { status: { name: status } } },
  })
}

export async function getProjectDetails(pageId: string) {
  const [page, blocksRes] = await Promise.all([
    notion.pages.retrieve({ page_id: pageId }) as any,
    notion.blocks.children.list({ block_id: pageId, page_size: 100 }),
  ])

  const blocks = blocksRes.results as any[]

  // Collect table reads needed
  const sectionTables: Record<string, { id: string }> = {}
  let currentSection: string | null = null

  for (const block of blocks) {
    if (['heading_1', 'heading_2', 'heading_3'].includes(block.type)) {
      const text = block[block.type]?.rich_text?.[0]?.plain_text ?? ''
      currentSection = detectSection(text)
      continue
    }
    if (currentSection && block.type === 'table' && !sectionTables[currentSection]) {
      sectionTables[currentSection] = { id: block.id }
      currentSection = null
    }
  }

  // Read all tables in parallel
  const [progressAllRows, itemAllRows, shippingAllRows, paymentAllRows] = await Promise.all([
    sectionTables.progress ? readTableRows(sectionTables.progress.id) : Promise.resolve([]),
    sectionTables.item ? readTableRows(sectionTables.item.id) : Promise.resolve([]),
    sectionTables.shipping ? readTableRows(sectionTables.shipping.id) : Promise.resolve([]),
    sectionTables.payment ? readTableRows(sectionTables.payment.id) : Promise.resolve([]),
  ])

  // 進度紀錄: skip header row if first row contains '日期'
  const progressData = progressAllRows.length > 0 && (progressAllRows[0][0] === '日期' || progressAllRows[0][0] === '日 期')
    ? progressAllRows.slice(1)
    : progressAllRows

  // 項目清單: use first row as header if it looks like one
  const itemHasHeader = itemAllRows.length > 0 && !/[0-9]/.test(itemAllRows[0][0])
  const itemHeaders = itemHasHeader ? itemAllRows[0] : ['品項', '規格', '數量']
  const itemData = itemHasHeader ? itemAllRows.slice(1) : itemAllRows

  // 出貨紀錄: first row as header
  const shippingHasHeader = shippingAllRows.length > 0 && !/[0-9]/.test(shippingAllRows[0][0])
  const shippingHeaders = shippingHasHeader ? shippingAllRows[0] : ['日期', '品項', '規格', '數量', '收件人', '備註']
  const shippingData = shippingHasHeader ? shippingAllRows.slice(1) : shippingAllRows

  // 請款紀錄: first row as header
  const paymentHasHeader = paymentAllRows.length > 0 && !/[0-9]/.test(paymentAllRows[0][0])
  const paymentHeaders = paymentHasHeader ? paymentAllRows[0] : ['日期', '項目', '金額', '請款方式', '付款狀態', '備註']
  const paymentData = paymentHasHeader ? paymentAllRows.slice(1) : paymentAllRows

  return {
    id: pageId,
    name: page.properties['專案名稱']?.title?.[0]?.plain_text ?? '',
    status: page.properties['狀態']?.status?.name ?? '',
    contact: page.properties['聯絡人']?.rich_text?.[0]?.plain_text ?? '',
    address: page.properties['地址']?.rich_text?.[0]?.plain_text ?? '',
    progressRows: progressData.map(r => ({ date: r[0] ?? '', desc: r[1] ?? '' })),
    itemHeaders,
    itemRows: itemData,
    shippingHeaders,
    shippingRows: shippingData,
    paymentHeaders,
    paymentRows: paymentData,
  }
}

const DAILY_TASKS_DATABASE_ID = '3882cda48d77809299f4f15d6420575b'

// Query all non-completed tasks for a person
export async function getTasksByPerson(person: string) {
  const res = await notion.databases.query({
    database_id: DAILY_TASKS_DATABASE_ID,
    filter: {
      and: [
        { property: '人員', rich_text: { equals: person } },
        { property: '狀態', status: { does_not_equal: '完成' } },
        { property: '狀態', status: { does_not_equal: '已封存' } },
      ],
    },
    sorts: [{ property: '截止日期', direction: 'descending' }],
    page_size: 100,
  })
  return (res.results as any[]).map(page => ({
    id: page.id,
    task: page.properties['任務名稱']?.title?.[0]?.plain_text ?? '',
    person: page.properties['人員']?.rich_text?.[0]?.plain_text ?? '',
    date: page.properties['截止日期']?.date?.start ?? '',
    status: page.properties['狀態']?.status?.name ?? '',
    source: page.properties['來源錄音']?.rich_text?.[0]?.plain_text ?? '',
    freq: '當日',
  }))
}

// Read daily work items, grouped by person
export async function getDailyTasks(dateStr?: string) {
  const filter = dateStr
    ? { property: '截止日期', date: { equals: dateStr } }
    : undefined
  // 分頁抓完全部（Notion 單次最多 100 筆，超過要靠 cursor 續抓）
  const results: any[] = []
  let cursor: string | undefined = undefined
  do {
    const res: any = await notion.databases.query({
      database_id: DAILY_TASKS_DATABASE_ID,
      ...(filter ? { filter } : {}),
      sorts: [{ property: '截止日期', direction: 'descending' }],
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    results.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return results.map(page => ({
    id: page.id,
    task: page.properties['任務名稱']?.title?.[0]?.plain_text ?? '',
    person: page.properties['人員']?.rich_text?.[0]?.plain_text ?? '(未分類)',
    date: page.properties['截止日期']?.date?.start ?? '',
    status: page.properties['狀態']?.status?.name ?? '未開始',
    source: page.properties['來源錄音']?.rich_text?.[0]?.plain_text ?? '',
    content: (page.properties['任務內容']?.rich_text ?? []).map((r: any) => r.plain_text).join(''),
    direction: (page.properties['進度方向']?.rich_text ?? []).map((r: any) => r.plain_text).join(''),
    aiPlan: (page.properties['AI規劃']?.rich_text ?? []).map((r: any) => r.plain_text).join(''),
    freq: '當日',
  }))
}

// 將長字串切成 Notion rich_text（單段上限 2000 字）
function toRichText(s: string) {
  const max = 2000
  const chunks: any[] = []
  for (let i = 0; i < s.length; i += max) chunks.push({ text: { content: s.slice(i, i + max) } })
  return chunks
}

const HISTORY_PAGE_ID = '3872cda48d7781ecafe5e5bfca9c4270'

// 刪除某日期的所有每日工作項目（重寫當天時用）
export async function deleteDailyTasksByDate(dateStr: string) {
  const res = await notion.databases.query({
    database_id: DAILY_TASKS_DATABASE_ID,
    filter: { property: '截止日期', date: { equals: dateStr } },
    page_size: 100,
  })
  for (const page of res.results as any[]) {
    // 已封存的頁面再封存會報錯，跳過即可
    try { await notion.pages.update({ page_id: page.id, archived: true }) } catch {}
  }
}

// 寫入歷史頁面：以日期為標題的區塊；重寫同一天會先刪掉舊區塊再附加新的
export async function writeHistorySection(dateStr: string, grouped: Record<string, string[]>) {
  const res = await notion.blocks.children.list({ block_id: HISTORY_PAGE_ID, page_size: 100 })
  const blocks = res.results as any[]

  // 找出今天的 heading 區塊，刪除它與其後（到下一個 heading_2 之前）的所有區塊
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.type === 'heading_2' && (b.heading_2?.rich_text?.[0]?.plain_text ?? '').includes(dateStr)) {
      const toDelete = [b.id]
      let j = i + 1
      while (j < blocks.length && blocks[j].type !== 'heading_2') {
        toDelete.push(blocks[j].id)
        j++
      }
      for (const id of toDelete) {
        try { await notion.blocks.delete({ block_id: id }) } catch {}
      }
      break
    }
  }

  // 組成新區塊：日期 heading + 每人段落 + 任務 bullet
  const children: any[] = [
    { type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: dateStr } }] } },
  ]
  for (const [person, tasks] of Object.entries(grouped)) {
    children.push({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `【${person}】` }, annotations: { bold: true } }] } })
    for (const t of tasks) {
      children.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: t } }] } })
    }
  }
  await notion.blocks.children.append({ block_id: HISTORY_PAGE_ID, children } as any)
}

// 依某日期，從資料庫現況重建歷史頁面該天的區塊（編輯後同步用）
export async function syncHistoryForDate(dateStr: string) {
  const tasks = await getDailyTasks(dateStr)
  const grouped: Record<string, string[]> = {}
  for (const t of tasks) (grouped[t.person] ??= []).push(t.task)
  await writeHistorySection(dateStr, grouped)
}

// Update a daily task (reassign person / edit text / change status)
export async function updateDailyTask(id: string, fields: { person?: string; task?: string; status?: string; freq?: string; content?: string; direction?: string; aiPlan?: string }) {
  const properties: any = {}
  if (fields.person !== undefined) properties['人員'] = { rich_text: [{ text: { content: fields.person } }] }
  if (fields.task !== undefined) properties['任務名稱'] = { title: [{ text: { content: fields.task } }] }
  if (fields.status !== undefined) properties['狀態'] = { status: { name: fields.status } }
  if (fields.content !== undefined) properties['任務內容'] = { rich_text: toRichText(fields.content) }
  if (fields.direction !== undefined) properties['進度方向'] = { rich_text: toRichText(fields.direction) }
  if (fields.aiPlan !== undefined) properties['AI規劃'] = { rich_text: toRichText(fields.aiPlan) }
  try {
    await notion.pages.update({ page_id: id, properties })
  } catch (e: any) {
    // 任務頁面已被封存（多半是重新整理過、畫面為舊資料）——忽略，前端重抓即可
    if (String(e?.message ?? e).includes('archived')) return
    throw e
  }
}

// Delete (archive) a daily task
export async function deleteDailyTask(id: string) {
  try {
    await notion.pages.update({ page_id: id, archived: true })
  } catch (e: any) {
    if (String(e?.message ?? e).includes('archived')) return
    throw e
  }
}

// Write one daily work item (used by Plaud sync cron)
export async function addDailyTask(person: string, task: string, dateStr: string, source: string, freq: string = '當日') {
  const properties: any = {
    任務名稱: { title: [{ text: { content: task } }] },
    人員: { rich_text: [{ text: { content: person } }] },
    截止日期: { date: { start: dateStr } },
    狀態: { status: { name: '進行中' } },
    來源錄音: { rich_text: [{ text: { content: source } }] },
  }
  await notion.pages.create({ parent: { database_id: DAILY_TASKS_DATABASE_ID }, properties })
}

// ===== 知識庫（使用 Notion「檔案庫」資料庫）=====
const KNOWLEDGE_DB_ID = '457fee4d9e8345618e4507cc2c363b74'

// 讀取一個頁面內文的純文字（抓常見 block 的 rich_text）
export async function readPagePlainText(pageId: string): Promise<string> {
  const out: string[] = []
  let cursor: string | undefined = undefined
  do {
    const res: any = await notion.blocks.children.list({ block_id: pageId, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) })
    for (const b of res.results as any[]) {
      const rt = b[b.type]?.rich_text
      if (Array.isArray(rt)) out.push(rt.map((r: any) => r.plain_text).join(''))
    }
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return out.filter(Boolean).join('\n')
}

// 取出知識庫中「待處理」（或狀態空白）的項目
export async function getKnowledgeQueue() {
  const res = await notion.databases.query({
    database_id: KNOWLEDGE_DB_ID,
    filter: { or: [
      { property: '狀態', select: { equals: '待處理' } },
      { property: '狀態', select: { is_empty: true } },
    ] },
    page_size: 100,
  })
  return (res.results as any[]).map(p => ({
    id: p.id,
    title: p.properties['檔案名稱']?.title?.[0]?.plain_text ?? '(未命名)',
    url: p.properties['連結']?.url ?? '',
    files: (p.properties['檔案']?.files ?? []).map((f: any) => ({ name: f.name ?? '', url: f.file?.url ?? f.external?.url ?? '' })),
  }))
}

// 取出知識庫中已處理的內容（給 AI 規劃檢索用）
export async function getKnowledgeBase() {
  const res = await notion.databases.query({
    database_id: KNOWLEDGE_DB_ID,
    filter: { property: '狀態', select: { equals: '已處理' } },
    page_size: 100,
  })
  const items = await Promise.all((res.results as any[]).map(async p => ({
    id: p.id,
    title: p.properties['檔案名稱']?.title?.[0]?.plain_text ?? '',
    tags: p.properties['分類']?.select?.name ? [p.properties['分類'].select.name] : [],
    summary: (p.properties['萃取摘要']?.rich_text ?? []).map((r: any) => r.plain_text).join(''),
    text: await readPagePlainText(p.id),
  })))
  return items
}

// 寫回知識庫處理結果（摘要 + 狀態 + 全文進內文）
export async function saveKnowledgeResult(pageId: string, ok: boolean, fullText: string, message: string) {
  await notion.pages.update({ page_id: pageId, properties: {
    狀態: { select: { name: ok ? '已處理' : '失敗' } },
    處理訊息: { rich_text: toRichText(message.slice(0, 1900)) },
    萃取摘要: { rich_text: toRichText(fullText.slice(0, 1900)) },
  } })
  if (ok && fullText) {
    const chunks: string[] = []
    for (let i = 0; i < fullText.length; i += 1800) chunks.push(fullText.slice(i, i + 1800))
    await notion.blocks.children.append({ block_id: pageId, children: [
      { type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: `【AI 萃取內容】` } }] } },
      ...chunks.map(c => ({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: c } }] } })),
    ] as any })
  }
}

const TASKS_DATABASE_ID = '25d2cda48d7781fdb48be99fcf824daf'

export async function searchTasks(query: string) {
  const [usersRes, titleRes] = await Promise.all([
    notion.users.list({}),
    notion.databases.query({
      database_id: TASKS_DATABASE_ID,
      filter: { property: '任務名稱', title: { contains: query } },
      page_size: 20,
    }),
  ])

  const matchedUserIds = (usersRes.results as any[])
    .filter(u => u.name?.toLowerCase().includes(query.toLowerCase()))
    .map(u => u.id)

  let personResults: any[] = []
  for (const userId of matchedUserIds.slice(0, 3)) {
    const r = await notion.databases.query({
      database_id: TASKS_DATABASE_ID,
      filter: {
        or: [
          { property: '指派人員', people: { contains: userId } },
          { property: '協助人員', people: { contains: userId } },
        ],
      },
      page_size: 20,
    })
    personResults.push(...r.results)
  }

  const seen = new Set<string>()
  return [...titleRes.results, ...personResults]
    .filter((p: any) => { if (seen.has(p.id)) return false; seen.add(p.id); return true })
    .map((page: any) => ({
      type: 'task' as const,
      id: page.id,
      taskName: page.properties['任務名稱']?.title?.[0]?.plain_text ?? '(未命名)',
      status: page.properties['狀態']?.status?.name ?? '',
      assignees: (page.properties['指派人員']?.people ?? []).map((u: any) => u.name).join('、'),
      helpers: (page.properties['協助人員']?.people ?? []).map((u: any) => u.name).join('、'),
      dueDate: page.properties['截止日期']?.date?.start ?? '',
      priority: page.properties['優先等級']?.select?.name ?? '',
      note: page.properties['備註']?.rich_text?.[0]?.plain_text ?? '',
      url: page.url,
    }))
}

export async function searchProjects(query: string) {
  const res = await notion.search({
    query,
    filter: { value: 'page', property: 'object' },
    page_size: 10,
  })
  return res.results
    .filter((p: any) => p.parent?.database_id?.replace(/-/g, '') === DATABASE_ID.replace(/-/g, ''))
    .map((page: any) => ({
      id: page.id,
      url: page.url,
      name: page.properties['專案名稱']?.title?.[0]?.plain_text ?? '(未命名)',
      status: page.properties['狀態']?.status?.name ?? '',
      contact: page.properties['聯絡人']?.rich_text?.[0]?.plain_text ?? '',
    }))
}
