// Notion API client for syncing Tile Jobs Dashboard

const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

// Database IDs from the Notion workspace
export const NOTION_DATABASES = {
  tileJobs: '241359d0-d7e3-4efa-8efb-01ef7a91c3f5',
  materialsPricing: 'ff2b8e35-918a-4ba6-b708-e0c81eed2669',
  laborRates: '3d286dc7-ab5e-48fa-8e9b-f633bc79f0d5',
  contacts: '449c1d8f-0e7f-4183-bfd3-4ecad6a4d28f',
} as const

function getNotionToken(): string {
  const token = process.env.NOTION_API_TOKEN
  if (!token) throw new Error('NOTION_API_TOKEN not set')
  return token
}

async function notionFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getNotionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Notion API error ${res.status}: ${body}`)
  }
  return res
}

// Notion property value extractors
function getText(prop: any): string | null {
  if (!prop) return null
  if (prop.type === 'title') return prop.title?.map((t: any) => t.plain_text).join('') || null
  if (prop.type === 'rich_text') return prop.rich_text?.map((t: any) => t.plain_text).join('') || null
  return null
}

function getNumber(prop: any): number | null {
  if (!prop || prop.type !== 'number') return null
  return prop.number
}

function getSelect(prop: any): string | null {
  if (!prop || prop.type !== 'select' || !prop.select) return null
  return prop.select.name
}

function getEmail(prop: any): string | null {
  if (!prop || prop.type !== 'email') return null
  return prop.email
}

function getPhone(prop: any): string | null {
  if (!prop || prop.type !== 'phone_number') return null
  return prop.phone_number
}

function getDate(prop: any): string | null {
  if (!prop || prop.type !== 'date' || !prop.date) return null
  return prop.date.start
}

function getDateEnd(prop: any): string | null {
  if (!prop || prop.type !== 'date' || !prop.date) return null
  return prop.date.end
}

// Map Notion status to our JobStatus type
function mapNotionStatus(notionStatus: string | null): string {
  const map: Record<string, string> = {
    'Lead': 'lead',
    'Estimate Ready': 'quoted',
    'Estimate Revised': 'quoted',
    'Approved': 'scheduled',
    'Quoted': 'quoted',
    'Scheduled': 'scheduled',
    'In Progress': 'in_progress',
    'Completed': 'completed',
    'Paid': 'paid',
    'Cancelled': 'cancelled',
  }
  return map[notionStatus ?? ''] ?? 'lead'
}

// Map Notion job type to our format
function mapJobType(notionType: string | null): string | null {
  const map: Record<string, string> = {
    'Bathroom': 'Bathroom Tile',
    'Kitchen': 'Floor Tile',
    'Backsplash': 'Backsplash',
    'Floor': 'Floor Tile',
    'Commercial': 'Floor Tile',
    'Repair': 'Tile Repair',
    'Other': 'Other',
  }
  return notionType ? (map[notionType] ?? notionType) : null
}

export interface NotionJobPage {
  notion_page_id: string
  title: string
  status: string
  client_name: string
  client_phone: string | null
  client_email: string | null
  client_address: string | null
  job_type: string | null
  square_footage: number | null
  scope_notes: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  estimated_days: number | null
  estimated_cost: number | null
  actual_cost: number | null
  amount_paid: number | null
  notes: string | null
  lead_source: string | null
  priority: string | null
  team_assigned: string | null
  materials_responsibility: string | null
  quote_amount: number | null
  final_amount: number | null
  profit_dollars: number | null
  profit_percent: number | null
  estimate_number: string | null
  follow_up_count: number | null
  quote_sent_date: string | null
  quote_accepted_date: string | null
  last_contact_date: string | null
  next_contact_date: string | null
  project_date_start: string | null
  project_date_end: string | null
}

function parseNotionJobPage(page: any): NotionJobPage {
  const props = page.properties
  return {
    notion_page_id: page.id,
    title: getText(props['Job Name']) ?? 'Untitled Job',
    status: mapNotionStatus(getSelect(props['Status'])),
    client_name: getText(props['Client Name']) ?? 'Unknown',
    client_phone: getPhone(props['Phone']),
    client_email: getEmail(props['Email']),
    client_address: getText(props['Location']),
    job_type: mapJobType(getSelect(props['Job Type'])),
    square_footage: getNumber(props['Square Footage']),
    scope_notes: getText(props['Scope Summary']),
    scheduled_start: getDate(props['Project Dates']),
    scheduled_end: getDateEnd(props['Project Dates']),
    estimated_days: getNumber(props['Estimated Duration (Days)']),
    estimated_cost: getNumber(props['Quote Amount']),
    actual_cost: getNumber(props['Your Cost']),
    amount_paid: getNumber(props['Amount Paid']),
    notes: getText(props['Notes']),
    lead_source: getSelect(props['Lead Source']),
    priority: getSelect(props['Priority']),
    team_assigned: getSelect(props['Team Assigned']),
    materials_responsibility: getText(props['Materials Responsibility']),
    quote_amount: getNumber(props['Quote Amount']),
    final_amount: getNumber(props['Final Amount']),
    profit_dollars: getNumber(props['Profit $']),
    profit_percent: getNumber(props['Profit %']),
    estimate_number: getText(props['Estimate Number']),
    follow_up_count: getNumber(props['Follow-Up Count']),
    quote_sent_date: getDate(props['Quote Sent Date']),
    quote_accepted_date: getDate(props['Quote Accepted Date']),
    last_contact_date: getDate(props['Last Contact Date']),
    next_contact_date: getDate(props['Next Contact Date']),
    project_date_start: getDate(props['Project Dates']),
    project_date_end: getDateEnd(props['Project Dates']),
  }
}

// Query all pages from the Tile Jobs Dashboard
export async function fetchAllNotionJobs(): Promise<NotionJobPage[]> {
  const allPages: NotionJobPage[] = []
  let hasMore = true
  let startCursor: string | undefined

  while (hasMore) {
    const body: any = { page_size: 100 }
    if (startCursor) body.start_cursor = startCursor

    const res = await notionFetch(`/databases/${NOTION_DATABASES.tileJobs}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const data = await res.json()
    for (const page of data.results ?? []) {
      allPages.push(parseNotionJobPage(page))
    }

    hasMore = data.has_more
    startCursor = data.next_cursor
  }

  return allPages
}

// Create a page in the Tile Jobs Dashboard (for website form → Notion)
export async function createNotionJob(data: {
  jobName: string
  clientName: string
  clientEmail: string
  clientPhone: string
  jobType?: string
  scopeSummary?: string
  leadSource?: string
}): Promise<string> {
  const properties: any = {
    'Job Name': { title: [{ text: { content: data.jobName } }] },
    'Client Name': { rich_text: [{ text: { content: data.clientName } }] },
    'Status': { select: { name: 'Lead' } },
  }

  if (data.clientEmail) {
    properties['Email'] = { email: data.clientEmail }
  }
  if (data.clientPhone) {
    properties['Phone'] = { phone_number: data.clientPhone }
  }
  if (data.jobType) {
    properties['Job Type'] = { select: { name: data.jobType } }
  }
  if (data.scopeSummary) {
    properties['Scope Summary'] = { rich_text: [{ text: { content: data.scopeSummary } }] }
  }
  if (data.leadSource) {
    properties['Lead Source'] = { select: { name: data.leadSource } }
  }

  const res = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASES.tileJobs },
      properties,
    }),
  })

  const page = await res.json()
  return page.id
}

// Update a Notion page's Amount Paid field (for Stripe → Notion)
export async function updateNotionJobPayment(notionPageId: string, amountPaid: number): Promise<void> {
  await notionFetch(`/pages/${notionPageId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Amount Paid': { number: amountPaid },
      },
    }),
  })
}
