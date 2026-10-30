import { describe, expect, it } from 'vitest'
import { curveResample } from './metric-card.jsx'

// The chart's line runs 100px tall (H - 2 * PAD_Y), so one height unit is 100px.
const PX = 100

// Where the landed line (toPath's Catmull-Rom curve) sits halfway between two days.
function drawnMidpoint(values, day) {
  const p0 = values[day - 1] ?? values[day]
  const p1 = values[day]
  const p2 = values[day + 1]
  const p3 = values[day + 2] ?? p2
  return (p1 + 3 * (p1 + (p2 - p0) / 6) + 3 * (p2 - (p3 - p1) / 6) + p2) / 8
}

describe('curveResample (#221)', () => {
  // A week of spending with one big day.
  const week = [0.2, 0.3, 0.25, 1, 0.35, 0.3, 0.4]
  // 181 samples over 6 gaps: a day every 30 samples, halfway between at +15.
  const samples = curveResample(week, 181)

  it('passes through every day', () => {
    week.forEach((v, day) => expect(samples[day * 30]).toBeCloseTo(v, 10))
  })

  it('ends a morph on the line it lands on, between the days too', () => {
    for (let day = 0; day < week.length - 1; day++) {
      expect(Math.abs(samples[day * 30 + 15] - drawnMidpoint(week, day)) * PX).toBeLessThan(0.01)
    }
  })

  it('needs to: a straight line between days misses the drawn curve by more than 1px', () => {
    const misses = week.slice(0, -1).map((v, day) => Math.abs((v + week[day + 1]) / 2 - drawnMidpoint(week, day)) * PX)
    expect(Math.max(...misses)).toBeGreaterThan(1)
  })

  it('stays flat without history', () => {
    expect(curveResample([], 5)).toEqual([0, 0, 0, 0, 0])
  })
})
