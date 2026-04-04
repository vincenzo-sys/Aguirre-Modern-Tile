import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface EstimateLineItem {
  description: string
  category: 'materials' | 'labor' | 'add_on' | 'operating'
  quantity: number
  unit: string
  your_cost: number
  markup_percent: number
  price_to_customer: number
  total_cost: number
  total_price: number
  retail_link?: string | null
}

export interface EstimateResult {
  job_id: string
  job_title: string
  client_name: string
  items: EstimateLineItem[]
  summary: {
    materials_cost: number
    materials_price: number
    labor_cost: number
    labor_price: number
    add_ons_cost: number
    add_ons_price: number
    operating_cost: number
    operating_price: number
    total_cost: number
    total_price: number
    profit: number
    profit_percent: number
  }
}

// GET /api/estimates?job_id=xxx — Generate estimate for a job
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('job_id')

  if (!jobId) {
    return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  }

  try {
    const supabase = getSupabaseAdmin()

    // Fetch job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Fetch reference data
    const [materialsResult, laborResult, addOnsResult, operatingResult] = await Promise.all([
      supabase.from('materials_pricing').select('*'),
      supabase.from('labor_rates').select('*'),
      supabase.from('add_ons').select('*'),
      supabase.from('operating_costs').select('*'),
    ])

    const materials = materialsResult.data ?? []
    const laborRates = laborResult.data ?? []
    const addOns = addOnsResult.data ?? []
    const operating = operatingResult.data ?? []

    // Build estimate line items from job's existing line_items
    const items: EstimateLineItem[] = []

    // If job has line items, use them and enrich with cost data from materials_pricing
    const jobLineItems = (job as any).line_items || []
    for (const item of jobLineItems) {
      // Try to match to a material in our pricing table
      const material = materials.find((m: any) =>
        item.description.toLowerCase().includes(m.item.toLowerCase().split(' ')[0].toLowerCase()) ||
        m.item.toLowerCase().includes(item.description.toLowerCase().split(' ')[0].toLowerCase())
      )

      if (item.category === 'materials') {
        items.push({
          description: item.description,
          category: 'materials',
          quantity: item.quantity,
          unit: item.unit,
          your_cost: material ? Number(material.your_cost) * item.quantity / (material.coverage || 1) : item.amount * 0.6,
          markup_percent: material ? Number(material.markup_percent) : 0.20,
          price_to_customer: item.unit_price,
          total_cost: material ? Number(material.your_cost) * item.quantity / (material.coverage || 1) : item.amount * 0.6,
          total_price: item.amount,
          retail_link: material?.retail_link || null,
        })
      } else {
        // Labor items — use labor rates
        const dailyRate = laborRates.find((r: any) => r.setting === 'Day Rate (per tiler)')
        const crewSize = laborRates.find((r: any) => r.setting === 'Standard Crew Size')
        const multiplier = laborRates.find((r: any) => r.setting === 'Install Multiplier')

        const costPerHour = dailyRate ? Number(dailyRate.value) / 8 : 31.25  // $250/day / 8hrs
        const crewCount = crewSize ? Number(crewSize.value) : 2
        const markup = multiplier ? Number(multiplier.value) : 1.9

        const hourlyCount = item.unit === 'hr' ? item.quantity : item.quantity / 8
        const laborCost = hourlyCount * costPerHour * crewCount

        items.push({
          description: item.description,
          category: 'labor',
          quantity: item.quantity,
          unit: item.unit,
          your_cost: costPerHour * crewCount,
          markup_percent: (markup - 1),
          price_to_customer: item.unit_price,
          total_cost: laborCost,
          total_price: item.amount,
        })
      }
    }

    // Calculate summary
    const materialItems = items.filter((i) => i.category === 'materials')
    const laborItems = items.filter((i) => i.category === 'labor')
    const addOnItems = items.filter((i) => i.category === 'add_on')
    const operatingItems = items.filter((i) => i.category === 'operating')

    const summary = {
      materials_cost: materialItems.reduce((s, i) => s + i.total_cost, 0),
      materials_price: materialItems.reduce((s, i) => s + i.total_price, 0),
      labor_cost: laborItems.reduce((s, i) => s + i.total_cost, 0),
      labor_price: laborItems.reduce((s, i) => s + i.total_price, 0),
      add_ons_cost: addOnItems.reduce((s, i) => s + i.total_cost, 0),
      add_ons_price: addOnItems.reduce((s, i) => s + i.total_price, 0),
      operating_cost: operatingItems.reduce((s, i) => s + i.total_cost, 0),
      operating_price: operatingItems.reduce((s, i) => s + i.total_price, 0),
      total_cost: 0,
      total_price: 0,
      profit: 0,
      profit_percent: 0,
    }
    summary.total_cost = summary.materials_cost + summary.labor_cost + summary.add_ons_cost + summary.operating_cost
    summary.total_price = summary.materials_price + summary.labor_price + summary.add_ons_price + summary.operating_price
    summary.profit = summary.total_price - summary.total_cost
    summary.profit_percent = summary.total_price > 0 ? summary.profit / summary.total_price : 0

    // If no line items, use job's estimated_cost as the price
    if (items.length === 0 && (job as any).estimated_cost) {
      const estCost = Number((job as any).estimated_cost)
      const actualCost = Number((job as any).actual_cost || estCost * 0.55)
      summary.total_price = estCost
      summary.total_cost = actualCost
      summary.profit = estCost - actualCost
      summary.profit_percent = estCost > 0 ? summary.profit / estCost : 0
    }

    const result: EstimateResult = {
      job_id: jobId,
      job_title: (job as any).title,
      client_name: (job as any).client_name,
      items,
      summary,
    }

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
