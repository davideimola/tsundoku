import { afterAll } from "vitest";
import { loadEnvLocal, requireDatabaseUrl, testDatabaseUrl } from "../../db/env.ts";

// Point the core module at the test database before any test imports it. The pool is
// created on first use, so setting the variable here is enough — nothing has read it
// yet.
loadEnvLocal();
process.env.DATABASE_URL = testDatabaseUrl(requireDatabaseUrl());

afterAll(async () => {
  // Imported lazily: this must not load the core module before the line above runs.
  const { closePool } = await import("@/core/db");
  await closePool();
});
