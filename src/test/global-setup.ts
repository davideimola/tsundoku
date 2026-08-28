import { ensureContainer } from "../../db/container.ts";
import { loadEnvLocal, requireDatabaseUrl, testDatabaseUrl } from "../../db/env.ts";
import { applyMigrations, ensureDatabase } from "../../db/migrate.ts";

/**
 * Bring the test database into existence before any test runs, so that `pnpm test`
 * is the whole command on a fresh clone with Docker running and nothing else.
 *
 * The container comes from `DATABASE_URL` — the same one variable `next dev` reads —
 * and the tests get their own database beside the development one. Setting
 * `TEST_DATABASE_URL` instead means the developer is pointing at a database they
 * manage, so this leaves Docker alone.
 */
export default async function setup(): Promise<void> {
  loadEnvLocal();
  const development = requireDatabaseUrl();
  const test = testDatabaseUrl(development);

  if (!process.env.TEST_DATABASE_URL) await ensureContainer(development);
  await ensureDatabase(test);
  await applyMigrations(test);
}
