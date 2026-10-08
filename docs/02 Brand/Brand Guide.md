---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
issue: 10
tags: [brand]
---
# Brand Guide

## Idea
**Tallyn** is a family finance app. People connect bank accounts in any currency, see one total, track spending and savings, and open joint accounts for partners, kids and parents. The name joins *tally* (counting) and *kin* (family). Tagline: **It all adds up.** Promise: your money, your family, everything adds up. See [[Vision]].

Write the name **Tallyn**: capital T, never all-caps in body text.

## Personality
Warm, trustworthy, modern, family-friendly, smart, simple, premium but approachable. Financial without feeling like a traditional bank.

## Palette: Sage & Clay
Values are defined in `design-tokens.json`. This note describes how to use them.

| Name | Use |
|---|---|
| Clay | Brand accent, right leaf, the "y". Graphics and large text only |
| Clay Deep | Buttons with white text, links, small clay text |
| Sage | Left leaf, tags, illustrations |
| Sage Deep | Small sage text on cream |
| Sage Light | Sage on dark surfaces |
| Cocoa | Text, header, footer, dark surfaces |
| Cream | Page background, text on dark |
| Sand | Section bands, subtle fills |
| White | Cards, inputs, text on Clay Deep |
| Success / Warning / Error | Positive amounts, pending, negative amounts and errors |

Rough balance: 60% cream or white, 30% cocoa and sand, 10% clay and sage.

## Typography
| Role | Font |
|---|---|
| Headlines, card titles, currency amounts | Space Grotesk 700 |
| Body | Montserrat 400/500 |
| Buttons, navigation | Bricolage Grotesque 700 |
| Wordmark | Jedira, outlined (see [[Logo Guide]]) |

Currency amounts always use tabular figures. Font files are in `brand/fonts/` (SIL OFL).

## Communications checklist
Before anything goes out (site, social, deck, email, app store):
- [ ] Uses an approved logo variant with correct clear space
- [ ] Colors come from `design-tokens.json` only
- [ ] Copy matches [[Voice and Tone]]
- [ ] Product claims match [[Vision]]. No promises about returns or security beyond what's true
- [ ] No real customer financial data in screenshots

## Related
[[Logo Guide]] · [[Voice and Tone]] · [[Design System]] · [[Animation Guide]]

## Decisions
| Date | Decision | Why |
|---|---|---|
| 2026-10-08 | Tagline "It all adds up." | From README |
| 2026-10-08 | Palette is Sage & Clay | Warmer and less bank-like than teal and navy |
| 2026-10-08 | Mark is a dot above two leaves | A person and a sprout; reads at 16px |
| 2026-10-08 | Add Clay Deep and Sage Deep | Clay with white text is 4.4:1, below AA for small text |
| 2026-10-08 | Currency amounts fixed to Space Grotesk | Consistent, tabular numbers |
