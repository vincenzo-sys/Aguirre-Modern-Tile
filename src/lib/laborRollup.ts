import type { SupabaseClient } from '@supabase/supabase-js'

// Recomputes a job's labor actuals from its labor_entries and rewrites the
// job-cost rollup (migration 039):
//   actual_labor_cost = SUM(labor_entries.labor_cost)
//   actual_cost       = COALESCE(actual_materials_cost, 0) + actual_labor_cost
//
// Shared by the dashboard labor route and the public (crew token) labor route
// so both keep job costing consistent. Returns the new totals.
export async function recomputeJobLaborActuals(
  supabaseAdmin: SupabaseClient,
  jobId: string
): Promise<{ actual_labor_cost: number; actual_cost: number; total_hours: number }> {
  const { data: entries } = await supabaseAdmin
    .from('labor_entries')
    .select('hours, labor_cost')
    .eq('job_id', jobId)

  const totalLabor = Math.round(
    (entries ?? []).reduce((sum, e) => sum + (Number(e.labor_cost) || 0), 0) * 100
  ) / 100
  const totalHours = Math.round(
    (entries ?? []).reduce((sum, e) => sum + (Number(e.hours) || 0), 0) * 100
  ) / 100

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('actual_materials_cost')
    .eq('id', jobId)
    .single()

  const materials = Number(job?.actual_materials_cost ?? 0)
  const actualCost = Math.round((materials + totalLabor) * 100) / 100

  await supabaseAdmin
    .from('jobs')
    .update({ actual_labor_cost: totalLabor, actual_cost: actualCost })
    .eq('id', jobId)

  return { actual_labor_cost: totalLabor, actual_cost: actualCost, total_hours: totalHours }
}

// Resolves the hourly rate to snapshot for a labor entry: explicit hour_rate,
// else day_rate / 8.
export function resolveHourRate(crew: { hour_rate?: number | null; day_rate?: number | null }): number {
  if (crew.hour_rate != null && Number.isFinite(Number(crew.hour_rate))) {
    return Number(crew.hour_rate)
  }
  const day = Number(crew.day_rate ?? 0)
  return day > 0 ? Math.round((day / 8) * 100) / 100 : 0
}
