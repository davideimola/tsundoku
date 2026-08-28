# A volume is catalogued, and the collection is the subset in the house

A `volume` row existed only because `acquireVolume` had created it, so being recorded and
being owned were one event and **every** volume the library knew was in the collection. The
shopping list built on that was structurally correct and practically absurd — every row of
it said *the collection already claims this volume* — and the spreadsheet import could not
name the twenty-one wishlist objects without claiming the owner had them on the shelf.

So the three words separate:

    volume       the object as catalogued: publisher, edition line, Binding, language, ISBN
    acquisition  the explicit fact that it is in the house, and until when
    Collection   the query over Volumes with an open acquisition

A **Wish** names a catalogued Volume, owned or not. Cataloguing an object is what the owner
does to want it, to compare it in a shop, or because it is on the shelf; which of those is
true is the acquisition's business and nothing else's.

An acquisition is **its own table** rather than two columns on `volume`, for two reasons and
the second decided it. What was paid and the day it came home are facts about an acquisition
and not about the object — the same object bought twice was bought at two prices — so
`volume` loses `price_paid`, `purchase_date` and `released_on` and gains nothing. And the
fact has to be sayable without a day: a volume owned since before any of this was written
down has no receipt, so a nullable `acquired_on` on the object could not tell *in the house,
day unknown* from *catalogued, never owned*, which is the whole distinction being drawn. The
row's existence is the fact; the day is only when.

## Consequences

- The **Collection is a subset of the catalogue**, everywhere. `searchCollection`,
  `countCollection`, the Series ledger's `ownedCount` and its derived missing Volumes, and
  the Wish's `inCollection` all read *has an open acquisition* rather than *exists*. A
  screen or an MCP tool answering nothing now means *not on the shelf* and never *never
  heard of*, and both say so where a reader could get that wrong.
- **A Volume sold and bought again is one object with two acquisitions**, which is truer
  than the two rows it used to take. One open acquisition per volume is a partial unique
  index, so the history is unbounded and the collection can never claim one object twice.
- **The Series' invariant costs a function.** "One owned volume per position per Series" was
  a partial unique index over `released_on is null`; ownership now lives in another table
  and no partial index can read one, so the same rule is a trigger raising the same unique
  violation under the same constraint name — the verb and the prose the owner reads are
  untouched. A *total* unique index was the cheaper alternative and was refused: it would
  also forbid cataloguing two printings of one position, and cataloguing what the owner does
  not own is the point of this decision.
- **The Collection screen has two registers**: the shelf, and — in a dashed frame — the
  objects the library knows and the house does not hold, each with the one form that says it
  arrived. Recording a Volume and saying it is in the house are two verbs and therefore two
  submissions; the screen asks for the price at the second one, where it becomes true.
- MCP gains nothing and loses nothing: `collection_search` still answers with the house, and
  now says that it is answering with a subset.
