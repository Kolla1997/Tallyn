import { afterEach, describe, expect, it, vi } from 'vitest'
import { newsDefault } from './news.js'

const zone = (timeZone) => vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({ resolvedOptions: () => ({ timeZone }) }))

describe('product news default (#281)', () => {
  afterEach(() => vi.restoreAllMocks())
  it('starts ticked in the US', () => {
    zone('America/Chicago')
    expect(newsDefault()).toBe(true)
  })
  it('starts unticked in Europe, the UK included', () => {
    zone('Europe/London')
    expect(newsDefault()).toBe(false)
    zone('Europe/Berlin')
    expect(newsDefault()).toBe(false)
  })
})
