# The mark, where it is drawn and what keeps the drawings together

**One geometry, three drawings, and none of them is the original.** The pile is a value —
`PILE` in [`src/components/mark.tsx`](../../src/components/mark.tsx), three spines at three
widths and three small tilts — and every picture of it is that value written out:

| Drawing | File | Why it exists separately |
| --- | --- | --- |
| The chrome's | `src/components/mark.tsx` | inline SVG in `currentColor`, so the mark is set in whatever ink surrounds it |
| The tab's | `src/app/icon.svg` | a favicon has to be a file a browser can fetch and parse on its own, so it states both greys itself |
| The README's | `masthead-light.svg`, `masthead-dark.svg` | loaded through an `<img>`, where the scheme is picked by the `<picture>` around it — hence two files rather than one media query |

[`src/components/mark.test.ts`](../../src/components/mark.test.ts) is what keeps the three
from becoming three logos: it reads both files, parses the rectangles and holds them to
`PILE`, exactly as it already did for the favicon. Edit one drawing and the others fail.

## The two greys, and the third colour that is not there

`--paper` and `--ink` from [`globals.css`](../../src/app/globals.css), converted to sRGB:
`#f0f0f0`/`#1b1b1b` on the light ground, `#101010`/`#e8e8e8` on the dark one. They are the
same pair [`outside-the-cascade.ts`](../../src/app/outside-the-cascade.ts) names for the
surfaces the stylesheet cannot reach, and `palette.test.ts` is what pins them to the
stylesheet.

Everything quieter in the masthead — the hairline under the wordmark, the line of serif
beneath it — is **ink at an opacity** rather than a fourth value. A picture nobody re-reads
is exactly where a stale hex survives a palette change, and there is none here to go stale.
The application spends its whole colour budget on one tint derived from a Series, and the
mark deliberately leaves room for it.

## The faces

`Archivo` for the word, `Source Serif 4` for the line under it — the application's own two,
named first in the SVG and then fallen back through a stack. A README is read on somebody
else's machine and there is no `next/font` out here to serve them, so what a stranger sees
is the fallback and that is fine: the mark carries the identity, the type follows it.

## Changing it

Change `PILE`, run `pnpm test`, and the two SVGs will tell you they no longer agree. Write
the same numbers into them — the `transform` string is `turn()` in `mark.tsx`, rounded the
way that function rounds, because `4.4 + 14.6 / 2` is not `11.7` in binary floating point.

The masthead is XML before it is a picture: **a comment carrying a double hyphen makes the
whole file unparseable**, and GitHub renders a broken-image icon rather than saying so. That
is a test too, which is why it is written down here rather than learned twice.
