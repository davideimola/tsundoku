# A Wish is planned into a month, and *bought it* is one press

Three decisions about the shopping list, taken together because each one alone leaves the
owner where they were.

1. **A Wish carries a period — the month the owner means to buy it in — and the priority
   goes.** The bands of the shopping list are months, and a Wish with no period is *someday*.
2. **A Wish can be amended.** Its period, its two prices and its shop are the owner's to
   rewrite, on the record rather than by closing one and opening another.
3. **The end of a Wish may be the press that records the acquisition.** *Bought it* writes an
   acquisition on the Volume and ends the Wish, in one transaction.

## What was wrong

The list had three priorities — 1 next, 2 soon, 3 someday — and, once opened, a Wish was
frozen: two verbs, `openWish` and `closeWish`, and nothing in between. Three complaints, and
they are one shape.

**A priority is a relative ranking, and a relative ranking ages in one direction.** *Next*
means before the others; it does not say when, and nothing about the row changes as the month
it was meant for goes by. What the owner actually says is *this period I take this one, next
period that one* — and the only way to say it with three words was to keep re-ranking twenty
rows against each other, by hand, which is the work the spreadsheet already made them do.

**Nothing could be reorganised.** Changing a priority meant ending a Wish and opening a new
one, which loses `opened_on` — the fact the list orders by, and the one that says *you have
been meaning to buy this since March*. The area's own rule is that nothing silently disappears
from what the owner meant to buy; making them delete an intention in order to reschedule it is
that rule broken by the screen it was written for.

**And buying something took two screens.** The object came home, and the owner had to record
an acquisition on the Collection and then come back here to close the Wish — two presses in
two places for one event, in a shop, one-handed. The model was right that these are two facts;
the screen was wrong to make the owner say them twice.

## Why a month, and not a hand-sorted order

The obvious repair is a total order: a numeric position on each Wish and a way to drag a row up
the list, which this repository already knows how to do — `path_item.position` is exactly that,
and the rail on a route is the gesture.

It is the wrong repair here, and the reason is what the two lists are for. **A route is an order
and nothing else**: the whole content of *read these in this order* is which comes before which.
A shopping list is not read in order — it is read against a month and a wallet. *Which of these
two comes first* is a question the owner does not have, and offering a rank invites them to
maintain an answer to it forever.

A month answers the question they do have, and it answers it **absolutely**: the row says
*September*, and in October it still says September, so a plan that did not happen is visible as
a plan that did not happen rather than as a row that has quietly kept its place at the top. It
also makes the order **inside** a band stop mattering, which is the ordering complaint dissolved
rather than satisfied: inside one month the owner buys all of them.

And it makes one number worth printing. The prices were already on the card — what it should
cost, what it costs where it was found — and a band of months is the first thing that can add
them up: *what does this month come to?* is the question a shopping list is for, and it could
not be asked of *soon*.

**Someday is the absence of a period, not a fourth value.** It is the one priority that was
never about time — it meant *not yet, and do not ask me again* — so it survives as no plan at
all, with a band of its own at the foot of the list.

**A month that has gone by is not a state.** Nothing says late, overdue or expired, nothing
warns, and nothing moves a Wish on its own. A period is a plan the owner wrote down, and this
application does not enforce the owner's plans — the posture a Declared constraint takes, and
the reason *suspended* is not a Pass outcome.

## Why amending is a verb and not a new Wish

An amendment is the correction of a record that already exists, which is a door this repository
has three of — `amendVolume`, `amendStory`, `amendSeries`. `amendWish` is the fourth, and it
parts from them in exactly one way, deliberately: **it can empty a field.**

The three existing ones cannot, because an assistant proposes them through the Inbox and *this
Volume has no publisher* is a proposal to lose a fact (ADR-0011). A Wish is the owner's own
plan about their own money: moving one to *someday* is emptying the period, and a price that
is no longer on the shelf is a price to take off rather than to leave standing as a lie. So an
absent field leaves what stands there, and a field present and empty clears it — which is a
distinction the type carries and the doors already have, since a form submits every box and an
assistant sends only what it means.

What it cannot touch is the Volume. Amending a Wish never becomes a way to correct the object
it names: that is `amendVolume`, on the object's own page, and a Wish that names the wrong
object is closed rather than repointed.

## Why *bought it* is one press and still two facts

`CONTEXT.md` says an acquisition and a Wish are unrelated: cataloguing does not begin one,
acquiring does not end one, and **a Wish ends only by a deliberate act**. All of that stands.
What changes is that the deliberate act can be the one that says why.

*Bought it* is one verb over two areas — it records the acquisition and closes the Wish, in one
transaction, so the two land together or not at all. The precedent is `sayWhatHappened`, which
has composed the same two areas since the one door shipped: *I bought it* catalogues an object
and acquires it in one breath, and nobody calls that two events.

Three things it does **not** do, and each is the model rather than an omission:

- **it does not become a state.** There is still no `Acquistato`: what is written is an
  acquisition and a `closed_on`, exactly what the two verbs write on their own;
- **it does not record why a Wish ended.** A Wish closed from *Bought it* and one closed
  because the owner stopped wanting the book are the same row afterwards, and the acquisition
  beside it is what says which happened. The model has no *reason* column and does not want
  one;
- **it does not guess at money.** The price paid is a field the owner presses through, prefilled
  with the price the Wish found, because *what it cost where I saw it* and *what I paid* are
  two numbers that are usually equal and sometimes not. A verb that copied one into the other
  silently would be inventing a receipt.

The Wish stays open when the object comes home some other way — a gift, a second copy, an
acquisition recorded from the Collection — because that is `acquireVolume` and it ends nothing,
as before.

## Consequences

- **`wish.priority` is gone and nothing keeps a copy of it** (migrations 0020, 0021). The
  backfill is the only honest reading of the three: *next* becomes the month the migration
  runs in, *soon* the month after, *someday* no month at all.
- **The period is a `date` holding the first of a month**, constrained by
  `wish_period_is_a_month`, and both doors talk in `YYYY-MM`. It is a date because the list
  compares it against `current_date` to know which band is this month and which have gone by.
- **The shopping list bands on the months that are *there*.** The list of months is not fixed —
  it is what the open Wishes carry, in order, with *Someday* at the foot — which is the same
  rule the priorities were banded by and for the same reason: a Wish cannot be on the list and
  on no band of it.
- **A band prints what it comes to, with its coverage.** The figure is the price found where
  there is one and the target price where there is not, and it is carried as `Covered<…>` like
  every other partial figure in this application: a total over the rows that named a price,
  and how many of them did.
- **The picker offers the current month and the five after it, plus *Someday*.** A period
  further out than that is a plan nobody has; the owner who has one writes the month, because
  the field takes a month and the picker is only a shortcut to one.
- **The Pile proposes no period at all.** It used to propose priority 2, *soon*, as the least
  presumptuous of three. With months there is no such value: the list knows *which object* the
  owner needs to carry on and has never known *when* they mean to pay for it, so the proposal
  carries the Volume and the screen's picker defaults to this month.
- **`wish_open` on the MCP door takes a month, and two tools join it** — `wish_amend` and
  `wish_bought`. An amending verb is not a tool where the record is a Story, a Volume or a
  Series (ADR-0011); a Wish is none of those. It is narrow, reversible and wrong in an obvious
  way, which is the test ADR-0005 set for what an assistant may write directly.
- **The Wishes screen grows two panels per card**, because both acts need a field and *an act
  that needs a field is a panel of its own*. *Close it* keeps its plain form, since it asks for
  nothing.
- **The spreadsheet importers can no longer convert their priority column.** They already
  refuse to run — the library they were written for is in production — and their planners now
  carry no period at all: the three words they read meant *rank*, and the only rows a period
  could be invented for are the ones migration 0020 has already written it onto.
