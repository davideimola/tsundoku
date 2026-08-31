# tsundoku

A single-owner library, named for the pile of unread books that keeps growing: what the
owner has read, what they thought of it, and what stands on the shelf at home — kept in one place so that an **external** reader (ChatGPT,
Claude, over MCP) can answer *"what should I read next"* without the owner maintaining a
spreadsheet by hand.

## Language

**Story**:
The narrative unit the owner reads and forms an opinion about. Its granularity is the
owner's choice, case by case: *Gotham Noir* is a story inside one volume, *Slam Dunk* is
a story across twenty. A story needs **no volume at all** — read digitally, borrowed,
read on someone else's shelf, or recorded only as Goodreads history — because being read
and being owned are two unrelated facts.
_Avoid_: work, title, entry, arc, and **book** unqualified — book names the object, not
the narrative.

**Reading**:
One act of reading a Story: when it happened, by what **medium** (paper or digital),
through which Volume if there was one, and whether it was finished or abandoned. There
may be **several for the same story**, because rereading is a real intention the owner
has already recorded — so a reading is never overwritten, and the rating it carried
survives beside the next one.
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
_Avoid_: collection — that word is taken, and means the shelf. Also: run, line, saga.

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

**Reading list**:
What to read next — a queue that **composes itself** from the next unread story of every
active Path and the next volume of every series being read, rather than a list kept by
hand. The owner overrides it with **pins**, and every entry carries an **intended
medium**: paper means it must be bought first, digital means it can be started tonight.
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
