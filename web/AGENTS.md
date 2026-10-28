# AGENTS.md — web/ UI libraries (#183, ADR 0016)

Rules for the draft lab's component libraries. Tallyn's own rules in the root `CLAUDE.md` come first.

- **Where:** Tailwind and shadcn styles load only in `lab.html` (`src/lab/`). Don't import `src/lab/lab.css` or Tailwind classes into the app's screens without a ticket.
- **Install with the shadcn CLI, never by pasting code:** `npx shadcn@latest add @bklit/<name>` (charts) or `npx shadcn@latest add @kokonutui/<name>` (free components). Run it in `web/`. If npm fails with `edgesOut`, install the missing package with `npx npm@11 i`.
- **Check the lists before building from scratch:** Bklit `https://bklit.com/r/registry.json`, Kokonut `https://kokonutui.com/r/registry.json`.
- **Kokonut UI Pro is not set up.** No key, no `@kokonutui-pro` registry.
- **Installed components are project code.** They live in `src/components/charts/` and `src/components/kokonutui/`; lint skips them. To change one, edit it in place and note the change in the commit.
- **taste-skill still decides the look:** strip glows, gradients and entrance animations from a component before using it in a Tallyn draft, and draw charts to its chart rules (one colour on the main data, quiet gridlines, a scale).
- **anime.js** (`import { animate } from 'animejs'`) is for feedback only: press, hover, a row arriving. Respect `prefers-reduced-motion`.
