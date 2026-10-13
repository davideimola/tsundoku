# The mark, where it is drawn and what keeps the drawings together

**One geometry, four drawings, and none of them is the original.** The pile is a value —
`PILE` in [`src/components/mark.tsx`](../../src/components/mark.tsx), three spines at three
widths, staggered, each bound in one of the palette's three inks — and every picture of it is
that value written out:

| Drawing | File | Why it exists separately |
| --- | --- | --- |
| The chrome's | `src/components/mark.tsx` | inline SVG filled with the tokens, so the mark follows the ground it is on |
| The tab's | `src/app/icon.svg` | a favicon has to be a file a browser can fetch and parse on its own, so it states both grounds' colours itself |
| The home screen's | `src/app/apple-icon.tsx`, `src/app/icon1.tsx` | PNGs rendered from `PILE` itself, so they import the geometry rather than copy it |
| The README's | `masthead-light.svg`, `masthead-dark.svg` | loaded through an `<img>`, where the scheme is picked by the `<picture>` around it — hence two files rather than one media query |

[`src/components/mark.test.ts`](../../src/components/mark.test.ts) is what keeps them from
becoming several logos: it reads the favicon and both mastheads, parses the rectangles and
holds them — position, size and binding — to `PILE`. Edit one drawing and the others fail.

## The colours

The mark is **bound in cloth, gilt and ink** (ADR-0026): bookcloth indigo on top, the gilded
edge in the middle, printer's ink at the bottom — the action colour, the second accent and the
ink everything else is printed in, seen together once. On a page they are the tokens
`--cloth-fill`, `--gilt` and `--ink` from [`globals.css`](../../src/app/globals.css); outside
it, converted to sRGB:

| | Paper | Cloth | Gilt | Ink |
| --- | --- | --- | --- | --- |
| Light | `#f2f0ea` | `#2f3f7a` | `#a77b22` | `#232836` |
| Dark | `#161a23` | `#3d4f98` | `#d9b062` | `#e9e6de` |

They are the same values [`outside-the-cascade.ts`](../../src/app/outside-the-cascade.ts)
names for the surfaces the stylesheet cannot reach, and `palette.test.ts` is what pins them to
the stylesheet.

Everything quieter in the masthead — the line of serif beneath the name — is **ink at an
opacity** rather than a further value. A picture nobody re-reads is exactly where a stale hex
survives a palette change, and there is none here to go stale.

## The word

**`tsundoku`, lowercase, in Newsreader at 600**, set a hair tight and never letterspaced: a
word, not a logotype spelled out in capitals. `Wordmark` in `mark.tsx` is the mark and the
word together, and it is what the sidebar and the sign-in screen carry. The line under it in
the masthead is the same serif's italic, which is the register the application keeps for the
owner's own voice.

A README is read on somebody else's machine and there is no `next/font` out there to serve the
face, so the SVG names Newsreader first and falls back through a serif stack. What a stranger
sees may be the fallback, and that is fine: the mark carries the identity, the type follows it.

## Changing it

Change `PILE`, run `pnpm test`, and the favicon and both mastheads will tell you they no longer
agree. Write the same numbers into them, with each spine's binding as its class.

The masthead is XML before it is a picture: **a comment carrying a double hyphen makes the
whole file unparseable**, and GitHub renders a broken-image icon rather than saying so. That
is a test too, which is why it is written down here rather than learned twice.
