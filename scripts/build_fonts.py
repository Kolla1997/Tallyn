#!/usr/bin/env python3
"""Make the web fonts from the brand font masters (#99).

Each master in brand/fonts/ becomes three WOFF2 files in brand/fonts/web/,
split by characters the way Google Fonts does, and web/src/fonts.css is
written to match. A browser downloads only the parts a page uses:

  latin  English, our symbols (− · ‹ › → ’ …) and common currency signs
  ext    Latin Extended: names such as Zoë or Łukasz, and signs such as ₹
  more   everything else the master covers (for example Cyrillic, Greek,
         Vietnamese), so nothing the master could show falls back

The masters are never changed. Variable weights and OpenType features are
kept, so the fonts look the same as the masters.

Needs fonttools and brotli:  python3 -m pip install fonttools brotli
Run from the repo root:      python3 scripts/build_fonts.py
"""

import os

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERS = os.path.join(ROOT, 'brand', 'fonts')
OUT = os.path.join(MASTERS, 'web')
CSS = os.path.join(ROOT, 'web', 'src', 'fonts.css')

# (family, master file, weight range, web file name)
FONTS = [
    ('Space Grotesk', 'SpaceGrotesk[wght].ttf', '300 700', 'space-grotesk'),
    ('Montserrat', 'Montserrat[wght].ttf', '100 900', 'montserrat'),
    ('Bricolage Grotesque', 'BricolageGrotesque[opsz,wdth,wght].ttf', '200 800', 'bricolage-grotesque'),
]

# Google Fonts' latin range, plus the arrows, ☰ and ✓ Tallyn uses.
LATIN = [
    (0x0000, 0x00FF), (0x0131, 0x0131), (0x0152, 0x0153), (0x02BB, 0x02BC), (0x02C6, 0x02C6),
    (0x02DA, 0x02DA), (0x02DC, 0x02DC), (0x0304, 0x0304), (0x0308, 0x0308), (0x0329, 0x0329),
    (0x2000, 0x206F), (0x20AC, 0x20AC), (0x2122, 0x2122), (0x2190, 0x2193), (0x2212, 0x2212),
    (0x2215, 0x2215), (0x2630, 0x2630), (0x2713, 0x2713), (0xFEFF, 0xFEFF), (0xFFFD, 0xFFFD),
]
# Google Fonts' latin-ext range.
EXT = [
    (0x0100, 0x02BA), (0x02BD, 0x02C5), (0x02C7, 0x02CC), (0x02CE, 0x02D7), (0x02DD, 0x02FF),
    (0x1D00, 0x1DBF), (0x1E00, 0x1E9F), (0x1EF2, 0x1EFF), (0x2020, 0x2020), (0x20A0, 0x20AB),
    (0x20AD, 0x20C0), (0x2113, 0x2113), (0x2C60, 0x2C7F), (0xA720, 0xA7FF),
]


def within(cp, ranges):
    return any(a <= cp <= b for a, b in ranges)


def as_ranges(cps):
    """Sorted code points as CSS unicode-range text."""
    out, cps = [], sorted(cps)
    start = prev = cps[0]
    for cp in cps[1:] + [None]:
        if cp is not None and cp == prev + 1:
            prev = cp
            continue
        out.append(f'U+{start:04X}' if start == prev else f'U+{start:04X}-{prev:04X}')
        if cp is not None:
            start = prev = cp
    return ', '.join(out)


def write_subset(master, cps, path):
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']  # keep every OpenType feature
    options.name_IDs = ['*']
    options.notdef_outline = True
    font = TTFont(master)
    sub = subset.Subsetter(options)
    sub.populate(unicodes=cps)
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(path)


def main():
    os.makedirs(OUT, exist_ok=True)
    css = [
        '/* Brand fonts (SIL OFL) as WOFF2, split by characters (#99). Made by',
        ' * scripts/build_fonts.py from the masters in brand/fonts/: do not edit by',
        ' * hand. The browser downloads only the parts a page uses. */',
    ]
    for family, file, weights, name in FONTS:
        master = os.path.join(MASTERS, file)
        cmap = set(TTFont(master).getBestCmap())
        parts = {
            'latin': {cp for cp in cmap if within(cp, LATIN)},
            'ext': {cp for cp in cmap if within(cp, EXT) and not within(cp, LATIN)},
        }
        parts['more'] = cmap - parts['latin'] - parts['ext']
        for part, cps in parts.items():
            if not cps:
                continue
            out = os.path.join(OUT, f'{name}-{part}.woff2')
            write_subset(master, cps, out)
            print(f'{os.path.relpath(out, ROOT)}: {len(cps)} characters, {os.path.getsize(out) / 1024:.1f} KB')
            css += [
                '',
                '@font-face {',
                f"  font-family: '{family}';",
                f"  src: url('../../brand/fonts/web/{name}-{part}.woff2') format('woff2');",
                f'  font-weight: {weights};',
                '  font-display: swap;',
                f'  unicode-range: {as_ranges(cps)};',
                '}',
            ]
    with open(CSS, 'w') as f:
        f.write('\n'.join(css) + '\n')
    print(f'wrote {os.path.relpath(CSS, ROOT)}')


if __name__ == '__main__':
    main()
