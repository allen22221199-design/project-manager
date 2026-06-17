import { Client } from '@notionhq/client'

export const notion = new Client({ auth: process.env.NOTION_TOKEN })
export const DATABASE_ID = process.env.NOTION_DATABASE_ID!

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

export async function addItemRecord(pageId: string, item: string, spec: string, qty: string) {
  const tableInfo = await findSectionTable(pageId, '項目清單')

  // Build cells array padded to match existing table width
  const baseValues = [item, spec, qty]

  if (tableInfo) {
    const width = tableInfo.width
    const cells = Array.from({ length: width }, (_, i) =>
      [{ type: 'text', text: { content: baseValues[i] ?? '' } }]
    )
    await notion.blocks.children.append({
      block_id: tableInfo.id,
      children: [{ type: 'table_row', table_row: { cells } }] as any,
    })
  } else {
    // Auto-create 項目清單 section (3 columns)
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
            table_width: 3,
            has_column_header: false,
            has_row_header: false,
            children: [
              { type: 'table_row', table_row: { cells: [[{ type: 'text', text: { content: '品項' } }], [{ type: 'text', text: { content: '規格' } }], [{ type: 'text', text: { content: '數量' } }]] } },
              { type: 'table_row', table_row: { cells: [[{ type: 'text', text: { content: item } }], [{ type: 'text', text: { content: spec } }], [{ type: 'text', text: { content: qty } }]] } },
            ],
          },
        },
      ] as any,
    })
  }
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
