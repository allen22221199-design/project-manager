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

export async function addProgressRecord(pageId: string, date: string, description: string) {
  const blocksRes = await notion.blocks.children.list({ block_id: pageId, page_size: 100 })
  const blocks = blocksRes.results as any[]

  let progressTableId: string | null = null
  let foundHeading = false

  for (const block of blocks) {
    if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
      const text = block[block.type]?.rich_text?.[0]?.plain_text ?? ''
      if (text.includes('進度紀錄')) {
        foundHeading = true
        continue
      } else if (foundHeading) {
        break
      }
    }
    if (foundHeading && block.type === 'table') {
      progressTableId = block.id
      break
    }
    // synced blocks: look inside
    if (foundHeading && block.type === 'synced_block') {
      const inner = await notion.blocks.children.list({ block_id: block.id })
      const innerTable = (inner.results as any[]).find(b => b.type === 'table')
      if (innerTable) {
        progressTableId = innerTable.id
        break
      }
    }
  }

  if (!progressTableId) {
    // fallback: append as a paragraph if no table found
    await notion.blocks.children.append({
      block_id: pageId,
      children: [{
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `${date}：${description}` } }],
        },
      }] as any,
    })
    return
  }

  await notion.blocks.children.append({
    block_id: progressTableId,
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
}

export async function updateProjectStatus(pageId: string, status: string) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      狀態: { status: { name: status } },
    },
  })
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

export async function getProjectDetails(pageId: string) {
  const [page, blocksRes] = await Promise.all([
    notion.pages.retrieve({ page_id: pageId }) as any,
    notion.blocks.children.list({ block_id: pageId, page_size: 100 }),
  ])

  const blocks = blocksRes.results as any[]
  const progressRows: { date: string; desc: string }[] = []
  let foundHeading = false

  for (const block of blocks) {
    if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
      const text = block[block.type]?.rich_text?.[0]?.plain_text ?? ''
      if (text.includes('進度紀錄')) { foundHeading = true; continue }
      else if (foundHeading) break
    }
    if (foundHeading && block.type === 'table') {
      const rows = await notion.blocks.children.list({ block_id: block.id })
      for (const row of (rows.results as any[]).slice(1)) {
        const cells = row.table_row?.cells ?? []
        progressRows.push({
          date: cells[0]?.[0]?.plain_text ?? '',
          desc: cells[1]?.[0]?.plain_text ?? '',
        })
      }
      break
    }
  }

  return {
    name: page.properties['專案名稱']?.title?.[0]?.plain_text ?? '',
    status: page.properties['狀態']?.status?.name ?? '',
    contact: page.properties['聯絡人']?.rich_text?.[0]?.plain_text ?? '',
    address: page.properties['地址']?.rich_text?.[0]?.plain_text ?? '',
    progressRows: progressRows.filter(r => r.date || r.desc),
  }
}
