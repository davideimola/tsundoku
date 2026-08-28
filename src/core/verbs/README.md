# The verbs

**Every mutation is a named verb over existing entities.** Record a Reading, set a
Rating, acquire a Volume, release a Volume, open a Wish, close a Wish, pin a Reading
list entry, declare a Series collected. There is no generic update and no `save()`:
the vocabulary of writing is the owner's vocabulary, and it comes from `CONTEXT.md`.

One file per area, named for the area — `reading.ts`, `wish.ts`, `series.ts`,
`collection.ts` — and one exported `async function` per verb. No barrel index; the
caller imports the file. (See `../README.md` for why.)

```ts
import { recordReading } from "@/core/verbs/reading";
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

## The MCP boundary

The MCP server may call verbs on entities that **already exist** — that is the whole
point of the verbs being narrow, reversible and wrong-in-an-obvious-way. It may only
**propose** the creation of a Story, Volume or Series, as an Inbox entry the owner
approves (ADR-0005). So: no verb here creates a Story, a Volume or a Series on
MCP's behalf. Creation belongs to the Inbox's own approval verb, which the owner
drives.
