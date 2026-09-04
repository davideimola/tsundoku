# The medium is a vocabulary, and only paper goes through an object

`reading.medium` stops being two values written into a check constraint and becomes a **table of
data**, like Type, Binding, Provenance and credit_role. The console a game was played on is a
medium — *PS5*, *Switch*, *PC*, *Steam Deck* — standing on the same axis as *paper* and *digital*,
and a console released next year is an **insert** rather than a migration.

The rule the old constraint carried moves with it. `reading_digital_went_through_no_volume` said
*a pass through a Volume is a pass on paper*, by naming the one value that was not allowed to.
With a list that grows, that sentence cannot live in a constraint over values: each medium
**declares whether it can go through an object**, and **only paper can**. No console can, which is
the same fact the old rule stated, said in a way that survives a fourth console.

## What this corrects

[ADR-0008](0008-provenance-is-origin-only-and-the-grain-of-a-score-is-its-own-axis.md) drew the
line this decision crosses, and drew it well:

> Type, Binding, Provenance and credit_role are stored as data because they are *vocabularies*
> that grow, and a seventh value is an insert rather than a release. These two are not a
> vocabulary. They are the model's own shape, **the way a Reading's medium is paper or digital**.

The rule stands and its **example was wrong the moment a videogame could be catalogued**. Paper
and digital looked like the model's shape because, in a library of printed things, they were an
exhaustive pair — there is no third way to hold a book. The consoles are not a third value of that
pair; they are the axis revealing that it was a vocabulary all along, and one that grows with the
hardware industry rather than with this model.

0008's conclusion about the **grain of a score** is untouched: `rating.scale` is `coarse` or
`half-points` and stays a check constraint, because it really is the model's shape — the owner's
scale is 1 to 10 in half points and coarse names the one other thing that can be true. A third
grain would still be a change to the model. What changes is only which of 0008's two examples
belonged on which side of its own rule.

## Why a console is the medium and not a field beside it

The medium exists to answer one question, and the Pile is where it is asked: **what does it take
to start this tonight?** Paper means the object has to be bought first. Digital means it can be
started now. A console means it can be started if that console is in the house — which is the same
question, answered by the same axis.

A second column would make every videogame carry `medium = 'digital'` next to a console, saying
nothing, twice; and it would leave the Pile reading two fields to compose one sentence it already
composes from one. The reverse case does not arise: nothing is played on paper.

It is a fact about the **Pass and never about the Story**. *Hades* on Switch and *Hades* on PC are
one Story gone through twice, exactly as a novel read once on paper and once as an ebook is —
which is the rule the medium has followed since it was written, applied to a wider list.

## Consequences

- **The Type decides which media are offered.** The narrative half of the door (ADR-0019) asks
  the medium; with the list open, the values that make sense follow the Type chosen in the same
  submission. This is a rule about what is *offered*, not about what is *allowed*: nothing in the
  database refuses a manga read on a PS5, because a vocabulary is not a taxonomy and the owner
  is the one holding the record.
- **The check constraint becomes a foreign key**, and the object rule becomes a column on the
  vocabulary read by the invariant that used to name `digital` by hand. Cross-table invariants in
  this schema are triggers already (ADR-0009's idiom), so this follows the house style rather than
  introducing one.
- **The seeded list is the owner's, and it starts small.** Paper and digital are the two rows that
  exist today; the consoles seeded are the ones the owner has actually played on. A medium nobody
  has used is a row nobody needs.
- **A medium cannot simply be deleted once a Pass points at it.** That is the ordinary consequence
  of a vocabulary becoming data — the same one Binding and Provenance already carry — and it is
  the right one: a pass that went through a Wii is a thing that happened.
