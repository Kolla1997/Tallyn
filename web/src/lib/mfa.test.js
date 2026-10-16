import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifiedAuthenticators, verifyCode } from './mfa.js'

// More than one authenticator (#23): a code is tried against each.
const mfa = { listFactors: vi.fn(), challengeAndVerify: vi.fn() }
vi.mock('./supabase.js', () => ({
  supabase: {
    auth: {
      mfa: new Proxy(
        {},
        {
          get:
            (_, k) =>
            (...a) =>
              mfa[k](...a),
        },
      ),
    },
  },
}))

describe('mfa', () => {
  beforeEach(() => Object.values(mfa).forEach((f) => f.mockReset()))

  it('lists only verified authenticators', async () => {
    mfa.listFactors.mockResolvedValue({
      data: {
        totp: [
          { id: 'a', status: 'verified' },
          { id: 'b', status: 'unverified' },
          { id: 'c', status: 'verified' },
        ],
      },
    })
    expect((await verifiedAuthenticators()).map((f) => f.id)).toEqual(['a', 'c'])
  })

  it('accepts a code from the second authenticator', async () => {
    mfa.challengeAndVerify.mockResolvedValueOnce({ error: new Error('Invalid TOTP code') }).mockResolvedValueOnce({ error: null })
    expect(await verifyCode('123456', ['a', 'c'])).toBe(true)
    expect(mfa.challengeAndVerify.mock.calls).toEqual([[{ factorId: 'a', code: '123456' }], [{ factorId: 'c', code: '123456' }]])
  })

  it('is false when none accepts it', async () => {
    mfa.challengeAndVerify.mockResolvedValue({ error: new Error('Invalid TOTP code') })
    expect(await verifyCode('000000', ['a', 'c'])).toBe(false)
  })
})
