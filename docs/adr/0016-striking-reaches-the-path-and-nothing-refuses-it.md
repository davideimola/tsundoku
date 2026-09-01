# Striking reaches the Path, and nothing refuses it

A **Path** can be **struck from the library**: the row is deleted, its stops and the Declared
constraints on it go with it, and — unlike a Volume's strike or a Story's — **nothing refuses
it**. It is offered once, from the route's own page.

This extends [ADR-0014](0014-a-record-that-was-a-mistake-is-struck-and-everything-else-is-kept.md)
and [ADR-0015](0015-striking-reaches-the-story-and-a-mistake-gets-its-own-door.md), and it takes
back one clause of the shape ADR-0015 declared fixed: *name what the owner has lived with, refuse
whole, and say what follows the row out*. The middle clause does not survive contact with a Path,
and the reason is below.

## What forced it

The Reading list composed itself from exactly two sources — the next unread Story of every active
Path, and the next missing Volume of every Series being collected. There was no third way in, so
saying *I want to read this* meant minting a Path: a named route whose name is uniquely indexed
and which cannot be undefined. The owner did exactly that for *Slam Dunk* and hand-copied four of
its twenty volumes into it.

Now that a **Want** is a fact of its own, that Path is a workaround with a name. `deactivatePath`
only hides it, and hiding it leaves the name *Slam Dunk* held for ever against any real route that
deserves it — a route the owner cannot define because a row they no longer want is standing on the
unique index.

## Why the rail is not here

ADR-0014's boundary is *did anything happen to this object?*, and ADR-0015 asked the same question
of a narrative. Both get four refusals because the rows they protect **assert something about the
world**: an object was in the house, an event happened in the owner's life, a judgement was made.
Unmaking one of those is losing history, which is the thing striking exists not to be.

**A Path asserts nothing.** It is an order the owner decided — *"its order is a judgement, never a
publication sequence"* — and a judgement can be withdrawn by the person who made it. There is no
record on a route that the world could contradict, so there is nothing to be refused *on*. A rail
here would be a rule protecting the owner from their own opinion.

The four sentences on a Story are the entire safety of that feature. The safety here is a
different thing and it is structural: **no record that asserts anything points at a Path.** A
Story, a Reading and a Rating have no column naming a route, so *they are left standing* is not a
promise the verb keeps but a fact about the schema. What does point at a Path — `path_item`, a
Declared constraint scoped to it, a Reading list pin naming it — is in every case a fact *about
the route*, and every one of those references is already `on delete cascade`. So the verb is one
statement and the schema decides what follows the row out.

## Consequences

**There is no bulk door and there does not need to be one.** ADR-0014's argument for bulk is that
the mess arrives in bulk — forty approvals at a time filing duplicates. Nobody mints Paths forty
at a time; the library has three, and one of them is the mistake. One route, from its own page,
where the owner is standing when they know the row is wrong.

**The two acts stand together on that page.** *Put this route aside* and *Strike this route* are a
hairline apart in the same column, because the difference between them is the thing the owner has
to read: aside says *not now* and keeps the order so it is never made twice; striking says *this
was never a route* and keeps nothing, because there was no order to keep.

**The press is still two taps.** A drawer with no field in it — the whole act is the press, and
the panel exists so that what goes with the route is read before the second tap. Nothing being
refused is precisely why that sentence has to be there: the owner's only safety is knowing that a
strike here withdraws a judgement and never loses history.

**The verb returns the name it struck.** The screen that pressed it no longer describes anything,
so the owner lands on `/paths` with a sentence naming the route — and the deleted row is the only
thing entitled to say what it was called.

**There is no MCP tool, and there must not be one.** ADR-0014's sentence, unchanged and for the
third time.

**Striking now has two shapes, not one.** A record that asserts something about the world is
refused on everything the owner has lived with; a record that is only ever the owner's own
judgement is not refused at all. A fourth entity asking for this should be sorted into one of
those two before any refusals are written for it.

## Considered and not taken

- **Refuse a Path that has stops on it.** It is exactly the route the owner most wants gone —
  *Slam Dunk* has four — and clearing them first is a rule that only makes the mistake take
  longer to leave.
- **Refuse a Path the owner has walked** (one with a read stop on it). It reads like ADR-0015's
  *Reading* branch and is not the same thing: the Reading is the record of that life, it survives
  the strike untouched, and the route is only the order they were read in. Withdrawing an order
  destroys nothing.
- **Put it aside instead, and filter struck routes out everywhere.** That is `deactivatePath`,
  which already exists and means something else — and it leaves the name held, which is the whole
  problem.
- **A soft delete: a `struck_at` column and a predicate in every query about Paths.** Rejected for
  ADR-0014's reason. A route that was never one is not worth a predicate on every future question
  about routes.
