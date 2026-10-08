---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
issue: 10
tags: [brand, motion]
---
# Animation Guide

The logo intro: leaves wobble in (1.6s), the dot pops (0.6s, from 1.0s), "Tallyn" fades up letter by letter, then the tagline. The leaves then breathe gently (2.6s loop).

| Use | File in `brand/animation/` |
|---|---|
| App splash and loading (iOS, Android) | `Lottie/tallyn-mark-intro-*.json`, then `Lottie/tallyn-mark-breathe-*.json` |
| Website | `SVG/tallyn-lockup-animated-*.svg` or `SVG/tallyn-mark-animated-*.svg` |
| Preview in a browser | `HTML/tallyn-logo-intro-*.html` |
| Social, presentations | `Video/*.mp4`, `GIF/*.gif` |

Files exist in `light` and `dark`. The Lottie files animate the mark only.

> [!warning] Not tested on devices
> The Lottie files were loaded and rendered with python-lottie, not on a phone. Test in your target players.

Always show the last frame instead of animating when the user prefers reduced motion. See [[Brand Guide]].
