// The books half, imported.
//
//   pnpm import:books                              db/import/sheets/biblioteca-biblioteca.csv
//   pnpm import:books db/import/books/fixtures/biblioteca.csv   the rehearsal
//   pnpm import:books --dry-run                    read and translate, touch no database
//   pnpm import:books --prove-rollback             fail a check on purpose, and leave nothing
//
// One deliberate act, and not a migration or a seed: nothing runs it for you, not
// `pnpm db:up`, not `pnpm db:reset`, not the test run. That is the posture the parent
// import took and the reason it gave — an import that happens as a side effect of
// something else is an import nobody decided to run, against a source nobody checked.
//
// **It writes into a library that is already there**, which is what makes the report below
// the deliverable as much as the rows are. It prints what the library held before, what it
// holds after, and every row the sheet described that this import did not write — because
// the failure mode of an import is not a crash, it is a library that looks complete and
// is not.

import { resolve } from "node:path";
import { requireDatabaseUrl } from "../../env.ts";
import type { Finding, Plan } from "./plan.ts";
import { planBooks, Unreadable } from "./plan.ts";
import { AlreadyThere, Refused, writeBooks } from "./write.ts";

const DEFAULT = "db/import/sheets/biblioteca-biblioteca.csv";

const USAGE = `usage: node db/import/books/cli.ts [file] [--dry-run] [--prove-rollback]

  file               the exported Biblioteca tab (default: ${DEFAULT})
  --dry-run          read and translate; write nothing and connect to nothing
  --prove-rollback   add an impossible check, so the rollback can be watched happening

See db/import/books/README.md for the columns the tab has to have.
`;

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function heading(title: string): void {
  out("");
  out(`── ${title} ${"─".repeat(Math.max(0, 76 - title.length))}`);
}

function say(finding: Finding): void {
  out(`  - row ${finding.line}: ${finding.said}`);
}

function reportPlan(plan: Plan): void {
  const counted = plan.counted;
  heading(`what ${counted.rows} rows of ${plan.tab} say`);
  out(
    `  ${String(plan.stories.length).padStart(3)} Story(ies)      one per row, whatever else the row said`
  );
  out(
    `  ${String(plan.volumes.length).padStart(3)} Volume(s)     ` +
      `of ${counted.owned} row(s) saying Posseduto` +
      (counted.undescribable === 0
        ? ""
        : ` — ${counted.undescribable} said no publisher or no binding and got none`)
  );
  out(
    `  ${String(plan.volumes.length).padStart(3)} acquisition(s) open, with no day and no price: the sheet says neither`
  );
  out(
    `  ${String(plan.passes.length).padStart(3)} Pass(es)      ` +
      `${counted.readThroughOwn} through an object the house holds, ` +
      `${plan.passes.length - counted.readThroughOwn} through none`
  );
  out(
    `  ${String(plan.ratings.length).padStart(3)} Rating(s)     out of 5, doubled onto the owner's scale, grain recorded as coarse`
  );
  out(
    `  ${String(plan.credits.length).padStart(3)} Credit(s)     ` +
      `${plan.people.length} person(s) named, as writers`
  );
  out("");
  out("  No Rating carries prose. Every Note cell on this tab is provenance chatter — where");
  out("  the row came from, or that a reading stopped — and not one of them is a judgement of");
  out("  a book, so none is put in the owner's mouth.");

  if (plan.dropped.size > 0) {
    heading(`${plan.dropped.size} column(s) the tab has and the model has nowhere to put`);
    for (const [column, held] of plan.dropped) {
      out(
        `  ${column.padEnd(20)} ${held} cell(s), dropped — giving one a home is a decision, and not this act's`
      );
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    out(USAGE);
    return;
  }
  const dryRun = args.includes("--dry-run");
  const proveRollback = args.includes("--prove-rollback");
  const named = args.find((arg) => !arg.startsWith("--"));
  const file = resolve(named ?? DEFAULT);

  out("");
  out(`tsundoku — importing the books half from ${file}`);

  const plan = planBooks(file);
  reportPlan(plan);

  if (plan.findings.length > 0) {
    heading(`${plan.findings.length} row(s) read and not written whole`);
    for (const finding of plan.findings) say(finding);
  }

  if (dryRun) {
    heading("--dry-run");
    out("  Read and translated. No database was opened and nothing was written.");
    return;
  }

  const url = requireDatabaseUrl();
  const outcome = await writeBooks(url, plan, { proveRollback });

  heading("what the library held before this ran");
  for (const [what, held] of Object.entries(outcome.before)) out(`  ${what.padEnd(28)} ${held}`);

  heading(`${outcome.checks.length} counts, asserted before committing`);
  for (const check of outcome.checks) {
    const mark = check.found === check.expectation.expected ? "ok  " : "FAIL";
    out(
      `  ${mark} ${check.expectation.what.slice(0, 60).padEnd(60)} ${String(check.found).padStart(4)} ` +
        `(expected ${check.expectation.expected})`
    );
    out(`       from ${check.expectation.from}`);
  }

  if (!outcome.committed) {
    heading("rolled back");
    out("  The import checked its own work, disagreed with the sheet, and left the library");
    out("  exactly as it found it:");
    for (const check of outcome.mismatches) {
      out(
        `  - ${check.expectation.what}: the database says ${check.found}, the sheet says ` +
          `${check.expectation.expected} — ${check.expectation.from}`
      );
    }
    process.exitCode = 1;
    return;
  }

  heading("committed");
  out("  One act, done. Run it again and it will refuse: a title is the key, and every one");
  out("  of these titles is now in the library.");
}

main().catch((error: unknown) => {
  out("");
  if (error instanceof Unreadable) {
    process.stderr.write(`${error.message}\n\n`);
    process.stderr.write(
      "A row this import cannot read is the sheet's to fix, or the mapping in\n" +
        "db/import/vocabulary.ts to widen deliberately. It is not an import's to guess at:\n" +
        "a word let through as itself is how a spreadsheet's vocabulary becomes the schema.\n"
    );
  } else if (error instanceof AlreadyThere || error instanceof Refused) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause) process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  }
  process.stderr.write("\nNothing was committed.\n");
  process.exitCode = 1;
});
