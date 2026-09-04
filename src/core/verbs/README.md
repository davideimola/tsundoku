# The verbs

**Every mutation is a named verb over existing entities.** Record a Pass, set a
Rating, catalogue a Volume, acquire a Volume, release a Volume, open a Wish, close a
Wish, pin an entry to the Pile, declare a Series collected. There is no generic update and no `save()`:
the vocabulary of writing is the owner's vocabulary, and it comes from `CONTEXT.md`.

One file per area, named for the area — `pass.ts`, `wish.ts`, `series.ts`,
`collection.ts` — and one exported `async function` per verb. No barrel index; the
caller imports the file. (See `../README.md` for why.)

```ts
import { recordPass } from "@/core/verbs/pass";
```

## The shape of one

```ts
/** What the verb means to the owner, and what else it changes. */
export async function releaseVolume(volumeId: string): Promise<void> {
  …
}
```

Take the ids and the values, return what the caller needs and nothing more, and name
the consequences in the doc comment — a verb that also ends something is fine, a verb
whose caller finds that out by surprise is not.

**One verb is one transaction.** If a verb is genuinely multi-statement, wrap it in
`begin`/`commit` on a single client, or put it in a function in a migration and call
that. Composing two verbs in a caller invents a transaction that does not exist.

**There is exactly one exception, and the reason is a third party's network.**
`lookUpCovers` in `cover.ts` walks a batch of Volumes, asks a source about each, and writes
what came back — one statement per object, and no transaction around the run. What the rule
protects is an atomic *fact*, and each object's answer is one: they are independent, and
holding a transaction open across two dozen requests to somebody else's CDN would put a lock
behind a stranger's timeout and lose twenty-three good answers because the twenty-fourth
hung. A second exception wants the same argument written down, in the verb, before it is
taken — not a shorter one.

## The MCP boundary

The MCP server may call verbs on entities that **already exist** — that is the whole
point of the verbs being narrow, reversible and wrong-in-an-obvious-way. It may only
**propose** the creation of a Story, Volume or Series, as an Inbox entry the owner
approves (ADR-0005). So: no verb here creates a Story, a Volume or a Series on
MCP's behalf. Creation belongs to the Inbox's own approval verb, which the owner
drives.

**Completing or correcting one of those three is the same act, and the same door**
(ADR-0011). `amendVolume`, `amendStory` and `amendSeries` are here, beside the verb
that creates each, and they are what an approved **Amendment** performs — an invented
ISBN or a half-remembered publisher is a permanent fact nobody ever reads back, which
is the Inbox's risk rather than the verbs'. `proposeAmendment` is the whole of what an
assistant may do about it, and the owner's approval is what calls the amending verb —
so an amending verb is never a tool on the MCP surface.

## When the database says no

Invariants live in Postgres, so a verb's failure path is a `pg` error — and **nothing
above `src/core` is allowed to see one**. The adapters are thin (ADR-0002); an adapter
that read a SQLSTATE or matched a constraint name would be holding domain logic.

So a verb that can be refused wraps its statement in `refusing` from `../refusal.ts`
and writes the prose the owner reads:

```ts
import { refusing } from "@/core/refusal";

export async function setRating(storyId: string, score: number): Promise<void> {
  await refusing(
    () => query("insert into rating (story_id, score) values ($1, $2)", [storyId, score]),
    (constraint) =>
      constraint === "rating_score_is_in_half_points"
        ? "A Rating is 1 to 10, in half points."
        : "That Rating could not be recorded."
  );
}
```

What comes out is a `Refusal` carrying a stable `code` — `already-exists`,
`not-found`, `not-allowed`, `invalid` — and prose. The web view renders the prose; the
MCP door returns both, because an assistant that reads `already-exists` can try
something else where it would only re-guess at prose.

**Anything that is not a `Refusal` is a bug, not an answer.** Let it stay unhandled:
the adapter turns it into a 500, and nobody dresses a broken query up as advice.
