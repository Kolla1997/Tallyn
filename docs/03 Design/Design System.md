---
type: guide
status: draft
owner: Dinesh
updated: 2026-10-08
tags: [design, tokens]
---

# Design System

> [!note] Token values are defined in `design-tokens.json` at the repo root, and `web/` consumes them. This note explains the tokens and how to use them. If the two disagree, the JSON wins: fix this note.

## Color
| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | #FFFFFF | #0F1115 | Page background |
| `--color-surface` |  |  | Cards, panels |
| `--color-text` |  |  | Body text |
| `--color-text-muted` |  |  | Secondary text |
| `--color-primary` |  |  | Brand / primary action |
| `--color-accent` |  |  | Highlights |
| `--color-success` |  |  |  |
| `--color-warning` |  |  |  |
| `--color-danger` |  |  |  |
| `--color-border` |  |  |  |

Contrast: body text ≥ 4.5:1, large text and UI ≥ 3:1.

## Typography
| Role | Font | Size / line height | Weight |
|---|---|---|---|
| Display |  | 40/48 | 700 |
| H1 |  | 32/40 | 700 |
| H2 |  | 24/32 | 600 |
| Body |  | 16/24 | 400 |
| Small |  | 14/20 | 400 |
| Mono |  | 14/20 | 400 |

## Spacing and layout
- Base unit: 4 px. Scale: 4, 8, 12, 16, 24, 32, 48, 64
- Radius: sm 4 · md 8 · lg 16 · full
- Breakpoints: 640 / 768 / 1024 / 1280
- Shadows: sm / md / lg (define)

## Iconography
- Set: > [!todo] e.g. Lucide / Phosphor
- Stroke 1.5 px, 24 px grid

## Components
| Component | Status | Notes / link |
|---|---|---|
| Button | draft | primary / secondary / ghost / danger |
| Input | draft |  |
| Card | draft |  |
| Modal | draft |  |
| Toast | draft |  |
| Nav | draft |  |

## Design files
- Figma / Canva: > [!todo] link
- Exported assets: `brand/`

## Decisions
| Date | Decision | Why |
|---|---|---|

Related: [[UI Patterns]] · [[Logo Guide]]
