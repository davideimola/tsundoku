# tsundoku

A single-owner library, named for the pile of unread books that keeps growing: what
the owner has read, what they thought of it, and what stands on the shelf at home —
kept in one place so that an **external** reader (ChatGPT, Claude, over MCP) can
answer *"what should I read next"* without the owner maintaining a spreadsheet by
hand.

Someone else reuses this by forking the repo and running their own infrastructure,
never by creating a second account.

Read [`CONTEXT.md`](CONTEXT.md) for the vocabulary — Story, Volume, Collection,
Series, Reading, Rating, Path, Wish and the rest are used as defined there, and the
words it says to avoid are avoided. Every decision lives in exactly one place, its ADR
in [`docs/adr/`](docs/adr/).

## Two doors over one core

One Next.js application holds both surfaces: the web view for the owner, and the MCP
server as a route handler in the same app. Both are **thin adapters over
[`src/core`](src/core/)**, which owns the verbs and the queries; neither holds domain
logic ([ADR-0002](docs/adr/0002-the-app-holds-no-model-and-the-recommender-is-external.md)).
That is what lets one test seam cover both.

The app contains **no LLM and spends no tokens**. The recommender is the assistant the
owner already pays for; this app's job is to make the collection answerable.

If you are adding verbs or queries, read [`src/core/README.md`](src/core/README.md)
first — it says where a new file goes and why there is no barrel index.

## The local loop

**Nothing is hosted at this stage.** Everything up to the first usable version runs on
a local Postgres in Docker: no cloud account, no Google OAuth client, no bearer token
and no secret to obtain. Going public is a later step
([ADR-0003](docs/adr/0003-postgres-runs-in-cluster-on-our-own-k3s-with-off-site-backups.md),
[ADR-0004](docs/adr/0004-two-public-surfaces-two-authentications.md)).

Docker must be running.

```sh
mise install                 # the toolchain: node 22, pnpm 10.32.1
pnpm install
cp .env.example .env.local   # one variable, DATABASE_URL
pnpm db:up                   # the container, then the schema
pnpm dev                     # http://localhost:3000
```

The page lists the five Types, read out of Postgres on the request. If you see them,
the whole path — container, migration, core module, page — is connected.

### DATABASE_URL is the only variable

It carries the host, the port, the credentials and the database name, and everything
reads it: `next dev`, `pnpm db:*` and `pnpm test`. It is also what the container is
built from, so **moving the port is the whole change** — nothing else needs touching.

```sh
# Something already on 5432? A Postgres installed on the host, most often.
DATABASE_URL=postgres://tsundoku:tsundoku@127.0.0.1:5433/tsundoku
```

The container is named after the port it publishes — `tsundoku-pg` on 5432,
`tsundoku-pg-5433` on 5433 — so **two checkouts on two ports never collide**, and
neither needs to know the other exists. `pnpm db:up` tells you to do exactly this if
the port it wants is taken.

`pnpm test` uses the same server and its own database, `tsundoku_test`, which it
creates. Development data and test data never share a database, so a test that
truncates a table cannot take the Collection you were looking at with it.

### The commands

```sh
pnpm dev          # http://localhost:3000
pnpm build        # production build (needs no database: the page is per-request)
pnpm db:up        # bring the container up and apply every pending migration
pnpm db:reset     # drop the database and apply the whole schema from scratch
pnpm db:down      # delete the container, and its data with it
pnpm db:psql      # a psql shell inside the container
pnpm test         # vitest against a real Postgres, node environment
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check (lint + format), lint:fix to fix
```

## The schema

**Invariants live in Postgres.** The database refuses what must never be true rather
than trusting the application to remember, so most of the model is in
[`db/migrations`](db/migrations/) rather than in TypeScript. Derivations are queries,
not stored columns, and they are the product: the Reading list that composes itself,
a Story's state from its Readings, a Series' missing Volumes.

Migrations are **plain, ordered, forward-only SQL files**. There is no down migration,
and **a file is never edited once it has been applied** — the runner keeps a checksum
per file in a `schema_migrations` table and refuses a file that has changed, rather
than trusting anyone to remember. To change something, add a file.

### Picking a migration number

```
db/migrations/<issue>_<step>_<slug>.sql

0002_01_type_is_a_data_row.sql
│    │  └─ what it does, lower_snake_case
│    └──── the step within your ticket: 01, then 02, …
└───────── the GitHub issue number of your ticket, four digits
```

**Your number is your issue number**, so there is nothing to coordinate: GitHub
already handed out a unique one, and no two tickets can pick the same. Both parts are
fixed width, so the lexical order is the numeric order. The runner refuses a file that
does not follow this, which is how the convention stays true.

Add a **new file** rather than extending someone else's. Several slices are adding to
this directory at once, and one file each is what keeps them out of each other's way.

**Your file must not depend on a higher-numbered one.** The number orders the
files; it says nothing about which table has to exist first. If your migration needs
another slice's table, you are blocked on that slice, not free to pick a bigger
number.

After merging a branch whose migration sorts below one you have already applied, run
`pnpm db:reset`. The runner **refuses** to apply a file from behind rather than
running it out of order, because doing so would leave your database with an order no
fresh clone would ever repeat. Locally there is nothing to preserve, so rebuilding is
free — which is the reason to do the spreadsheet import last and deliberately.

A migration is wrapped in one transaction, so it lands whole or not at all. Two things
follow: no `begin`/`commit`/`rollback` inside a file, and no `create index
concurrently`, which Postgres will not run in a transaction at all.

### Type is a data row

Manga, Comic, Graphic Novel, Novel, Non-fiction are **rows in the `type` table, never
an enum in code**
([ADR-0006](docs/adr/0006-one-model-for-reading-and-other-collections-are-a-second-context.md)).
A sixth Type is an insert, not a release. Nothing in TypeScript enumerates the five,
and nothing should.

## Tests

**One seam: the verbs and the queries, against a real Postgres.** Both doors are thin
adapters over the core, so this seam covers the web view and the MCP server together
and the adapters need no tests of their own.

```sh
pnpm test
```

That is the whole command on a clean clone with Docker running: it creates the
container if it is missing, creates `tsundoku_test`, applies the schema, and runs. A
node environment with **no browser runner** — there are deliberately no rendering
tests, no component tests and no DOM anywhere in this repo.

A test file runs at a time rather than in parallel, because verbs write and one
database cannot serve two files truncating the same tables.

This diverges from `bindex` on purpose, and the divergence is written down in
[`vitest.config.ts`](vitest.config.ts): there the derivations were dashboard tiles and
the tests are pure; here the derivations *are* the product and they are SQL, so
testing them without a database would mean not testing them.
