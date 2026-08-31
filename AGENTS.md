# tsundoku

## Agent skills

### Issue tracker

Issues live as GitHub issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## The application

### Stack and local loop

Next.js, TypeScript, Tailwind, shadcn, biome, vitest, and a Postgres in Docker driven
by one variable. `README.md` has the commands, the migration naming convention and the
testing seam.

### Where code goes

Both doors — the web view and the MCP route handler — are thin adapters over
`src/core`, and neither holds domain logic (ADR-0002). Read `src/core/README.md`
before adding a verb or a query: it says which file yours goes in, and why there is no
barrel index to edit.

### Where an MCP tool goes

**One new file in `src/lib/mcp/tools/`, and nothing else.** The directory is the tool
list, so the route handler is never edited and there is no barrel to conflict in.
`src/lib/mcp/README.md` is the contract, including what a tool may not do.

### Where a page goes

**`src/app/(owner)/`, and it calls `requireOwner()` before it reads anything.** The
route group is the owner gate; a page outside it is a page served to anyone with the
URL. `src/app/gated.test.ts` fails when either half stops being true. See the README's
owner gate section.

### Where a screen goes in the shell

**One line in `src/app/(owner)/navigation.ts`, under one of the three questions.** The
shell renders that one map as a sidebar at the desk and as a bottom bar plus *More* on a
phone, so a destination cannot exist at one width and not the other.
`src/app/(owner)/shell.test.ts` fails when a screen in the tree is in no one's
navigation — and when a page takes the width back off the shell by centring itself in a
column.

### Where a cross-entity question goes

**In `src/core`, and then in both doors.** The finder is one field over the whole library —
Stories, Volumes, Series, people, Paths — and it is `findInTheLibrary` in
`src/core/queries/finder.ts`, called by the palette the chrome opens, by the `/find` screen behind
it and by `finder_search` on `/mcp`. The owner and the assistant search one library: **a
query the finder needs is added to the core and exposed to both**, and the finder never
reaches a record the assistant cannot. A cross-entity question is the one case where a query
is not named after an area, because the area it answers for is every area at once.

`src/app/(owner)/finder.tsx` is the scripted half and **`/find` is the specification**
(ADR-0010). The chrome carries a glyph beside the mark and that glyph is an
`<a href="/find">`: with nothing running it is a link to that screen, and with a script it
opens a palette over the window instead — so the suggestions, the arrow keys and `⌘K` are a
shorter way to a place the owner can already get to, and a button that did nothing on a
shop's signal was never an option. It is the one screen in the group deliberately **not** in
the navigation — declared as `THE_FINDER` in `navigation.ts`, opened from the chrome at both
widths instead, and held to all of that by `shell.test.ts`, which also fails if a second
palette appears. A further exception is argued for in that module, never added to a test.

It is also the answer to *"where does behaviour in the browser get tested?"*: it does not,
because it holds none. What is searched is a core query, and how the answer is banded,
worded and turned into a URL is `find/kinds.ts` — a screen's own derivation, tested beside
itself. `vitest.config.ts` states the rule: a client component may exist, and it may hold no
derivation.

### Where a colour and a face go

**`src/app/globals.css`, and nowhere else.** Paper, ink, two rules and **one hue**,
declared on both grounds, with every shadcn token an alias over them — and three faces
wired to three roles, the serif reserved for the owner's own prose. A screen names no
colour and picks no family: it spends the tokens. `src/app/palette.test.ts` is the wall,
and it fails when a screen names a colour of its own or when a ground stops being legible.

The mark is `src/components/mark.tsx`, drawn from one geometry that `src/app/icon.svg`
draws again as the favicon and `src/app/apple-icon.tsx` renders again as the phone's home
screen icon — that last one *imports* `PILE`, so it cannot drift; `src/components/mark.test.ts`
is what stops the favicon from doing so.

**A tab, a home screen and a status bar are outside this cascade**, so they cannot be handed a
`var()`. The four literals they need are named once in `src/app/outside-the-cascade.ts`, spent
by `apple-icon.tsx`, `manifest.ts` and the `themeColor` in `layout.tsx`, and pinned to the
stylesheet's own primitives by `palette.test.ts` — which is what buys that file its exception.
All three files are excluded from the owner gate by name in `src/proxy.ts`: a phone fetches
them without a cookie, and gated they answer `307 /signin`.

### Where the shelf's colour comes from

**`src/lib/tint.ts`, and it is the one file in `src/` allowed to name a colour.** The chrome
has no accent, so the only colour on screen is the library's: a tint derived from a Series'
identity, the same on every deploy, worn by the spines the walls are laid out as. A screen
spends `tint()` the way it spends a token and names nothing itself — `src/lib/tint.test.ts`
walks every colour the function can produce and holds each one to the palette's own reading
threshold on both grounds, which is what buys the exception the palette wall states.

The tile that wears it is `src/components/cover.tsx`, and it is **the cover rather than a
placeholder for one**: 0 of 96 Volumes carry an ISBN, so a drawn tile is the normal case and
an image is the exception. It is shaped like the page it stands for (210 by 297) so that the
day covers are hotlinked (#32) an image fills the tile instead of reflowing the wall.

### Where a screen's own derivation goes

**Beside the page, in a file named after what it answers — and it takes data and answers
data.** `src/app/(owner)/inbox/decisions.ts` bands a few hundred waiting entries into the
handful of decisions the owner actually takes, and names each one; `find/kinds.ts` says what
each kind of record the finder reaches is called and where enter lands on it;
`stories/story-state.tsx` and `reading-list/entry.ts` are the same thing at a smaller size. It is the screen's because
banding is the screen's (see the next section), and it is a *file* rather than a lump inside
`page.tsx` because it can then be tested beside itself — which `vitest.config.ts` licenses in
the same sentence it licenses the tint and the gate's predicate, under the same rule: data in,
data out, a function the app would still have if React were replaced. A component, a render
or a private helper of a page is the line, and crossing it is a third seam.

**It holds the screen's words, and never a list the core owns.** The heading *43 ISBNs on
Star Comics Volumes* and the label *ISBN* are one vocabulary, so they live in one table; but
which fields a record has and which it cannot be created without are `AMENDABLE_FIELDS` and
`NEEDED_TO_CREATE` in `src/core/verbs/inbox.ts`, read from there. A screen keeping its own
copy is a screen guessing at what the core will refuse.

### Where a filter goes

**In the URL, and in the core query's arguments.** A narrowed wall is a `GET` —
`/stories?type=manga&state=reading` — so it is linkable, survives a refresh and works with
nothing running in the browser (ADR-0010); every control that narrows one is a link or a field
in a `GET` form, never a script. **The query takes the filter as an argument**: a page never *narrows* an array it
fetched, because a wall showing four Stories must not have read seventy-seven. Grouping what
came back into bands is the screen's, and that is the whole of the distinction.
`listStoryWall` in `src/core/queries/story.ts` is the pattern, and
`src/app/(owner)/stories/page.tsx` is what reading a filter against the vocabulary looks
like — an unknown value narrows to nothing in the core, and is shown as no filter at all.

**One stated exception, and it is about composition rather than narrowing.** The Reading list
is not rows in a table: `composeReadingList` builds it out of two derivations and then *orders*
it, and the order is the answer it gives. So the dashboard takes its first three entries with a
`slice` — the first three are not knowable until the whole list has been composed, and the band
prints the total beside them, which needs all of it anyway. The rule's purpose is that a screen
must not read seventy-seven rows to show four; a composed answer has no such rows to leave
unread.

**And a control offers only what the wall can be narrowed to.** Where the vocabulary is the
library's rather than a fixed list, it is read off what is there: the Collection wall's Series
and publisher pickers come from `listCollectionSeries` and `listCollectionPublishers`, which
answer with the Series and the publishers the *house holds*. A picker naming a Series the owner
owns nothing of is a control whose every use empties the wall. A vocabulary too long for a row
of chips is a native `<select>` in a `GET` form rather than links — still no script, still a URL.

### Where a figure goes, and what it must arrive with

**An aggregate over records that may not carry the fact it needs is wrapped in its own
coverage in the core.** `Covered<Figure>` in `src/core/queries/library.ts` is the shape: the
figure, how many records carried the fact, and how many there were. Eighteen of this library's
seventy-seven acquisitions carry a price, so a total handed over on its own would read as
*what I have spent* and be wrong by a factor of four — and no screen can defend itself against
that, because a total carries no evidence of what it was computed over. **The denominator is
the query's to supply and impossible for a page to invent**, which is why this is a contract
and not a habit.

**Coverage is not a proportion, and the rule does not reach one.** *67 of 77 Stories are
unread* is the thing being reported; *18 of 77 acquisitions carried a price* is how far the
report can be trusted. So the length of a list a page holds whole and renders whole — the
spines in the pile, the entries in a band's heading — is not a figure this rule binds: there is
nothing partial about it and no denominator to get wrong.

Two rules follow, and `src/app/(owner)/page.tsx` is the pattern for both. Coverage is rendered
only where it is short (`whole()` answers that, so no screen writes the comparison itself) — a
coverage sentence on every figure is noise the owner learns to skip, and then skips on the one
that matters. And **records that exist and carry nothing read as an absence rather than a
zero**: an em dash with the reason said out loud, the way an unrated Story already reads on the
Story wall. The other half of that is as important — **no records at all still gets its zero**,
because nothing bought is a measurement where *nobody wrote the price down* is not one. Both
halves live in `figureOf`, in one place, so a figure cannot decide for itself which case it
is.
