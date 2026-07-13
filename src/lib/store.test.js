import { describe, it, expect } from 'vitest'
import { localDay, isDue, REVIEW_INTERVALS_DAYS } from './store.js'

describe('localDay', () => {
  it('formats a Date as YYYY-MM-DD from LOCAL components (not UTC)', () => {
    // Regression guard: evening study in the Americas must not roll to "tomorrow".
    // Build a local date explicitly so the assertion is timezone-independent.
    const d = new Date(2026, 0, 5, 22, 30) // Jan 5 2026, 22:30 local
    expect(localDay(d)).toBe('2026-01-05')
  })
  it('zero-pads month and day', () => {
    expect(localDay(new Date(2026, 2, 9, 1, 0))).toBe('2026-03-09')
  })
  it('accepts an ISO string', () => {
    // localDay(new Date(iso)) — uses local components of the parsed instant
    const d = new Date(2026, 5, 15, 12, 0)
    expect(localDay(d.toISOString())).toBe('2026-06-15')
  })
})

describe('isDue', () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

  it('never marks an unknown (new, unstarted) word as due', () => {
    expect(isDue({ status: 'unknown', last_reviewed: daysAgo(100) })).toBe(false)
  })
  it('marks a word with no timestamps as due', () => {
    expect(isDue({ status: 'learning' })).toBe(true)
  })
  it('learning word is due after 1 day, not before', () => {
    expect(isDue({ status: 'learning', last_reviewed: daysAgo(0.1) })).toBe(false)
    expect(isDue({ status: 'learning', last_reviewed: daysAgo(2) })).toBe(true)
  })
  it('learned word rests ~14 days then returns (no silent decay)', () => {
    expect(isDue({ status: 'learned', last_reviewed: daysAgo(3) })).toBe(false)
    expect(isDue({ status: 'learned', last_reviewed: daysAgo(15) })).toBe(true)
  })
  it('trouble word comes back the same day (short interval)', () => {
    expect(isDue({ status: 'trouble', last_reviewed: daysAgo(0.5) })).toBe(true)
  })
  it('falls back to status_updated_at / created_at when last_reviewed is null', () => {
    expect(isDue({ status: 'recognize', last_reviewed: null, status_updated_at: daysAgo(5) })).toBe(true)
    expect(isDue({ status: 'recognize', last_reviewed: null, created_at: daysAgo(0.1) })).toBe(false)
  })
})

describe('REVIEW_INTERVALS_DAYS', () => {
  it('orders intervals so harder statuses resurface sooner', () => {
    expect(REVIEW_INTERVALS_DAYS.trouble).toBeLessThan(REVIEW_INTERVALS_DAYS.learning)
    expect(REVIEW_INTERVALS_DAYS.learning).toBeLessThan(REVIEW_INTERVALS_DAYS.recognize)
    expect(REVIEW_INTERVALS_DAYS.recognize).toBeLessThan(REVIEW_INTERVALS_DAYS.learned)
  })
  it('has no interval for unknown (those are new, not reviews)', () => {
    expect(REVIEW_INTERVALS_DAYS.unknown).toBeUndefined()
  })
})
