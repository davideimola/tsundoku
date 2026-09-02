# tsundoku

A single-owner library, named for the pile of unread books that keeps growing: what the
owner has read, what they thought of it, and what stands on the shelf at home — kept in one place so that an **external** reader (ChatGPT,
Claude, over MCP) can answer *"what should I read next"* without the owner maintaining a
spreadsheet by hand.

## Language

**Story**:
The narrative unit the owner reads and forms an opinion about, and there is **one test for
what counts as one**: *a Story is what you would give a score to.* It is not decided case by
case — that was the sentence that quietly made this word mean two things — and it is never
asked at the moment of cataloguing: the default is **one Volume, one Story**, and two
deliberate gestures carry the exceptions. *Batman: L'uomo che ride* holds **three** Stories in
one object, because the three tales are judged apart. *Slam Dunk* is **one** Story across
twenty tankōbon, because volume 7 is not a thing that gets a score.
A story needs **no volume at all** — read digitally, borrowed, read on someone else's shelf,
or recorded only as Goodreads history — because being read and being owned are two unrelated
facts.
It is the **spine**: a Volume is an object that attaches to it, a Reading an act, a Rating a
judgement. Only the spine is always there, which is why nobody creates one on purpose — a
Story appears because the owner said something about a title.
_Avoid_: work, title, entry, arc, and **book** unqualified — book names the object, not
the narrative.

**Reading**:
One act of reading a Story: when it happened, by what **medium** (paper or digital),
through which Volume if there was one, and whether it was finished or abandoned. There
may be **several for the same story**, because rereading is a real intention the owner
has already recorded — so a reading is never overwritten, and the rating it carried
survives beside the next one.
A pass through a long run **knows how far it got**: the last Volume it finished, and therefore
*ten out of twenty*. That is why the warning below still stands rather than being bent — how
far you are is a fact about **the pass**, which is an event, and never a field on the Story.
_Avoid_: reading status, progress — those name a field, and this is an event.

**Volume**:
One object as the library catalogues it: a manga tankōbon, an omnibus, a novel. It carries
the publisher, the edition line, the Binding, the language and the ISBN — everything about
the *thing* and nothing about the narrative.
**Being catalogued is not being owned.** The owner records an object to want it, to compare
it in a shop, or because it is on the shelf, and which of those is true is a separate fact:
an **acquisition** says it is in the house, from a day and at a price, and until when. So a
Volume the owner has never had is an ordinary Volume, and one sold and bought again is one
object acquired twice rather than two objects.
**Digital ownership is deliberately not modelled**: an ebook is a Reading with a digital
medium and no Volume. The owner's reason is that a file is not something they collect
and not something they forget they have.
_Avoid_: book unqualified, item, copy, and **edition** — edition is the publisher's line
(*Ultimate Deluxe Edition*), a property of the volume rather than a synonym for it.

**Cover**:
The image a **Volume** is faced with on a wall. It is either **looked up** — asked for by ISBN
at Google Books, and at Open Library for what Google does not have, and then *pointed at* where
it lives rather than copied here — or it is the **owner's own image**, a photograph or a scan
they host themselves, which overrides the looked-up one. The distinction is not a detail: a
looked-up cover is somebody else's, 128 pixels wide because that is the only size that exists,
and revocable by them at any moment; an owner's image is theirs, at whatever size they took it,
and is the only thing that will ever face a Volume with no ISBN — every Bonelli monthly, always
(ADR-0013). **A Volume with no cover is the ordinary case, not a gap**: the tile the walls draw
in the Series' tint is the cover, and an image covers it.
A looked-up cover **is an answer to the ISBN that stood on the record when it was asked for**,
which is why correcting the ISBN takes the cover with it: the alternative is an object wearing
another book's jacket, which loads perfectly and is a lie.
A **Story** has none of its own — a narrative is not an object — and what it wears on a wall is
borrowed from the first Volume that carries it.
_Avoid_: thumbnail and artwork — *thumbnail* names a size, and the size is a consequence of
the source rather than the thing. And **image** unqualified wherever whose it is matters,
which is nearly everywhere: it is *the owner's own image*, or it is a looked-up cover. The one
place the bare word is right is a tile, which is handed whichever of the two won and has no
business knowing.

**Acquisition**:
The fact that a **Volume** is in the house, from a day and at a price, and until when. It
is what the **Collection** is a query over, and it is recorded deliberately rather than
implied by anything else: cataloguing an object does not begin one, and ending one does not
end a **Wish**. An open acquisition is the shelf; one that ended is a record of having had
the object, which is why selling a volume and buying it again is one object acquired twice
rather than two objects. A Volume can have none at all, and that is an ordinary Volume.
_Avoid_: purchase — a gift and a book owned since before any of this was written down are
acquisitions with no purchase in them. Also: ownership, stock.

**Striking**:
Removing a record from the library because the record itself was a **mistake** — a duplicate an
assistant proposed and the owner approved in a hurry, an object or a narrative that was never
real. It is not the opposite of an acquisition and never says anything about the world:
releasing says the object left the house and keeps every record of it, where striking says
there was no object. So it is refused on anything the owner has lived with, and what it takes
with it is only what was as fictional as the record.

A **Volume** is struck from the **catalogue**: refused on one in the house, one a **Reading**
went through, one carrying an **Edition note**, one a **Wish** names — and the acquisitions that
ended go with it (ADR-0014). A **Story** is struck from the library: refused on one an object in
the house **carries**, one a **Reading** went through, one carrying a **Rating**, one a **Path**
names as a stop — and the **Credits** go with it while the **people** they name stay (ADR-0015).
A **Path** is struck from the library too, and **nothing refuses it** — a route asserts nothing
about the world, it is only an order the owner decided (ADR-0016). Its stops and the **Declared
constraints** on it go with it; every **Story**, **Reading** and **Rating** it named stays.
Striking a route is not putting one aside: aside says *not now* and keeps the order, striking
says *this was never a route*.

_Avoid_: delete and remove — both read as *take this off the shelf*, which is releasing, and
the whole point is that these are two different acts. Also, of a Story: unpublish, archive — a
struck record is gone, not put away.

**Collection**:
The Volumes with an open acquisition: the objects physically in the owner's home. It is a
**subset of what the library knows**, not the whole of it — the catalogue holds objects the
owner wants and objects they have let go — and that is what makes it worth asking. It exists
to answer *"what do I actually have?"*, the question the owner cannot answer from memory and
asks while standing in a shop. Being read is no part of it, and neither is wanting: a volume
is in the collection because it is on the shelf, and it leaves the collection without
leaving the catalogue.
_Avoid_: library, shelf, inventory.

**Binding**:
How a Volume is bound: tankōbon, omnibus, deluxe, Must Have, hardcover, paperback, spillato.
It is what an Edition note usually judges. Stored as data rather than as an enum, so meeting
a binding this list does not have is an insert — which is how *spillato*, a single stapled
comic, arrived (#17).
_Avoid_: **format** — in the spreadsheets that one word meant binding in one place and
reading medium in another, and served neither.

**Story ↔ Volume**:
**Many-to-many, in both directions.** One volume holds several stories — *L'uomo che
ride* holds three — and one story spans several volumes. Never write "the volume's
story" or "the story's volume": what is stored is which stories a volume carries.

**Series**:
A publisher's ordered line of Volumes for one edition, and a **completeness ledger
rather than a narrative concept**: how many volumes have been published, whether the line
is ongoing or concluded, which one comes next. It answers *"what am I missing"* and never
*"was it any good"* — which is exactly why it does not overlap with Story. One story may
run in several series (*Fullmetal Alchemist* in the standard edition and in the Ultimate
Deluxe Edition; *Death Note* in six Black Edition volumes or twelve standard ones), and
the volume counts differ between them.
**Collecting a series is a deliberate decision, never derived from ownership**: holding
42 of Naruto's 72 volumes does not open a collecting project.
A Series **says which Story it publishes**, and that lone arrow is the only thing the line and
the narrative say to each other — **many Series to one Story**, because *Fullmetal Alchemist*
is one work whether it is printed as the standard edition or as the Ultimate Deluxe. It is what
makes a volume joining the line attach to the work that is already there instead of minting a
twenty-first narrative. It states **what the line prints** and never whether it was any good,
so the ledger stays a ledger.
_Avoid_: collection — that word is taken, and means the shelf. Also: line, saga — and **run**
*for the ledger itself*: a run is the serialized **Story** a line prints, which is the word the
Reading list uses for one that still has somewhere to go (#43). *The twenty tankōbon* are the
Series; *Slam Dunk* is the run.

**Instalment**:
One numbered part of a **Story** that was serialized: *Ultimate Spider-Man* #1…#160, *Slam
Dunk*'s twenty. It belongs to the **narrative and never to a printing**, and that is the whole
of its usefulness — *thirty-five out of a hundred and sixty* stays true however the owner read
them, in singles, in an omnibus, in a deluxe line or half in each, where *one of three omnibus*
is a fact about a shelf and says nothing about the work.
It is **optional**, and it costs nothing where it is not wanted: a Story that declares none is
an ordinary Story, and where a line prints one part per Volume — every manga on these shelves —
the numbering simply **follows the volumes**, so volume 7 is instalment 7 and nobody types
anything. Ranges are written by hand only where one object collects many, which is the omnibus
and very nearly nothing else.
A **Volume covers a range of them**, which is what lets the library say which parts of a work
are in the house even when the objects come from different editions.
_Avoid_: chapter and issue — each names one medium's unit and this model holds both. Also
**number** unqualified: that one is taken by a Volume's position in its Series, which is a fact
about the printing and the opposite of this.

**Credit**:
A person's contribution to a **Story** in a named role — writer, artist. One person may
hold both roles on the same story, and the two are routinely different people:
*One-Punch Man* is written by ONE and drawn by Yusuke Murata.
_Avoid_: author — it presumes a single role and silently drops the artist.

**Rating**:
The owner's judgement of a **Story**: a score from 1 to 10 in half points and, where they
wrote one, prose. It carries the **grain** it was given in — half points, or coarse for one
given out of 5 and doubled onto this scale — which is its own axis and not a Provenance: the
judgement is the owner's, the precision is not. It is the
only judgement that feeds recommendation, and it never attaches to a volume — the object
was not the thing that was good or bad.
_Avoid_: review, score, vote.

**Edition note**:
What the owner thinks of a **Volume as an object** — print quality, translation, value
for money, whether the Must Have was the right way to try the saga before committing to
the omnibus. It decides what to buy. It is **not** a rating and never feeds
recommendation.

**Wish**:
An open intention to acquire a **named Volume**: priority, target price, price found,
shop. It ends only by a deliberate act. *"Complete this series"* is **not** a wish — it
is the collecting decision on a Series, and the missing volumes follow from it as a
query rather than as rows typed by hand.

**Want**:
An open intention to **read a Story**, standing on its own and belonging to no **Path**. It
is the fact the library was missing: it could already say *I read this* (a Reading), *I want
to own this object* (a Wish), *I mean to complete this line* (a Series being collected) and
*I mean to read these in this order* (a Path) — and had no way at all to say *I want to read
this*. So the only door into the **Reading list** was minting a Path, a named and ordered
route that **cannot be undefined**, for something that was never a route; and a Series wholly
on the shelf and wholly unread stood nowhere at all, because the Series source names the
Volumes that are **missing** and there were none.
It pairs with the **Wish**, and the pair is the whole distinction: **a Wish names a Volume and
is about owning; a Want names a Story and is about reading.** Neither implies the other — the
owner wants to read what they will borrow, and buys what they will not open for years.
It **ends by itself and never by a deliberate act**, which is exactly where it parts from the
Wish: nobody closes a Want, and there is no second truth to keep in step with the Readings. It
falls quiet when a **Reading began after the Want was opened** — a comparison of dates rather
than a state, which is what makes **rereading ordinary instead of a special case**: a Want
opened today on a Story read in 2019 finds no Reading later than itself and stands on the list
until the owner actually rereads it. Nothing anywhere says *this one is a reread*; it is one
because the reading is older than the wish to read it again.
_Avoid_: wish — that word is taken and means the object. Also to-read, plan, backlog, which
the Reading list's own list already refuses, and **shelf** — a Want is one sentence about one
Story, not a place things are put.

**Reading list**:
What to read next, and it is **two halves rather than one list**.
The **head** is what the owner has pinned, in the order they pinned it. It is short because
every row in it is a decision, and it is the only place an order means anything.
The **reserve** is everything else, and it **composes itself** from four sources — every
Story still to read on an active **Path**, every open **Want**, every **run with somewhere left
to go**, and the next missing **Volume** of every **Series** being collected — rather than
being a list kept by hand. A route
contributes **everything still ahead on it** and not merely its next stop, because what stands
behind that stop has to be visible before it can be pinned: that is what makes *three Marvel
stories and then a DC one* sayable rather than only nameable. A **run** contributes the
**Instalment** that comes next for as long as it has somewhere left to go: *the run is the whole
signal*, so *Slam Dunk* — collected, twenty published and twenty on the shelf, which the Series
source has nothing to say about because nothing is missing — stands on the list with no route
minted for it, no flag on its line and no **Want** needed, at *nought of twenty* until the owner
opens it. It leaves the list by itself, the way a Want falls quiet: a **Reading** that finished
it or that the owner abandoned takes it off, and so does a pass that has reached the last part.
It is
**deliberately unordered**, sorted by a rule nobody maintains (the newest Want first, then the
Paths, then the runs, then the Series): a long list somebody has to keep in order is
a list that goes stale,
and the moment an order starts to matter is the moment the owner is already deciding — which
is the pin.
A **pin** names **the thing to read** and not the source it came from, which is what makes
*three Marvel stories and then a DC one* expressible at all: what could be pinned before was
the route or the line, and a route contributes one stop.
**One Story is one row however many reasons it has to be there** — on two Paths and wanted
besides is one row that says all three, because the same answer written three times is not
three answers.
Every row carries an **intended medium**: paper means it must be bought first, digital means
it can be started tonight.
_Avoid_: readlist, to-read, backlog, queue.

**Provenance**:
How a record came to be known — Goodreads history, the photo census, typed from the
shelf — and therefore how far it can be trusted. It is **origin only**: it is first-class
because the recommender must weigh *"Goodreads says I read this in 2020"* differently from
*"I read this and I remember it"*. How coarse a score is is a different question, on its own
axis on the Rating, so that a score can say both where it came from and what grain it was
given in — coarse *and* off the sheet, coarse *and* from Goodreads.
_Avoid_: source, origin.

**Path**:
An ordered route through stories that the **owner** defines, crossing types, publishers
and series freely: *Recupero Batman*, *Angolo Giappone*, *Technical Leadership*. Its
order is a judgement, never a publication sequence.
_Avoid_: filone, percorso, list, collection.

**Declared constraint**:
Something the owner has said about how they want to read, in prose, holding either over one
Path or over the whole library: *"don't accumulate too many unread books"*, *"take it
slowly, given the cost"*. It is an **instruction to the external advisor** rather than a note
to self, which is why it is a first-class sentence and not a comment on something else —
nothing in this application enforces it, counts against it or warns about it, and everything
it changes it changes by being repeated to whoever is asked what to read next.
_Avoid_: rule, preference, setting — all three promise something the app obeys.

**Inbox**:
What an external assistant asked for and the owner has not decided yet. It exists because
the two kinds of writing are not the same risk: a Reading, a Rating, an acquisition or a
Wish is narrow, reversible and wrong in an obvious way, so an assistant records those
directly, while a **Story, a Volume or a Series it creates is a permanent fact** — a
hallucinated title or a fabricated edition the owner carries for years. So creating one from
outside is impossible, and the attempt lands here as an entry the owner reads: what was
said, in the words it was said in, what it proposes, and everything else the
assistant supplied, unchecked. It carries **Amendments** beside creations, for the same
reason and against the same risk. **Approval is the act that creates the entity**, which is
why a rejected entry leaves nothing anywhere — the entry was the only trace the proposal
ever had. A **first-class entity, not a log**: the owner's own `Inbox` tab already sketched
it, columns and all.
_Avoid_: queue, pending, draft, staging — and **approval workflow**, which promises states
this has none of: an entry waits, or it has been decided.

**Amendment**:
A proposal to complete or correct a **record that already exists** — the ISBN a Volume was
catalogued without, the publisher left blank, the count a Series has fallen behind on —
waiting in the **Inbox** the way a creation does. It is not written directly because the risk
it carries is the Inbox's risk and not the verbs': an invented ISBN is a permanent fact,
silent, and wrong in a way the owner will never notice, where a Reading recorded on the wrong
day is obvious the moment it is read back. It amends **one record**, so what it proposes is
legible beside what stands there today, and approving it is the act that changes the record.
It amends the record's **fields**, and a **Credit** is not one of them: a person in a role on
a Story is a record of its own, visible the moment it is wrong and undone whole by removing
it, so it is attributed directly and never amended into the Story (ADR-0012).
_Avoid_: edit, update, correction, patch — and **suggestion**, which promises something the
owner may leave lying around; an amendment waits for a decision exactly as a creation does.

**Type**:
Manga, Comic, Graphic Novel, Novel, Non-fiction. An **attribute** of a story, not a kind
of thing: the model is one model, and a novel and a tankōbon differ in their attributes,
never in their shape.
