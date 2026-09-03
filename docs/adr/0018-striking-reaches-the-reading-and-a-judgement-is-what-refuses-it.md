# Striking reaches the Reading, and a judgement is the one thing that refuses it

A **Reading** can be **struck from the library**: the row is deleted, the library stops knowing
the owner ever opened the Story on that pass, and where the Story stands follows from whatever
Readings are left. It is refused on **one** thing — a Rating that points at it — and it is
offered from the row itself, on the Story's own page, one pass at a time.

A **Rating** can be struck the same way, and **nothing refuses it**. It exists as the other half
of that one refusal, and as the answer on its own to a score typed into the wrong row.

This extends [ADR-0014](0014-a-record-that-was-a-mistake-is-struck-and-everything-else-is-kept.md),
[ADR-0015](0015-striking-reaches-the-story-and-a-mistake-gets-its-own-door.md) and
[ADR-0016](0016-striking-reaches-the-path-and-nothing-refuses-it.md). It qualifies the rule this
repo has stated since the first migration — *a Reading is never overwritten* — and that rule
stands: this is not an edit.

## What forced it

The owner pressed *Start reading it* on the wrong tile, and the Story read `reading` on the
dashboard's top band with no way back.

There were two exits and both are lies. *Finished* records that the owner read a book they never
opened; *Gave up* records an abandonment, which this application treats as real evidence about
taste and hands to a recommender. Striking the Story was the third idea and it is refused by
construction: `WHY_A_STORY_STANDS` answers *"a Reading went through it. That is an event in your
life, and it names this narrative."* — so the narrative could not be unmade and recreated either.

**The state is derived, and that is what left no door at all.** Where the owner is with a Story is
an expression over its Readings, computed on every request and stored nowhere — the decision this
whole schema is built on, and the reason the sheets' `Stato lettura` column is gone. There is no
field to correct. The only way to change the answer is to change the Readings, and this module
had four verbs, none of which removed one.

## Why this is ADR-0014's case and not an edit of history

ADR-0014's boundary is not *is this a delete?* but **did anything happen to this record?**, and
it draws the line at rows that assert something about the world: an object was in the house, an
event happened in the owner's life, a judgement was made. Unmaking one of those loses history.

A pass the owner never made asserts an event that did not occur. It has no past — nothing was
read, nothing was judged — and leaving it is what makes the library wrong, exactly as leaving the
duplicated *Slam Dunk 5* did. So this is the same door, opened one entity further along.

**The rule about overwriting is untouched.** *Reading it again is a new Reading* is about a pass
that happened and then happened again; `finishReading` still refuses a Reading that has already
ended. Nothing here amends a row: a pass is struck whole or it stays whole.

## Why a Rating is the one refusal

**Because the schema already has an opinion, and it is the wrong one to let happen quietly.**
`rating_belongs_to_the_read_story` is `on delete set null (reading_id)`. A Rating survives the
deletion of the pass it came out of and keeps its score, its prose and its Provenance — it simply
stops pointing at anything. And a Rating that points at no Reading is a legitimate shape in this
model: it is what a score imported from a sheet with no act to name looks like.

So striking a rated pass would not lose the judgement. It would **silently change what the
judgement is a sentence about** — from *what I thought of that reading* to *what I think of this
narrative* — and nobody would have written the new sentence. That is the one outcome worth a
rail, and it is the only record in the schema that can point at a Reading at all.

**Which is why `strikeRating` had to ship in the same breath.** A refusal the owner has no way to
satisfy is the dead end this ADR exists to end, and there was no verb that removed a Rating:
`setRating` replaces the number and still asserts that the owner judged the book. Nothing refuses
the Rating's own strike, for ADR-0016's reason exactly — no record in this schema points at a
Rating, so there is nothing to clear first and nothing that changes by its going. A score is the
owner's own sentence, and one they did not mean to write is one they may unwrite.

**Striking's two shapes, from ADR-0016, both appear here.** The Reading asserts something about
the world and is refused on the one record that could be quietly rewritten; the Rating is only
ever the owner's own judgement and is not refused at all. A fifth entity asking for this door
should still be sorted into one of those two before any refusals are written for it.

## Consequences

**One at a time, and never in bulk.** ADR-0014's argument for bulk is that the mess arrives in
bulk — forty approvals filing duplicates. A mis-tap arrives alone. And the list a bulk door would
stand over is the owner's own reading history, which is a worse thing to have in front of you
under a row of ticks than a button on the row you are looking at.

**It is offered on the row, not at the head of the page.** The pass is what is being unmade, so
the press stands where the pass is drawn, last among that row's acts: rate it, say where it got
to — and, if it never happened, take it off. The judgement's own strike is inside the judgement,
which is what makes one control serve both places a Rating appears: under the pass it came out
of, and in the card of scores that point at no pass.

**The press is two taps, and the panel has no field in it.** The Story's strike set that shape and
the reason is unchanged: the whole of the act is the press, so the panel exists to make the second
tap deliberate and to say what goes with the row before it is made. Both drawers state their
refusal — or the absence of one — before the button.

**The verb answers with the Story.** The screen that pressed it is the Story's own page and it
still describes something, unlike a struck Path's; the id comes off the deleted row rather than
out of the form for `strikePath`'s reason, which is that the browser does not tell the application
what it just did. The form field is still sent, because a *refused* strike has no answer to read
a Story off.

**Nothing needs telling that the state changed.** The Story reads `to read` again on the next
request because the derivation is the only answer there has ever been. This is the payment for a
decision made in the first migration, collected three years early.

**There is no MCP tool, and there must not be one.** ADR-0014's sentence, unchanged and for the
fourth time. The party that can record a pass through the MCP door is exactly the party that must
not be able to delete one to tidy up after itself (ADR-0005).

## Considered and not taken

- **Let *Gave up* stand in for it.** It is what the owner would have had to do, and it is why
  this ADR exists: an abandonment is evidence a recommender is meant to weigh, so recording one
  for a book nobody opened poisons the thing the whole application is for.
- **A `struck_at` column on `reading`, and a predicate everywhere.** Rejected for ADR-0014's
  reason, and harder here than anywhere: the state derivation, the reading list's four sources
  and the instalment a pass reached all read the Readings, and every one of them would have to
  remember the predicate. A pass that never happened is not worth that.
- **Amend the Reading instead — let the owner correct the medium, the day, the Story it names.**
  A different feature, and the wrong one for this: correcting *which Story I read* on a row that
  records reading nothing is an edit of history to paper over an event that did not happen. The
  rule against overwriting a pass is worth keeping, and striking is how it stays keepable.
- **Refuse a finished or abandoned pass, and allow it only while open.** It reads safer and it
  fails on the second mistake: the owner who closed a Reading they never made would be back in
  the dead end, one step further in. What makes a pass safe to unmake is that nothing hangs off
  it, not whether the owner has already said how it ended.
- **Take the Rating with the Reading, as a Story's strike takes its Credits.** A Credit is a fact
  about the narrative that only the strike's own record held; a Rating is a sentence the owner
  wrote, and it has somewhere to stand without the pass. Destroying it as a side effect of a
  correction is the one thing worth two presses here.
