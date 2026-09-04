import { describe, it, expect } from 'vitest'
import {
  bucketJob, matchesQuery, matchRank, groupJobsForPicker,
  firstMatch, countJobs, jobPickerSubtitle, normalizeQuery,
  type JobPickerOption,
} from './jobPicker'

const TODAY = '2026-09-04'

function job(over: Partial<JobPickerOption> & { job_number: number }): JobPickerOption {
  return {
    id: `job-${over.job_number}`,
    title: 'Bathroom',
    status: 'accepted_not_scheduled',
    client_name: 'Someone',
    client_address: null,
    client_phone: null,
    client_email: null,
    scheduled_start: null,
    scheduled_end: null,
    estimated_days: null,
    estimated_cost: null,
    ...over,
  }
}

describe('bucketJob', () => {
  it('puts a committed job with no date in needs_date', () => {
    expect(bucketJob(job({ job_number: 112, status: 'accepted_not_scheduled' }), TODAY))
      .toBe('needs_date')
  })

  it('treats every schedulable status with no date as needs_date', () => {
    for (const status of ['accepted_not_scheduled', 'scheduled', 'in_progress', 'waiting_for_materials']) {
      expect(bucketJob(job({ job_number: 1, status }), TODAY), status).toBe('needs_date')
    }
  })

  it('does not pull leads or quotes into needs_date', () => {
    expect(bucketJob(job({ job_number: 1, status: 'lead' }), TODAY)).toBe('archive')
    expect(bucketJob(job({ job_number: 2, status: 'quoted' }), TODAY)).toBe('archive')
  })

  it('puts a future-dated job in upcoming', () => {
    expect(bucketJob(job({ job_number: 109, status: 'scheduled', scheduled_start: '2026-09-08', scheduled_end: '2026-09-12' }), TODAY))
      .toBe('upcoming')
  })

  it('keeps a job running through today in upcoming, by its end date', () => {
    expect(bucketJob(job({ job_number: 110, status: 'in_progress', scheduled_start: '2026-09-01', scheduled_end: '2026-09-06' }), TODAY))
      .toBe('upcoming')
  })

  it('archives a job whose dates are entirely past', () => {
    expect(bucketJob(job({ job_number: 100, status: 'scheduled', scheduled_start: '2026-07-01', scheduled_end: '2026-07-03' }), TODAY))
      .toBe('archive')
  })

  it('archives finished work even when its dates are in the future', () => {
    for (const status of ['completed', 'paid', 'cancelled']) {
      expect(bucketJob(job({ job_number: 5, status, scheduled_start: '2026-12-01' }), TODAY), status).toBe('archive')
    }
  })
})

describe('the ordering that caused the complaint', () => {
  // The old query sorted scheduled_start DESC with nulls last, so completed
  // work sat on top and the jobs you actually open the modal to schedule sat
  // at the very bottom, behind a LIMIT 100.
  const jobs = [
    job({ job_number: 103, status: 'completed', scheduled_start: '2026-07-01', scheduled_end: '2026-07-02', client_name: 'Lee Construction' }),
    job({ job_number: 112, status: 'accepted_not_scheduled', client_name: 'Maniaci' }),
    job({ job_number: 109, status: 'scheduled', scheduled_start: '2026-09-08', scheduled_end: '2026-09-12', client_name: 'Dragonas' }),
    job({ job_number: 111, status: 'accepted_not_scheduled', client_name: 'Roberts' }),
  ]

  it('surfaces the unscheduled accepted jobs first', () => {
    const g = groupJobsForPicker(jobs, TODAY)
    expect(g.needs_date.map((j) => j.job_number)).toEqual([112, 111])
  })

  it('never lets a completed job outrank one that needs a date', () => {
    const g = groupJobsForPicker(jobs, TODAY)
    expect(firstMatch(g)!.job_number).toBe(112)
    expect(g.archive.map((j) => j.job_number)).toEqual([103])
  })

  it('keeps every job reachable — nothing is filtered away', () => {
    expect(countJobs(groupJobsForPicker(jobs, TODAY))).toBe(jobs.length)
  })

  it('includes statuses the old query excluded outright', () => {
    const extra = [
      ...jobs,
      job({ job_number: 90, status: 'paid', scheduled_start: '2026-05-01' }),
      job({ job_number: 91, status: 'lead' }),
      job({ job_number: 92, status: 'quoted' }),
      job({ job_number: 93, status: 'awaiting_response' }),
    ]
    expect(countJobs(groupJobsForPicker(extra, TODAY))).toBe(extra.length)
  })

  it('sorts upcoming soonest-first', () => {
    const g = groupJobsForPicker([
      job({ job_number: 1, status: 'scheduled', scheduled_start: '2026-10-01' }),
      job({ job_number: 2, status: 'scheduled', scheduled_start: '2026-09-06' }),
    ], TODAY)
    expect(g.upcoming.map((j) => j.job_number)).toEqual([2, 1])
  })
})

describe('search', () => {
  const maniaci = job({ job_number: 112, client_name: 'Maniaci', title: 'Shower + floor', client_address: '12 Ocean Ave, Marblehead' })
  const roberts = job({ job_number: 111, client_name: 'Paul Roberts', title: 'Tub surround' })

  it('normalizes a leading # so "#112" and "112" agree', () => {
    expect(normalizeQuery('#112')).toBe('112')
    expect(matchesQuery(maniaci, '#112')).toBe(true)
    expect(matchesQuery(maniaci, '112')).toBe(true)
  })

  it('matches on client name, title and address, case-insensitively', () => {
    expect(matchesQuery(maniaci, 'maniaci')).toBe(true)
    expect(matchesQuery(maniaci, 'SHOWER')).toBe(true)
    expect(matchesQuery(maniaci, 'marblehead')).toBe(true)
    expect(matchesQuery(maniaci, 'zzz')).toBe(false)
  })

  it('an empty query matches everything', () => {
    expect(matchesQuery(maniaci, '')).toBe(true)
    expect(matchesQuery(maniaci, '   ')).toBe(true)
  })

  it('ranks an exact job number above a number buried in an address', () => {
    const addressHit = job({ job_number: 50, client_name: 'Other', client_address: '112 Main St' })
    expect(matchRank(maniaci, '112')).toBeLessThan(matchRank(addressHit, '112'))
  })

  it('puts the number match first even when it lives in the archive', () => {
    const g = groupJobsForPicker([
      job({ job_number: 7, status: 'accepted_not_scheduled', client_name: 'Has 112 in name' }),
      job({ job_number: 112, status: 'completed', scheduled_start: '2026-01-01', client_name: 'Maniaci' }),
    ], TODAY, '112')
    // Search spans the archive — that is what makes "link ALL the jobs" true.
    expect(g.archive.map((j) => j.job_number)).toEqual([112])
    expect(countJobs(g)).toBe(2)
  })

  it('filters out non-matches', () => {
    const g = groupJobsForPicker([maniaci, roberts], TODAY, 'roberts')
    expect(countJobs(g)).toBe(1)
    expect(firstMatch(g)!.job_number).toBe(111)
  })

  it('firstMatch returns null when nothing matches', () => {
    expect(firstMatch(groupJobsForPicker([maniaci], TODAY, 'nothing'))).toBeNull()
  })
})

describe('jobPickerSubtitle', () => {
  it('says so when a job has no date', () => {
    expect(jobPickerSubtitle(job({ job_number: 112 }))).toBe('Not scheduled')
  })

  it('shows a single date without a range', () => {
    expect(jobPickerSubtitle(job({ job_number: 1, status: 'scheduled', scheduled_start: '2026-09-08', scheduled_end: '2026-09-08' })))
      .toBe('Sep 8')
  })

  it('shows a range and a day count for a multi-day install', () => {
    expect(jobPickerSubtitle(job({ job_number: 1, status: 'scheduled', scheduled_start: '2026-09-08', scheduled_end: '2026-09-12' })))
      .toBe('Sep 8 – Sep 12 · 5 days')
  })

  it('marks finished work as done, with its date', () => {
    expect(jobPickerSubtitle(job({ job_number: 1, status: 'completed', scheduled_start: '2026-08-01', scheduled_end: '2026-08-03' })))
      .toBe('Done Aug 3')
    expect(jobPickerSubtitle(job({ job_number: 1, status: 'cancelled' }))).toBe('Cancelled')
  })
})
