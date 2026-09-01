# Striking reaches the Story, and a mistake gets its own door

A **Story** can be **struck from the library**: the row is deleted and the library stops knowing
the narrative. It is refused on anything the owner has lived with — an object in the house
carrying it, a Reading through it, a score on it, a Path naming it as a stop — and it is offered
twice: in **bulk**, over the Stories nothing has happened to, and **one at a time**, from the
Story's own page.

This extends [ADR-0014](0014-a-record-that-was-a-mistake-is-struck-and-everything-else-is-kept.md),
which said the same thing about a Volume, and it takes back one line of it: *one object at a
time, from its own page* was listed there as considered and not taken. For a Story it is taken,
and the reason is below.

## What forced it

ADR-0014 fixed the catalogue and left the wall. The gap it was written about is not a fact about
Volumes: an assistant may not create a Story and may **propose** one
([ADR-0005](0005-the-mcp-runs-verbs-directly-and-creates-entities-only-through-the-inbox.md)),
approval is **bulk** by design
([ADR-0011](0011-the-inbox-carries-amendments-and-approval-is-bulk.md)), and a safeguard
exercised forty at a time will let things through. What got through was permanent. The Inbox's
rejection only leaves a proposal unapproved; `amendStory` corrects a narrative that should
exist rather than unmaking one that should not; and so the Story wall could hold two tiles for
one narrative with nothing anywhere on the screen able to say so.

A duplicated Story is worse than a duplicated Volume in one specific way, which is why this is
not merely tidiness. **The Story is what the assistant recommends from**
([ADR-0002](0002-the-app-holds-no-model-and-the-recommender-is-external.md), the read corpus): a second *Slam Dunk* with no
Reading on it is a narrative the library believes the owner has never touched, and it will be
recommended back to them for ever.

## Where the boundary is, said again in a Story's terms

ADR-0014's rule is *did anything happen to this object?* The same question asked of a narrative
answers with four different records:

| Refused when | Because |
|---|---|
| an object **in the house** carries it | the narrative is as real as the thing on the shelf. Say the object no longer carries it first — this is the rail |
| a **Reading** went through it | an event in the owner's life names it. No duplicate has one |
| a **Rating** stands on it | the judgement, which is the one record that is only ever about a narrative and never about an object ([ADR-0001](0001-a-story-is-not-a-volume-and-the-rating-belongs-to-the-story.md)) |
| a **Path** names it as a stop | an ordering the owner planned. Nothing but the owner writes one |

A score with **no Reading behind it** refuses too — a column imported off a sheet is still the
owner's opinion — and that is the one branch a *has it been read* test would have missed.

**What goes with it is the Credits, and the people stay.** This is the half that differs from a
Volume's strike. A duplicate carrying *Takehiko Inoue, writer* is carrying an attribution of a
narrative that does not exist, so the Credit goes; a Person is not owned by the Credit that
first named them
([ADR-0012](0012-a-credit-is-attributed-directly-and-mints-its-person.md)) and keeps every other
Credit they hold. The record of which catalogued objects carried it goes too, and there is no
foreign key to clear first the way a Volume's ended acquisitions had to be: every reference to a
Story cascades, and the two references that would matter cannot exist, because either of them
refuses the gesture.

## Why a Story gets the door a Volume did not

ADR-0014 rejected the single-object control as *the* answer, and it was right: the mess arrives
in bulk, and repairing ten duplicates one navigation at a time is ten navigations to undo
somebody else's minute. That argument is untouched — the bulk control is still the main door.

The second door exists because of what the bulk list **is**. Striking a Volume is offered over
the objects the Collection does not claim, which is a list that exists for its own reasons and
happens to be safe; the ordinary Volume the owner is looking at is *in the house*, so a refusal
is a thing they can actually meet. A Story has no such pre-existing list, and the one this ADR
defines — the Stories nothing has happened to — is **defined as the set the verb accepts**. So
from that panel no refusal is reachable. The four sentences that are the entire safety of the
feature could never be read by the owner, and a rule nobody is ever told is a rule they will
walk into from the other direction: *why is this duplicate not in the list?*

The Story's own page answers that, and it is where the owner is standing when they know the row
is wrong — looking at a tile with no Readings, no score and nothing carrying it. So the press
is offered **whatever stands on the Story**, and the verb's refusal names what stands. The
screen deliberately does not re-derive the four to decide whether to draw the control: that
would be a second copy of the rule, and one that cannot see the fourth branch at all, since a
Story's page never asks which Paths name it.

## Consequences

**The selection lands whole or not at all**, as ADR-0014 has it: one refused Story refuses the
gesture, names itself, and nothing has moved when the screen comes back. One selection of one is
the same verb, so the Story's page and the wall's drawer cannot come to disagree about what is
allowed.

**The list is the rule read backwards, in one expression.** `WHY_A_STORY_STANDS` is SQL exported
from `core/verbs/story.ts`: the verb spends it to find the Story that stands and name it, and
`listStoriesNothingHasHappenedTo` selects the rows it has nothing to say about. A `not exists`
written twice would drift the day a fifth branch is added, and the drift would be a screen
offering a tick the verb refuses — which is exactly the failure the whole-or-nothing rule makes
loud and pointless.

**There is no MCP tool, and there must not be one.** ADR-0014's sentence, unchanged and for the
same reason: the party that files a hallucinated Story is exactly the party that must not be
able to delete rows to tidy up after itself (ADR-0005).

**The count is a CSS counter again.** The wall's drawer resets it on the list, each ticked row
increments it, the button reads it, and the bar does not exist until something is ticked — so
the screen works with nothing running in the browser
([ADR-0010](0010-javascript-runs-on-the-owner-surface-and-no-write-depends-on-it.md)) and still says how
many rows a press is about to destroy.

**Striking is now a class of act rather than a Volume's.** A third entity asking for it — Series
is the obvious one — is a boundary to write down and not a new idea, and the shape is fixed:
name what the owner has lived with, refuse whole, and say what follows the row out.

## Considered and not taken

- **Refuse on any Volume carrying it, not just one in the house.** It would make the rail
  simpler and lock the owner out of the mess they actually have: a duplicate an assistant filed
  *and linked* to a catalogued object it invented is unreachable, and unlinking it first is a
  trip to a screen about the wrong thing. The link is not the owner's life; the shelf is.
- **Refuse on a Credit.** A Credit is an attribution of a narrative, and if the narrative was
  never real neither was the attribution. Refusing on one would mean an assistant that credited
  its own hallucination had made it permanent, which is precisely the loop ADR-0014 exists to
  break.
- **A soft delete: a `struck_at` column and a predicate in every query about Stories.** Rejected
  for ADR-0014's reason, and harder here — the Story is read by `STORY_STATE`, the wall, the
  Paths, the Reading list, the credits' body of work and the read corpus MCP recommends from. A
  record that was never true is not worth a predicate on every future question.
- **Let the Inbox undo its own approvals.** Still the honest version, still much larger, and now
  wanted twice: the entry would have to record what it created and how to unmake it. Worth
  reopening if approvals ever need to be reversible as a class.
