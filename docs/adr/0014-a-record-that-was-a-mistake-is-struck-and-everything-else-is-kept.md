# A record that was a mistake is struck, and everything else is kept

A Volume can be **struck from the catalogue**: the row is deleted and the library stops knowing
the object. It is refused on anything the owner has lived with — an object in the house, one a
Reading went through, one they wrote an Edition note about, one a Wish names — and it is offered
in **bulk**, over the list of objects the Collection does not claim.

This qualifies
[ADR-0007](0007-a-volume-is-catalogued-and-the-collection-is-the-subset-in-the-house.md), which
says an acquisition that ends is not deleted and the catalogue keeps the object. That rule
stands. This one is about a row that never stood for anything.

## What forced it

An assistant proposed *Slam Dunk 5* to *9* as new Volumes under a Shinsōban edition line the
owner does not own, the owner approved the batch, and the catalogue now holds each of those
objects twice. There was no way to undo it: `releaseVolume` keeps the record by design, and the
Inbox's rejection only leaves a proposal unapproved — once approved, **the entity is permanent**
([ADR-0005](0005-the-mcp-runs-verbs-directly-and-creates-entities-only-through-the-inbox.md)).

That is the gap. ADR-0005 accepts the risk of a hallucinated entity by putting creation behind
the owner's approval; it assumed the approval was the safeguard. Approval is **bulk**
([ADR-0011](0011-the-inbox-carries-amendments-and-approval-is-bulk.md)) — forty at a time,
deliberately, because that is the only way the backfill was ever going to happen — and a
safeguard exercised forty at a time is a safeguard that will let things through. The Inbox's
front door is bulk, so the back door has to exist and has to be bulk too.

## Why this is not the delete ADR-0007 refuses

**Releasing is about the world; striking is about the record.** Releasing says the object left
the house, and it keeps everything, because a Reading made through the object and the note
written about it are facts about the owner's past that a delete would take with them. Every word
of that is about an object that *was real*.

A duplicate has no past. Nothing was read through it, nothing was judged about it, and the house
never held it. Deleting it removes an assertion that was never true, which is the opposite of
losing history — leaving it is what makes the catalogue wrong.

**So the boundary is not "is this a delete?" but "did anything happen to this object?"**, and it
is enforced as four refusals rather than a warning:

| Refused when | Because |
|---|---|
| an **open** acquisition | it is on a shelf. Release it first — and then think again |
| a **Reading** went through it | an event in the owner's life names this object |
| an **Edition note** | prose the owner wrote about it *as an object* |
| a **Wish** names it | an intention they recorded against this exact Volume |

**Ended acquisitions go with it, and that is the deliberate half.** A duplicate's purchase
history is as fictional as the duplicate, and the foreign key refuses the Volume while one
stands — so the verb deletes them, and the line is the *open* acquisition rather than any
acquisition at all. This is the one place striking can destroy something real, and it is why the
control lives only over the list of objects the Collection does not claim: nothing on the shelf
is reachable from it.

## Consequences

**The selection lands whole or not at all.** One refused object refuses the gesture and names
itself, and nothing has moved when the screen comes back. Half a clean-up is worse than none:
the owner would have to work out which half.

**There is no MCP tool, and there must not be one.** The party that files a hallucinated
duplicate is exactly the party that must not be able to delete rows to tidy up after itself
(ADR-0005). Striking is the owner's act, from the owner's surface, and adding a tool for it
would be a decision for an ADR rather than for a tool file.

**A bulk destructive control needs its count to be legible without a script.** The screen this
lives on is the one ADR-0010 exists for, so the number of ticked rows is a **CSS counter** — the
list resets it, each ticked row increments it, the button reads it — and the bar does not exist
until something is ticked. *How many am I about to destroy* is not decoration on a delete.

**An Inbox rejection is still the cheap way, and this is still the expensive one.** Nothing here
makes approving in bulk safer; it makes it survivable. The Inbox is where a duplicate should be
caught, and the entry showing what stands in the record today beside what is proposed (ADR-0011)
is the thing that would have caught this one.

## Considered and not taken

- **A soft delete: a `struck_at` column, and every query filtering on it.** It would keep the
  row for an undo nobody will ever run, and put a predicate in every query about Volumes for
  ever — including the ones that have not been written yet, which is how a soft delete leaks. A
  record that was never true is not worth a column on every future question.
- **Cascade the lot, and let the owner delete anything.** Then the one mis-tick that matters —
  an object with fifteen years of acquisitions on it — is unrecoverable, and the four refusals
  are the entire safety of the feature.
- **One object at a time, from its own page.** Safe, and it makes undoing ten duplicates ten
  navigations to repair somebody else's minute of work. The mess arrives in bulk, so the answer
  is bulk; the safety comes from what is refused, not from how slow it is.
- **Let the Inbox undo its own approvals.** The honest version of this, and much larger: the
  entry would have to record what it created and how to unmake it, and *unmake* is exactly this
  verb with an audit trail on top. Worth reopening if approvals ever need to be reversible as a
  class rather than a mistake at a time.
