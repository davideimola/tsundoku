# The core module

One core, two doors. The web view and the MCP route handler are **thin adapters over
this module**, and neither holds domain logic (ADR-0002). That is what makes a single
test seam cover both surfaces, and it is the rule to break last.

```
src/core/
├── db.ts            the pool, and the only file that knows what a pool is
├── covers.ts        the cover sources — one of the two files that know what a fetch is
├── records.ts       what a book is, asked by ISBN — the other one
├── isbn.ts          what an ISBN is, and what else a camera hands over
├── money.ts         what a price is, as the owner types it — comma or dot
├── queries/         one file per question the app answers
│   └── type.ts
└── verbs/           one file per area of writing — see verbs/README.md
```

## There is no index

Import the file, not a barrel:

```ts
import { listTypes } from "@/core/queries/type";
```

`src/core/index.ts` does not exist and should not be created. Fourteen slices are
adding verbs and queries to this directory in parallel; a barrel would be the one
file every one of them has to edit, and every merge would conflict in it. Importing
the file directly costs nothing and conflicts with nobody.

For the same reason: **add a file rather than widening one.** A new question about
the Collection goes in `queries/collection.ts`, not into `queries/type.ts`. Files are
named after the area they answer for, in the vocabulary of `CONTEXT.md` — `story.ts`,
`collection.ts`, `pile.ts`, `series.ts` — never after a layer (`helpers.ts`,
`utils.ts`, `service.ts`).

**One kind of question is not an area's, and it says so out loud.** `queries/finder.ts`
answers *what in this library is called that?* across Stories, Volumes, Series, people and
Paths at once, which is exactly why it could not be added to any of the five: put in
`story.ts` it would be a Story query reading five tables. So a cross-entity question gets a
file named after the question rather than after an area — and if you find yourself widening
one of these files to answer across areas, that is the file to add to instead. Both doors
call it, which is the other half of the rule: the owner's finder and the assistant's
`finder_search` are the same function, so neither can reach a record the other cannot.

## What belongs here, and what does not

- **Here**: the verbs, the queries, and the SQL. Derivations are queries, not stored
  columns, and they are the product — the Pile composed from active Paths and
  Series in progress, a Story's state from its Passes, a Series' missing Volumes.
- **Not here**: anything about HTTP, sessions, bearer tokens, React or MCP framing.
  Those belong to the adapter that has them.
- **One stated exception, and it is outbound.** That rule is about the door a request
  arrives through: an adapter holds the framing, and the model never learns what a session
  or a bearer is. A source the library *asks a question of* is the other direction — a
  dependency of the model, like the pool — so `covers.ts` and `records.ts` sit beside
  `db.ts` and are **the only two files in the repository that know what a `fetch` is**
  (ADR-0013). Two, because they are two subjects: `covers.ts` asks what an object *looks
  like*, which is a question about bytes that are somebody else's, and `records.ts` asks
  what an object *is* — a title and a publisher, by ISBN, so that the form the owner is
  about to fill in arrives filled in. `src/app/hotlinked.test.ts` is the list, and a third
  entry cannot be added without editing it. Both are held to the same shape `db.ts` is:
  everything above them takes them as an argument (`AskForACover`, `AskAboutAnIsbn`), so no
  test in this repository calls a third party, and **nothing on a page render calls one
  either** — a lookup is an act the owner presses, and a render reads a column.
- **Not here either**: invariants that Postgres can enforce. The database refuses
  what must never be true rather than trusting this module to remember, so a rule
  that can be a constraint should be a constraint in a migration, not an `if`.
  **One exception is written down, and a second wants the same argument made**
  (ADR-0024): *finishing is reaching the end* is a rule about the **act** and not
  about the row, because the count of Instalments a work declares is allowed to
  grow — a line printing a thirty-second tankōbon has not made a finished reading
  a lie, and a trigger holding the invariant would refuse that ordinary insert. So
  it lives in the statement each door concludes with, inside `verbs/pass.ts`.

Everything in here is `server-only`. `DATABASE_URL` must never reach a browser
bundle, and the import makes an accidental client import a build error.

## Reads

A query is an exported `async function` returning plain data, with a type beside it.
Return the shape the screen and the MCP tool actually want — this module answers
questions, it does not expose tables.

Every value reaches SQL as a parameter:

```ts
return query<Volume>("select … from volume where series_id = $1", [seriesId]);
```

Never by building a string. It is the whole reason SQL injection is not something
this repo has to think about.

## Tests

Seam 1, against a real Postgres: `queries/type.test.ts` sits beside
`queries/type.ts`. `pnpm test` brings the database up and applies the schema itself —
see the README's local loop. The adapters get no tests of their own, and there are no
rendering, component or browser tests anywhere in this repo.
