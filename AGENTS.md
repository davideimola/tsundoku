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

### What a tool that proposes has to say, and where that sentence lives

**In `SEARCH_FIRST` and the cost sentence beside it in `src/lib/mcp/tools/inbox.ts`, and in no
second wording.** An assistant may not create a Story, a Volume or a Series and may not write a
field onto one: it proposes, and the owner approving is the act (ADR-0005, ADR-0011). The door
has had every tool needed to avoid a duplicate since the finder shipped — `finder_search` over
the whole library, `stories_all`, `collection_search`, `series_list`, `inbox_waiting` — and
assistants proposed duplicates anyway, until the owner stopped using the Inbox and went back to
typing the records in by hand (#53). **The gap was never a capability. It was the prose**, so
the prose is now one instruction rather than four descriptions each saying it their own way:
search first, with the tool named, and what a wrong one costs the person who reads every entry
by hand.

A tool that proposes spends `SEARCH_FIRST` and one of the two cost sentences —
`WHAT_A_WRONG_ONE_COSTS` where a duplicate is the risk, and `READ_BY_HAND`, which is the half
they share, where it is not. It does not rewrite them, and a fifth proposing tool that says it
more weakly than the four is the failure this section exists to stop: the weakest description in
the list is the one an assistant will find a way to read as permission.
`src/lib/mcp/tools/inbox.test.ts` is what holds them there.

The two project files an assistant is actually handed — `docs/assistant-projects/` — say the
same instruction in the same words, because they are read by the same assistant before it ever
sees a tool description.

**A proposal may name records other than the one it proposes, and only ever by id** (#52). A
proposed Volume says which Stories are inside it, because an object catalogued carrying no
narrative made every approval the first half of a repair — the owner went to the object's page
afterwards to type what the assistant already knew. The argument is a list of plain strings and
nothing else, and that shape is the rule rather than the prose beside it: an id is verifiable, so
one naming no Story refuses the **whole** entry, where a title in there would be a second proposal
hidden inside the first — a second place duplicates are born, which is the failure the section
above exists to stop. So **no argument anywhere in `tools/` names a record rather than finding
one**, `src/lib/mcp/tools/inbox.test.ts` holds that shape, and the works an object carries are
absent from `PROPOSAL_FIELDS` and `AMENDABLE_FIELDS` on purpose: a link is a record of its own
rather than a column on either end of it, which is the line ADR-0012 drew through a Credit.

The screen is the other half, and it is what makes the instruction checkable rather than
hopeful: an Inbox entry carries its **namesakes** (`src/core/queries/inbox.ts`), the records the
library already holds under the name the entry proposes, and the Inbox reads a creation against
them exactly as it reads an amendment against the record it names. A duplicate is spotted rather
than remembered.

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

### Where a new record enters the library

**Through the one door, `/add`, and nowhere else** (#45). The owner writes a title or scans a
barcode and says one of four things — *I bought it*, *I want to buy it*, *I read it*, *I want to
read it* — and `sayWhatHappened` in `src/core/verbs/what-happened.ts` works out what to record.
The four are two pairs: the first two are about an object and both catalogue a Volume, parting
only on the act underneath — an acquisition, or a Wish on an object that is therefore catalogued
and not owned (ADR-0007) — and the last two are about a narrative and record no object. There is
no screen that catalogues a Volume on its own, no screen that records a Story on its own, and
there must not be one again: those were three acts across two screens, and the drift they
produced is on the shelves — twenty-two Volumes against twenty-one Stories.

Two rules hold it together, and both are `CONTEXT.md`'s rather than the screen's. **A Story is
never something the owner creates**: it appears because something was said about a title, so
nobody is ever asked which of the two they are recording. And **the default is shown rather than
written** (#48, ADR-0019): the two sentences about an object name the narratives inside it in
the same submission, in a list that arrives with one row already in it — the Story the line
publishes where there is a line, the volume's own title where there is not — and that row can be
renamed, taken off or added to before pressing. The verb no longer mints anything from a
volume's title on its own, and **an object the owner catalogues by hand carries at least one
narrative**: emptying the list refuses the press, in the verb's own words. An object proposed
from outside may carry none, and that is a gap the library shows rather than a state it refuses.

**The one thing that ever overrode the default is the owner's own arrow**, and it is now what
the shown row usually says: a Series that says which Story it publishes takes a joining object
into that work rather than minting a twenty-first narrative (#39), which is why the Series
picker is on both object panels — the moment the object is in front of the owner is the moment
its line is known, paid for or not. The *position* is the half only *I bought it* asks for: a
position of a Series is filled by what is on the shelf, so an object only wished for takes none
and the placement waits for it to come home. Because the placement is what writes the arrow's
link, taking that row off is what takes the link back off with it — otherwise the row the owner
was shown would be one they could not correct.

**What kind of thing it is is asked above the four, and the sentences are said in its verb**
(#65, migration 0019). The Type was always asked and it stood *inside* each panel, after the
press — which is how the owner came to say *I read it* about a videogame and correct it
afterwards. It is pressed on the same screen as the sentences now, as links rather than as a
control, and three things read off that one answer: the verb the two narrative sentences take
(`verb_past`, `verb_base` on `type` — *read*, *played*), the line under the narrative half's
heading, and whether the object half stands on the screen at all. The last is not a check
against `videogame`: a half that catalogues an object is offered where the Type offers a medium
that goes through one (`aTypeCarriesAnObject`, ADR-0022), so an eighth kind of thing decides it
by the rows it arrives with. **This is not the fork ADR-0019 refused** — that one asked *object
or narrative* before the sentences and would have left the owner still saying bought-or-wished;
this is one field the panels already asked for, moved to where the sentences can follow it. All
of it lives in `src/app/(owner)/add/door.ts` and is tested beside itself; no Type is a state the
screen answers for, in the printed library's words.

The verb is a file named after the sentence rather than after an area, for `queries/finder.ts`'s
reason: it reaches the Collection, the Story and the Want at once, and it composes those areas'
verbs rather than writing their SQL again, so every refusal reaches the owner in the words the
area wrote. It is **not a tool and never will be** — it creates a Story, and an assistant may
only propose one through the Inbox (ADR-0005).

### Where a cross-entity question goes

**In `src/core`, and then in both doors.** The finder is one field over the whole library —
Stories, Volumes, Series, people, Paths — and it is `findInTheLibrary` in
`src/core/queries/finder.ts`, called by the palette the chrome opens, by the `/find` screen behind
it and by `finder_search` on `/mcp`. The owner and the assistant search one library: **a
query the finder needs is added to the core and exposed to both**, and the finder never
reaches a record the assistant cannot. A cross-entity question is the one case where a query
is not named after an area, because the area it answers for is every area at once.

`src/app/(owner)/finder.tsx` is the scripted half and **`/find` is the specification**
(ADR-0010). The rail on a route is the other pair: `paths/[id]/rail.tsx` lets a stop be
dragged into its gap at a desk, and the arrows and *first* on every row are the
specification — the drag fills two fields into a form the server rendered and presses it,
so there is one write and not two. It is offered only where a mouse can start it precisely
(`(pointer: fine)` and `lg`), because on a phone a drag inside a scrolling column is worse
than a tap and this application is used one-handed in a shop.

**The span on a Volume is the third pair, and it is the one that says the rail's limit was
about the *axis* rather than about the phone.** `collection/[id]/span.tsx` lets the owner
sweep across the parts of a work to say which of them are inside this object, and press one
part to say it holds only that; the two number boxes beside it are the specification, and the
sweep fills them in and presses that same form. It is **not** held to a desk: the rail's
gesture is vertical inside a column that scrolls vertically, which a browser cannot reliably
tell apart, where this one is horizontal inside a page that scrolls vertically — so
`touch-action: pan-y` separates them outright, and it is Pointer Events rather than HTML5 drag
for exactly that reason. The object it exists for is the omnibus, and an omnibus is bought
standing in a shop. Its arithmetic is `span-of-the-work.ts`, tested beside itself, for the
reason the rail's `landing.ts` is.

The chrome carries a glyph beside the mark and that glyph is an
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
draws again as the favicon, `src/app/icon1.tsx` renders again as that favicon's raster twin and
`src/app/apple-icon.tsx` renders again as the phone's home screen icon — the last two *import*
`PILE`, so they cannot drift; `src/components/mark.test.ts` is what stops the drawn one from
doing so.

**The raster twin is not a nicety, and the reason is worth knowing before deleting it**: Safari
could not read an SVG favicon at all until 26.0 (caniuse, `link-icon-svg`), so on that browser
`icon.svg` alone is a tab with nothing in it — which is what the owner reported. Two `<link
rel="icon">`s are offered and each browser takes the type it understands. `favicon.ico` is
beside them for the fetchers that ask for that path and read no markup at all; it is the one
icon in the repository that is a committed binary rather than a drawing or an import, and
therefore the one that can go stale.

**A tab, a home screen and a status bar are outside this cascade**, so they cannot be handed a
`var()`. The four literals they need are named once in `src/app/outside-the-cascade.ts`, spent
by `apple-icon.tsx`, `icon1.tsx`, `manifest.ts` and the `themeColor` in `layout.tsx`, and
pinned to the stylesheet's own primitives by `palette.test.ts` — which is what buys that file
its exception. Every one of those addresses is excluded from the owner gate by name in
`src/proxy.ts` — `favicon.ico`, `icon.svg`, `icon1`, `apple-icon`, `manifest.webmanifest` — and
`src/proxy.matcher.test.ts` pins each: a phone and a tab fetch them without a cookie, and gated
they answer `307 /signin`.

### Where the shelf's colour comes from

**`src/lib/tint.ts`, and it is the one file in `src/` allowed to name a colour.** The chrome
has no accent, so the only colour on screen is the library's: a tint derived from a Series'
identity, the same on every deploy, worn by the spines the walls are laid out as. A screen
spends `tint()` the way it spends a token and names nothing itself — `src/lib/tint.test.ts`
walks every colour the function can produce and holds each one to the palette's own reading
threshold on both grounds, which is what buys the exception the palette wall states.

The tile that wears it is `src/components/cover.tsx`, and it is **the cover rather than a
placeholder for one**: a drawn tile is the normal case and an image is the exception. It is
shaped like the page it stands for (210 by 297), which is what let #32 hotlink an image into the
tile without reflowing a single wall. A drawn title is held to the height of the tile as well as
to five lines, because the two are not the same limit — five lines are taller than a 4rem tile,
and a centred block taller than what holds it loses as much off the *top* as off the bottom
(#31). It is drawn small beside a row on three screens now — the Pile, the shopping
list, and a person's body of work, which is a wall of these split by the role they held.

Two other things wear a tint, and each is a different view of the same object: the lying-down
spine the pile is stacked from (`src/components/pile.tsx`), because a pile is read from the
side, and the **standing** spine of `src/components/spine.tsx`, because a shelf is read from
it. A wall is faced outwards and gets the cover; a *sequence* of objects gets spines, which
is what makes a 72-volume ledger one screen instead of six and twenty tankōbon one row
instead of twenty. Two screens draw that one: a Series' positions
(`src/app/(owner)/series/spines.tsx`, which keeps only what a *position* means — held,
missing, or merely empty) and the objects carrying a Story
(`src/app/(owner)/stories/[id]/page.tsx`, where hollow means the house does not hold it).
How a tile wears a tint is `worn()`/`WORN` in `src/lib/tint.ts` and never each tile's own
three lines.

### Where a cover comes from, and what may be kept of it

**Hotlinked, never hosted, and Postgres is what refuses the alternative** (ADR-0013). A Volume
carries the cover as a *reference* — which source answered, that source's id for the record, the
address, and the source's own page for the book — and an `<img>` points at somebody else's
domain. Google Books is the only source that has these covers (91% of a measured sample against
5.6% for the next two) and its terms forbid a permanent copy, so `cover_url` is constrained to
their domain and `own_image_url` is constrained *away* from it: hosting is reserved for the
owner's own photograph, which overrides the looked-up one and is the only thing that will ever
face a Bonelli monthly.

Three rules follow, and each is a file:

- **Nothing on a render calls a third party.** A page reads a column. The lookup is
  `lookUpCovers` in `src/core/verbs/cover.ts`, a verb the owner runs from the Collection, and
  `src/core/covers.ts` is one of the **two** files in the repository that know what a `fetch`
  is. The other is `src/core/records.ts` — see *Where an ISBN goes* below — and
  `src/app/hotlinked.test.ts` holds the list at two.
- **A rate limit is not an absence.** A source answers *found*, *none* or *unanswered*, and the
  third writes nothing at all — a 403 recorded as "no cover" produced a false 0% in the research
  this rests on (`docs/research/cover-images-by-isbn.md`).
- **The fallback chain is resolved once, in the core.** `THE_COVER_IT_IS_FACED_WITH` in
  `src/core/queries/cover.ts` is the owner's image over the looked-up one, and the three walls
  that draw a tile all read it rather than each deciding. **A Story's own image is the rung
  above both** (#65): `story.own_image_url` is the one image a narrative can wear — nothing is
  ever looked up onto a Story, because every source is keyed by an ISBN and a videogame owns no
  object to carry one — and `THE_COVER_IT_IS_FACED_OUT_WITH` in `src/core/queries/story.ts` is
  the whole order, **the image nearest the record first**: the Story's own, then whatever the
  lending Volume is faced with, then the drawn tile. The same constraint reserves hosting on
  both tables, so a looked-up address is refused by Postgres on a Story exactly as on a Volume.
- **A cover is an answer to an ISBN, so `amendVolume` drops it when it writes a different
  one.** ADR-0012 predicted the failure and production produced it: *One-Punch Man 9* wearing
  *Slam Dunk 9*'s jacket, because the ISBN behind it was wrong. A blank tile is honest and a
  wrong one is not — and a wrong one passes every check, because the image loads. The two
  repairs are `forgetTheCover` and the run's `again`, and a press on one object's own page
  always reaches the source rather than checking the recorded address still resolves.

### Where an ISBN goes, and what a camera is allowed to decide

**`src/core/isbn.ts` reads it, `src/core/records.ts` asks about it, `src/core/queries/isbn.ts`
holds the two questions both answer, and the browser decides nothing.** An ISBN used to arrive one
way — typed at a desk from the object in hand — and now arrives a second, from a barcode read
in a shop. The two fail differently, and that difference is the whole of this design: a typed
ISBN is short a digit, where a *scanned* one is **the wrong barcode entirely** — the price
add-on printed beside it, the ISSN-derived EAN on a Bonelli monthly, the shop's loyalty card —
and a length check waves all three through. So `theIsbnItIs` answers with a **reading** rather
than a boolean, and the refusal names which barcode the owner is holding.

`whatIsOnThisIsbn` is the shop's question, and its **order is the feature**: is this an ISBN at
all, then *does the library already know it* — one round trip to Postgres, before anybody's
network — and only then what the national catalogue says it is. The middle step short-circuits
the third, which is worth more than the request it saves: a lookup that asked SBN first would
spend a shop's signal to fill in a form for an object already on the shelf. It is a file named
after the question rather than after an area, for `queries/finder.ts`'s reason.

**`whatIsPublishedUnderThisIsbn` is the second question, and it is the first with its middle
step taken out.** It is asked from the page of an object the owner is already holding, where
*does the library know this?* is not worth a round trip: the answer is yes, and it is the record
on screen. Two exports over one shared step rather than one export with a flag, because the
**answers** differ and not merely the work — an ISBN scanned in a shop can turn out to be an
object already on the shelf, and an ISBN scanned off the object whose page you are standing on
cannot.

**A wrong fact is corrected from the object's own page, and the catalogue is asked in the same
press that records the number** (`collection/[id]`). The gesture a barcode buys is *hold the
object, point the phone*, so the moment the ISBN reaches the library is the moment there is
something to check the record against; asking afterwards, from a second press, is a lookup
nobody performs. **The write is the ISBN and nothing else.** What SBN answered rides back in the
address (`collection/[id]/panels.ts`) and stands in the panel as a *proposal*, field by field,
beside the two facts this library kept — and `correctWhatItIs` is the second press that writes
as much of it as the owner wants. Three rules hold it: a field the catalogue never named is not
a box at all, because an empty one would read as *SBN says this object has no publisher*;
**clearing a box keeps what the record says**, which is the same sentence the ISBN field is held
to and is the whole of the *keep mine* gesture, since a librarian's `One piece 100` is not
always an improvement on the spine's *One Piece 100*; and what the catalogue's answer does not
carry — the Binding, the language, the edition line, the position in a line — is not named in
the amendment and is therefore left standing, which is `amendVolume`'s own rule and not the
screen's. Which fields *differ* is `collection/[id]/standing.ts`'s, so a lookup that merely
confirms the record reads as a confirmation rather than as work to do.

**SBN is the source because it is the one that has manga.** Google Books v1 has the records and
answers 429 keyless; Dynamic Links, the keyless path the covers use, carries no title at all;
Open Library holds nothing for 51 of 54 measured ISBNs. SBN is undocumented, is somebody's
Liferay XHR surface, and goes down — which is why *unanswered* is a third answer here exactly
as it is for a cover.

**The scanner is an enhancement over a field that already works, and it holds no derivation**
(`src/components/scan.tsx` — in `components/` rather than beside a screen because two screens
are now the same gesture: the one door, and an object's own ISBN panel). It is not rendered
until a script is running, because
a control that does nothing on a shop's signal was never an option (ADR-0010) — and unlike the
finder it can have no unscripted twin, since a camera *is* a script. What it can have, and has,
is a twin field: **the one door has one field, and a barcode and a title go in the same place**
— typed, pasted or filled in by the phone's own text scanner, it posts with nothing running,
and which of the two arrived is `add/door.ts`'s to read (#45). The object's page has the same
twin field for the same reason, and there the two things that go in it are a barcode and a
barcode: the one on the back of the thing in your hand, read by the camera or typed off it. Safari has no `BarcodeDetector`, so the
fallback is ZXing as WebAssembly, dynamically imported on the first press and served from our
own origin — `public/decoder/zxing_reader.wasm`, pinned to the dependency by
`src/app/vendored.test.ts`, which is the fourth wall.

### Where a form the owner opened deliberately goes

**In a drawer whose open state is the URL** — `@/components/drawer`, a link to `?panel=…`,
and a panel the server renders when that parameter is there. `src/app/(owner)/collection/page.tsx`
is the pattern: the hero carries *Covers* and *Not in the house*, and each is an `<a>`.

It is worth knowing why this is not a dialog component. A drawer is ordinarily client state,
a portal and a focus trap; the screen that needed one is the one the owner opens **in a shop,
on the shop's signal**, and a form that exists only once a bundle has parsed is a form that is
not there when it is wanted. A drawer's open state is genuinely one bit of *navigation*, so
putting it in the URL costs no script at all — which is a stronger claim than the finder's
scripted-half-with-an-unscripted-twin (ADR-0010), and it is available here only because of
that. What it buys: the open drawer is linkable, it survives a refresh, and the back button
closes it because that is what going back means.

A Story's page is the second one (#29), and it says something the first could not: **an act
that needs a field is a panel of its own, not a second submit button.** Starting a Pass,
finishing one and giving up on one are three addresses and three plain forms, because a
`formAction` on a second submit needs a script to send the right one — and a write that only
works once a bundle has parsed is not a write this application has.

The Volume's page and the two Series screens are the rest of it (#30), and between them they
say where the line is. **A press that asks for nothing is a plain form and not a panel** —
*Collect this Series* takes no field, and a drawer in front of it would be a door in front of
a door. **A field under the list it corrects is not a panel either**: a drawer is for a form
the owner *opened*, where saying which Story is inside this object is a correction made while
reading the list above it — which is why the one field the contents of an object are named in
stands under those rows and not behind a press (#47, `src/components/stories-it-holds.tsx`).
And **a record the owner reads is on the page even when writing it
is a panel** — the Edition note is prose in the serif with *Rewrite the Edition note* beside
it, the way a Rating's prose is read back on the Story, because what was written is the record
and the box is the act.

The last three screens are the rest of it (#31), and they add one clause rather than a rule:
**the record is on the page and the panel is only the act**, which the Volume's Edition note
said and a Path's intent says again — the owner's own words are read in the serif under the
route's name, and *Say what it is for* is a drawer beside them. Its sibling clause is the one
the Wishes screen is the case for: **what is folded away is not there.** That shopping list
kept its four numbers behind a disclosure, and the tap that opened one was taken standing in a
shop with a book in the other hand, so everything that decides a purchase is on the card now
and a Wish with no price says so in words rather than showing a row of dashes.

Three rules for adding one. **Read the panel against a list**, the way every filter on a wall
is read — `?panel=banana` opens nothing, and neither does a `?pass=` naming no Pass of
this Story. Better still, read it against **the acts the screen has**: `theActsOnTheObject`
and `theEditionNoteAct` in `collection/[id]/standing.ts` name every panel a Volume has, the
page opens none they did not name, and so a hand-typed `?panel=release` cannot stand a release
form over an object the house does not hold. Each act's label is its panel's title too, so a
press and the panel it opens cannot come to call one act two things. **And a refused write
comes back with its panel open, carrying the verb's prose into the panel** — the sentence is
about what was typed, so it is only useful beside the field it is about, and a panel covers the
screen it would otherwise be printed behind. And **carry the screen's other parameters through**:
opening a drawer must not take the owner's search filters off on the way, and closing it must
put them back. `panelled()`/`unpanelled()` on the Collection are that, and they deliberately
drop the answer to the *last write*, so a report is not printed again over an act nobody just
performed.

### Where a screen's own derivation goes

**Beside the page, in a file named after what it answers — and it takes data and answers
data.** `src/app/(owner)/inbox/decisions.ts` bands a few hundred waiting entries into the
handful of decisions the owner actually takes, and names each one; `find/kinds.ts` says what
each kind of record the finder reaches is called and where enter lands on it;
`series/positions.ts` says what each position of a Series is — held, missing, or merely empty
— which is the one place the difference between *missing* and *not mine yet* is decided;
`stories/passes.ts` says how a Pass is worded and **which one of them is still
open**, which is what puts *start it* or *close it* in a Story's hero and is read off
`outcome` in one place rather than three; `collection/[id]/standing.ts` says where the owner
stands with one object — in the house, catalogued, or acquired and let go — and therefore
**which acts its page offers**, which is where an object that left the house is offered
acquiring it *again* rather than releasing something the house does not have;
`wishes/shopping.ts` says the months a shopping list is bought in — the Pile's picker and the
one door's offer the same ones — and bands the list out of the periods that are *there* rather
than by filtering a fixed run of months, so **a Wish cannot be on the list and on no band of
it** and **a month that has gone by keeps its own band**, which is that area's own rule about
nothing disappearing silently (ADR-0023); it also says what a band **comes to**, which is the
one figure a period made askable and the one a screen carries its own `Covered` for;
`credits/body-of-work.ts` cuts everything a person is credited on along the role they held on
it, over an answer the core hands over split by whether it was read — and a Story they held
two roles on stands in **both** bands, because that is the pair of facts the word *Credit*
exists to keep apart;
`paths/[id]/candidates.ts` bands what could still go on a route by **the line its objects
stand in** rather than by Type, because a route crosses Types freely and the run the owner is
working through is the thing they pour onto one in a single press — and it keeps the core's
order in and between the bands, since that order is what the stops are *placed* in and not
merely how they are read;
`stories/nothing-on-it.ts` says what a strike takes with a Story — the Credits, and the
people it does *not* take (ADR-0012) — which is the half of a bulk delete a count cannot say;
`components/stories-on-offer.ts` bands what the field under an object's contents found by the
line each Story stands in, and says what the press over a whole band promises and what enter
on a typed title does — the one derivation belonging to a **component** rather than to a
screen, because that component is written to be mounted on two of them (#47, and #48 for the
second), which is why it sits beside the component in `components/` and not beside a page;
`stories/story-state.tsx` and `pile/entry.ts` are the same thing at a smaller size. It
is the screen's because banding is the screen's (see the next section), and it is a *file*
rather than a lump inside `page.tsx` because it can then be tested beside itself — which
`vitest.config.ts` licenses in the same sentence it licenses the tint and the gate's
predicate, under the same rule: data in,
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

**One stated exception, and it is about composition rather than narrowing.** The Pile
is not rows in a table: `composePile` builds it out of three derivations, keys one row
per thing to read, and then splits it into the **head** the owner pinned, in pin order, and the
unordered **reserve** — and that split is the answer it gives. So the dashboard reads the two
halves in order and takes the first three entries with a `slice` — the first three are not
knowable until the whole list has been composed, and the band
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
