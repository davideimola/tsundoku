# The count of Instalments follows the line, and a run reaches the list held or begun

How many **Instalments** a Story has is no longer typed where a **Series** can say it. Where
exactly one Series names the Story and has published more than nought Volumes, the count **is**
that number and stays at it as the line grows. The owner correcting it by hand ends that, for
good.

And the fourth source of the **Reading list** gains a condition: a **run** reaches the list when
it is **all on the shelf**, or when the owner has **begun it**. Nothing else.

This amends [#34](https://github.com/davideimola/tsundoku/issues/34), which promised the first
half — *"where a line prints one part per Volume, they follow the volumes so nobody types
anything"* — and delivered it only for the per-Volume ranges. It extends
[ADR-0001](0001-a-story-is-not-a-volume-and-the-rating-belongs-to-the-story.md), whose separation
of the narrative from the printing is the thing this has to hold on to while joining the two
numbers, and it leans on
[ADR-0009](0009-drizzle-owns-the-migrations-and-the-schema-is-still-sql.md) for the trigger being
hand-written SQL in a generated migration.

## What forced it

Two things the owner said, a day apart.

The first: setting a Series' published count and then being asked *again* how many Instalments the
work has *"sembra la stessa cosa messa due volte"*. It is not the same fact — `series.published_count`
is a printing's and `story.instalments` is the narrative's — but in **this** library the two
coincide for almost every record. Twenty tankōbon of *Slam Dunk*, one part each. Six of *La via del
grembiule*. The merge gesture already knew it: it serialized a new work to the length of the line
it was made from. So the owner met the number twice, once as a ledger and once as a narrative, and
the second time read as a re-ask by an application that had not been listening.

The second: they own two volumes of *Berserk*, of forty-three, and are not going to read it now.
That was harmless while a serialized Story was a Story somebody had *said* something about. The
moment the count follows the line, nearly every work with a ledger behind it declares parts — and
the run source, which contributed every serialized Story still to read with somewhere left to go,
would have put the whole shelf on the Reading list.

The two changes are therefore one change. The first makes serialization automatic; the second is
what keeps *what to read next* a list of things to read.

## Following a printing's number without becoming a printing's fact

The count stays the **narrative's**, and three clauses are what keep it there.

**Only the owner's word is permanent.** A count that came from the line is the library keeping two
numbers in step; a count the owner gave is the work's own length, and no ledger moves it again.
*Ultimate Spider-Man* is a hundred and sixty issues in twenty volumes, and the day the owner says
so, the line stops answering for it — for ever. That is what makes the following a convenience
rather than a redefinition: the narrative's count is *available* to be told by a printing and is
never *owned* by one.

**Nought published is silence, not zero.** A Series with `published_count = 0` is one the owner
never filled in — three lines are in that state today — so it says nothing about the work, and the
work declares nothing, exactly as an unnumbered Story does. Reading nought as *no parts* would have
been the model inventing a fact out of a blank field.

**Two lines stop the following altogether.** *Fullmetal Alchemist* is one work whether it is
printed as twenty-seven standard volumes or as eighteen deluxe ones, and which of those says how
long the narrative is, is not a question this library is entitled to answer. So where two Series
name one Story the number stops moving and becomes the owner's. No work has two lines today; the
rule exists so that the day one does, nothing is decided behind them.

The same posture answers a line that stops answering — deleted, repointed, or corrected down to
nought. The number is **frozen and handed to the owner** rather than taken away, because a fraction
the owner has been reading against must not vanish because a ledger was edited.

## Why a column and a trigger, and not a derivation at read time

The tempting shape is `coalesce(s.instalments, the_line_count)` in the queries. It is wrong here,
and the reason is load-bearing.

The two invariants #34 insisted be **constraints rather than `if`s** are triggers over
`story.instalments`: a pass cannot stand past the end of the work
(`an_instalment_lies_inside_the_work`), and a Volume's covered range cannot fall outside it
(`the_work_still_holds_what_was_read`), both from migration `0007`. Derive the count at read time
and those triggers see only the typed numbers — so *seven of five* becomes reachable on every work
whose count came from a line, which after this change is most of them. The invariant would hold
exactly where the owner had already been careful.

Cross-table invariants are already triggers in this schema (`volume_holds_one_position` since
`0000`), so this follows the idiom rather than adding one. It is the same idiom pointed the other
way: 0007's triggers **refuse** a write that would break the count, and
`the_count_follows_the_line` **writes** the count. And the pair composes — lowering a line's
published count under a pass that has read further is refused, by Postgres, on the ledger's own
verb, in the ledger's own prose. That refusal is the clearest evidence the trade was the right one:
a read-time derivation could not have produced it at all.

The cost is one stored fact: `story.instalments_said_by`, which is `line`, `owner`, or nobody.
Without it the rule is untellable — a hand correction to the number a line happens to give is
indistinguishable from the following itself, and the correction is exactly what has to stop it. It
is a text column with a check constraint, like `rating.scale` and `reading.medium`, and
deliberately **not** a **Provenance**: a Provenance says how a record came to be known and
therefore how far it can be trusted, where this says which of two facts a number is a copy of.
Nothing about trust changes when a line answers for a count.

## What the owner's word costs

Rule three is permanent, and permanence has a price: **there is no verb that hands the count back
to the line.** A count corrected once is the owner's for ever, and a work whose numbering they took
off stays unnumbered however the line grows.

That is deliberate and it is the conservative half of the design. The alternative — a way to say
*follow the line again* — is a second control on a card whose whole purpose in this slice was to
lose one, and it answers a question nobody has asked yet: the realistic correction is *this line
prints twenty volumes and the work is a hundred and sixty issues*, which is true for ever. If the
owner does want it back, the honest door is a verb of their own and an ADR that argues for it, not
a checkbox added quietly here.

## The two user stories the run condition reconciles

They pull against each other, and the condition is the reading that satisfies both.

**User story 14** — *"a run I own completely and have not read to appear… so that Slam Dunk is not
invisible because nothing is missing"*. The Series source names what is **missing**, and for a line
wholly on the shelf nothing is; so a work owned whole and never opened has no other way in.
Requiring a pass, or a Want, would leave it exactly as invisible as it was before the tracker.

**User story 31** — *"a run in progress to appear without a Series being marked as anything, so
that starting it is the only signal needed"*. A run the owner has opened is on the list because
they opened it: no flag on the line, no collecting project, no Want.

So: **all on the shelf, or begun.** *Slam Dunk* twenty of twenty, unread — yes, and it is the row
the tracker exists for. *Your Name.* three of three, unread — yes, the same case at a smaller size.
*Berserk* two of forty-three — no. *Death Note Black Edition* two of six — no, because nearly whole
is not whole and the proportion was never the question. *One-Punch Man*, twenty-two held against a
count nobody filled in — only once begun, since a ledger at nought cannot claim the shelf is
complete.

Three things it deliberately does **not** ask for. It does not ask the owner to mark anything: a
flag on the line is the *"Series being read"* flag #34 already ruled out of scope, and every flag
is a second truth to keep in step. It does not read `collecting_since`: whether the owner means to
complete a line says nothing about whether tonight's reading is in the house. And it does not
change `STORY_STATE` — a pass that finished or was abandoned still stops a run contributing,
which is the recommendation this list exists not to make.

*All on the shelf* is read through the **arrow**, the Series' own `story_id`, and against that
Series' count published — the same arrow the count of Instalments itself follows. One question
cannot be answered off the ledger while the other is answered off the shelf. Where two lines print
one work, **either being whole is enough**, because what is being asked is whether the work can be
read through tonight and any complete printing of it can.

One case falls out of it rather than being decided by it: **a work the house holds none of and
nobody has opened contributes no run.** That is wanted — the owner reads digitally sometimes and
says a Story is read without wanting progress tracked. A work with no objects that the owner *has*
opened does contribute, because they have started it and the list's job is to help them carry on.

## Consequences

**The merge gesture types nothing.** `mergeSeriesIntoOneStory` used to serialize a new work to the
count published or the furthest position placed, whichever was further. Now it leaves the length to
the line — the arrow it sets is what gives the count and what keeps it — and writes a number only
in the one case no line will say: where the shelf reaches **past** what the ledger claims is
published, because a work shorter than the objects carrying it is not one. That number is the
owner's word, since no line stands behind it.

**A ledger edit can now be refused by a narrative's invariant**, and `whySeriesRefused` grew two
sentences for it. It names which fact is in the way and where to correct it, because the write the
owner made was on the ledger and the thing standing in the way is on the Story.

**An approved Amendment is the owner's word.** An assistant proposing a count is still an Inbox
entry (ADR-0005), and approving one now also stops the following — otherwise the number the owner
confirmed would be moved by the next ledger edit, silently, which is the exact risk that door
exists to close.

**The card lost a question rather than gaining an explanation.** Where the count comes from the
line, the Instalments card says the number and its provenance in the mono eyebrow the page already
sets a Type and a state in — *20 Instalments · From the line* — and *Say how many parts it has* is
simply not there, because there is nothing to do. What stays is *Correct the count*, and the drawer
it opens says in one sentence that pressing it takes the number off the line. No card explaining
the relation between two facts: the argument is here, and a screen is not where an argument goes.

**Two tests in the suite changed meaning rather than breaking.** The two fixtures that asserted a
run with no shelf behind it reaches the Reading list now stand a line wholly in the house, which is
what *Slam Dunk* actually is. That is the amendment doing its job, and the row the tracker exists
for is still asserted by name.
