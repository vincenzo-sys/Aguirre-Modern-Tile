#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BASE_URL = process.env.TILE_API_BASE_URL || 'https://aguirremoderntile.com'
const API_KEY = process.env.TILE_API_KEY

if (!API_KEY) {
  console.error('[tile-crm-mcp] TILE_API_KEY env var is required')
  process.exit(1)
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const msg = data && typeof data === 'object' && data.error ? data.error : `HTTP ${res.status}`
    throw new Error(`${method} ${path} failed: ${msg}`)
  }
  return data
}

const tools = [
  {
    name: 'create_lead',
    description:
      'Create a new lead from an inbound prospect (phone, text, referral, walk-in). Automatically find-or-creates a customer record. Use this for any new inquiry that isn\'t an existing customer.',
    inputSchema: {
      type: 'object',
      required: ['client_name', 'project_type'],
      properties: {
        client_name: { type: 'string', description: 'Full name of the prospect' },
        client_phone: { type: 'string', description: 'US phone, e.g. "(617) 555-0142"' },
        client_email: { type: 'string' },
        project_type: {
          type: 'string',
          enum: ['bathroom', 'shower', 'kitchen-floor', 'backsplash', 'other'],
        },
        source: {
          type: 'string',
          enum: ['phone', 'referral', 'walk-in', 'repeat', 'website', 'other'],
          default: 'phone',
        },
        notes: { type: 'string', description: 'Free-form call notes, budget, timeline, etc.' },
        next_follow_up: {
          type: 'string',
          description: 'YYYY-MM-DD date when to follow up',
        },
        answers: {
          type: 'object',
          description: 'Optional structured answers (key/value pairs)',
          additionalProperties: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'update_lead',
    description:
      'Update an existing lead: change status, add notes, set follow-up, record lost reason. Pass only the fields you want to change.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Lead UUID' },
        status: { type: 'string', enum: ['new', 'reviewed', 'converted', 'archived'] },
        notes: { type: 'string' },
        next_follow_up: { type: 'string', description: 'YYYY-MM-DD' },
        last_contact_at: {
          type: 'string',
          description: 'ISO 8601 timestamp of last contact',
        },
        lost_reason: { type: 'string' },
        source: { type: 'string' },
        client_name: { type: 'string' },
        client_phone: { type: 'string' },
        client_email: { type: 'string' },
        project_type: { type: 'string' },
      },
    },
  },
  {
    name: 'get_lead',
    description: 'Fetch one lead by ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
  },
  {
    name: 'create_customer',
    description:
      'Create a customer record directly (without an associated lead). Returns an existing customer if one matches by email or phone, otherwise inserts a new row.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        zip: { type: 'string' },
        notes: { type: 'string' },
        source: {
          type: 'string',
          enum: ['website', 'manual', 'referral', 'repeat'],
          default: 'manual',
        },
      },
    },
  },
  {
    name: 'find_customers',
    description:
      'Search customers by name/email/phone fragment. Use before creating anything to avoid duplicates. Returns enriched records with job_count and total_revenue.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search fragment' },
        source: { type: 'string', description: 'Filter by source' },
      },
    },
  },
  {
    name: 'get_customer',
    description:
      'Fetch a single customer including all their jobs, quotes, and invoices.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
  },
  {
    name: 'create_job',
    description:
      'Create a new job. If customer_id is omitted, find-or-creates the customer by email/phone. Can link to a lead via from_lead_id (auto-marks that lead as converted).',
    inputSchema: {
      type: 'object',
      required: ['title', 'client_name'],
      properties: {
        title: { type: 'string' },
        client_name: { type: 'string' },
        client_phone: { type: 'string' },
        client_email: { type: 'string' },
        client_address: { type: 'string' },
        customer_id: { type: 'string' },
        job_type: {
          type: 'string',
          description:
            'One of: Bathroom Tile, Shower Tile, Floor Tile, Backsplash, Tile Repair, Tile Reglazing, Other',
        },
        square_footage: { type: 'number' },
        scope_notes: { type: 'string' },
        scheduled_start: { type: 'string', description: 'YYYY-MM-DD' },
        scheduled_end: { type: 'string', description: 'YYYY-MM-DD' },
        estimated_days: { type: 'number' },
        estimated_cost: { type: 'number' },
        assigned_to: { type: 'string', description: 'Team member UUID' },
        notes: { type: 'string' },
        status: {
          type: 'string',
          enum: [
            'lead',
            'quoted',
            'scheduled',
            'in_progress',
            'waiting_for_materials',
            'completed',
            'paid',
            'cancelled',
          ],
          default: 'lead',
        },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['category', 'description', 'quantity', 'unit', 'unit_price', 'amount'],
            properties: {
              category: { type: 'string', enum: ['materials', 'labor'] },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit: { type: 'string', enum: ['sq ft', 'hr', 'ea', 'ln ft', 'bag', 'box'] },
              unit_price: { type: 'number' },
              amount: { type: 'number' },
              status: {
                type: 'string',
                enum: ['needed', 'ordered', 'received', 'on_site'],
                description: 'Materials only',
              },
            },
          },
        },
        from_lead_id: { type: 'string' },
      },
    },
  },
  {
    name: 'list_jobs',
    description:
      'List jobs with filters. Use for "what\'s scheduled this week?" or crew-assignment questions.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Single status or comma-separated list',
        },
        from: { type: 'string', description: 'YYYY-MM-DD — scheduled_start >= from' },
        to: { type: 'string', description: 'YYYY-MM-DD — scheduled_start <= to' },
        assigned_to: { type: 'string' },
        limit: { type: 'number', default: 100, maximum: 500 },
      },
    },
  },
  {
    name: 'get_job',
    description: 'Fetch one job by ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
  },
  {
    name: 'update_job',
    description:
      'Update a job\'s fields. Status changes to scheduled/in_progress/completed auto-send customer SMS via OpenPhone.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string' },
        scheduled_start: { type: 'string' },
        scheduled_end: { type: 'string' },
        estimated_days: { type: 'number' },
        estimated_cost: { type: 'number' },
        actual_cost: { type: 'number' },
        assigned_to: { type: 'string' },
        notes: { type: 'string' },
        scope_notes: { type: 'string' },
        square_footage: { type: 'number' },
        job_type: { type: 'string' },
      },
    },
  },
  {
    name: 'add_line_item',
    description:
      'Append a new line item to a job (material or labor). Fetches current items, appends, saves back.',
    inputSchema: {
      type: 'object',
      required: ['job_id', 'category', 'description', 'quantity', 'unit', 'unit_price'],
      properties: {
        job_id: { type: 'string' },
        category: { type: 'string', enum: ['materials', 'labor'] },
        description: { type: 'string' },
        quantity: { type: 'number' },
        unit: { type: 'string', enum: ['sq ft', 'hr', 'ea', 'ln ft', 'bag', 'box'] },
        unit_price: { type: 'number' },
        status: {
          type: 'string',
          enum: ['needed', 'ordered', 'received', 'on_site'],
          default: 'needed',
        },
      },
    },
  },
  {
    name: 'set_line_item_status',
    description:
      'Update the status of a specific material line item on a job (needed → ordered → received → on_site).',
    inputSchema: {
      type: 'object',
      required: ['job_id', 'index', 'status'],
      properties: {
        job_id: { type: 'string' },
        index: {
          type: 'number',
          description: 'Zero-based index of the line item within the job\'s line_items array',
        },
        status: {
          type: 'string',
          enum: ['needed', 'ordered', 'received', 'on_site'],
        },
      },
    },
  },
]

async function callTool(name, args) {
  switch (name) {
    case 'create_lead':
      return request('/api/leads', { method: 'POST', body: args })

    case 'update_lead': {
      const { id, ...rest } = args
      return request(`/api/leads/${id}`, { method: 'PATCH', body: rest })
    }

    case 'get_lead':
      return request(`/api/leads/${args.id}`)

    case 'create_customer':
      return request('/api/customers', { method: 'POST', body: args })

    case 'find_customers': {
      const qs = new URLSearchParams()
      if (args.q) qs.set('q', args.q)
      if (args.source) qs.set('source', args.source)
      return request(`/api/customers${qs.toString() ? `?${qs}` : ''}`)
    }

    case 'get_customer':
      return request(`/api/customers/${args.id}`)

    case 'create_job':
      return request('/api/jobs', { method: 'POST', body: args })

    case 'list_jobs': {
      const qs = new URLSearchParams()
      for (const k of ['status', 'from', 'to', 'assigned_to', 'limit']) {
        if (args[k] !== undefined && args[k] !== null && args[k] !== '') {
          qs.set(k, String(args[k]))
        }
      }
      return request(`/api/jobs${qs.toString() ? `?${qs}` : ''}`)
    }

    case 'get_job':
      return request(`/api/jobs/${args.id}`)

    case 'update_job': {
      const { id, ...rest } = args
      return request(`/api/jobs/${id}`, { method: 'PATCH', body: rest })
    }

    case 'add_line_item': {
      const { job_id, ...rest } = args
      const job = await request(`/api/jobs/${job_id}`)
      const items = Array.isArray(job.line_items) ? job.line_items : []
      const amount = Number((Number(rest.quantity) * Number(rest.unit_price)).toFixed(2))
      const newItem = { ...rest, amount }
      if (newItem.category !== 'materials') delete newItem.status
      items.push(newItem)
      return request(`/api/jobs/${job_id}`, {
        method: 'PATCH',
        body: { line_items: items },
      })
    }

    case 'set_line_item_status': {
      const { job_id, index, status } = args
      const job = await request(`/api/jobs/${job_id}`)
      const items = Array.isArray(job.line_items) ? [...job.line_items] : []
      if (index < 0 || index >= items.length) {
        throw new Error(`Line item index ${index} out of range (0..${items.length - 1})`)
      }
      if (items[index].category !== 'materials') {
        throw new Error('Only material line items have a status')
      }
      items[index] = { ...items[index], status }
      return request(`/api/jobs/${job_id}`, {
        method: 'PATCH',
        body: { line_items: items },
      })
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

const server = new Server(
  { name: 'tile-crm', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  try {
    const result = await callTool(name, args ?? {})
    return {
      content: [
        {
          type: 'text',
          text:
            typeof result === 'string'
              ? result
              : JSON.stringify(result, null, 2),
        },
      ],
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[tile-crm-mcp] server ready on stdio')
