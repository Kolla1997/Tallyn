// 6-digit authenticator codes (RFC 6238: SHA-1, 30-second steps), so tests can
// pass 2FA the way a person does with their app (#113). Node's crypto only.
import { createHmac } from 'node:crypto'

const STEP = 30

function base32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    const v = alphabet.indexOf(ch)
    if (v < 0) throw new Error('not a base32 secret')
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export function totp(secret, step = Math.floor(Date.now() / 1000 / STEP)) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', base32(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

// A code from a step this secret hasn't used yet, waiting for the next step if
// needed, so a code is never sent twice. Also waits if the step is about to
// end, so the code doesn't run out on its way to the server.
const lastStep = new Map()
export async function freshCode(secret) {
  for (;;) {
    const now = Date.now() / 1000
    const step = Math.floor(now / STEP)
    const left = STEP - (now % STEP)
    if (step > (lastStep.get(secret) ?? -1) && left > 3) {
      lastStep.set(secret, step)
      return totp(secret, step)
    }
    await new Promise((r) => setTimeout(r, (left + 0.2) * 1000))
  }
}
