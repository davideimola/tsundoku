# The door forks on the object and the narrative, and the story a volume carries is shown rather than written

`/add` keeps its four sentences and stops presenting them as one flat set. They stand in **two
named halves** — *the object* (`I bought it`, `I want to buy it`) and *the narrative* (`I read
it`, `I want to read it`) — and the object half **names the Stories the Volume carries in the
same submission**, in a field arriving with the default already in it: the Story the **Series**
publishes where there is a line, the volume's own title where there is not.

## What forced it

Two outcomes were coming out of one undivided choice. Two of the four sentences catalogue an
object and two create no object at all, and nothing on the screen said so — the owner read the
set as four arbitrary tiles and could not tell which two would leave a Volume behind. The
halves are not a new distinction: they are **Wish and Want**, which the glossary already calls
"the whole distinction", standing where the owner first meets them instead of only in the
records.

And the silent default was wrong in a way the code makes precise. It fired **only outside a
Series** — with a line, the volume attaches to the Story the line publishes — so the one place
it ever ran was the omnibus, the graphic novel and the novel. On a novel it is right. On
*Batman: Il lungo Halloween* it minted a Story named after the jacket, for an object that
carries several tales named nothing like it. The default was firing exactly where it was least
likely to be true, and silently.

What replaces it is not its removal: a shown default costs the ordinary case nothing — a field
already filled — and costs the omnibus one gesture.

## Consequences

**A Volume catalogued by the owner carries at least one Story.** Emptying the field refuses the
submission, because when the owner's own hands are on it they have the object or its photograph
in front of them.

**A Volume proposed from outside may carry none, and that is a gap the library shows.** Asking
an assistant which stories an object holds is asking it to invent them, which is the risk the
**Inbox** exists to hold back. `inbox_propose_volume` may name Stories only by an id it found
with `stories_find` — never a new title — so a missing narrative is a separate proposal the
owner approves first. No entry ever depends on another; the Inbox still has no states.

**One component, two adapters.** At cataloguing it accumulates and submits in one transaction;
on a Volume's page each row acts at once through the verbs that already exist (`carry`,
`stopCarrying`, `recordStory`). No verb reconciles a set, because a diff that goes wrong goes
wrong by **unlinking**, silently, on an object the owner will not open for months.

**The row's second control appears only where it can work.** The cross unlinks; the bin strikes
the Story, and striking is refused on one a Reading went through, one carrying a Rating, one a
Path names (ADR-0015) — so the bin is drawn only where the row already knows striking is
allowed, and never while cataloguing, where there is nothing yet to strike.

**Type is one choice for the whole object**, guessed from the Binding where the Binding decides
(`tankōbon` → Manga, `spillato` → Comic) and otherwise from the last one used. It stays a
property of the narrative: the Volume gains no Type column.

**Nothing asks for an instalment range while linking.** `volume_story.covers_from/covers_to`
is filled afterwards, on the link, where the omnibus is the only object that wants it.

**The narrative half asks the medium.** It recorded `digital` unconditionally, which was
tolerable while the four sentences stood together and the object half covered paper. Now that
it is a declared door, paper read on someone else's shelf is half of what comes through it.

## The shape, settled against four of them

Four variants were built on the Volume's own page and read against its real density: a ledger
of rows with a folded catalogue under it, a two-pane transfer, a single token field, and the
one that won — **the ledger with one door**. Its rows are the list this page already is, a
hairline and a serif title and the acts beside each one; its way in is a **single field** under
them where typing searches the library, bands the answers by the Series each Story stands in,
offers the whole band in one press, and mints on Enter what the library does not know.

The two shapes it beat each say why. A **toggle** onto the catalogue asks the owner to know,
before they type, whether what they are about to name already exists — which is the question
they opened the screen to answer. **Chips inside a field** put a narrative's title in a pill,
and *Batman: Il lungo Halloween* does not fit in one: the rows are the chips, full width.

## Considered and not taken

- **A `Volume or Story` fork above the sentences**, which is what was first asked for. It
  costs a screen: after choosing, the owner still has to say bought-or-wished, read-or-wanted.
  The complaint was the absence of grouping, not an excess of choices.
- **Dropping the default and always typing the first Story.** A tax on *Superman: Stagioni* and
  on every novel, where the volume's title is the narrative's title.
- **Leaving the stories to be added afterwards, one at a time, from each Story's page.** That
  is the round trip that forced this decision — catalogue the object, leave it, mint a
  narrative elsewhere, come back, link them.
