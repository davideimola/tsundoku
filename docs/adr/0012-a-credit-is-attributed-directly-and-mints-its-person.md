# A Credit is attributed directly, and the attribution mints its Person

An assistant **credits a person on a Story directly**, over MCP, and the attribution **names the
Person** where the library has not met them. A Credit does not wait in the Inbox, and a Person is
the one entity created from outside it.

This settles the half of
[ADR-0005](0005-the-mcp-runs-verbs-directly-and-creates-entities-only-through-the-inbox.md) that
was left open — it names a Story, a Volume and a Series behind the Inbox and does not name a
Person — and it takes back one line of
[ADR-0011](0011-the-inbox-carries-amendments-and-approval-is-bulk.md), which listed *the artist
nobody credited* among the amendments that wait.

## What forced it

The Credits are not late, they are **absent**: the workbook holding the `Autore` column was
imported empty, so the library holds **0 people and 0 Credits** (#18). Every question the Credit
area exists to answer — *what have I read by this hand*, the one question a recommender asks
before suggesting another Story — answers nothing, and it will answer nothing until several
hundred names are typed. That is the work the spreadsheets were abandoned over, and the assistant
is the only party willing to do it (#26).

## Why it is not behind the Inbox, where the ISBN is

ADR-0011's risk is *a permanent fact nobody reads back*, and an ISBN is that at its purest: it
overwrites a column, nothing looks wrong, and a wrong one quietly fetches another book's cover
for as long as the record stands.

**A Credit is not a column.** It is a record of its own — a person in a role on a Story — so a
wrong one is *visible*, on the Story and on the person, and `uncreditStory` is a whole undo that
leaves the person standing wherever else they are credited. That is the same shape as a Reading
recorded on the wrong day, which ADR-0005 put on the direct side of the line and for the same
reason.

**And a Person exists in order to be credited.** Minting one is not a claim about the library:
a person nothing points at is absent from every screen that browses by Credit, so the row is the
Credit's own consequence rather than a second assertion beside it.

## Consequences

**One irreversible thing is accepted, and it is carried by prose rather than by a boundary.** The
name is unique on `lower(name)`, there is no rename verb and no merge verb, so a second spelling
is a second person for as long as the library stands, splitting every answer about them in two.
`credit_attribute` therefore says out loud what no constraint can: read the people who are
already there, and reuse the spelling that is there. The alternative was 0 people and 0 Credits.

**A misattribution is undone by removing the Credit**, never by amending the Story: `credit` is
not among `AMENDABLE_FIELDS`, and an amendment naming one is refused in prose that says so.

## Considered and not taken

- **A fourth entity behind the Inbox: propose the Credit.** Faithful to ADR-0011, and it makes
  the backfill cost the owner one approval per name — three hundred decisions about a fact that
  is visible and undoable, which is the friction ADR-0011 says it is buying something with, spent
  where it buys nothing.
- **Extend the Inbox to a Person only, and write the Credit directly.** The Credit cannot be
  written before its person exists, so this makes every new name a two-sitting act: propose,
  wait, credit. It is the shape that loses the sentence the whole flow is for.
- **Hold ADR-0005 unchanged.** The Credit area stays empty, and the Credit picker and the
  *read by this hand* question are both built over a table nothing is ever put in.
