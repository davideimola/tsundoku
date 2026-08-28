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
cp .env.example .env.local   # DATABASE_URL, and the gate open for local work
pnpm db:up                   # the container, then the schema
pnpm dev                     # http://localhost:3000
```

The page lists the five Types, read out of Postgres on the request. If you see them,
the whole path — container, migration, core module, page — is connected.

`.env.example` carries `AUTH_DEV_OPEN=true`, which opens the owner gate. There is no
Google OAuth client yet, so without it the loop above would end at a sign-in button
that cannot work. See [the owner gate](#the-owner-gate) for what it does and why it
cannot be the reason the library ends up readable from the internet.

### DATABASE_URL is the only variable the local loop needs

The gate adds `AUTH_DEV_OPEN` while nothing is hosted, and four more once there is a
Google client to point at; the MCP door adds `MCP_BEARER_TOKEN`, which is a string you
pick — all of them documented in [`.env.example`](.env.example) and none of them a value
this repo carries. Everything about the database is still one variable.

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

## The owner gate

The web view is gated by **Google, restricted to a single address**
([ADR-0004](docs/adr/0004-two-public-surfaces-two-authentications.md)). `/mcp` is not:
it is the other door and takes a static bearer token, so it is excluded from the gate
by name.

The gate is **two layers over one predicate**:

- [`src/proxy.ts`](src/proxy.ts) redirects a request without a session to `/signin`.
  It is **ergonomics**, not the wall: Next's own reference says a Server Function is a
  POST to the route where it is used, so a matcher change can silently remove proxy
  coverage, and CVE-2025-29927 is the proof that this layer has already been bypassed
  in the field.
- `requireOwner()` in [`src/lib/auth/owner.ts`](src/lib/auth/owner.ts) **refuses**. It
  is what every page and every Server Function behind the gate calls first.

Both ask [`src/lib/auth/gate.ts`](src/lib/auth/gate.ts) for the verdict and neither
decides anything itself, so the two layers cannot disagree about who the owner is.
That predicate is pure — environment in, verdict out — which is what makes both
directions of the gate a table of cases rather than an argument.

### Where a new page has to sit

**Every page lives in a route group, and the group is the gate.**

```
src/app/
├── (owner)/          behind the gate. Everything that reads the library.
│   ├── layout.tsx    force-dynamic, and the sign-out affordance
│   └── page.tsx
├── (public)/         outside it. Today: /signin, and nothing else.
└── api/auth/         Auth.js's own endpoints
```

So a screen over the Collection, the Stories, the Readings or the Reading list goes in
`src/app/(owner)/`, and **calls `requireOwner()` before it reads anything**:

```tsx
export default async function CollectionPage() {
  await requireOwner();
  const volumes = await listCollection();
  …
}
```

The same for a Server Function or a route handler beside it: a layout does not run for
either, so the assert goes in each one.

Both halves of that rule are a test rather than a paragraph
([`src/app/gated.test.ts`](src/app/gated.test.ts)), because both failures are silent —
a page put outside the group compiles, renders and reads Postgres exactly as intended,
and has simply been served to whoever has the URL. Putting a page **outside** the gate
is therefore two deliberate acts: the file goes in `(public)` and the path is excluded
in the proxy's matcher.

### The session lasts 90 days, counted from the sign-in

A session is a self-contained JWT, so Google is contacted exactly once — at sign-in —
and there is no access token to expire and no refresh token to race.

The 90 days are **absolute, not idle**. Auth.js re-signs the token every time the
session is resolved, so `maxAge` on its own is not "how long the session lasts" but
"how long the app can go unopened": open it once a month and the cookie never expires.
So the moment the gate was opened is stamped into the token at sign-in and the life is
measured from there. Using the app does not extend it; only a new sign-in, which is a
deliberate act and a round trip to Google, opens a new one. The number, and the fact
that nothing moves it, are asserted in
[`src/lib/auth/gate.test.ts`](src/lib/auth/gate.test.ts).

A single session cannot be revoked, because there is no session table. The kill switch
is rotating `AUTH_SECRET`, which ends every session at once, and it is the reason the
sign-out affordance exists at all.

### Nothing is hosted yet, so the gate has a local opt-in

There is no Google OAuth client, no client id and no secret, and there will not be one
until the owner makes it. `AUTH_DEV_OPEN=true` opens the gate for local work; with it
set, Auth.js is never reached at all.

It is an **opt-in rather than a fallback** — a gate that opened by itself whenever
`AUTH_GOOGLE_ID` was missing would open the whole library to anyone with the URL the
day a variable was misspelled in the cluster — and it is **never honoured in a
production build**, which the container is. Both conditions are tested.

The four variables that boot the real gate — `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `AUTH_OWNER_EMAIL` — are documented in
[`.env.example`](.env.example) and have no values there. Creating the OAuth client is a
human step: that is the price of owner identity being configuration rather than
hardcoded data, and it is what lets someone else fork this and run it as themselves.

## The MCP door

`/mcp` is the other door: one route handler, a **static bearer token**, and the same
queries the pages call ([ADR-0004](docs/adr/0004-two-public-surfaces-two-authentications.md),
[ADR-0002](docs/adr/0002-the-app-holds-no-model-and-the-recommender-is-external.md)). MCP
read is a first-class product surface here rather than an integration bolted on at the
end — the app is judged on how legible the collection is from outside.

**Exposing a query over MCP is one new file in `src/lib/mcp/tools/`.** The directory *is*
the tool list: nothing imports it by name, so the route handler is never edited and there
is no barrel for two slices to conflict in. [`src/lib/mcp/README.md`](src/lib/mcp/README.md)
is the contract — read it before adding a tool, and read `src/core/README.md` before
adding the query underneath it.

The gate is `MCP_BEARER_TOKEN` and it **fails closed**: unset or blank, every request is
refused. Unlike the owner gate there is no development opt-in beside it, because this is a
string you pick rather than a Google client somebody has to create.

```sh
MCP_BEARER_TOKEN=$(openssl rand -hex 32)   # into .env.local, then pnpm dev
```

Both directions are a test rather than a paragraph
([`src/app/mcp/route.test.ts`](src/app/mcp/route.test.ts)), which is the other half of
Seam 2.

### Pointing an assistant at it

Claude Code, against the local loop:

```sh
claude mcp add --transport http tsundoku http://localhost:3000/mcp \
  --header "Authorization: Bearer $MCP_BEARER_TOKEN"
```

Then `/mcp` in Claude Code lists the tools, and *"what have I read?"* calls
`stories_read`. A **Claude custom connector** on claude.ai takes the deployed
`https://<domain>/mcp` and the same header in its *Request headers* section; the Claude
API's MCP connector takes the token as `authorization_token`. ChatGPT's in-app connector
is the one surface where a static bearer is unconfirmed, and ADR-0004 defers it
deliberately.

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

**The primary seam is the verbs and the queries, against a real Postgres.** Both doors
are thin adapters over the core, so this seam covers the web view and the MCP server
together and the adapters need no tests of their own.

**The second seam is the two gates at the HTTP edge**, and it is deliberately thin
because it is protocol behaviour rather than the model: the owner gate in both
directions ([`src/proxy.test.ts`](src/proxy.test.ts)), and `/mcp` refusing an absent or
wrong bearer and accepting the right one
([`src/app/mcp/route.test.ts`](src/app/mcp/route.test.ts)). It reaches no database, and it needs no
Google OAuth client: a Google client is only how an address gets into a session token,
so the test mints its own with the same `encode` Auth.js signs with. Nothing else is a
seam here.

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
