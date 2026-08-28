# Provenance is origin only, and the grain of a score is its own axis

`converted-from-a-coarser-scale` was seeded as a **Provenance**, on ADR-0001's word that a
score converted from the coarser scale "carries its Provenance". That collapses two
questions into one value: a score doubled from the books sheet's 1–5 could say it was coarse
*or* say where it came from, never both, so coarse-and-from-Goodreads and
coarse-and-from-the-sheet were indistinguishable. The spreadsheet import reads exactly those
scores, and it needs to say both things about each one.

So the two axes separate, on the Rating and nowhere else:

    rating.provenance_id  how it came to be known — goodreads-history, the sheet, remembered
    rating.scale          the grain it was given in — coarse | half-points

A **Reading** carries a Provenance too and its axis is left alone: grain is a property of a
score, and an act of reading has none.

The grain is a **check constraint rather than a data row**, and ADR-0006's rule is what
decides that: Type, Binding, Provenance and credit_role are stored as data because they are
*vocabularies* that grow, and a seventh value is an insert rather than a release. These two
are not a vocabulary. They are the model's own shape, the way a Reading's medium is paper or
digital — the owner's scale is 1 to 10 in half points, and coarse names the one thing that
can be true instead — so a third grain would be a change to the model.

## Consequences

- **This corrects ADR-0001's consequence**, which put the converted scale in the Provenance.
  The rest of ADR-0001 stands: one scale, 1–10 in half points, and the books sheet's 1–5
  doubles onto it on import. What changes is where the doubling is recorded.
- `converted-from-a-coarser-scale` is **gone as a Provenance row** and cannot be written. The
  scores that carried it keep their grain as `coarse` and gain an honest origin,
  `typed-from-the-shelf`, which is where a 1–5 score came from.
- **Every score says its grain, including the ordinary ones.** `half-points` is the default a
  verb applies rather than a default the column holds, so the corpus an external reader
  recommends from always carries both axes and the MCP door tells it how to weigh them: a
  coarse 8 is *liked it*, not an 8.
- The one place the two are read together is the recommendation surface, which is the reason
  they were confused in the first place: they answer the same practical question — how much
  to trust this number — and they answer different halves of it.
