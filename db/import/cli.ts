// The import, run.
//
//   pnpm import                       against db/import/sheets/
//   pnpm import db/import/fixtures    against the fixtures, which is how it is rehearsed
//   pnpm import --dry-run             read and translate, touch no database
//   pnpm import --prove-rollback      fail a check on purpose, and leave nothing behind
//
// One deliberate act. It is **not** a migration, it is **not** a seed, and it is not run by
// `pnpm db:up` or `pnpm db:reset` — the same posture `bindex`'s ADR-0009 took, for the same
// reason: an import that happened as a side effect of something else would be an import
// nobody decided to run, against a source nobody had checked.
//
// The report it prints is the deliverable as much as the rows are. Every number is traced
// back to the tabs it came from, and everything the sheets said that the model has no room
// for is printed rather than dropped quietly, because the failure mode of an import is not
// a crash — it is a library that looks complete and is not.

import { resolve } from "node:path";
import { requireDatabaseUrl } from "../env.ts";
import type { Finding, Plan } from "./plan.ts";
import { planImport } from "./plan.ts";
import { readSheets, tabsRead } from "./sheets.ts";
import { AlreadyImported, Refused, writeImport } from "./write.ts";

const USAGE = `usage: node db/import/cli.ts [directory] [--dry-run] [--prove-rollback]

  directory          where the exported tabs are (default: db/import/sheets)
  --dry-run          read and translate; write nothing and connect to nothing
  --prove-rollback   add an impossible check, so the rollback can be watched happening

See db/import/README.md for which tab goes in which file.
`;

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function heading(title: string): void {
  out("");
  out(`── ${title} ${"─".repeat(Math.max(0, 76 - title.length))}`);
}

function say(finding: Finding): void {
  const at = finding.line === null ? finding.where : `${finding.where} row ${finding.line}`;
  out(`  - ${at}: ${finding.said}`);
}

function reportSource(
  tabs: readonly { name: string; rows: readonly unknown[]; errorCells: number }[]
): void {
  heading("the tabs");
  for (const tab of tabs) {
    const broken =
      tab.errorCells === 0 ? "" : `, ${tab.errorCells} cell(s) holding a spreadsheet error`;
    out(`  ${tab.name.padEnd(24)} ${String(tab.rows.length).padStart(4)} row(s)${broken}`);
  }
  out("");
  out("  Dashboard (both sheets)     read by nothing on purpose: those tiles are derived,");
  out("                              three of them say #ERROR!, and a derivation is a query");
  out("                              here rather than a stored column.");
}

function reportTranslation(plan: Plan): void {
  heading("the three confusions, split");
  out("  Formato          two columns of one name: a Binding in Collezione, a reading medium");
  out(
    `                   in Biblioteca. ${plan.volumes.length} Volume(s) took a Binding; ` +
      `${plan.readings.filter((r) => r.volumeKey === null).length} Reading(s) took a medium.`
  );
  out("  Serie / Universo taken apart into a Series, a universe and a Path:");
  out(
    `                   ${plan.series.length} Series, ${plan.paths.length} Path(s), ` +
      `${plan.universes.size} universe(s) with nowhere to go.`
  );
  // Two facts and neither of them a wish state: the object is in the house — which is
  // every acquisition the wishlist accounts for — and the intention that led there is over.
  const cameHome = plan.acquisitions.length - (plan.counts.get("Collezione") ?? 0);
  const ended = plan.wishes.filter((wish) => wish.closedOn !== null).length;
  out(
    `  Acquistato       ${cameHome} row(s) read as an object in the house plus a Wish that ` +
      `ended. ${ended} Wish(es) have ended in all, and no Wish anywhere has a state column ` +
      "for Acquistato to survive in."
  );

  if (plan.universes.size > 0) {
    heading("the universes, which the model has no word for");
    out("  Carried out of Serie / Universo so that they stop pretending to be a Series, and");
    out("  then dropped: giving the model a universe is a decision, and an import is not");
    out("  where a decision gets taken. Nothing else was lost from those cells.");
    for (const [universe, rows] of [...plan.universes].sort((a, b) => b[1] - a[1])) {
      out(`  - ${universe} (${rows} row(s))`);
    }
  }
}

function reportPlan(plan: Plan): void {
  heading("what the sheets say, in the model's words");
  const lines: readonly [string, number][] = [
    ["Series", plan.series.length],
    ["Paths", plan.paths.length],
    ["Path stops", plan.pathItems.length],
    ["declared constraints", plan.constraints.length],
    ["Stories", plan.stories.length],
    // Said once: a person credited on twenty rows of one Series is one Credit on the one
    // Story those rows collapse into.
    ["Credits", new Set(plan.credits.map((c) => `${c.storyKey}|${c.personKey}|${c.roleId}`)).size],
    ["people credited", plan.persons.length],
    ["Volumes catalogued", plan.volumes.length],
    ["of which in the house", plan.acquisitions.length],
    ["Volumes carrying a Story", plan.volumeStories.length],
    ["Edition notes", plan.editionNotes.length],
    ["Readings", plan.readings.length],
    ["of which through no Volume", plan.readings.filter((r) => r.volumeKey === null).length],
    ["Ratings", plan.ratings.length],
    ["of which coarse", plan.ratings.filter((r) => r.scale === "coarse").length],
    ["Wishes", plan.wishes.length],
    ["of which ended", plan.wishes.filter((w) => w.closedOn !== null).length],
  ];
  for (const [what, count] of lines) out(`  ${what.padEnd(28)} ${String(count).padStart(4)}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }

  const dryRun = argv.includes("--dry-run");
  const proveRollback = argv.includes("--prove-rollback");
  const named = argv.filter((argument) => !argument.startsWith("--"));
  if (named.length > 1) {
    process.stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }
  const directory = resolve(named[0] ?? "db/import/sheets");

  const sheets = readSheets(directory);
  const plan = planImport(sheets);

  out("");
  out(`tsundoku — importing the two sheets from ${directory}`);
  reportSource(tabsRead(sheets));
  reportTranslation(plan);
  reportPlan(plan);

  if (plan.noted.length > 0) {
    heading(`${plan.noted.length} thing(s) the sheets say and the model has no room for`);
    for (const finding of plan.noted) say(finding);
  }

  if (plan.blocking.length > 0) {
    heading(`${plan.blocking.length} thing(s) that stop the import`);
    for (const finding of plan.blocking) say(finding);
    out("");
    out("Nothing was written. These are not for an import to decide: a value the model has");
    out("no word for, a score off its own scale or two rows judging one Story differently is");
    out("the sheet's to fix, or the mapping in db/import/vocabulary.ts to widen deliberately.");
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    heading("--dry-run");
    out("  Read and translated. No database was opened and nothing was written.");
    return;
  }

  const url = requireDatabaseUrl();
  const outcome = await writeImport(url, plan, { proveRollback });

  heading(`${outcome.checks.length} counts, asserted against the tabs before committing`);
  for (const check of outcome.checks) {
    const mark = check.found === check.expectation.expected ? "ok  " : "FAIL";
    out(
      `  ${mark} ${check.expectation.what.padEnd(52)} ${String(check.found).padStart(4)} ` +
        `(expected ${check.expectation.expected})`
    );
    out(`       from ${check.expectation.from}`);
  }

  if (!outcome.committed) {
    heading("rolled back");
    out("  The import checked its own work, disagreed with the tabs, and left nothing:");
    for (const check of outcome.mismatches) {
      out(
        `  - ${check.expectation.what}: the database says ${check.found}, the tabs say ` +
          `${check.expectation.expected} — ${check.expectation.from}`
      );
    }
    out("");
    out("  The rows below existed inside the transaction and do not exist now.");
    for (const [table, count] of outcome.written) out(`    ${table.padEnd(14)} ${count}`);
    process.exitCode = 1;
    return;
  }

  heading("committed");
  for (const [table, count] of outcome.written) out(`  ${table.padEnd(14)} ${count}`);
  out("");
  out("  One act, done. Run it again and it will refuse: `pnpm db:reset` first.");
}

main().catch((error: unknown) => {
  out("");
  if (error instanceof AlreadyImported || error instanceof Refused) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause) process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  }
  process.stderr.write("\nNothing was committed.\n");
  process.exitCode = 1;
});
