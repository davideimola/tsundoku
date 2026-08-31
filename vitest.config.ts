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
