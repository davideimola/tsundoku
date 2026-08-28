# The core module

One core, two doors. The web view and the MCP route handler are **thin adapters over
this module**, and neither holds domain logic (ADR-0002). That is what makes a single
test seam cover both surfaces, and it is the rule to break last.

```
src/core/
├── db.ts            the pool, and the only file that knows what a pool is
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
`collection.ts`, `reading-list.ts`, `series.ts` — never after a layer (`helpers.ts`,
`utils.ts`, `service.ts`).

## What belongs here, and what does not

- **Here**: the verbs, the queries, and the SQL. Derivations are queries, not stored
  columns, and they are the product — the Reading list composed from active Paths and
  Series in progress, a Story's state from its Readings, a Series' missing Volumes.
- **Not here**: anything about HTTP, sessions, bearer tokens, React or MCP framing.
  Those belong to the adapter that has them.
- **Not here either**: invariants that Postgres can enforce. The database refuses
  what must never be true rather than trusting this module to remember, so a rule
  that can be a constraint should be a constraint in a migration, not an `if`.

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
