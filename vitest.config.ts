import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two seams, and there is no third one.
//
// **Seam 1**, the primary one: the core module's verbs and queries against a **real
// Postgres**. Both doors — the web view and the MCP route handler — are thin
// adapters over that core (ADR-0002), so this one seam covers both and the adapters
// need no tests of their own. There are deliberately no rendering tests, no
// component tests and no browser runner. The owner surface *does* run client
// components in production (ADR-0010) — there is a DOM out there — and still no test
// in here needs one: what a screen is tested through is the query behind it and the
// Server Function its plain form posts to, and a scripted control has an unscripted
// twin that is the specification.
//
// **#25 asked for that paragraph to be corrected as false, and it was already true** —
// which is worth writing down rather than quietly fixing, because the ticket's premise
// is what was wrong. It called itself "the first ticket to ship a client component";
// `src/app/(owner)/shell.tsx` had been one since #20, and the sentence above was written
// in that slice for exactly this reason. Nothing here needed correcting. What #25
// actually changed is the *strength* of the claim, and that is what the rest of this
// paragraph is.
//
// A second such control has since shipped and is held to the same rule: the rail on a
// route (`src/app/(owner)/paths/[id]/rail.tsx`) lets a stop be dragged into its gap at a
// desk. It holds a media query, a rectangle and six listeners; which gap the pointer let go
// in is `landing.ts` below, and what a move writes is `moveStoryOnPath` in Seam 1. What it
// submits is a form the server rendered, so the arrows beside it are still the
// specification.
//
// The finder's field is the first control here that does something in the browser rather
// than reading `usePathname()`: it suggests as the owner types, walks a list with the
// arrow keys and takes `⌘K` from anywhere. None of that is tested, and the reason is not
// that a runner would be inconvenient — it is that the component holds no derivation the
// two seams could take. What is searched is `src/core/queries/finder.ts`, which is
// Seam 1; how the answer is banded, worded and turned into a URL is
// `src/app/(owner)/find/kinds.ts`, which is a screen's own derivation and tested beside
// itself under the paragraph below; and where enter lands with nothing running at all is
// `/find`, a plain `GET` over the same query.
//
// **What is left is not nothing, and it is the right nothing**: a highlight that wraps at
// the end of a list, a stale answer dropped, and a predicate asking whether a key was
// typed into an `HTMLInputElement`. Each is behaviour — and each is behaviour *over the
// DOM*, so none of it passes the rule above and below this: a function this application
// would still have if React were replaced. `typing()` would not exist; there would be no
// element to ask about.
//
// So the rule this configuration is now stating, which is more than "no test needs a
// DOM": **a client component may exist, and it may hold no derivation.** The day one does
// — a filter applied in the browser, a total added up on the client — the answer is to
// move it behind one of the two seams, not to add a third one and a DOM to run it in.
//
// This is a deliberate divergence from `bindex`, which tests pure logic only and
// leaves invariants to the database. Here the derivations *are* the product — the
// self-composing Reading list, a Story's state from its Readings, a Series' missing
// Volumes — and they are SQL. Testing them without a database means not testing them.
//
// **Seam 2**, deliberately thin: the two gates at the HTTP edge. It is protocol
// behaviour rather than the model — the owner gate in both directions, and `/mcp`
// against its bearer and the rate limit in front of it — so it reaches no database and
// shares nothing with Seam 1 but this config.
//
// Both gates are a **pure predicate** with a thin adapter over it, and the predicate is
// tested beside itself rather than only through the adapter: `src/lib/auth/gate.test.ts`
// and `src/lib/mcp/rate-limit.test.ts` are that, and they are Seam 2's arithmetic rather
// than a third seam. The rule that keeps it from becoming one is that they test a
// function the gate would still have if HTTP were replaced — environment or a moment in,
// verdict out — and never a private helper of the route.
//
// **The same licence, stated once, reaches a screen's own derivation** — `src/lib/tint.ts`,
// `src/app/(owner)/inbox/decisions.ts`, which bands a few hundred waiting Inbox entries
// into the handful of decisions the owner actually takes and names them,
// `src/app/(owner)/find/kinds.ts`, which says what each kind of record is called and where
// enter lands on it, `src/app/(owner)/collection/covers-found.ts`, which turns a cover
// run's six numbers into the clauses the owner reads, `src/app/(owner)/stories/readings.ts`,
// which says how an act of reading is worded and which one of them is still open — the
// predicate the acts on a Story's page hang off — `src/app/(owner)/series/positions.ts`, which
// says what each position of a Series is and so where the difference between *missing* and
// *not mine yet* is decided, `src/app/(owner)/collection/[id]/standing.ts`, which says where
// the owner stands with one object and therefore which acts its page offers,
// `src/app/(owner)/reading-list/entry.ts`,
// which says what a composed entry is called, where its tile leads and what its foot carries,
// `src/app/(owner)/paths/[id]/landing.ts`, which says which gap a stop dragged on a route
// falls into — the one piece of arithmetic the drag adds over the two arrows beside it, and
// the order on a route is the one judgement in this application nothing derives —
// `src/app/(owner)/wishes/shopping.ts`, which says the three steps a shopping list is bought
// in — the Reading list's picker offers the same three words — and holds the banding to the
// Wish's own rule that nothing silently disappears from what the owner meant to buy, and
// `src/app/(owner)/credits/body-of-work.ts`, which cuts everything a person is credited on
// along the role they held on it, over an answer the core hands over split by whether it was
// read, and `src/components/stories-on-offer.ts`, which bands what the field under an object's
// contents found by the line each Story stands in and says what enter on a typed title does —
// the one of these that belongs to a **component** rather than to a screen, because the
// component it is beside is written to be mounted on two of them (#47, and #48 for the
// second).
//
// **The third client component carrying a write is the first**, and the licence above is what
// keeps it from being a third seam. `src/components/stories-it-holds.tsx` names the Stories an
// object holds and writes through an adapter of Server Functions (ADR-0020, which supersedes
// ADR-0010 and no longer asks a control for an unscripted twin). What is left in the component
// is a field, a settling timer, a stale answer dropped and one armed press; what it *derives*
// is the file named in the paragraph above, and what it writes is Seam 1.
//
// **The fourth is the same component's second mounting**, and it is a screen rather than a
// component: `src/app/(owner)/add/the-object.tsx` is the object half of the one door, where the
// rows are held until one submission because the Volume does not exist yet (#48). What it holds
// is a list, a counter for the rows that are not records yet and two pickers that answer each
// other; what it *derives* is `src/app/(owner)/add/door.ts` — what row the list arrives with,
// and what the press carries about what is inside the object — which is tested beside itself
// under the paragraph above, in both directions, because a refused press reads back what the
// action wrote. What it writes is `sayWhatHappened`, which is Seam 1.
//
// It is the same rule and not a wider one: data in, data out, a function
// this application would still have if React were replaced, and never a component, a render
// or a private helper of a page. What a *screen* is tested through is still the query behind
// it and the Server Function its plain form posts to. A pure derivation grown into a page is how this rule would be broken, and
// the test file has to say out loud which of the two it is.
//
// **The same licence reaches one file that is not a screen's, and that is `src/core/covers.ts`'s
// readers.** They take the text of a source's answer, or an HTTP status, and answer *found*,
// *none* or *unanswered* — data in, data out, and this application would still have them if
// `fetch` were replaced by a courier. Everything in that file which touches a socket is
// exercised through the verb instead, which takes its source as an argument and is Seam 1
// (`src/core/verbs/cover.test.ts`). So the rule is unchanged rather than widened, and the thing
// it buys is worth naming: **no test in this repository calls a third party**, and the two
// behaviours that matter most — a rate limit is not an absence, and a cover that has gone is
// looked up again — are exactly the two a live source would not produce on demand.
//
// **Four files are neither seam, and they are walls**: `src/app/gated.test.ts`,
// `src/app/palette.test.ts`, `src/app/hotlinked.test.ts` and `src/app/vendored.test.ts`. Each
// is arithmetic or a grep over the source, each catches a failure that is silent — a page
// served ungated, a colour nobody chose, a page that calls a third party on the render, a
// vendored decoder that has drifted from the library that loads it and so is broken in Safari
// only — and none of them renders anything. They are the same licence as the paragraph above:
// text and bytes in, verdict out.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The core module is `server-only`, which Next resolves through its own
      // bundler alias rather than from `node_modules`. Stubbed so the module is
      // reachable from a test — see the stub for why nothing is lost by it.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Auth.js is transformed rather than loaded as an external package. Its internals
    // import `next/server`, which Next resolves through its own bundler and which
    // node's ESM resolver, reaching for it from inside `next-auth`, does not find.
    // Inlining is what lets Seam 2 exercise the proxy with a real session cookie
    // instead of a mock of the thing under test.
    server: { deps: { inline: ["next-auth", "@auth/core"] } },
    include: ["src/**/*.test.ts", "db/**/*.test.ts"],
    // Brings the container up and applies the schema to the test database, so
    // `pnpm test` is the whole command on a clean clone.
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    // One database, so one file at a time. Verbs write, and two files truncating the
    // same tables in parallel would fail in a way that reads as a bug in the verb.
    // A slice that wants speed back should reach for a schema per worker, not for
    // this flag.
    fileParallelism: false,
    // A green run has to mean tests ran: collecting nothing is a broken config, not a
    // pass.
    passWithNoTests: false,
  },
});
