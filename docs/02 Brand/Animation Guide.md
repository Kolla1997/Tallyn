---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-12
issues: [10, 66]
tags: [brand, motion]
---
# Animation Guide

The logo intro: leaves wobble in (1.6s), the dot pops (0.6s, from 1.0s), "Tallyn" fades up letter by letter, then the tagline. The leaves then breathe gently (2.6s loop).

| Use | File in `brand/animation/` |
|---|---|
| Web app loading (#66) | `SVG/tallyn-mark-animated-light.svg` in `web/src/components/TallynLoader.jsx`, with "Adding it all up" and dots that appear one by one |
| App splash and loading (iOS, Android) | `Lottie/tallyn-mark-intro-*.json`, then `Lottie/tallyn-mark-breathe-*.json` |
| Website | `SVG/tallyn-lockup-animated-*.svg` or `SVG/tallyn-mark-animated-*.svg` |
| Preview in a browser | `HTML/tallyn-logo-intro-*.html` |
| Social, presentations | `Video/*.mp4`, `GIF/*.gif` |

Files exist in `light` and `dark`. The Lottie files animate the mark only.

> [!warning] Not tested on devices
> The Lottie files were loaded and rendered with python-lottie, not on a phone. Test in your target players.

Always show the last frame instead of animating when the user prefers reduced motion. See [[Brand Guide]].

## When filters change (#87)
Dinesh picked option A with count-up numbers. Code: `web/src/lib/motion.js`, `web/src/components/CountUp.jsx`.

| What | Effect |
|---|---|
| Data loading from the server (Transactions filters) | After 150ms (never for fast answers): card content dims to 45% and a thin Clay bar slides along each card's top; `aria-busy` on the area. New content fades in (250ms, ease-out, 3px rise) |
| Instant switches (Accounts person and bank chips, Home Yours / Everyone and its tabs) | The cards that change fade in (250ms) |
| Totals (Spent, Money in, net worth, have / owe, balances) | Count to the new value in 600ms, easing out. Screen readers get only the final value |
| Bars (net worth, credit cards) | Slide to their new sizes (300ms) |

Reduced motion: no sliding bar, rise or counting; a plain 200ms fade only.

## Debts page (#27)
| What | Effect |
|---|---|
| Rings, on first show | Tracks grow in one after another (80ms apart), arcs fill (1.1s, slight overshoot), the total counts up from 0, the legend slides in and its bars fill |
| Pointing at a ring or legend row | That ring glows, the others fade to 28%; the middle shows its amount and share |
| Notched gauges | Filled notches light up one by one (28ms apart) when shown |

Reduced motion: everything appears at once.

