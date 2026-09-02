// The conversion, run.
//
//   pnpm convert:runs --dry-run    read the library, write nothing, print the plan
//   pnpm convert:runs              convert the five runs and strike the hand-made Path
//
// One deliberate act, like `db/import/`: it is **not** a migration, not a seed, and no part of
// `pnpm db:up` or `pnpm db:reset`. `db/convert/runs.ts` says why at length. It writes through
// whatever `DATABASE_URL` names, so the rehearsal and the real thing are one command pointed
// at two databases — and the real one is the live library, which is reached the way the
// README's deployment section says and never from a laptop by accident.
//
// The report is the deliverable as much as the rows are: every line prints what it collapsed
// and into what, so the owner can read afterwards what they pressed.

import { registerHooks } from "node:module";
import { connection, requireDatabaseUrl } from "../env.ts";

const USAGE = `usage: node db/convert/cli.ts [--dry-run]

  --dry-run   read the library and print the plan; write nothing

See db/convert/README.md.
`;

// `src/core` is `server-only`, which Next resolves through its own bundler and vitest through
// the stub named in `vitest.config.ts`. Node resolves it through neither, and there is no such
// package installed — so this is the third resolver saying the same thing, pointed at the same
// stub. It has to be registered before the core module is loaded, which is why everything
// below reaches `runs.ts` by a dynamic import rather than by a hoisted one at the top.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") {
      return {
        url: new URL("../../src/test/server-only-stub.ts", import.meta.url).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function heading(title: string): void {
  out();
  out(`── ${title} ${"─".repeat(Math.max(0, 76 - title.length))}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  if (args.some((one) => one !== "--dry-run")) {
    process.stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }

  // Read before the core module is: the pool takes `DATABASE_URL` off the environment when it
  // is first touched, and `.env.local` is where the local loop keeps it.
  const url = requireDatabaseUrl();
  const { convertTheRuns, nameOf, planTheConversion } = await import("./runs.ts");

  const { host, port, database } = connection(url);
  out(`converting against ${database} at ${host}:${port}`);

  const plan = await planTheConversion();

  heading("the five runs");
  for (const line of plan.lines) {
    const already = line.already ? `  already one work: ${line.already.title}` : "";
    out(
      `  ${nameOf(line).padEnd(32)} ${String(line.objects).padStart(3)} object(s), ` +
        `${String(line.narratives).padStart(3)} narrative(s)${already}`
    );
  }

  heading("the hand-made Path");
  out(
    plan.path
      ? `  ${plan.path.name} — ${plan.path.stops} stop(s), struck by this conversion`
      : "  none: no Path is called Slam Dunk, so there is nothing to strike"
  );

  if (plan.refusals.length > 0) {
    heading("refused, and nothing was converted");
    for (const reason of plan.refusals) out(`  - ${reason}`);
    // Said only where something would actually have been carried: on a library that simply has
    // no line of that name, this sentence would be an explanation of the wrong refusal.
    if (plan.lines.some((line) => line.carrying.length > 0)) {
      out();
      out("  A narrative that has been read or judged is not one this may collapse unwatched.");
    }
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    heading("dry run");
    out("  Nothing was written. Run it again without --dry-run to convert.");
    return;
  }

  // The plan that was just printed, handed on: what the owner read is what is pressed.
  const converted = await convertTheRuns(plan);

  heading("converted");
  for (const work of converted.works) out(`  ${work.line.padEnd(32)} ${work.storyId}`);
  for (const line of converted.alreadyConverted) out(`  ${line.padEnd(32)} was already one work`);
  out();
  out(
    converted.pathStruck === null
      ? "  No Path was struck."
      : `  The ${converted.pathStruck} Path was struck; every other route is untouched.`
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause) process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  })
  // The pool holds the event loop open, and this is a command rather than a server.
  .finally(async () => {
    const { closePool } = await import("../../src/core/db.ts");
    await closePool();
  });
