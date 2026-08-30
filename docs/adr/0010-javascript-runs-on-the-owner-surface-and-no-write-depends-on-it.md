# JavaScript runs on the owner surface, and no write depends on it

The `(owner)` screens may run client JavaScript. What survives of the old stance is the
half that was load-bearing: **no write depends on it.** Every form stays a plain `POST` to
a Server Function, and the page after a write stays a normal server render — so the screens
used one-handed in a shop, on the shop's signal, keep working with nothing executing in the
browser.

## What forced it

The stance was never written down. Eighteen comments across every screen restated it —
*"works with no JavaScript running at all"*, *"on a shop's signal"* — with one `"use client"`
in the whole of `src` and no ADR anywhere. A rule that pervasive and that unrecorded is
either promoted or broken by accident, and the redesign broke it three times over: a Credit
picker that suggests people who already exist, a finder over the whole library, and a wall
that is 96 tiles today and will not stay 96.

The distinction the comments were actually protecting is not *"no JavaScript"*. It is
*"nothing the owner is about to commit is lost because a script did not load"*. That
sentence costs nothing on a screen where they are only looking.

## Consequences

**Those eighteen comments now say something narrower than they read.** A future reader
meeting one should take it as the write rule, not a ban — the ones on `actions.ts` files
are exactly right as written, and the ones on `page.tsx` layouts are the ones the redesign
supersedes.

**A scripted control needs an unscripted twin that reaches the same place.** The Credit
picker is an `input` that accepts a name typed in full whether the suggestions arrived or
not; a filtered view is a `GET` with its state in the URL, which is also what makes it
linkable and survivable across a refresh. Where those two diverge, the unscripted one is
the specification.

## Considered and not taken

- **Hold it absolute.** Costs the Credit suggestions outright — with 0 people in the
  database and an AI about to propose a few hundred, typing a name blind is how duplicates
  get made — and costs the finder, which on this library is worth more than any filter.
- **Drop it entirely and use React normally.** Cheaper to build and loses a real place:
  the owner uses this standing in a fumetteria deciding whether they already own volume 12.
