import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type Connection, connection } from "./env.ts";

const run = promisify(execFile);

// The local Postgres.
//
// Production runs Postgres in-cluster under CloudNativePG (ADR-0003); locally it is
// one throwaway container, so that everything up to the first usable version needs
// no cloud account, no secret and no cluster.
//
// The image tracks the version `pantry` runs, because ADR-0003 copies pantry's
// pattern and a local major that differs from the cluster's is a difference you find
// out about at migration time.
const IMAGE = "postgres:18-alpine";

/** The port a default container name carries no suffix for. */
const DEFAULT_PORT = 5432;

/**
 * The container's name: `tsundoku-pg` on the default port, `tsundoku-pg-<port>`
 * anywhere else.
 *
 * The suffix is what makes `DATABASE_URL` **the** one variable. Several checkouts
 * work on this repo at once; if the name were fixed, a second one moving to another
 * port would find the first one's container already running, skip creating its own,
 * and then fail to connect — a confusing way to learn that it needed a second
 * variable it was never told about. Deriving the name from the port it is on means
 * the two never meet.
 */
export function containerName(port: number): string {
  const override = process.env.TSUNDOKU_PG_CONTAINER;
  if (override && override.trim() !== "") return override.trim();
  return port === DEFAULT_PORT ? "tsundoku-pg" : `tsundoku-pg-${port}`;
}

type State = "absent" | "running" | "stopped";

async function state(name: string): Promise<State> {
  try {
    const { stdout } = await run("docker", ["inspect", "-f", "{{.State.Running}}", name]);
    return stdout.trim() === "true" ? "running" : "stopped";
  } catch {
    return "absent";
  }
}

/**
 * Refuse a container that is up but not on the port we are about to connect to.
 * Only reachable when `TSUNDOKU_PG_CONTAINER` pins a name by hand, and without this
 * the failure arrives later as a connection refused with nothing pointing at the
 * cause.
 */
async function requirePublishedPort(name: string, port: number): Promise<void> {
  const { stdout } = await run("docker", [
    "inspect",
    "-f",
    `{{index .NetworkSettings.Ports "5432/tcp" 0 "HostPort"}}`,
    name,
  ]).catch(() => ({ stdout: "" }));

  const published = stdout.trim();
  if (published === "" || published === String(port)) return;

  throw new Error(
    `Container ${name} is already running, but on port ${published}, and ` +
      `DATABASE_URL asks for ${port}.\n` +
      "Either point DATABASE_URL at " +
      `${published}, or remove that container with \`pnpm db:down\` and let this one ` +
      "be created."
  );
}

async function requireDocker(): Promise<void> {
  try {
    await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  } catch {
    throw new Error(
      "Docker is not answering. Start Docker Desktop (or your daemon) and try again."
    );
  }
}

/**
 * Bring the container up and wait until Postgres accepts connections. Idempotent:
 * an existing container is started rather than replaced, so `pnpm db:up` on a
 * database you already have keeps its rows.
 */
export async function ensureContainer(url: string): Promise<void> {
  await requireDocker();
  const where = connection(url);
  const name = containerName(where.port);

  switch (await state(name)) {
    case "running":
      await requirePublishedPort(name, where.port);
      break;
    case "stopped":
      process.stdout.write(`starting container ${name}\n`);
      await start(name, where);
      break;
    case "absent":
      process.stdout.write(`creating container ${name} (${IMAGE}) on port ${where.port}\n`);
      await create(name, where);
      break;
  }

  await waitUntilReady(name, where);
}

async function start(name: string, where: Connection): Promise<void> {
  try {
    await run("docker", ["start", name]);
  } catch (cause) {
    throw portConflict(cause, where) ?? cause;
  }
}

async function create(name: string, where: Connection): Promise<void> {
  try {
    await run("docker", [
      "run",
      "--detach",
      "--name",
      name,
      // Bound to loopback, never 0.0.0.0: this database holds the owner's library
      // and has no business being reachable from the network it is on.
      "--publish",
      `127.0.0.1:${where.port}:5432`,
      "--env",
      `POSTGRES_USER=${where.user}`,
      "--env",
      `POSTGRES_PASSWORD=${where.password}`,
      "--env",
      `POSTGRES_DB=${where.database}`,
      IMAGE,
    ]);
  } catch (cause) {
    // A `docker run` that fails on the port binding still leaves the container
    // behind, stopped. Clear it, so the next attempt creates one on the port the
    // developer has just corrected rather than starting this one again.
    await run("docker", ["rm", "--force", "--volumes", name]).catch(() => {});
    throw portConflict(cause, where) ?? cause;
  }
}

/**
 * Turn docker's port-binding failure into the one instruction that fixes it. The
 * port is the one thing about the local loop that is genuinely per-machine, so this
 * message is the whole answer and deliberately carries no `cause`: docker's own is a
 * screen of pull progress with one useful line in the middle of it.
 */
function portConflict(cause: unknown, where: Connection): Error | undefined {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (!/port is already allocated|address already in use|ports are not available/i.test(message)) {
    return undefined;
  }
  return new Error(
    `Port ${where.port} is already taken — something else is listening there ` +
      "(a Postgres installed on the host, most often).\n" +
      "Point this checkout somewhere else by setting one variable, in .env.local or " +
      "in the shell:\n" +
      `  DATABASE_URL=postgres://${where.user}:${where.password}` +
      `@127.0.0.1:${where.port + 1}/${where.database}\n` +
      "Then `pnpm db:up` again. That is the whole change: the container is named after " +
      "the port it is on, so it will not collide with one another checkout is running."
  );
}

async function waitUntilReady(name: string, where: Connection): Promise<void> {
  const deadline = Date.now() + 60_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      await run("docker", ["exec", name, "pg_isready", "-U", where.user, "-q"]);
      return;
    } catch (cause) {
      last = cause instanceof Error ? cause.message : String(cause);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Postgres in ${name} did not become ready within 60s.\n${last}`);
}

/** Stop and delete the container, and the data in it with it. */
export async function removeContainer(url: string): Promise<void> {
  await requireDocker();
  const name = containerName(connection(url).port);
  if ((await state(name)) === "absent") {
    process.stdout.write(`container ${name} is not there\n`);
    return;
  }
  await run("docker", ["rm", "--force", "--volumes", name]);
  process.stdout.write(`removed container ${name}\n`);
}

/** `psql` inside the container, so nothing has to be installed on the host. */
export function psqlArgs(url: string): string[] {
  const where = connection(url);
  return ["exec", "-it", containerName(where.port), "psql", "-U", where.user, "-d", where.database];
}
