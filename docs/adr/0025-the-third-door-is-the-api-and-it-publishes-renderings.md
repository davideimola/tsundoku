# The third door is the API, and it publishes Renderings rather than records

There is a **third public surface**: `/api`, authenticated by **`API_BEARER_TOKEN`**, a secret
of its own and not the MCP door's. Its first resource is `GET /api/showcase`, one document
describing what is being gone through, what concluded, what is unopened and what is on the
shelf. It is a resource under `/api` rather than a one-off `/showcase` route, because the
thing being built is a door and not an endpoint, and naming it after its first question would
make the second question a second decision.

The token is distinct from `MCP_BEARER_TOKEN` because **the consumers differ in where they
live**. The MCP token sits in the owner's own assistant; this one sits in a third party's
environment, the host that builds the public page. It has to be rotatable there without
reconnecting an assistant, and revocable here without touching one. `src/lib/auth/api.ts` is
therefore a sibling of `src/lib/mcp/bearer.ts` and not a call into it: folding the two into
one gate taking a variable name would be one edit away from a shared default, a shared
fallback, or a *use the MCP token if the API one is unset* convenience that hands a page host
the door that writes.

## While one token exists, the API is read-only by construction

Not by policy, and not by a check. There is no verb reachable from this door, no route under
`/api` that writes, and nothing in the gate that could grant one. Writes stay behind the Inbox
at `/mcp` (ADR-0005), where a creation is a proposal and the owner approving is the act.

When a second consumer with different permissions turns up, the move is **scoped tokens as
data**, the way Medium and Type are data (ADR-0006, ADR-0022), and not a fourth environment
variable. A vocabulary of consumers that grows by an insert is the shape this repository
already uses for everything that grows; three secrets in a cluster is already the most this
argument supports.

## It exposes Renderings, not records

**There is no per-row `public` flag anywhere in this library and there must not be one.** A
flag is a thing to forget to set, and forgetting it publishes a price. So what is published is
a composition, `theShowcase` in `src/core/queries/showcase.ts`, and **what is not composed
there does not exist to the outside.** The absence is structural rather than filtered: nothing
reaches the door and gets stripped, because nothing selects it in the first place.

What that keeps in, named so a later slice can check itself against a list:

- **prices**: what an object cost, what a Wish should cost, what it costs where it was found,
  and the shop it was found in;
- **acquisitions**, the days included. When something came home and when it left are the
  owner's own record of their money and their shelf. The *order* the shelf came home in is
  read to sample the wall by; the days themselves never leave;
- **the Inbox and its proposals**, which are an assistant's guesses awaiting a decision. A
  guess published as a fact is the worst failure this door could have;
- **Paths**, which are the owner's intentions about what to read next;
- **Provenance and the grain of a score** (ADR-0008), both of which are axes about how far the
  owner's own record can be trusted. A reader of a shelf page is not answering that question,
  and a page handed *coarse* could only ignore it or print a caveat nobody asked for;
- **the prose of a Rating**, which is the sharpest of these. A Rating's words are the owner
  writing to themselves about a book. The score is the only part of that judgement anybody
  else was ever meant to read, and it is the only part that travels;
- **ISBNs**, which are about the object as a commodity rather than about the library;
- **the owner's own address**, which nothing in the document names at all. Nothing in it
  identifies the owner: it is titles, counts and tiles.

Two things follow from *Renderings, not records*, and both are in the document's shape. The
**vocabulary travels with every row**: a Type arrives as its slug, its label and both of its
verbs, so a consumer heads one block *Reading* and the next *Playing* without keeping a table
of slugs it would have to maintain (ADR-0021), and a Medium arrives as a pair for the same
reason, because no rule over `playstation-5` produces *PlayStation 5*. And **the lists are
samples**: `shelf.volumes`, `pile.recent` and `finished.recent` are capped, ordered by what
happened most recently, with the real figure beside them in `shelf.total`, `pile.count` and
`finished.count` so a page can say *showing 60 of 412*. There is deliberately no cursor: a door
that let somebody walk the whole library sixty rows at a time would publish what the caps exist
to keep to a sample.

## Every row says which one of the run it is

Volumes of a numbered line carry the **same title**, because the title is the object's and the
run is the narrative's. So a shelf of ten tankōbon published as ten titles is ten identical
tiles, and so is a Pile of them, and a verdict on volume eleven is indistinguishable from one
on volume twelve. Every row of this document that names a title therefore carries `standsAt`,
and the consumer prints the title and that beside it. **It must never take a number out of a
title string**: what is in a title is whatever the owner typed while cataloguing, half the
library does not carry one, and a number read off prose is a guess published as a fact.

It is a **range and not a number**, because an object can be several parts of a work: an
omnibus holding Instalments one to three is a case the model writes down
(`recordVolumeCoversInstalments`), and flattening it would be the document lying about what is
inside a book. A single part is `from` and `to` at the same number, so a consumer has one shape
rather than two, and a standalone is `null` rather than a decorative *1*.

**The `unit` travels because the numbers are genuinely two facts**, for the reason
`progress.unit` travels. `instalments` is the narrative's own parts (ADR-0017) and is what
`progress` counts, so the two can stand in one sentence. `volumes` is the printing's: where the
object stands in its line, the number at the foot of the spine, and it is what is left where
the work declares no parts. A line whose published count nobody filled in is silence rather
than nought (ADR-0017), and the nineteenth and twentieth objects of it are still two different
books. A consumer printing *vol. 7* over a count of Instalments would be inventing a fact about
a printing out of a fact about a work.

A standing is read from an **object**, because there is nowhere else in this model to get one:
a narrative has no position and the numbering belongs to the Volume. So it is the object itself
on the shelf and on the wishlist, the objects carrying the narrative in the Pile, and **the
Volume the pass names** in `now` and `finished`, which is the other half of this: `progress`
says how far a pass got and never which object it went through, and a pass through no object at
all, read digitally or borrowed, says `null`. The rule that turns an object into a standing is
one function spent by all four blocks, over `WHAT_IT_COVERS` exported from
`queries/story-to-volume.ts`, so a tile out here and the Story's own page cannot come to
disagree about what an omnibus holds.

## What concluded is the verdicts, and not the log

`finished` is **the passes that said something about what they went through**: a pass carrying
a Rating, or one that was given up on. The second half is the half that had to be written down,
because giving up is a judgement and it is the sharpest one this library records: an
abandonment travels for want of a score rather than being dropped for it, and the page this
feeds leans on exactly that. What falls out is the pass that simply ended with nothing said
about it, which is most of a library typed in from a shelf.

The rule is in `theShowcase` rather than in the consumer, for the reason everything else about
this document is: *every concluded pass* was sixty-three rows on the owner's own library and a
number that only ever grows, so a page handed all of them would be a log of titles once held
rather than a page about what the owner thought of them. The block is therefore the shape the
other two samples already have, `count` beside `recent`, and not a bare array: a page that read
the sample's length as the history would print *12 verdicts* about a reader who has passed
forty. Reshaping it is a breaking change by the rule at the foot of this document, and it costs
one coordinated deploy of the page that reads it.

## The gate is the owner gate's shape, and `/api` is not excluded as a prefix

`/api/auth/[...nextauth]` already lives under `/api`, so a prefix-wide hole in
`src/proxy.ts` would be a hole every later route falls into without anybody deciding it
should. `api/showcase` is excluded **by name**, and a route added under `/api` and left out of
that line is gated by Google: it answers `307 /signin` to its bearer, which is useless rather
than open, and that is the direction to be wrong in.

The two layers are the ones the owner gate already has (`src/lib/auth/owner.ts`). The proxy is
ergonomics; **`requireApiCaller()` is the wall**, it is the first statement in every route
under `/api`, and `src/app/api/gated.test.ts` walks the routes that are there and fails when
one of them stops calling it. It **fails closed**: `API_BEARER_TOKEN` unset or blank refuses
every request, because a deployment missing a secret must refuse everybody rather than publish
the library to whoever finds the URL. There is no development opt-in beside it, unlike
`AUTH_DEV_OPEN`: this is a string the owner picks, so having one locally costs a line in
`.env.local`.

It parts from `requireOwner()` in one way, and the reason is who is on the other side. A
refused owner is a person who should land on a sign-in screen, so that wall throws and the
proxy does the friendly part. A refused API caller is a program, and the only useful thing to
hand a program is the status and the header naming what it is missing, so this one answers a
401 rather than throwing.

**It carries a rate limit**, reusing the shape in `src/lib/mcp/rate-limit.ts` and none of its
counters. The argument is the one that put a limiter in front of `/mcp` (ADR-0004): an
endpoint that answers a token check to anyone who asks is an endpoint that can be asked for
ever, so the limiter runs before the gate and before anything a caller could make expensive.
Here it is worth more, because an allowed request composes a dozen queries over the whole
library where an allowed MCP call answers one question. The counters are its own so that a
flood against the public page does not refuse the owner's assistant out of an allowance it
never spent. **The one-replica assumption is unchanged and now covers two counters rather than
one**, and the comment in the cluster deployment stays true: two replicas would hold two of
each and both doors' limits would double, which is wrong in the safe direction and loudly so.

## The Wish is configuration, and it is off

The wishlist block exists in the contract and is published only where `SHOWCASE_WISHLIST` says
`true`. Off by default, because what the owner means to buy is a plan rather than a library,
and the four numbers the owner's own shopping list is made of do not travel even when it is
on: titles and tiles, and nothing else. It is in the contract at all because a fork may
reasonably want a public wishlist, and a block invented later is a block whose shape nobody
agreed on.

## Consequences

- **A new resource under `/api` is two things and not one**: a route that calls
  `requireApiCaller()` first, and a name added to the matcher in `src/proxy.ts`. Forgetting
  the first is a test failure; forgetting the second is an endpoint that redirects.
- **A field is published by being composed.** Adding one to `showcase.ts` is the whole act of
  publishing it, which is why that file's own tests assert the forbidden list by name: there
  is no second place to check.
- **The consumer is versioned by the document and not by a URL.** Adding a field is
  compatible; renaming or removing one is not, and there is no `/v2` planned. The consumer is
  one page and the owner owns both ends, so the honest cost of a breaking change is one
  coordinated deploy rather than a versioning scheme built for a stranger.
