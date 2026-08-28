import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Seam 1, and there is no second one here.
//
// The tests exercise the core module's verbs and queries against a **real
// Postgres**. Both doors — the web view and the MCP route handler — are thin
// adapters over that core (ADR-0002), so this one seam covers both and the adapters
// need no tests of their own. There are deliberately no rendering tests, no
// component tests and no browser runner: nothing in this app needs a DOM.
//
// This is a deliberate divergence from `bindex`, which tests pure logic only and
// leaves invariants to the database. Here the derivations *are* the product — the
// self-composing Reading list, a Story's state from its Readings, a Series' missing
// Volumes — and they are SQL. Testing them without a database means not testing them.
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
