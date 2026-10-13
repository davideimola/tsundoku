# The chrome is bound in cloth, and names are set in a serif

**This supersedes the rule #18 wrote into `src/app/globals.css`: *the chrome carries no accent
hue*.** That rule spent the application's whole colour budget on one thing — the tint a Series
derives for its spines and tiles — and left everything else paper, ink and two greys, on the
argument that a chrome with an accent of its own would compete with the library for the one
thing the owner is meant to look at. It was a deliberate decision and `src/app/palette.test.ts`
held it: seven primitives of chroma exactly zero, and a refusal red kept under a ceiling so
that it could never become an accent.

It is retired because of what it produced rather than what it intended. **The owner judged the
result generic**, and the judgement was made by comparison: next to kanpai, an application on
the same stack that had chosen its colours and its faces, tsundoku read as a tool nobody had
dressed. The reasons are concrete and they compound:

- **Seven tokens of zero chroma are shadcn's `neutral` theme.** The rule did not produce a
  restrained identity; it produced the default, and the default is what every unfinished
  interface looks like. In a dark room it was `oklch(0.175 0 0)` — a switched-off screen, not
  a night.
- **The library's tint could not carry the whole identity alone.** A tint fixed at one
  lightness and a low chroma reads, on a tile with no image, as a placeholder that has not
  loaded — and every surface around it was grey, so there was nothing for it to sit against.
- **Monospaced, letterspaced capitals were doing the work colour should have done.** With
  nothing else allowed to be loud, labels, filters, actions and figures were all set in the
  mono eyebrow — about 120 uses of `font-mono` and 136 of tracked capitals — and the
  application read as a terminal rather than as a library.
- **Headings had no voice.** Titles were set in the same grotesque as the body, at a normal
  weight; the serif was loaded and kept for the owner's prose alone, in small italic.

## What replaces it

**A palette taken from the object the library is about: a bound book.**

- **Paper and ink keep a temperature.** The ground is newsprint, grey with a thread of warmth;
  the ink is printer's ink, black with a thread of blue. Neither is a colour, and the wall
  holds them under a stated chroma ceiling so that neither becomes one.
- **Cloth is the action colour** — bookcloth indigo, the colour of a clothbound spine. It is
  the filled button, the link that does something, the chip that is on, the destination the
  owner is at and the focus ring. It has a text spelling and a surface spelling, because in a
  dark room the two cannot be one value and both stay legible.
- **Gilt is a rare second accent** — the gilded edge of a page block. It marks progress and
  what is finished or judged, and it is never spent on an action.
- **The dark room is blue-black**, night ink rather than neutral black, and every token is
  redeclared for it.
- **The refusal stays its own red**, and is held *apart from cloth* by the wall: an action and
  a refusal are the two things a screen most often puts side by side, and they must never be
  mistaken for each other. Indigo was chosen over a ribbon red for exactly this reason.

The library's tint is untouched by this decision and still the only colour a screen computes;
its own wall still holds it.

**Type gets a voice.** Newsreader, a display serif with an optical-size axis, becomes the face
of **names**: a page's title, a Story's, a Volume's and a Series' name in a header or a list, a
section heading, a big figure. Archivo stays the interface's face. The rule that *the serif is
the owner's voice* survives in a narrower form: **the owner's own prose is the serif's
italic**, so a Rating's words and an Edition note stay visibly theirs now that the
application's headings share the family. Source Serif 4 is retired rather than kept beside it —
one serif, two registers.

**The mono eyebrow goes.** Labels are small sans in sentence case. Monospace is kept for ISBNs
and tabular data inside a table and nowhere else; a count or a date elsewhere is
`tabular-nums` in whichever face it stands in. Actions that were tracked capitals with an
underline are text buttons in sentence case — cloth for the act a screen is for, quiet ink for
the rest — and a filter is a chip whose chosen value is filled with cloth.

**The mark takes the palette.** Three stacked spines bound in cloth, gilt and ink, beside the
word *tsundoku* in the serif, lowercase — not a letterspaced logotype. One geometry still
draws every picture of it, and `src/components/mark.test.ts` still holds them together.

## What the wall holds now

`src/app/palette.test.ts` stops proving that no colour exists and proves instead that the ones
that do are **named, bounded and legible**: every primitive declared on both grounds and named
once; the neutrals under their ceiling; cloth an indigo of real chroma, as text and as a
surface; gilt present; the refusal red and a stated distance round the hue circle from cloth;
and every contrast computed against WCAG — ink at 7:1, quiet ink, refusal and cloth-as-text at
4.5:1, paper-coloured words on a cloth button at 4.5:1, and gilt and the edge of a field at 3:1
as marks. No screen names a colour, as before.

## Consequences

- One colour the approved palette named was moved to clear the wall: the light field edge,
  `--rule-field`, is a step darker than the swatch it was taken from, because the swatch
  measured 2.84:1 against paper and the edge of a box the owner types in is held to 3:1.
- Every screen's eyebrow, action link, chip and figure changed in the same tranche as the
  tokens, because leaving the mono capitals in place under a coloured chrome would have kept
  the terminal and only tinted it.
- The long explanations of the data model that opened most screens are gone from the top of
  them. Each screen opens with one short line under its title; a sentence the owner genuinely
  needs is kept where it is relevant or behind a *How this works* disclosure, rather than
  deleted.
- The door, *Add to the library*, is no longer the one filled block across the top of the
  sidebar: it is a quiet line in the desk's chrome beside the finder, and the cloth button in
  the header of Home. On a phone it stays where it was.

## Addendum: the second tranche — the covers are the heart of it

The first tranche dressed the chrome. The second turns to what the chrome is around, and the
owner's verdict on it was short: **the covers are the heart of the app, so show them clean.**

- **One cover, everywhere.** Every tile — the walls, Home, the Pile's rows, a Series, a Wish,
  an acquisition, a stop on a Path, the hero of a detail page — is `src/components/cover.tsx`,
  and it is one shape: two by three, `object-fit: cover`, a four-pixel corner, the shadow a
  book throws on a shelf and a crease at the spine. No per-Type shape, and no tile taller than
  its neighbours.
- **Nothing is printed on a real jacket.** The Binding, the Type, the score, the dash for a
  score nobody gave, the title band and the volume number all came off the image; the
  Binding and the Type are said on the detail page. Under a tile there is at most one quiet
  line, and only where it means something: how far a run has got (with a thin gilt line), how
  many Stories a stacked Volume binds, which number of a Series this is. The run's stack of
  edges behind a jacket (#34) is retired with the rest, because the paper stack below now
  says something else and two stacked pictures meaning two things would be one too many.
- **Where there is no jacket the cover is drawn** — the Series' cloth, a darker headband, the
  title stamped in the serif — and it is always underneath the jacket, so one that fails to
  load leaves the drawn cover rather than a hole, with no script.
- **The tint is bookcloth.** `src/lib/tint.ts` moved from a pastel printed in ink to a deep,
  dusty cloth (L 0.42, C 0.07 on paper, a step deeper in the dark) lettered in light; it is
  still derived and stable, and its wall now walks every hue against the lettering at 7:1.
  The marks a cover is bound with — the shadows, the crease, the headband — are colours, so
  they live beside the tint as `BINDING`, the one file allowed to name one.
- **Stories bound in one Volume are one tile.** Where several Stories on a wall borrow the same
  jacket, the wall draws it once, faced out of two sheets of paper, with *N stories inside*
  under it, and it opens a sheet listing them with a way onto the Volume. The sheet is a
  drawer whose open state is the URL, so it works with nothing running. The Story wall's query
  does not name the Volume that lends a jacket, so the grouping is by the jacket's address
  (`src/components/bound-together.ts`) and the Volume is found among the house's by the same
  address — an approximation stated where it is made.
- **A rating is a bookmark** (`src/components/rating-mark.tsx`): a ribbon filled with cloth to
  the score, the figure beside it in the serif — *9*, *7.5* — named *Rated 9 out of 10*. An
  absent score is said in words, *Not rated yet*, with the act that fills it.
- **A drawer takes the keyboard where a script runs**: the panel is focused as it opens and
  `Escape` goes where its close link goes. Without one it is the page it always was.
- **Detail pages open with the cover.** A Story, a Volume and a Series open with a large clean
  cover beside the Type and state, the name at the name scale, the creators in the serif, the
  bookmark where there is a rating, one cloth act and outlined secondaries; below, sections
  separated by rules replace the stack of cards. A Series' slots are a shelf of spines — the
  owned ones in the Series' cloth with the title up the spine, the missing ones dashed — under
  *N of M in the house* and a gilt bar.
- **On a phone the door is the centre of the bar.** The bottom bar is Home, the Pile, a raised
  round cloth *+* that is *Add to the library*, the Collection and More; the Inbox leaves the
  bar for a tray in the phone's header with its count on a small cloth badge, and stays behind
  More. The door is still not a destination in the map.
- **The Collection narrows with chips**: a row of Types and three small `<details>` menus for
  Series, publisher and Binding, all plain links that keep the filters in the URL.
