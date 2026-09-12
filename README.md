<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/masthead-dark.svg">
    <img src="docs/brand/masthead-light.svg" alt="tsundoku — the pile that keeps growing, catalogued" width="720">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/davideimola/tsundoku/actions/workflows/check.yml"><img src="https://github.com/davideimola/tsundoku/actions/workflows/check.yml/badge.svg" alt="Check"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1b1b1b" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Next.js%2016-Postgres%2018-1b1b1b" alt="Next.js 16, Postgres 18">
  <img src="https://img.shields.io/badge/LLM%20inside-none-1b1b1b" alt="No LLM inside">
</p>

A single-owner library, named for the pile of unread books that keeps growing: what
the owner has read, what they thought of it, and what stands on the shelf at home —
kept in one place so that an **external** reader (ChatGPT, Claude, over MCP) can
answer *"what should I read next"* without the owner maintaining a spreadsheet by
hand.

Someone else reuses this by forking the repo and running their own infrastructure,
never by creating a second account — [running your own copy](#running-your-own-copy) is
what that takes.

## The name

**積ん読** — *tsundoku*. Japanese for buying books and letting them pile up unread, and
the word is a pun rather than a description: 積んでおく (*tsunde oku*, "to pile it up and
leave it there") with 読 (*doku*, "reading") standing where the last syllable was. It is
Meiji-era, which is to say the habit is older than any app that ever offered to fix it.

Nothing here offers to fix it. **The pile is the subject, not the backlog**: this
application catalogues what is on it, what came off it and what was thought of each, and
the mark at the top of this file is that pile drawn at its smallest — three spines,
slightly askew, because a stack put down without care is what the word means.

Read [`CONTEXT.md`](CONTEXT.md) for the vocabulary — Story, Volume, Collection,
Series, Pass, Rating, Path, Wish, the Pile and the rest are used as defined there, and the
words it says to avoid are avoided. Every decision lives in exactly one place, its ADR
in [`docs/adr/`](docs/adr/).

## Three doors over one core

One Next.js application holds every surface: the web view for the owner, the MCP server as a
route handler in the same app, and a read-only `/api` behind a bearer of its own
([ADR-0025](docs/adr/0025-the-third-door-is-the-api-and-it-publishes-renderings.md)). All are
**thin adapters over
[`src/core`](src/core/)**, which owns the verbs and the queries; neither holds domain
logic ([ADR-0002](docs/adr/0002-the-app-holds-no-model-and-the-recommender-is-external.md)).
That is what lets one test seam cover all of them.

The app contains **no LLM and spends no tokens**. The recommender is the assistant the
owner already pays for; this app's job is to make the collection answerable.

If you are adding verbs or queries, read [`src/core/README.md`](src/core/README.md)
first — it says where a new file goes and why there is no barrel index.

## The local loop

**The local loop stays entirely local.** Everything up to the first usable version runs
on a Postgres in Docker: no cloud account, no Google OAuth client, no bearer token and
no secret to obtain. What it takes to run the same thing in public is
[running your own copy](#running-your-own-copy)
([ADR-0004](docs/adr/0004-two-public-surfaces-two-authentications.md)), and none of it
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
pnpm db:mock      # an invented library to walk the screens with (--clean to remove)
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
│   ├── finder.tsx    the glyph beside the mark, and the palette it opens
│   ├── find/         where it lands, unscripted: one GET over one core query
│   └── page.tsx
├── (public)/         outside it. Today: /signin, and nothing else.
└── api/auth/         Auth.js's own endpoints
```

So a screen over the Collection, the Stories, the Passes or the Pile goes in
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
three questions it answers — *Reading and playing*, *Owning*, *Repairing*. The shell renders
that one map at both widths, so a destination cannot exist on the desk and not on the phone. A
screen that is in the tree and not in the map is a screen reachable only by typing its
URL, which is the state this application was in until #20: eight links on the home page
and no `<nav>` anywhere. It is a test rather than a paragraph, for the same reason the
gate is ([`src/app/(owner)/shell.test.ts`](src/app/(owner)/shell.test.ts)).

**There is exactly one screen that is not in the map, and it is `/find`.** The three
sections are the three questions the owner asks; *find* is not a fourth one, it is how they
get to the answer to any of them. So it is declared as `THE_FINDER` in `navigation.ts`
instead, and the chrome carries the way into it beside the mark on every screen — which is a
stronger claim than a line in a list, and the wall holds it to all of it: the screen exists,
it is not *also* a destination, the chrome opens it at both widths, and there is exactly one
palette behind those two triggers. A further exception has to be argued for in that module
rather than added to a list in a test. See
[the finder](#the-finder-is-one-query-and-both-doors-get-it).

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
day a variable was misspelled in a deployment — and it is **never honoured in a
production build**, which the container is. Both conditions are tested.

The four variables that boot the real gate — `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `AUTH_OWNER_EMAIL` — are documented in
[`.env.example`](.env.example) and have no values there. Creating the OAuth client is a
human step: that is the price of owner identity being configuration rather than
hardcoded data, and it is what lets someone else fork this and run it as themselves.

## The finder is one query, and both doors get it

One field over the whole library, reachable from every screen and from the keyboard. The
chrome spends a glyph on it beside the mark; `⌘K` opens it from anywhere; it arrives as a
palette over the window rather than a box in the sidebar, so the answer is the size of the
answer. A fragment of a name is enough, and enter lands on the record. Results are grouped by
what they are — Story, Volume, Series, person, Path — so a narrative is distinguishable from
an object at a glance. On a library this size a finder is worth more than any amount of
filtering, because the owner searches **titles**, not functions.

It is **one core query, and the MCP door has it too**:
[`src/core/queries/finder.ts`](src/core/queries/finder.ts) behind the field, behind `/find`,
and behind `finder_search` on `/mcp`. That is not tidiness — the owner and ChatGPT search the
same library and get the same answers, and if they ever disagree one of them is lying. **A
cross-entity question the finder needs is added to the core and both doors get it**; the
finder never reaches a record the assistant cannot.

Three things about it are decisions:

- **The palette is the scripted half and `/find` is the specification**
  ([ADR-0010](docs/adr/0010-javascript-runs-on-the-owner-surface-and-no-write-depends-on-it.md)).
  The glyph in the chrome is an `<a href="/find">`: with nothing running it is a link to that
  screen, which carries a plain `GET` form over the same query, and with a script it opens
  the palette instead. So the suggestions, the arrow keys and the shortcut are a shorter way
  to a place the owner can already get to — and a button that did nothing on a shop's signal
  was never an option. It costs one step without a script, where the old sidebar field could
  be typed into where it stood; what it buys is a search one keystroke from every screen.
  The palette shows the first few of each kind and the screen four times as many, so
  everything the palette reaches the screen reaches, and never the other way round.
- **The accent fold is `unaccent`**, applied to both sides of every comparison
  ([`db/migrations/0003_the_finder_folds_accents.sql`](db/migrations/0003_the_finder_folds_accents.sql)),
  so `perche` finds *Perché* and `kohei` finds *Kōhei Horikoshi*. It is the extension rather
  than a hand-kept table of the accents somebody thought of, and it is a trusted contrib
  module, so the app user that owns the database can create it and the init container applies
  the file like any other.
- **Volumes are the catalogue, not the Collection**
  ([ADR-0007](docs/adr/0007-a-volume-is-catalogued-and-the-collection-is-the-subset-in-the-house.md)).
  An object the library knows and the house does not hold has a page of its own, so the
  finder reaches it. *Do I own this?* is `collection_search` and the Collection wall.

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

An assistant **runs verbs directly on entities that already exist** — record a Pass, set
a Rating, acquire a Volume, open a Wish — because those are narrow, reversible and wrong in
an obvious way, and because *"I finished volume 23, I'd give it an 8"*, said out loud,
landing in the database is the flow the whole app was built for.

**Creating a Story, a Volume or a Series from out there is impossible**
([ADR-0005](docs/adr/0005-the-mcp-runs-verbs-directly-and-creates-entities-only-through-the-inbox.md)).
The risk is not in the verbs, it is in entity creation, where a hallucinated title becomes a
permanent duplicate. The attempt lands as an **Inbox** entry instead, and **approving it is
the act that creates the entity** — `/inbox` is that screen. A rejected entry leaves nothing
behind, because the entry was the only trace the proposal ever had.

### Five tools were renamed, and a connected assistant has to be re-added

`reading_record`, `reading_finish`, `reading_abandon`, `reading_provenances` and
`reading_list_next` are now `pass_record`, `pass_finish`, `pass_abandon`,
`pass_provenances` and `pile_next`. A **Reading** was *one act of reading a Story*, which a
videogame is not, and the **Reading list** was *what to read next*, which half of what
stands on it is not
([ADR-0021](docs/adr/0021-the-boundary-is-the-narrative-you-pass-through-and-videogames-are-inside-it.md)).

**The old names are gone, and this breaks a connected assistant once.** ChatGPT caches the
tool list it first saw and there is no channel to tell it otherwise, so the door has to be
reconnected by hand: **restart the tunnel client, then remove and re-add the connector** —
"refresh" does not refetch, and inverting the two hides which one worked.
[`src/lib/mcp/README.md`](src/lib/mcp/README.md) is where that runbook lives, along with
the whole table of old name against new, the arguments that moved with them, and how to
tell an old list apart from a deploy that never landed.

**`pass_media` is a sixth change to that list and takes the same runbook.** It lists the
media the way `pass_provenances` lists the Provenances, and it exists because the medium
stopped being a pair the day the consoles arrived: `pass_record` used to name *paper or
digital* in its own sentence, and a door naming a vocabulary's values is where they go
stale — the next console would be an insert *and* an edit to that sentence, which is the
coupling [ADR-0022](docs/adr/0022-the-medium-is-a-vocabulary-and-only-paper-goes-through-an-object.md)
moved to a row to kill.

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

> *"I finished volume 23 of Slam Dunk, I'd give it an 8"* — a Pass and a Rating,
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

## The API door

`/api` is the third door, and **it is read-only by construction**
([ADR-0025](docs/adr/0025-the-third-door-is-the-api-and-it-publishes-renderings.md)): there is
no verb reachable from it, no route under it that writes, and nothing in its gate that could
grant one. Writes stay behind the Inbox at `/mcp`. Its first resource is:

```
GET /api/showcase
Authorization: Bearer $API_BEARER_TOKEN
```

One document, because the consumer is one public page rebuilt on a schedule and five round
trips to a home cluster are five chances to be half down: what is being read or played right
now, what concluded and what the owner thought of it, how tall the pile is, and a sample of
the shelf. `?types=manga,videogame` narrows every block by Type slug, and an unknown slug is a
400 rather than a quietly empty document. It answers an `ETag` and honours `If-None-Match`,
and it is `Cache-Control: private, max-age=300`, because this is one person's library behind
one token and no shared cache may hand it to the next request that arrives without one.

**The token is not `MCP_BEARER_TOKEN` and must not be.** That one lives in the owner's own
assistant; this one lives in the page host's environment, and each has to be rotated without
disturbing the other.

### What it publishes, and what it cannot

**Renderings, not records.** There is no per-row `public` flag in this library: what is
published is a composition, `theShowcase` in
[`src/core/queries/showcase.ts`](src/core/queries/showcase.ts), and **what is not composed
there does not exist to the outside**. Prices, acquisitions and their days, the Inbox and its
proposals, Paths, Provenance, the grain of a score, the prose of a Rating, ISBNs and the
owner's own address are absent by construction rather than by filtering. Nothing in the
document identifies the owner.

Adding a field to that file is the whole act of publishing it, which is why the file's own
tests assert the forbidden list by name. `shelf.volumes` and `pile.recent` are **samples**,
capped and ordered by what arrived most recently, with the real figure beside them, and there
is deliberately no cursor.

### A new resource under it is two things

A route that calls `requireApiCaller()` **first**, and its path added by name to the matcher
in [`src/proxy.ts`](src/proxy.ts). `/api` is not excluded from the owner gate as a prefix,
because `api/auth` already lives under it: a route left out of that line is gated by Google
and answers `307 /signin` to its bearer, which is useless rather than open.
[`src/app/api/gated.test.ts`](src/app/api/gated.test.ts) walks the routes that are there and
fails when one stops calling the wall.

## The schema

**Invariants live in Postgres.** The database refuses what must never be true rather
than trusting the application to remember, so most of the model is in
[`db/migrations`](db/migrations/) rather than in TypeScript. Derivations are queries,
not stored columns, and they are the product: the Pile that composes itself,
a Story's state from its Passes, a Series' missing Volumes.

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

**Do not touch the `when` beside it.** Drizzle's migrator does not keep a set of files a
database has seen: it reads the newest `created_at` in `drizzle.__drizzle_migrations` — each
row holding a file's `when` — and applies everything whose `when` is *greater* than that one
number. It is a watermark. So a `when` written by hand, or one that sorts behind a file
already applied, is a migration that **will never run anywhere**, and nothing says so:
`pnpm db:migrate` reports success, a fresh database is built correctly from an empty table,
and the only surface that finds out is production, where the column is missing and the page is
a 500. It happened — entries 12 to 18 carry timestamps hand-written a day apart into the
future, and 0020 and 0021 arrived from the real clock behind them, so a deploy shipped code
for a schema the database was never going to be given.
[`db/migrations/journal.test.ts`](db/migrations/journal.test.ts) is the wall now: the journal
has to climb, and it names the one entry that is allowed to sit below the mark.

**And a `when` that a database has already recorded is not yours to raise either.** Raising it
does not make the file run where it was skipped; it makes it run **again** wherever it landed,
failing on the first `add column` and taking everything behind it down with it — which is how
0019 answered when it was tried. So: past the largest `when` already applied, or left exactly
where the databases recorded it. Never between.

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

Manga, Comic, Graphic Novel, Novel, Non-fiction, Videogame are **rows in the `type`
table, never an enum in code**
([ADR-0006](docs/adr/0006-one-model-for-reading-and-other-collections-are-a-second-context.md)).
Nothing in TypeScript enumerates them, and nothing should.

**Videogame is the proof rather than the exception.** It arrived as one `insert` in
`0015` and no release
([ADR-0021](docs/adr/0021-the-boundary-is-the-narrative-you-pass-through-and-videogames-are-inside-it.md)),
because a Story owing no object to anybody is the case this model has held since
ADR-0001. The medium is the same posture, one table further on: paper, digital and
the consoles the owner plays on are rows too, each declaring whether it can go
through an object
([ADR-0022](docs/adr/0022-the-medium-is-a-vocabulary-and-only-paper-goes-through-an-object.md)),
so the next console is another insert. **Which media a Type offers is a third row of
data** (`type_medium`, `0016`): paper and digital for what is printed, the consoles
for what is played, which is the one thing `CONTEXT.md` says a Type decides. Both
pickers that ask the medium read it — the narrative half of `/add` and the *Start it*
panel on a Story's page — so a console bought next year reaches them by two inserts
and no release. A Type with no row there is answered with the whole vocabulary rather
than with an empty picker.

**Offered is not allowed.** Nothing in the database refuses a manga read on a PS5:
there is no foreign key from `pass` to that mapping and no trigger over it, because a
vocabulary says what is offered and the owner is the one holding the record. It
decides what stands in front of them, and no more than that.

### A cover is hotlinked, and only the owner's own images are hosted

**No third-party image byte is stored anywhere by this application**
([ADR-0013](docs/adr/0013-covers-are-hotlinked-and-only-the-owners-own-images-are-hosted.md)).
A Volume carries its cover as a *reference* — which source answered, that source's id for the
record, the address, and the source's own page for the book — and an `<img>` points at
somebody else's domain. Google Books is the only source that has these covers (91% of a
54-ISBN sample of real Italian comics, against 5.6% for the next two —
[`docs/research/cover-images-by-isbn.md`](docs/research/cover-images-by-isbn.md)) and its
terms forbid a permanent copy, so `cover_url` is **constrained by Postgres** to the sources'
own domains and `own_image_url` is constrained *away* from them. Hosting is reserved for the
owner's own photograph, which overrides the looked-up cover and is the only thing that will
ever face a Volume with no ISBN — every Bonelli monthly, always.

**Nothing on a page render calls a third party.** The lookup is a verb the owner runs, from
the *Look up the covers* disclosure at the foot of the Collection or from one object's own
page; a render reads a column. `src/core/covers.ts` is the only file in the repository that
knows what a `fetch` is, and it answers three ways — found, none, and **unanswered**, which
writes nothing at all, because a 403 recorded as "no cover" is the mistake that produced a
false 0% in the research above. A cover that has gone missing is looked up again by the same
verb, oldest check first, and never on the request path.

Two consequences worth expecting. **Roughly one Volume in ten will never have a looked-up
cover**, so the drawn tile stays the normal case and the Series' tint stays underneath every
jacket. And the covers that do arrive are **128 pixels wide**, which is the only size that
exists: anything larger is a photograph the owner took.

**A Story can carry an image of its own, and it is the only image a narrative ever wears.**
Nothing is looked up onto one: every source is keyed by an ISBN, an ISBN belongs to an object,
and a videogame owns no object at all — which is why until now a game's tile could be nothing
but the drawn one. `story.own_image_url` is the same escape hatch under the same constraint,
set from *Face it with an image* on the Story's own page. **The precedence is the image nearest
the record**: the Story's own image, then whatever the first Volume carrying it is faced with —
itself the owner's photograph over the looked-up cover — then the drawn tile, which stays the
ordinary case. It is resolved once, in `THE_COVER_IT_IS_FACED_OUT_WITH`
(`src/core/queries/story.ts`), so the three walls that lay a Story out cannot each decide it
differently.

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
Medium in the books sheet — `Serie / Universo` is taken apart into a Series, a
universe and a Path, and `Acquistato` is read as what it is, a Wish that ended plus an
object in the house. If a column ever seems to want a migration, that is the signal to stop
and say so instead.

[`db/import/README.md`](db/import/README.md) is what the owner reads before exporting: which
tab goes in which file, which columns each one needs, what the import refuses and what it
reports rather than absorbing.

## The conversion

The other command nobody runs for you, and for the same reason. Fifty-one of the library's
eighty-three Stories are numbers of a run, across five lines — One-Punch Man, Slam Dunk, La
via del grembiule, Fullmetal Alchemist and Death Note — because a Story used to be *the
owner's choice, case by case*, and the choice made for a manga shelf was to track the run
rather than judge the work. One rule replaced that: **a Story is what you would give a score
to**. This is the one-off that moves the owner's rows onto it.

```sh
pnpm convert:runs --dry-run    # read the library, print the plan, write nothing
pnpm convert:runs              # convert the five runs, and strike the hand-made Slam Dunk Path
```

It presses `mergeSeriesIntoOneStory` five times, so the five lines become five works and the
Path the owner minted as a workaround for a Want goes with them. **It refuses the whole run
while any narrative it would collapse carries a Pass or a Rating** — today that count is
zero, and the guard is what keeps this safe the day it is actually run. Every Volume, every
Acquisition and every completeness ledger is untouched: the shelf does not move.

It is a script rather than a migration on purpose — the gesture it presses is a verb and not
SQL, a migration would run itself on a deploy nobody was watching, and nothing here is schema.
[`db/convert/README.md`](db/convert/README.md) is the argument and the rehearsal.

## Running your own copy

This repository is public and the application is single-owner by design, so the two facts
meet here: **you run it by forking and hosting it yourself, never by creating a second
account in somebody else's** ([ADR-0004](docs/adr/0004-two-public-surfaces-two-authentications.md)).
There is no tenancy in the schema and there is not meant to be. What follows is the whole
of what that costs.

**Three things, and no fourth.** A Postgres 18, this application, and a Google OAuth client
so that the gate has something to check you against. No cloud account is implied, no
Kubernetes, and nothing here calls an LLM or spends a token on your behalf — the recommender
is the assistant you already pay for
([ADR-0002](docs/adr/0002-the-app-holds-no-model-and-the-recommender-is-external.md)).

### With Docker, which is the short way

[`compose.yaml`](compose.yaml) is the deployment's three steps in order — the database, the
migrations, the app — and compose enforces the order, so the schema is always applied by the
same image that then serves.

```sh
cp .env.example .env.local   # then fill in the four gate variables, see below
docker compose up --build    # http://localhost:3000
```

It is deliberately not the local loop: what it builds is a production image, where
`AUTH_DEV_OPEN` is never honoured, so the gate is real from the first request. Put it behind
a TLS terminator of your own — the container serves plain HTTP on 3000 and knows nothing
about certificates — and set `AUTH_URL` to the origin that terminator publishes.

**The volume is where the data lives, not where it is safe.** Continuous backup is the one
thing `compose.yaml` deliberately does not have, and it is the one thing worth adding before
you have typed much in: this data is small, hand-curated over years and irreplaceable, and a
backup that has never been restored is a belief rather than a backup.

### With node, if you already have a Postgres

The same three steps, unwrapped. Node 22 and pnpm 10 — `mise install` pins both — and a
database you created yourself, empty; the migrations make everything in it.

```sh
export DATABASE_URL=postgres://user:password@host:5432/tsundoku
pnpm install --frozen-lockfile
pnpm build          # needs no database: every page that reads the library is per-request
pnpm db:migrate     # the one db:* command that reaches for no Docker

# What `output: "standalone"` writes is a server that carries its own dependencies, and
# the two things it deliberately does not trace, because they are served rather than
# imported. The Dockerfile does exactly these three lines.
cp -R public .next/standalone/public
cp -R .next/static .next/standalone/.next/static
node .next/standalone/server.js   # PORT and HOSTNAME are the server's own
```

The build needs the network even without a database: `next/font/google` fetches the three
families and self-hosts them, so a browser asks Google for nothing at run time, and a build
that cannot reach them fails outright rather than shipping fallback type.

`pnpm db:migrate` is what the init container and the compose `migrate` service both run, and
it is idempotent: it reads the journal in `db/migrations/meta/` and applies what that
database still needs ([ADR-0009](docs/adr/0009-drizzle-owns-the-migrations-and-the-schema-is-still-sql.md)).
Run it on every deploy, before the new version serves.

### What you have to set, and what the gate does without it

Every one of these is documented at length in [`.env.example`](.env.example). Nothing in
this list carries a value in this repository.

| Variable | Needed | What it is |
| --- | --- | --- |
| `DATABASE_URL` | always | host, port, credentials and database name, and the only variable the local loop needs |
| `AUTH_SECRET` | hosted | what the session cookie is signed with; `pnpm dlx auth secret` prints one. Rotating it signs everybody out |
| `AUTH_GOOGLE_ID` | hosted | the OAuth client id from Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | hosted | its secret |
| `AUTH_OWNER_EMAIL` | hosted | the one Google address that may sign in. Singular: a comma in it is refused, not read as a list |
| `AUTH_URL` | hosted | the public origin, which must match the redirect URI registered with Google exactly |
| `MCP_BEARER_TOKEN` | for `/mcp` | a string you pick; it is the whole of that door's authentication |
| `API_BEARER_TOKEN` | for `/api` | a second string you pick, for the read-only API. Deliberately not the same secret: it lives in the page host's environment |
| `SHOWCASE_WISHLIST` | optional | `true` publishes the wishlist block on `/api/showcase`. Off by default, and off is the right answer unless you want yours public |
| `COVER_CONTACT_URL` | optional | where a cover source can reach you about your traffic. Unset, this app says it is the project rather than somebody else's deployment |
| `AUTH_DEV_OPEN` | local only | opens the gate while there is no Google client to point at, and is **never honoured in a production build** |

**All three doors fail closed.** A deployment missing one of the gate variables refuses the
owner rather than admitting everybody, and `/mcp` or `/api` with its own token unset or blank
refuses every request. The authorised redirect URI to register with Google is
`https://<your domain>/api/auth/callback/google`.

### The image

[`Dockerfile`](Dockerfile), and three things about it that are decisions rather than
boilerplate:

- **It builds with no database.** `pnpm build` works with `DATABASE_URL` unset because
  every page that reads the library is per-request, and nothing in the build passes a
  connection string. A build that needed one would need one in CI, in a registry job and on
  a laptop, and the first thing anybody would reach for is a copy of the owner's own.
- **It does not run as root.** `USER node` in the image, and `node` is uid 1000 there — which
  matters wherever the runtime states it a second time, since an orchestrator asked to refuse
  a root container cannot tell whether a *name* is root.
- **It carries the migrations.** `db/` is copied in beside the traced server, so whatever runs
  this image can apply the schema from it — `db/cli.ts migrate`, before the app is allowed to
  serve — and what is applied is exactly what was built. `migrate` is the one `db:*` command
  that reaches for no Docker: by then the server already exists and holds the database and the
  role. [`compose.yaml`](compose.yaml) is that step written out.

```sh
docker build -t tsundoku .
```

### The icons and the manifest are the one thing served without a cookie

`icon.svg` is the tab's, `apple-icon` is the phone's home screen — a 180px PNG generated from
the **same `PILE` geometry the chrome draws**, so there is no fourth copy of the mark to keep
in step — and `manifest.webmanifest` is what makes *Add to Home Screen* open the library as an
app rather than as a tab with an address bar over the Collection wall.

**All three are excluded from the owner gate by name**, beside `favicon.ico` and for the
reason already written there: a browser fetches them unprompted, and a manifest is fetched
with credentials *omitted* unless the link says otherwise — so gated they answer `307 /signin`
and the phone silently never offers to install anything. Nothing under them is library data:
an application's name and its logo are already on the sign-in screen. `start_url` is `/`,
which **is** gated, so opening the app with no session lands on the sign-in screen, which is
correct.

They are also the only place in the project besides the tint that names a colour, because a
tab, a home screen and a status bar are outside this application's cascade and cannot be
handed a `var()`. The four literals live once in
[`src/app/outside-the-cascade.ts`](src/app/outside-the-cascade.ts), and
[`src/app/palette.test.ts`](src/app/palette.test.ts) reads `globals.css`, converts the
primitives to sRGB and asserts they are exactly them, on both grounds.

### `/mcp` and `/api` are rate limited

The limit is immediately before each door's bearer gate, and
[`src/lib/mcp/README.md`](src/lib/mcp/README.md) has what it counts and the two assumptions it
rests on. It counts before the gate is reached, so an unauthenticated flood costs this
application one comparison rather than a query. The two doors share the arithmetic and **not
the counters**: a flood against the public page must not refuse the owner's own assistant out
of an allowance it never spent.

### The parts that are the owner's and not yours

Two commands in this repository read the owner's own spreadsheets — [the import](#the-import)
and [the conversion](#the-conversion) — and both now refuse to run: they were one-off moves
onto this model and their fixtures are fabricated data about real books, kept so the code
stays readable and runnable. A fork starts with an empty library and fills it through the
screens or through `/mcp`, and `pnpm db:mock` puts an invented one in front of you if you
want to walk the walls first.

The [assistant project instructions](docs/assistant-projects/) are written in the owner's
voice about the owner's shelf. They are the two documents that make the MCP door useful, and
they are meant to be edited rather than pasted as they are.

### Issues are welcome

Issues and pull requests are read. What is **not** open is the shape of the thing: single
owner, no tenancy, no recommender inside the app, and a vocabulary that is
[`CONTEXT.md`](CONTEXT.md)'s rather than a preference — those are ADRs, and changing one
means arguing with the ADR rather than with the code. Everything else — a bug, a source that
answers differently, a screen that is wrong on a phone, a deployment path that does not work
— is worth a ticket.

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
stylesheet on both grounds;
[`src/app/hotlinked.test.ts`](src/app/hotlinked.test.ts) greps the source for the two rules
ADR-0013 rests on — one file knows what a `fetch` is, and nothing reaches for the image
optimizer; [`src/lib/tint.test.ts`](src/lib/tint.test.ts) walks every
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

The finder is where that was first put to the test (#25). Its field suggests as the owner
types and takes `⌘K` from any screen, and it has no test — because it holds nothing to
test: what is searched is a core query, how the answer is banded and turned into a URL is a
derivation tested beside itself, and pressing enter with no script running at all lands on
`/find`, which asks the same query. So the claim is stronger than "no test needs a DOM": **a
client component may exist, and it may hold no derivation.** The day one does, the answer is
to move it behind a seam rather than to add a third one.

**No test here calls a third party**, and the cover lookup is where that was worth
deciding rather than assuming. The verb takes its source as an argument, so Seam 1 hands it
one that answers off a table; what turns a real response into an answer is a pair of pure
readers in [`src/core/covers.ts`](src/core/covers.ts), tested against bodies a real probe
produced. That is not convenience: the two behaviours that matter most — a rate limit is
never recorded as an absence, and a cover that has gone is looked up again — are exactly the
two a live source will not produce on demand.

A test file runs at a time rather than in parallel, because verbs write and one
database cannot serve two files truncating the same tables.

This diverges from `bindex` on purpose, and the divergence is written down in
[`vitest.config.ts`](vitest.config.ts): there the derivations were dashboard tiles and
the tests are pure; here the derivations *are* the product and they are SQL, so
testing them without a database would mean not testing them.
