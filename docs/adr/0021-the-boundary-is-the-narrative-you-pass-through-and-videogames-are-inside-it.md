# The boundary is the narrative you pass through, and videogames are inside it

**Videogame** joins the Types, in this model and not in a second one. A game is a **Story** by
the test that was already written — *a Story is what you would give a score to* — it is gone
through in a **Pass** that finishes or is abandoned, it takes a **Rating** on the narrative and
never on an object, it is meant to be played by a **Want**, and it stands on the **Pile** beside
the manga. Nothing is generalised to let it in. It carries no **Volume**, and a Story owing no
object to anybody is the ordinary case this model has held since ADR-0001.

This amends
[ADR-0006](0006-one-model-for-reading-and-other-collections-are-a-second-context.md), which put
"non-reading collections" outside and named board games as the example. The boundary it drew is
kept and its line is moved: what this model holds is **a narrative you pass through once and
judge**, and what falls outside is **an object you own and reuse**. Board games stay outside,
now for a reason that survives contact with a videogame — a board game has no pass that ends,
and *abandoned* says nothing about Catan. They will arrive as the second bounded context 0006
predicted, with their own glossary under a root `CONTEXT-MAP.md`.

Two words change with the boundary, because the old ones named half of what they hold.
A **Reading** becomes a **Pass**, which is the word `CONTEXT.md` was already using every time it
had to explain the record to itself. The **Reading list** becomes **the Pile**, which is what the
application is named after, holds a game and a novel without leaning towards either, and promises
no order — the list is unordered on purpose.

## What forced it

The owner asked whether this could hold videogames, and answered the design question in the
asking: *"alla fine i giochi sono semplici, c'è una storia e un voto"*, and *"il possesso fisico
non mi interessa"*. That second sentence is the whole reason the answer is yes at this price.
Volume, Series, Instalment, Binding, Wish and Acquisition — the entire collector's half, and
every part of this model that is genuinely about paper — is **declined rather than stretched**,
and what remains is the half that was never about paper in the first place.

0006's argument was that generalising would cost "Story, Reading, Series and rating-on-story,
which is everything that makes this model good at reading". That cost is real and it is not
charged here, because nothing is made neutral: Story keeps its test, the Pass keeps its outcomes,
Series stays a ledger over objects and simply has nothing to say about a game, and the Rating
stays on the narrative. The word *reading* in 0006's boundary was doing the work of *narrative*,
and a videogame is the case that shows the difference.

The third thing the owner said settles the shape of the surfaces: they want to see
*"cosa ho di letture, cosa ho di videogame, cosa ho di board game"*, and a view of everything at
once **"per farmi sentire peggio"**. That last one cannot be the Collection, which is the query
over Volumes in the house and where a game will never appear. It is the **arrears** — Stories with
no concluded Pass, of any Type — which is what the application is named after and the one view
that genuinely crosses the boundary this decision draws.

## What the test costs, and why it is still the test

*A Story is what you would give a score to* is kept as the definition, and `CONTEXT.md` loses the
word *narrative* from the opening of that entry, because the test now admits things that hold no
story: *Tetris* is a thing a score would be given to. The owner does not intend to catalogue many
of those — *"non gioco quasi più multiplayer, solo single player"* — and that is a fact about
their shelf rather than a rule, so nothing refuses them.

The same test settles remakes without a special case. Each game is its **own Story**, because a
remake is scored apart from what it remakes, and a remaster usually is not. The link between the
two — *this one revisits that one* — is **deliberately not modelled**: it would be the first
Story-to-Story relation in the library, and the question it answers (*you rated the original a
nine*) has not yet been asked by anything. It is written here so that adding it later is a
decision and not a discovery.

## Consequences

**A saga is a Path, and there is no fourth grouping.** *The three Dark Souls* is a route the owner
writes, crossing whatever it likes, exactly as *Recupero Batman* does. A Series cannot hold it —
a Series is a completeness ledger over Volumes and a saga of videogames has none — and a
*franchise* concept of its own would answer the Path's question a second time. A Path marked **not
active** groups without contributing to the Pile, which is what a saga nobody is playing needs.

**Suspended is not a state, because a Pass that has not ended already is one.** `outcome` is
nullable and `reading_unconcluded_has_not_ended` holds the pair together: no outcome, no end date,
still under way. What separates *I am playing this* from *I put this down in March* is how long
ago it started, which the record already carries — and a field saying it would be a second truth
nobody keeps in step, which is the objection `CONTEXT.md` raises against *reading status* in the
first place.

**A game enters by the narrative half of the door only** (ADR-0019). The object half catalogues a
Volume and there is no Volume to catalogue. That half asks a medium, and the medium it may ask for
now depends on the Type — so **the Type is chosen before the medium**, and the values offered
follow it: paper and digital for what is printed, the consoles for what is played
([ADR-0022](0022-the-medium-is-a-vocabulary-and-only-paper-goes-through-an-object.md)).

**A game's tile wears the owner's own image or the Series tint, and nothing is looked up.**
Covers are hotlinked by ISBN from Google Books and Open Library (ADR-0013) and hang on the
**Volume**, because a narrative is not an object; a game has neither an ISBN nor a Volume, so the
only image it can ever have is one the owner hosts — which is what every Bonelli monthly already
is. A box-art source of its own (IGDB, SteamGridDB) would need an API key, a domain added to the
hotlink constraint and 0013 amended, and it is **not taken**: an image a third party can revoke is
what 0013 exists to be careful about, and the owner can add it later without undoing anything.

**Two roles are added and two kinds of thing are refused.** `credit_role` gains **director** and
**composer**, because a Credit is indexed by person to answer *what else did this one do* and both
pass that test. A **studio** and a **publisher** are not people and do not enter by this door; if
they are ever wanted, that is a decision of its own.

**Physical ownership of a game is left out, and the door stays open by itself.** A boxed game is
an ordinary Volume with a Binding of its own and no ISBN. Nothing is built to keep that possible,
because nothing needs to be.

**Renaming Reading reaches the MCP tool names, and ChatGPT caches those.** The rename is a
migration, the verbs in `src/core`, both adapters, and a connector that has to be re-added on the
other side before it sees the new list. That cost was weighed and paid once, deliberately, rather
than left to be paid by halves later.

## Considered and not taken

- **A second bounded context for videogames**, which is what 0006 read literally would give. It
  costs two MCP doors and a second connector, and it takes away the only thing that makes the
  arrears worth asking about: that one external reader can weigh three unread manga against
  twelve unplayed games in a single answer.
- **Keeping `Reading` and renaming only the list.** Defensible — the list is what the owner looks
  at, the record is a word in the code — and refused because a glossary that is half renamed is
  the state this repo has been careful never to be in.
- **A `Videogame` Type without touching the words**, leaving `Reading` to mean an act of playing.
  It is the cheapest thing and it is the one that rots: `CONTEXT.md` had already stopped using the
  word when explaining itself.
