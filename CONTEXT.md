# tsundoku

A single-owner library, named for the pile of unread books that keeps growing: what the
owner has read, what they thought of it, and what stands on the shelf at home — kept in one place so that an **external** reader (ChatGPT,
Claude, over MCP) can answer *"what should I read or play next"* without the owner maintaining a
spreadsheet by hand.

## Language

**Story**:
The unit the owner goes through and forms an opinion about, and there is **one test for
what counts as one**: *a Story is what you would give a score to.* The test is the definition
and **narrative is only what most of them happen to be**: a videogame is a Story by the same
test a manga is, and one holding no story at all — *Tetris* — is still the thing a score would
be given to. It is not decided case by case — that was the sentence that quietly made this
word mean two things — and at the moment
of cataloguing the owner is **not asked to decide it: they are shown the answer already
written**. The default is still **one Volume, one Story**, and it still costs nothing, but it
arrives as a line standing in front of them — the volume's title, or the Story the **Series**
already publishes — rather than as a row written behind their back. A default that is shown is
a default that can be corrected in the one case it was always wrong: *Batman: L'uomo che ride*
holds **three** Stories in one object, because the three tales are judged apart. *Slam Dunk*
is **one** Story across twenty tankōbon, because volume 7 is not a thing that gets a score.
A story needs **no volume at all** — read digitally, borrowed, read on someone else's shelf,
played on a console, or recorded only as Goodreads history — because going through a thing and
owning it are two unrelated facts.
It is the **spine**: a Volume is an object that attaches to it, a Pass an act, a Rating a
judgement. Only the spine is always there, which is why nobody creates one on purpose — a
Story appears because the owner said something about a title. The two things they can say are
the two halves of the door: **an object they have or want**, which is a Volume and names the
Stories it carries, or **a narrative they went through or mean to**, which is a Story and owes
no object to anybody. That is the **Wish/Want** distinction standing where the owner first meets
it, and it is why a Story with nothing said about it has no way in.
_Avoid_: work, title, entry, arc, and **book** unqualified — book names the object, not
the narrative.

**Pass**:
One pass through a Story: when it happened, by what **medium**, through which Volume if there
was one, and whether it was finished or abandoned. There may be **several for the same
story**, because going through a thing again is a real intention the owner has already
recorded — so a pass is never overwritten, and the rating it carried survives beside the next
one.
A pass that has **not ended** is one still under way: no outcome, and therefore no end date.
That is the whole of what *I am in the middle of this* means here, and it is why **suspended
is not a third outcome** — a game put down in March and a game played last night are the same
record, and what separates them is how long ago it started, which the pass already says.
_Suspended_ may be a word the walls use; it is not a word the model has.
A pass through a long run **knows how far it got**: the last Volume it finished, and therefore
*ten out of twenty*. That is why the warning below still stands rather than being bent — how
far you are is a fact about **the pass**, which is an event, and never a field on the Story.
**Never overwritten is not the same as never struck** (ADR-0018). A pass that *happened* is
permanent, and a second one is what says it went differently; a row recording a pass that
**never happened at all** — the wrong tile pressed in a shop — is struck, because the state is
derived from these events and there is no field to correct. That door is refused on the one
thing that can hang off a pass, a Rating, since deleting a rated one would quietly turn *what I
thought of that pass* into *what I think of the narrative*.
_Avoid_: reading status, progress, session — the first two name a field and this is an event,
and the third names one sitting where this names the whole run at a thing. Also **reading**
for the record itself, which named only half of what it holds (ADR-0021).

**Medium**:
What a **Pass** went through the Story by: paper, digital, or the console it was played on. It
is a fact about **the pass and never about the work** — *Hades* on Switch and *Hades* on PC are
one Story gone through twice, the way a novel read once on paper and once as an ebook is.
It exists to answer one practical question, which the **Pile** asks of every row it draws:
**what does it take to start this tonight?** Paper means the object has to be bought first,
digital means it can be started now, a console means it can be started if that console is in the
house. That question is why a console belongs on this axis rather than beside it: it does the
work the medium was already doing, and a videogame carrying `digital` next to a console would
be saying nothing twice.
It is a **vocabulary and therefore data**, not a shape written into a constraint — the list
grows when a console is released, and that is an insert (ADR-0022). Each value says whether it
can go through an object, and **only paper can**.
_Avoid_: platform and format — *platform* names only the half of this list that is hardware,
and *format* is the word the old spreadsheets used for the binding in one place and for this in
another.

**Volume**:
One object as the library catalogues it: a manga tankōbon, an omnibus, a novel. It carries
the publisher, the edition line, the Binding, the language and the ISBN — everything about
the *thing* and nothing about the narrative.
**Being catalogued is not being owned.** The owner records an object to want it, to compare
it in a shop, or because it is on the shelf, and which of those is true is a separate fact:
an **acquisition** says it is in the house, from a day and at a price, and until when. So a
Volume the owner has never had is an ordinary Volume, and one sold and bought again is one
object acquired twice rather than two objects.
**A Volume carrying no Story is possible and is a gap rather than a state**: nothing refuses
it — an object proposed from outside arrives with none, and one catalogued from a photograph
may wait for its contents — but it stands on no Pile and takes no judgement, so the
library shows it until it carries something.
**Digital ownership is deliberately not modelled**: an ebook is a Pass with a digital
medium and no Volume. The owner's reason is that a file is not something they collect
and not something they forget they have.
**A videogame owns no object here either**, and for a different reason: a disc on the shelf is
a fact the owner has weighed and found says almost nothing worth recording. The door is not
closed — a boxed game is an ordinary Volume with a Binding of its own and no ISBN, which is
what every Bonelli monthly already is — it is simply not walked through (ADR-0021).
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
A **Story** has no *looked-up* cover and never will — every source is keyed by an ISBN, and an
ISBN belongs to an object — so what it wears on a wall is normally borrowed from the first
Volume that carries it. It may carry **an image of the owner's own**, and that is the one thing
a **videogame** needed that a book did not: a game carries no Volume, so it has nothing to
borrow a face from and this is the only image it can ever have (ADR-0021, #65).
**The precedence is the image nearest the record**: the Story's own image, then whatever the
lending Volume is faced with — which is itself the owner's photograph over the looked-up cover
— then nothing, which is the drawn tile. Both of the first two are the owner's; the Story's is a
picture of the work the tile stands for, where the Volume's is borrowed off one printing of it,
so the nearer one leads. A looked-up cover reaches a narrative only by being lent, and stays
what it is: somebody else's, revocable, and attached to an object.
_Avoid_: thumbnail and artwork — *thumbnail* names a size, and the size is a consequence of
the source rather than the thing. And **image** unqualified wherever whose it is matters,
which is nearly everywhere: it is *the owner's own image*, or it is a looked-up cover. The one
place the bare word is right is a tile, which is handed whichever of the two won and has no
business knowing.

**Acquisition**:
The fact that a **Volume** is in the house, from a day and at a price, and until when. It
is what the **Collection** is a query over, and it is recorded deliberately rather than
implied by anything else: cataloguing an object does not begin one, and ending one does not
end a **Wish**. One press writes an acquisition *and* ends a Wish — *Bought it*, on the
shopping list — and it is the exception that proves the rule: the two facts are written
together because the owner said one sentence about one event, and neither is derived from the
other. An open acquisition is the shelf; one that ended is a record of having had
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

A **Volume** is struck from the **catalogue**: refused on one in the house, one a **Pass**
went through, one carrying an **Edition note**, one a **Wish** names — and the acquisitions that
ended go with it (ADR-0014). A **Story** is struck from the library: refused on one an object in
the house **carries**, one a **Pass** went through, one carrying a **Rating**, one a **Path**
names as a stop — and the **Credits** go with it while the **people** they name stay (ADR-0015).
A **Path** is struck from the library too, and **nothing refuses it** — a route asserts nothing
about the world, it is only an order the owner decided (ADR-0016). Its stops and the **Declared
constraints** on it go with it; every **Story**, **Pass** and **Rating** it named stays.
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

**Type**:
What kind of thing a **Story** is: Manga, Comic, Graphic Novel, Novel, Non-fiction, Play,
Videogame. It is a fact about the **narrative** and never about the object that carries it —
*Manga* is what a work is and not how it was bound — which is why one is asked once for
whatever a Volume holds and none is ever written on the Volume itself.
It is **data and not a shape** (ADR-0006): a seventh kind of thing is an insert, which is what
*Play* was when the books half turned out to hold a script, and *Videogame* right after it.
A Type carries the two things that follow from what kind of thing it is, and both are rows
rather than rules written somewhere in code: **which media it offers** — paper and digital for
what is printed, the consoles for what is played — and **what going through it is called**,
which is *read* for six of the seven and *played* for the one that is not. The second is why a
videogame can be recorded in the owner's own words rather than in a printed library's: the
door asks the Type before it asks what happened, and the sentences it offers are said in that
verb. A Type that is not read is the one that has to say so.
Whether a thing of this kind can be **held** is not a fact of its own either. It follows from
the media: only paper goes through an object (ADR-0022), so a Type offering none is a Type
this library holds no object for, and the door stops offering to catalogue one.
_Avoid_: category, genre and **kind** unqualified — genre is what a work is *about*, which
this library deliberately does not record, and category names nothing in particular.

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
It is **said when the object is catalogued and said again whenever the owner looks at it**, by
the same gesture in both places: the Stories a Volume carries are named where the Volume is,
never by visiting each narrative in turn.

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
Pile uses for one that still has somewhere to go (#43). *The twenty tankōbon* are the
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
**How many parts a work has follows the line too**, for the same reason and not because the two
facts are one: where exactly one **Series** names the Story and has published more than nought
Volumes, the count *is* that number and stays at it as the line grows — an ongoing line gains
volumes, and the work gains parts. Nought published is *the owner never filled it in* rather
than *no parts*, and such a work declares nothing at all — in both directions, so a ledger
corrected back down to nought unnumbers the work again. What keeps the printing's count and
the narrative's from collapsing into one is that **the owner's word ends the following**:
correcting the count by hand — or taking the numbering off — makes the number theirs, and no
line moves it again. Two Series naming one Story stop the following as well, because which of
two ledgers a work takes its length from is not something this library decides for them
(ADR-0017).
A **Volume covers a range of them**, which is what lets the library say which parts of a work
are in the house even when the objects come from different editions.
_Avoid_: chapter and issue — each names one medium's unit and this model holds both. Also
**number** unqualified: that one is taken by a Volume's position in its Series, which is a fact
about the printing and the opposite of this.

**Credit**:
A person's contribution to a **Story** in a named role — writer, artist, director, composer.
One person may hold two roles on the same story, and they are routinely different people:
*One-Punch Man* is written by ONE and drawn by Yusuke Murata.
The roles are a **vocabulary and grow by an insert**, but they grow for one reason only: a
Credit is indexed by person because the question it answers is **what else did this one do**.
*Director* and *composer* earn their place by that test — what else Kojima directed, what else
Mitsuda wrote — and a **studio** and a **publisher** do not enter here at all, because neither
is a person.
_Avoid_: author — it presumes a single role and silently drops the artist. Also studio and
developer, which name companies.

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
An open intention to acquire a **named Volume**: the **Period** it is planned into, target
price, price found, shop. It ends only by a deliberate act. *"Complete this series"* is
**not** a wish — it is the collecting decision on a Series, and the missing volumes follow
from it as a query rather than as rows typed by hand.
It is **replanned rather than replaced**: the period, the two prices and the shop are
rewritten on the record, because ending an intention in order to reschedule it would lose the
day it was opened — which is the fact that says *you have been meaning to buy this since
March* — and would be the one thing this list refuses to do, which is lose a row quietly.
The deliberate act that ends one **may be the press that says why**: *Bought it* records the
acquisition and closes the Wish in one breath, and it is still the two facts it always was —
an acquisition, and a Wish that ended. Nothing else ends one, so an object that comes home
another way leaves the intention standing.
_Avoid_: priority — the word named a ranking of these against each other, which is the
question the owner never had; and **wishlist**, which names a place things are put rather
than one sentence about one object.

**Period**:
The month a **Wish** is planned into, and therefore the band it stands in on the shopping
list: *this month I take this one, next month that one.* It is an **absolute** answer where a
priority was a relative one — *next* says only *before the others*, and everything the owner
still means to buy drifts into it — which is why the order **inside** a month does not matter:
inside one, they buy all of them.
A Wish with **no** period is *someday*, and that is the absence of a plan rather than a third
word for one. **A month that has gone by is not a state**: nothing says late, overdue or
expired, nothing warns and nothing moves a Wish on its own — a period is a plan the owner
wrote down, and this application does not enforce the owner's plans. It is what makes one
number worth printing, which no priority could be asked for: **what this month comes to**, out
of the prices the Wishes in it carry.
_Avoid_: deadline, due date and sprint — all three promise something the app obeys — and
**quarter**, which is a span the owner may say in words and never a value this holds: three
months are three periods.

**Want**:
An open intention to **take on a Story** — to read it, or to play it — standing on its own and
belonging to no **Path**. It
is the fact the library was missing: it could already say *I read this* (a Pass), *I want
to own this object* (a Wish), *I mean to complete this line* (a Series being collected) and
*I mean to read these in this order* (a Path) — and had no way at all to say *I want to read
this*. So the only door into the **Pile** was minting a Path, a named and ordered
route that **cannot be undefined**, for something that was never a route; and a Series wholly
on the shelf and wholly unread stood nowhere at all, because the Series source names the
Volumes that are **missing** and there were none.
It pairs with the **Wish**, and the pair is the whole distinction: **a Wish names a Volume and
is about owning; a Want names a Story and is about going through it.** Neither implies the other — the
owner wants to read what they will borrow, and buys what they will not open for years.
It **ends by itself and never by a deliberate act**, which is exactly where it parts from the
Wish: nobody closes a Want, and there is no second truth to keep in step with the Passes. It
falls quiet when a **Pass began after the Want was opened** — a comparison of dates rather
than a state, which is what makes **rereading ordinary instead of a special case**: a Want
opened today on a Story read in 2019 finds no Pass later than itself and stands on the list
until the owner actually rereads it. Nothing anywhere says *this one is a reread*; it is one
because the pass is older than the wish to go through it again.
_Avoid_: wish — that word is taken and means the object. Also to-read, plan, backlog, which
the Pile's own avoid-list already refuses, and **shelf** — a Want is one sentence about one
Story, not a place things are put.

**The Pile**:
What to take on next — read or play — and it is **two halves rather than one list**. It is what
the application is named after: the pile that keeps growing.
The **head** is what the owner has pinned, in the order they pinned it. It is short because
every row in it is a decision, and it is the only place an order means anything.
The **reserve** is everything else, and it **composes itself** from four sources — every
Story still to read on an active **Path**, every open **Want**, every **run with somewhere left
to go**, and the next missing **Volume** of every **Series** being collected — rather than
being a list kept by hand. A route
contributes **everything still ahead on it** and not merely its next stop, because what stands
behind that stop has to be visible before it can be pinned: that is what makes *three Marvel
stories and then a DC one* sayable rather than only nameable. A **run** contributes the
**Instalment** that comes next for as long as it has somewhere left to go **and it is either all
on the shelf or the owner has begun it**: *the run is the whole signal*, so *Slam Dunk* —
collected, twenty published and twenty on the shelf, which the Series source has nothing to say
about because nothing is missing — stands on the list with no route minted for it, no flag on
its line and no **Want** needed, at *nought of twenty* until the owner opens it. That condition
is what keeps the list a list once the count of Instalments **follows the line** and nearly
every work with a ledger behind it declares parts: *Berserk* at two of forty-three is a line the
owner owns a corner of and has said nothing about, and it waits until they own it whole or open
it. Nothing else is asked for — no flag to fill in, and whether the owner means to complete the
line says nothing about whether tonight's reading is in the house. *All on the shelf* is read
against the line's own count published, so a ledger nobody has filled in cannot claim it. It
leaves the list by itself, the way a Want falls quiet: a **Pass** that finished
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
A row carries an **intended medium** where an object carries it, and it is there for one
question — what it takes to start tonight: an object means it must be on the shelf or bought
first, and anything that goes through none can be started now.
Where **no object carries it**, the row names no medium at all, and that is an answer rather
than a gap: a medium is a fact about a **Pass** and nobody has passed through this yet, so
there is nothing to go on and the list does not guess. It read *digital* until a videogame
could stand here, and nothing is played on paper or on `digital` either. It costs the row
nothing, because what the medium is there to answer — *can I start this tonight* — is the same
answer either way: nothing has to be got first.
**One pile holds both**, and the row says which by its Type rather than by standing in a
different list: the whole reason an external reader can weigh *three manga against twelve
games* is that it is looking at one arrears and not at two. It can be **narrowed** to one Type
where the owner has already decided what kind of evening it is, and that is a way of *reading*
the one list rather than a second list: what an external reader is handed crosses every Type in
one call, and the narrowing changes what is shown and never the order. For a Story with no objects behind
it — every videogame — two of the four sources are silent, since neither names a Volume, and
what speaks is the **Want** and the **Path**.
_Avoid_: readlist, to-read, backlog, queue — and **reading list**, which named half of what
it holds from the day a videogame could stand in it.

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
It is also **how a saga is held together**, and the only way: *the three Dark Souls* is a Path
the owner writes, not a fact the library keeps. A **Series** cannot do it — a Series is a
ledger over Volumes, and a saga of videogames has none — and a grouping of its own would answer
the same question twice. A Path set **not active** groups without putting anything on the
**Pile**, which is what makes it usable for a saga the owner is not playing through now.
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
the two kinds of writing are not the same risk: a Pass, a Rating, an acquisition or a
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
silent, and wrong in a way the owner will never notice, where a Pass recorded on the wrong
day is obvious the moment it is read back. It amends **one record**, so what it proposes is
legible beside what stands there today, and approving it is the act that changes the record.
It amends the record's **fields**, and a **Credit** is not one of them: a person in a role on
a Story is a record of its own, visible the moment it is wrong and undone whole by removing
it, so it is attributed directly and never amended into the Story (ADR-0012).
_Avoid_: edit, update, correction, patch — and **suggestion**, which promises something the
owner may leave lying around; an amendment waits for a decision exactly as a creation does.

**Type**:
Manga, Comic, Graphic Novel, Novel, Non-fiction, Play, Videogame. An **attribute** of a story,
not a kind of thing: the model is one model, and a novel and a tankōbon differ in their
attributes, never in their shape. A **Videogame** differs by carrying no object at all, which is
not a second shape — a Story owing no Volume to anybody is the ordinary case the model already
holds, and it is what an ebook has always been.
It is **data rather than an enum** (ADR-0006), so meeting one this list does not have is an
insert — which is how **Play** arrived, with the books half: *Harry Potter e la maledizione
dell'erede* is a script, the owner's own sheet says so in the column every other row uses
for *Romanzo*, and calling it a novel to avoid an insert would put a wrong fact in the
library. The same sentence let *spillato* into the Bindings, and it decides both the same
way.
It decides which **media** are offered and nothing else, which is why the Type is chosen before
the medium wherever both are asked for: paper and digital for what is printed, the consoles for
what is played (ADR-0021).
