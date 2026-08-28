import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Where the one variable comes from.
//
// `DATABASE_URL` is the single knob for the local loop: it carries the host, the
// port, the credentials and the database name, so a sibling checkout moves to
// another port by setting it and nothing else. `next dev` reads `.env.local` on
// its own; the scripts and the test run read it through here so all three agree.

const ENV_FILE = fileURLToPath(new URL("../.env.local", import.meta.url));

let loaded = false;

/** Load `.env.local` if it exists. A variable already set in the shell wins. */
export function loadEnvLocal(): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(ENV_FILE)) return;

  const fromShell = { ...process.env };
  process.loadEnvFile(ENV_FILE);
  // The shell overrules the file on purpose: `DATABASE_URL=… pnpm test` is how a
  // parallel checkout points at its own port, and a committed default must never
  // win over it.
  for (const [key, value] of Object.entries(fromShell)) {
    if (value !== undefined) process.env[key] = value;
  }
}

/** The development database's URL, or a message saying how to get one. */
export function requireDatabaseUrl(): string {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (url && url.trim() !== "") return url;

  throw new Error(
    "DATABASE_URL is not set.\n" +
      "  cp .env.example .env.local     # the local default, port 5432\n" +
      "Set it to another port if 5432 is taken; nothing else needs changing."
  );
}

/**
 * The database the test run uses: `TEST_DATABASE_URL` if set, otherwise the
 * development database's name with `_test` appended.
 *
 * A separate database rather than a separate container, so that one `DATABASE_URL`
 * still describes the whole local loop, and so that a verb test truncating a table
 * cannot take the shelf you were just looking at in the browser with it.
 */
export function testDatabaseUrl(developmentUrl: string): string {
  const override = process.env.TEST_DATABASE_URL;
  if (override && override.trim() !== "") return override;
  return withDatabase(developmentUrl, `${connection(developmentUrl).database}_test`);
}

export type Connection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

/** Pull the parts a `docker run` needs out of the URL. */
export function connection(url: string): Connection {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`DATABASE_URL is not a URL: ${url}`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`DATABASE_URL must be a postgres:// URL, not ${parsed.protocol}//`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database === "") throw new Error(`DATABASE_URL names no database: ${url}`);

  return {
    host: parsed.hostname || "127.0.0.1",
    port: Number(parsed.port || "5432"),
    user: decodeURIComponent(parsed.username) || "postgres",
    password: decodeURIComponent(parsed.password) || "postgres",
    database,
  };
}

/** The same server, a different database — used for `create`/`drop database`. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(database)}`;
  return parsed.toString();
}
