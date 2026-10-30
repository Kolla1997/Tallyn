import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.fn()
vi.mock('./api.js', () => ({ api: (...a) => api(...a) }))
const { forgetMe, loadMe, startMe } = await import('./me.js')

// The profile starts loading beside the consent check, and is used once (#159).
describe('me', () => {
  beforeEach(() => {
    api.mockReset()
    forgetMe()
  })
  it('hands the early request to the first load, then loads fresh', async () => {
    api.mockResolvedValueOnce({ id: 'early' }).mockResolvedValueOnce({ id: 'fresh' })
    startMe()
    startMe() // a second start doesn't ask again
    expect(api).toHaveBeenCalledTimes(1)
    expect(await loadMe()).toEqual({ id: 'early' })
    expect(await loadMe()).toEqual({ id: 'fresh' })
  })
  it('drops the early request on sign-out', async () => {
    api.mockResolvedValueOnce({ id: 'a' }).mockResolvedValueOnce({ id: 'b' })
    startMe()
    forgetMe()
    expect(await loadMe()).toEqual({ id: 'b' })
  })
})
