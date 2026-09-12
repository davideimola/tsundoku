# An ending that never happened is struck, and finishing is reaching the end

How a **Pass** ended can be **struck on its own**: the outcome goes, the day it ended goes with
it, and the pass stays — its medium, its Provenance, the Volume it went through, the Instalment
it reached, and the Rating the owner wrote. **Nothing refuses it.** It is offered from the row
itself, on the Story's own page, one pass at a time, and only where there is an ending to unsay.

And the way in is narrowed to match: **finishing is reaching the end**, so `finishPass` refuses a
pass that *says* where it got to while that is short of the last Instalment. The two answers are
the two acts that were always there — move it on, or give it up. A pass that never counted is
finishable exactly as before.

This extends [ADR-0018](0018-striking-reaches-the-reading-and-a-judgement-is-what-refuses-it.md),
and it is the same rule one field in: a pass that happened is permanent, a pass that never
happened is struck — and so is an **ending** that never happened. It leaves untouched the rule
this repo has stated since the first migration: a Pass is never overwritten, and this is not an
edit of one.

## What forced it

*All-Star Superman* read **`read`** to every assistant that asked, on the strength of a single
issue.

The row was not even wrong about the reading. It said `1 of 12`, it carried the day, the medium,
and 7.5 out of 10 with a written paragraph about Morrison's first impression. One field in it was
false — `finished` — and that one field is the only one `STORY_STATE` looks at. So the Story
answered `read`, an assistant reading the library over MCP built a whole reading path on top of
it, and the fraction standing beside the outcome was never consulted by anything.

**Nothing in the library had produced that row on purpose.** Its Provenance is *typed from the
shelf*: it arrived through the import, where the only sentence available about a narrative the
owner had opened was *I read it*. The import did not lie — it said the one thing it could say.

**And there was no way back that did not cost the owner something they wrote.** There were three
doors and each is refused or false:

- *Finished* differently is not a door at all: `concludePass` refuses a pass that has already
  ended, because a Pass is never overwritten.
- *Gave up* is the same refusal, and it would be a false statement besides — the owner's own
  paragraph says *interesse concreto a proseguire*.
- **Striking the pass** is refused the moment it carries a score (ADR-0018), and satisfying that
  refusal means striking the Rating first — so correcting *how it ended* began by unwriting *what
  I thought of it*, and then retyping the paragraph from memory into a new pass.

The fourth idea is worse than all three: **a second pass, left open, beside the finished one.**
It reads `reading`, which is the answer the owner wanted, and it buys that answer by recording
that the run was gone through twice. It is a lie in the one table this schema treats as history.

## Why this is ADR-0018's case and not an edit of history

ADR-0018's boundary — ADR-0014's, one entity along — is not *is this a delete?* but **did
anything happen to this record?**

The pass happened. The reading happened, the judgement happened, the first issue was finished.
What did not happen is the **ending**, and it is a field rather than a row only because this
schema stores an outcome on the pass it concludes rather than as an event of its own. Striking it
asserts nothing new and loses nothing that occurred: everything in the row that records something
the owner did stays exactly as they left it.

This is the distinction the ADR is built to hold. *It went differently* is a second Pass and
always will be — the pass that happened keeps its outcome, its date and its score, and the next
one stands beside it. *It never ended* is not a second pass and not an edit of the first: it is
the removal of an assertion nobody made.

**The end date goes with it, and not because it is tidy.** `pass_unconcluded_has_not_ended` does
not allow a pass with no outcome to hold a day it ended, and that constraint is right: an open
pass that ended on a Tuesday is two statements that cannot both be true.

## Why nothing refuses it

Because the record that refuses a strike of the whole pass is **not at risk here at all**.

`rating_belongs_to_the_story_passed_through` is `on delete set null (pass_id)`, so striking a
rated pass leaves the judgement pointing at nothing and quietly turns *what I thought of that
pass* into *what I think of the narrative* (ADR-0018). Striking only the outcome deletes no row.
The Rating goes on pointing at the same pass, and that pass goes on being the same act of
reading — now correctly described as unfinished. Nobody's sentence changes meaning.

So this door sorts into ADR-0016's second shape rather than its first: like a Rating's own
strike, there is nothing to clear first and nothing that changes by its going. **And that is the
whole reason it exists rather than *strike it and record it again*** — the alternative was a
refusal whose only answer cost the owner a paragraph.

## Why finishing is now refused short of the end

Because a door that only cleans up after the fact leaves the state reachable, and the state is
what an external reader is handed.

`CONTEXT.md` already says the half of this rule that is about the way out: *a pass that has
reached the last Instalment is still open, because finishing is a separate act the owner
performs*. The complement was never written down, and without it *finished at 1 of 12* is a
shape any door can produce — the import did, and so could a mis-tap in the owner's own drawer.

**Three doors, because the state has three ways in.** `finishPass` writes the outcome onto a
pass that has a fraction; `recordPass` writes both in one statement, which is how the forcing
row arrived; and `recordInstalmentReached` moves the fraction under an outcome that is already
there — without that third one, *finished and not counting*, which is the shape the one door
records, could be walked to *1 of 12* from the owner's own screen in a single press, and the
first two refusals would be guarding a door with a window beside it. The third says so in prose
of its own, because the answer it points at is different: **say it never ended first**, which is
the act this ADR opens.

**It is a refusal on the act and not an invariant in Postgres**, which is a departure from this
repo's posture and a deliberate one. A trigger holding *a finished pass stands at the last
Instalment* would have to fire when the **count** moves, and a count that moves is ordinary: a
line that publishes a thirty-second tankōbon after the owner finished thirty-one has not made
their reading a lie. So the rule belongs to the moment of pressing *finished*, where it is a
question about what the owner is asserting right now, and it sits in the verb beside
`concludePass`'s own *already ended* — which keeps precedence, because that is the truer sentence
about a pass that has one.

**Only a pass that says where it got to is held to it.** A null `at_instalment` is the owner not
counting, which `recordInstalmentReached` already treats as a first-class answer and which is
what the one door records when it catalogues *I read it*. Holding that pass to the rule would
break the main way records enter the library in order to catch a case it cannot even see.

Each gate lives **inside the statement its door writes with** rather than in a read before it,
which is this repo's one-verb-one-transaction rule (`src/core/verbs/README.md`) rather than a
flourish: a pass moved on between a check and an update would be finished under a rule that had
already answered. The prose has one author and the gates have three homes, and that is the trade
written down — what the three must never disagree about is the sentence the owner reads.

**Abandoning short stays open, and the asymmetry is the point.** Stopping at the first Instalment
is what giving up *is*, and abandonment is real evidence about taste that this library keeps. The
refusal names that door by name, because a refusal the owner cannot satisfy is the dead end
ADR-0018 was written to end.

## Consequences

**The rows the old shape already produced are not addressed here.** Every run the import touched
arrived `finished`, and how many of them stand short of their last Instalment is a question about
the production library rather than about this decision. They are correctable one row at a time
from the screen, by the owner, which is what this door is for; whether a migration should sweep
them is a separate decision and needs the count first.

**It is the owner's act and never the assistant's**, like every strike (ADR-0005, ADR-0014). The
party that can record a pass through the MCP door is exactly the party that must not be able to
unsay how one ended, so there is no tool for this in `src/lib/mcp/tools/`. The assistant does
feel the other half: `finishPass`'s new refusal reaches it in the verb's own prose, which is the
right way for it to learn that finishing means reaching the end.

**One at a time, and never in bulk**, for ADR-0018's reason exactly: a mis-tap arrives alone, and
the list a bulk door would stand over is the owner's own reading history.

**It is drawn only where there is an ending to unsay.** An open pass carries the three acts it
has — rate it, move it on, strike it — and no fourth that would be refused the moment it is
pressed.
