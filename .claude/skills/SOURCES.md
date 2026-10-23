# Outside skills (#141)

Pinned copies of third-party Claude Code skills. Claude loads one on its own when a task matches its description. Tallyn's own rules win over them (CLAUDE.md §6).

To update: re-copy from the source at a newer commit, read the diff, and bump the commit here. Never pull automatically.

| Skill | Source | Commit | License |
|---|---|---|---|
| `emil-design-eng` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | `2d22863` | MIT (`LICENSE-emilkowalski`) |
| `animate` | emilkowalski/skills | `2d22863` | MIT |
| `animation-performance` | emilkowalski/skills | `2d22863` | MIT |
| `break-ui` | emilkowalski/skills | `2d22863` | MIT |
| `improve-animations` | emilkowalski/skills | `2d22863` | MIT |
| `review-animations` | emilkowalski/skills | `2d22863` | MIT. Manual only (`/review-animations`); its author turned off auto-use |
| `hallmark` | [nutlope/hallmark](https://github.com/nutlope/hallmark) | `7ec8682` | MIT (`hallmark/LICENSE`) |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `d14efff` | MIT (`LICENSE-ui-ux-pro-max`) |

Emil's skills are copied unchanged. Changes to the others:
- `hallmark`: left out `scripts/fixtures/` (test pages; its own installer skips them too).
- `ui-ux-pro-max`: left out `scripts/tests/`. In `SKILL.md`, the script path `${CLAUDE_PLUGIN_ROOT}/.claude/skills/...` became `.claude/skills/...` so it runs from the repo root.

Scripts (read before adding, #141):
- `hallmark/scripts/` (Node): `sloplint.mjs` checks HTML/CSS; `--render`, `capture.mjs` and `picture.mjs` need `puppeteer-core` and Chrome. Network: `theme.mjs photos --save` downloads from Wikimedia only; `imagegen.mjs` calls Together AI only when `TOGETHER_API_KEY` is set (it isn't, and must stay off). `install.mjs` and `install-hook.mjs` copy to `~/.claude` and edit `settings.json`: never run them.
- `ui-ux-pro-max/scripts/` (Python, no extra packages): local search over the CSVs in `data/`. No network calls. `--persist` writes a `design-system/` folder: don't use it here (CLAUDE.md §6).

Hallmark's working files go in `.hallmark/` (gitignored). Some mention sibling skills not installed here (`pick-ui-library`, `prototype`, `find-animation-opportunities`, `animate-expo`).
