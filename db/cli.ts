import { execFileSync } from "node:child_process";
import { ensureContainer, psqlArgs, removeContainer } from "./container.ts";
import { requireDatabaseUrl } from "./env.ts";
import { applyMigrations, dropDatabase, ensureDatabase } from "./migrate.ts";

// The local loop, as four commands. See the README.

const USAGE = `usage: node db/cli.ts <up|reset|down|psql>

  up      bring the container up and apply every pending migration
  reset   drop the database and apply the whole schema from scratch
  down    delete the container, and its data with it
  psql    a psql shell inside the container
`;

async function main(): Promise<void> {
  const command = process.argv[2];
  const url = requireDatabaseUrl();

  switch (command) {
    case "down":
      await removeContainer(url);
      return;
    case "up": {
      await ensureContainer(url);
      await ensureDatabase(url);
      const applied = await applyMigrations(url);
      process.stdout.write(
        applied.length === 0
          ? "schema already current\n"
          : `${applied.length} migration(s) applied\n`
      );
      return;
    }
    case "reset": {
      await ensureContainer(url);
      await dropDatabase(url);
      await ensureDatabase(url);
      const applied = await applyMigrations(url);
      process.stdout.write(`${applied.length} migration(s) applied\n`);
      return;
    }
    case "psql": {
      await ensureContainer(url);
      execFileSync("docker", psqlArgs(url), { stdio: "inherit" });
      return;
    }
    default:
      process.stderr.write(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause) process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
});
