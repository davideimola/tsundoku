# The Inbox carries amendments, and approval is bulk

An assistant may **propose an Amendment** — an ISBN on a Volume catalogued without one, an
artist nobody credited, a publisher left blank — and it waits in the **Inbox** exactly as a
proposed Story, Volume or Series does. Approval is the act that changes the record. Because
amendments arrive by the hundred rather than one at a time, **approving them works on a
selection**, and an entry shows what stands in the record today beside what is proposed.

This extends [ADR-0005](0005-the-mcp-runs-verbs-directly-and-creates-entities-only-through-the-inbox.md)
rather than contradicting it: the line still runs between what is narrow and reversible and
what becomes a permanent fact.

**One example above was taken back.** *The artist nobody credited* is not an amendment:
[ADR-0012](0012-a-credit-is-attributed-directly-and-mints-its-person.md) puts a Credit on the
direct side of that line, because it is a record of its own and not a column — visible when it is
wrong, and undone whole. Everything else here stands, the ISBN included.

## What forced it

The owner's assistant is not only the recommender. It is also the maintainer: the library
was imported from spreadsheets that had no ISBN column at all, so **0 of 96 Volumes carry
one**, and the workbook that held the `Autore` column came in empty, so there are **0 people
and 0 Credits**. Filling that in by hand is the reason the spreadsheets were abandoned.

ADR-0005 has no answer for it, because completing a record that already exists is neither of
the two things it split. And there is no path anywhere: `creditStory` exists in
`src/core/verbs/credit.ts` and is not exposed over MCP, where `credit_people`, `credit_person`
and `credit_roles` are all reads; nothing in the app, MCP or web, writes an ISBN onto a
Volume that already exists.

## Why it lands in the Inbox and not in the verbs

The risk ADR-0005 names is *a hallucinated fact the owner carries for years*, and an ISBN is
that risk at its purest: nobody ever reads one back, nothing looks wrong, and a wrong one
quietly fetches another book's cover for as long as the record stands. A misattributed artist
is the same failure with a friendlier face. That is the opposite of the Readings and Ratings
the verbs write directly, which are wrong in a way the owner notices the next time they look.

An assistant filling three hundred fields in one sitting is not a smaller version of that
risk. It is the largest instance of it the library will ever see.

## Consequences

**The Inbox stops being a footnote.** It is the screen a maintenance session happens in, and
it has to hold a few hundred entries legibly — grouped, diffed against what is there, and
approvable in one gesture. Sized for one entry at a time, it makes the backfill cost more
than doing it by hand, which is the same as refusing it.

**Rejection still leaves nothing.** An amendment that is turned down leaves the record
untouched and the entry is its only trace, as with a creation.

## Considered and not taken

- **Let maintenance write directly, keeping the Inbox for new entities.** The fluent path,
  and it puts the least visible class of error on the least supervised road.
- **Hold ADR-0005 unchanged.** Nothing changes, so the ISBNs and the Credits never arrive,
  and the wall and the Credit picker are both built on a table that stays empty.
