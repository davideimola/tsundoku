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

**The local loop stays entirely local.** Everything up to the first usable version runs
on a Postgres in Docker: no cloud account, no Google OAuth client, no bearer token and
no secret to obtain. What it takes to run the same thing in public is
[going live](#going-live)
([ADR-0003](docs/adr/0003-postgres-runs-in-cluster-on-our-own-k3s-with-off-site-backups.md),
[ADR-0004](docs/adr/0004-two-public-surfaces-two-authentications.md)), and none of it
changes anything below.

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
pnpm db:migrate   # apply pending migrations to whatever DATABASE_URL names
pnpm db:demo      # refresh the Inbox's proposals to look at it with (--clean to remove)
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
│   ├── layout.tsx    force-dynamic, and the shell put on around every screen
│   ├── navigation.ts the destinations, grouped into the three questions
│   ├── shell.tsx     the sidebar at the desk, the bottom bar on a phone
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

**And it goes in the navigation**, as one line in
[`src/app/(owner)/navigation.ts`](src/app/(owner)/navigation.ts), under whichever of the
three questions it answers — *Reading*, *Owning*, *Repairing*. The shell renders that one
map at both widths, so a destination cannot exist on the desk and not on the phone. A
screen that is in the tree and not in the map is a screen reachable only by typing its
URL, which is the state this application was in until #20: eight links on the home page
and no `<nav>` anywhere. It is a test rather than a paragraph, for the same reason the
gate is ([`src/app/(owner)/shell.test.ts`](src/app/(owner)/shell.test.ts)).

That file also holds the width: the shell owns it, and a page that puts `mx-auto` and a
`max-w-*` on the same element — the 34 constraints that used to run the library down the
middle of a wide monitor — fails it. `max-w-prose` on a paragraph is measure, not a
column, and stays.

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

### It writes, and where it may write is decided

An assistant **runs verbs directly on entities that already exist** — record a Reading, set
a Rating, acquire a Volume, open a Wish — because those are narrow, reversible and wrong in
an obvious way, and because *"I finished volume 23, I'd give it an 8"*, said out loud,
landing in the database is the flow the whole app was built for.

**Creating a Story, a Volume or a Series from out there is impossible**
([ADR-0005](docs/adr/0005-the-mcp-runs-verbs-directly-and-creates-entities-only-through-the-inbox.md)).
The risk is not in the verbs, it is in entity creation, where a hallucinated title becomes a
permanent duplicate. The attempt lands as an **Inbox** entry instead, and **approving it is
the act that creates the entity** — `/inbox` is that screen. A rejected entry leaves nothing
behind, because the entry was the only trace the proposal ever had.

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
`stories_read`. The two sentences that exercise the write boundary are:

> *"I finished volume 23 of Slam Dunk, I'd give it an 8"* — a Reading and a Rating,
> recorded directly.
>
> *"I bought Ultimate Spider-Man Omnibus 1"* — an object the library has not
> catalogued, so it lands in `/inbox` and waits. The assistant should say it is
> waiting, not that it has added it. A **Claude custom connector** on claude.ai takes the deployed
`https://<domain>/mcp` and the same header in its *Request headers* section; the Claude
API's MCP connector takes the token as `authorization_token`. ChatGPT's in-app connector
is the one surface where a static bearer is unconfirmed, and ADR-0004 defers it
deliberately.

Connecting the door is half of it. What the owner pastes into the assistant's project —
the vocabulary, the write boundary, and the order to ask the questions in — is in
[`docs/assistant-projects/`](docs/assistant-projects/), one document per project over this
one library. The connector makes the collection answerable; those make it answered
correctly.

## The schema

**Invariants live in Postgres.** The database refuses what must never be true rather
than trusting the application to remember, so most of the model is in
[`db/migrations`](db/migrations/) rather than in TypeScript. Derivations are queries,
not stored columns, and they are the product: the Reading list that composes itself,
a Story's state from its Readings, a Series' missing Volumes.

Migrations are **plain, ordered, forward-only SQL files**. There is no down migration,
and **a file is never edited once it has been applied** — Drizzle keeps a hash per file
in its own ledger and refuses a file that has changed, rather than trusting anyone to
remember. To change something, add a file.

### Writing a migration

**You do not pick a number, and you do not write the DDL by hand**
([ADR-0009](docs/adr/0009-drizzle-owns-the-migrations-and-the-schema-is-still-sql.md)).
Describe the change in [`db/schema.ts`](db/schema.ts) and let the generator write the
file:

```sh
pnpm db:generate    # diffs db/schema.ts against the last snapshot, writes the next file
pnpm db:migrate     # applies what the database has not seen
```

It numbers sequentially from a journal it owns, which is what removed the whole class
of problem the old `<issue>_<step>` convention had: a file from a lower-numbered ticket
arrived from behind and was refused, correctly, and every number that convention would
produce next sorted behind it too.

The generator names the file something random. **Rename it for what it does** and change
the `tag` in `db/migrations/meta/_journal.json` to match — the name is how the next
reader finds it, and nothing has been applied yet.

Then finish it by hand, because **three things Drizzle does not write are the schema's**:

- every `comment on`, which is where this schema documents itself. A generated
  migration that adds a table or a column needs them appended, or the practice dies
  quietly;
- PL/pgSQL — `volume_holds_one_position()` and its triggers are SQL in `0000` and will
  be SQL in whatever changes them;
- the vocabularies, which are rows and not schema (ADR-0006). Each new one is a
  hand-written file of its own, as `0001` is.

`db/migrations/meta/` is the generator's own state and is committed with the file: the
snapshot is the description the *next* diff is taken against, so a snapshot that is not
true makes the next migration wrong. It is written by `pnpm db:generate` and never by
hand.

A migration is wrapped in one transaction, so it lands whole or not at all. Two things
follow: no `begin`/`commit`/`rollback` inside a file, and no `create index
concurrently`, which Postgres will not run in a transaction at all.

After merging a branch whose migration sorts below one you have already applied, run
`pnpm db:reset`: applying it out of order would leave your database with an order no
fresh clone reproduces. Locally there is nothing to preserve, so rebuilding is free —
which is the reason to do the spreadsheet import last and deliberately.

### Type is a data row

Manga, Comic, Graphic Novel, Novel, Non-fiction are **rows in the `type` table, never
an enum in code**
([ADR-0006](docs/adr/0006-one-model-for-reading-and-other-collections-are-a-second-context.md)).
A sixth Type is an insert, not a release. Nothing in TypeScript enumerates the five,
and nothing should.

## The import

The two Google Sheets are read **once, deliberately**, by a command nobody runs for you:
it is not a migration, not a seed, and no part of `pnpm db:up` or `pnpm db:reset`.

```sh
pnpm import:sheets db/import/fixtures    # the rehearsal, against committed fixtures
pnpm import:sheets                       # the real thing, against db/import/sheets/
```

One transaction that **checks its own work before committing** — twenty-two counts, each
one arithmetic over the source tabs' own row counts and the cells read off them, never over
what it is about to insert — and that **refuses a database which
already holds imported data**, because there is no key in these sheets to match a second
run against. Re-running is `pnpm db:reset` and then this.

The sheets are an **address book, not a description**: they are import material and they do
not shape the schema. `Formato` is two columns of one name — a Binding on the shelf, a
reading medium in the books sheet — `Serie / Universo` is taken apart into a Series, a
universe and a Path, and `Acquistato` is read as what it is, a Wish that ended plus an
object in the house. If a column ever seems to want a migration, that is the signal to stop
and say so instead.

[`db/import/README.md`](db/import/README.md) is what the owner reads before exporting: which
tab goes in which file, which columns each one needs, what the import refuses and what it
reports rather than absorbing.

## Going live

**The application is one container and the cluster is a second repository.** The code
lives here; the Flux manifests that run it live in
[`davideimola/home-cluster`](https://github.com/davideimola/home-cluster) under
`apps/tsundoku/`, next to `apps/pantry/` and shaped like it — a CloudNativePG cluster with
continuous backup to Backblaze B2, the app deployment, and a Traefik ingress with a
certificate from cert-manager. No tunnel
([ADR-0004](docs/adr/0004-two-public-surfaces-two-authentications.md)).

### The image

[`Dockerfile`](Dockerfile), and three things about it that are decisions rather than
boilerplate:

- **It builds with no database.** `pnpm build` works with `DATABASE_URL` unset because
  every page that reads the library is per-request, and nothing in the build passes a
  connection string. A build that needed one would need one in CI, in a registry job and on
  a laptop, and the first thing anybody would reach for is a copy of the owner's own.
- **It does not run as root.** `USER node` in the image, and a `securityContext` saying so
  again in the deployment: the image is what makes it true wherever it is run, the manifest
  is what refuses to schedule it if it ever stops being true.
- **It carries the migrations.** `db/` is copied in beside the traced server, and the
  deployment's init container runs `db/cli.ts migrate` from the same image that then serves
  — so what is applied is exactly what was built. `migrate` is the one `db:*` command that
  reaches for no Docker: in the cluster the server already exists and holds the database and
  the role.

```sh
docker build -t tsundoku .
```

### The six variables the cluster sets, and the one it must not

`DATABASE_URL` comes from the secret CloudNativePG writes itself, so no connection string
is ever in Git. The other five are the ones from
[`.env.example`](.env.example): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
`AUTH_OWNER_EMAIL`, `MCP_BEARER_TOKEN`. Each one is a SOPS-encrypted secret in the cluster
repo; the private half of the key lives in the cluster and never in Git.

**`AUTH_DEV_OPEN` is absent there**, and its absence is deliberate belt and braces rather
than the thing that keeps the gate shut: it is never honoured in a production build, which
the container is, and that is a test rather than a promise. Setting it in the cluster would
change nothing — which is exactly why it is not set.

### `/mcp` is rate limited, and it is the only thing published

The limit is in the route handler, immediately before the bearer gate, and
[`src/lib/mcp/README.md`](src/lib/mcp/README.md) has what it counts and the two assumptions
it rests on. Nothing else on the cluster becomes reachable as a side effect: the Traefik
ingress class is deliberately not the cluster's default, so an `Ingress` has to name it to
be published, and `apps/tsundoku` is the only thing that does.

### The restore is what says this is done

Continuous backup that has never been restored is a belief, not a backup
([ADR-0003](docs/adr/0003-postgres-runs-in-cluster-on-our-own-k3s-with-off-site-backups.md)),
and the data is small, hand-curated over years and irreplaceable. So the rehearsal is a
written procedure with a check at every step, in the cluster repo beside the manifests it
names: `apps/tsundoku/RESTORE.md`. It is done once, before the spreadsheet import counts as
complete, and it is the last acceptance criterion of going live.


## Tests

**The primary seam is the verbs and the queries, against a real Postgres.** Both doors
are thin adapters over the core, so this seam covers the web view and the MCP server
together and the adapters need no tests of their own.

**The second seam is the two gates at the HTTP edge**, and it is deliberately thin
because it is protocol behaviour rather than the model: the owner gate in both
directions ([`src/proxy.test.ts`](src/proxy.test.ts)), and `/mcp` refusing an absent or
wrong bearer, accepting the right one, and running out of requests before it looks at
either ([`src/app/mcp/route.test.ts`](src/app/mcp/route.test.ts)). It reaches no database, and it needs no
Google OAuth client: a Google client is only how an address gets into a session token,
so the test mints its own with the same `encode` Auth.js signs with.

Both gates are a pure predicate with a thin adapter over it, and the predicate is tested
beside itself as well as through the adapter —
[`src/lib/auth/gate.test.ts`](src/lib/auth/gate.test.ts) and
[`src/lib/mcp/rate-limit.test.ts`](src/lib/mcp/rate-limit.test.ts). That is Seam 2's
arithmetic rather than a third seam: what it tests is a function the gate would still
have if HTTP were replaced. Nothing else is a seam here.

**A few files are arithmetic of that same kind, and none of them renders anything.**
[`src/app/palette.test.ts`](src/app/palette.test.ts) computes every contrast in the
stylesheet on both grounds; [`src/lib/tint.test.ts`](src/lib/tint.test.ts) walks every
colour the shelf's tint can produce and holds each one to the same threshold;
[`src/components/mark.test.ts`](src/components/mark.test.ts) pins the favicon to the mark;
[`src/lib/utils.test.ts`](src/lib/utils.test.ts) holds the class merger to the two type
sizes this application declared of its own. The rule that keeps them from becoming a seam
is the gates': each is a function this app would still have if React were replaced.

```sh
pnpm test
```

That is the whole command on a clean clone with Docker running: it creates the
container if it is missing, creates `tsundoku_test`, applies the schema, and runs. A
node environment with **no browser runner** — there are deliberately no rendering tests
and no component tests. The owner surface does run client components in production
([ADR-0010](docs/adr/0010-javascript-runs-on-the-owner-surface-and-no-write-depends-on-it.md)),
and still no test here needs a DOM: what a screen is tested through is the core query
behind it and the Server Function its plain form posts to, both of which work with
nothing running in the browser.

A test file runs at a time rather than in parallel, because verbs write and one
database cannot serve two files truncating the same tables.

This diverges from `bindex` on purpose, and the divergence is written down in
[`vitest.config.ts`](vitest.config.ts): there the derivations were dashboard tiles and
the tests are pure; here the derivations *are* the product and they are SQL, so
testing them without a database would mean not testing them.
