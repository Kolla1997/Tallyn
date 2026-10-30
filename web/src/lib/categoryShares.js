// The By category card's numbers (#253): each category's share of everything spent, rounded so the
// shares add up to exactly 100%; categories under 5% folded into "Other"; and the finding the card
// leads with. Shares are of the categories' own total, so the receipt's "Spent" line is the sum of
// the rows above it.

export const FOLD_BELOW = 0.05

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']

// Largest remainder: round down, then give the leftover points to the biggest remainders.
export function roundedShares(amounts) {
  const total = amounts.reduce((s, v) => s + v, 0)
  if (total <= 0) return amounts.map(() => 0)
  const raw = amounts.map((v) => (v / total) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((s, v) => s + v, 0)
  raw
    .map((v, i) => [v - Math.floor(v), i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (left > 0) {
        out[i] += 1
        left -= 1
      }
    })
  return out
}

// cats: [{ category, amount_minor }], largest first (as the API sends them).
export function categoryShares(cats) {
  const list = cats.filter((c) => c.amount_minor > 0)
  const total = list.reduce((s, c) => s + c.amount_minor, 0)
  if (total <= 0) return null
  const max = list[0].amount_minor
  const big = list.filter((c) => c.amount_minor / total >= FOLD_BELOW)
  let small = list.filter((c) => c.amount_minor / total < FOLD_BELOW)
  // Folding a single category into "Other" hides it for nothing: show it as itself.
  if (small.length === 1) {
    big.push(small[0])
    small = []
  }
  const other = small.reduce((s, c) => s + c.amount_minor, 0)
  const parts = [...big.map((c) => ({ ...c })), ...(small.length ? [{ category: 'OTHER', amount_minor: other }] : [])]
  roundedShares(parts.map((p) => p.amount_minor)).forEach((p, i) => (parts[i].pct = p))
  // Four reds, the more spent the redder, as Spending by day draws its days.
  const level = (v) => Math.min(4, Math.max(1, Math.ceil((v / max) * 4)))
  parts.forEach((p) => (p.level = level(p.amount_minor)))
  return {
    total,
    parts,
    // Inside Other, each one's share of the whole; under 1% shows as 0 and is written "<1%".
    small: small.map((c) => ({ ...c, pct: Math.round((c.amount_minor / total) * 100) })),
    bigShare: small.length ? 100 - parts[parts.length - 1].pct : 100,
    bigCount: big.length,
  }
}

// The line the card opens with: who led and by how much, and how much the big ones took.
export function finding(shares, label, money) {
  const [a, b] = shares.parts.filter((p) => p.category !== 'OTHER')
  if (!b) return { strong: `All of it went on ${label(a.category)}.`, rest: '' }
  const rest = `${label(a.category)} led, ${money(a.amount_minor - b.amount_minor)} ahead of ${label(b.category)}.`
  if (shares.small.length && shares.bigCount >= 2 && shares.bigCount < WORDS.length) {
    return { strong: `${WORDS[shares.bigCount]} categories took ${shares.bigShare}% of it.`, rest }
  }
  return { strong: rest, rest: '' }
}
