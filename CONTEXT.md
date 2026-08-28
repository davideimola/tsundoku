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
One physical object the owner buys and keeps: a manga tankōbon, an omnibus, a novel. It
carries the publisher, the edition line, the language, the price and the ISBN —
everything about the *thing* and nothing about the narrative.
**Digital ownership is deliberately not modelled**: an ebook is a Reading with a digital
medium and no Volume. The owner's reason is that a file is not something they collect
and not something they forget they have.
_Avoid_: book unqualified, item, copy, and **edition** — edition is the publisher's line
(*Ultimate Deluxe Edition*), a property of the volume rather than a synonym for it.

**Collection**:
The Volumes physically in the owner's home. It exists to answer *"what do I actually
have?"* — the question the owner cannot answer from memory and asks while standing in a
shop. Being read is no part of it, and neither is wanting: a volume is in the collection
because it is on the shelf.
_Avoid_: library, shelf, inventory.

**Binding**:
How a Volume is bound: tankōbon, omnibus, deluxe, Must Have, hardcover, paperback. It is
what an Edition note usually judges.
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
wrote one, prose. It is the
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
shelf — and therefore how far it can be trusted. It is first-class because the
recommender must weigh *"Goodreads says I read this in 2020"* differently from *"I read
this and I remember it"*, and a score converted from a coarser scale differently from one
given in half points.
_Avoid_: source, origin.

**Path**:
An ordered route through stories that the **owner** defines, crossing types, publishers
and series freely: *Recupero Batman*, *Angolo Giappone*, *Technical Leadership*. Its
order is a judgement, never a publication sequence.
_Avoid_: filone, percorso, list, collection.

**Type**:
Manga, Comic, Graphic Novel, Novel, Non-fiction. An **attribute** of a story, not a kind
of thing: the model is one model, and a novel and a tankōbon differ in their attributes,
never in their shape.
