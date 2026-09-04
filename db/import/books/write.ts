// One transaction, into a library that is already there, which checks its own work before
// it is allowed to commit.
//
// Everything below happens on a single `pg` client between one `begin` and one `commit`,
// and the counts are asserted **before** the commit rather than after it. So this import
// either lands whole or leaves the library exactly as it found it — which matters more
// here than it did for the parent import: there, a wrong run left a database that still
// looked like a fresh one, and the answer was `pnpm db:reset`. Here the database holds
// ninety-nine Volumes the owner has been using, and `reset` is not an answer at all.
//
// It writes SQL rather than calling the verbs, for the parent import's reason: the verbs
// are TypeScript over a pool and **one verb is one transaction** by design, so an import
// made of verb calls would be two hundred transactions and could not roll back. The
// invariants are not lost by going around them, because they live in Postgres — the score
// in half points, one open acquisition per Volume, a digital Reading through no Volume, a
// person named once. The one rule that lives in TypeScript and matters here is
// `creditStory`'s select-or-insert of a person, and that is honoured by construction below
// and then asserted as a count.
//
// ## Running it twice
//
// It refuses a run whose **titles are already in the library**, and that is the only guard
// it needs. A row of this tab is a title, and a title is the one key the sheet has: unlike
// the parent import's receipts and volume numbers, `Harry Potter e il calice di fuoco` is
// either there or it is not. So a second run stops with the titles listed, and a run of a
// sheet the owner has *added ten rows to* is refused for the same reason — which is the
// honest answer, because the ten new rows are a fifty-fifth to sixty-fourth Story and
// nothing here can tell them from the fifty-four already imported.

import { Client } from "pg";
import { BEFORE, type Before, type Expectation, expectationsFor } from "./expectations.ts";
import type { Plan } from "./plan.ts";

/** One expectation, and what the database actually answered. */
export type Checked = {
  readonly expectation: Expectation;
  readonly found: number;
};

export type Outcome = {
  readonly committed: boolean;
  readonly before: Before;
  readonly checks: readonly Checked[];
  readonly mismatches: readonly Checked[];
};

/** The library already holds titles this import would write again. */
export class AlreadyThere extends Error {
  readonly titles: readonly string[];

  constructor(titles: readonly string[]) {
    super(
      `The library already holds ${titles.length} of these titles: ${titles.slice(0, 8).join(", ")}` +
        `${titles.length > 8 ? ", …" : ""}.\n` +
        "  This import is one deliberate act and a title is the only key the sheet has, so a\n" +
        "  second run would leave two of everything with nothing to tell them apart. If the\n" +
        "  sheet has grown rows since, import them by hand or through the Inbox — a Story is\n" +
        "  a permanent fact and creating one is worth the click."
    );
    this.name = "AlreadyThere";
    this.titles = titles;
  }
}

/** A statement the database refused, said with the plan row that caused it. */
export class Refused extends Error {
  readonly where: string;

  constructor(where: string, cause: unknown) {
    const said = cause instanceof Error ? cause.message : String(cause);
    super(`${where}: the database refused this row — ${said}`);
    this.name = "Refused";
    this.where = where;
  }
}

export type WriteOptions = {
  /**
   * Add an expectation that cannot hold, so the rollback can be watched happening.
   *
   * A flag rather than a test, because the criterion is that a failed check leaves the
   * library untouched and the only way to see that is to fail one on a real run against a
   * real database and then go and look.
   */
  readonly proveRollback?: boolean;
};

const IMPOSSIBLE: Expectation = {
  what: "a deliberately impossible expectation",
  sql: "select count(*) from volume",
  expected: -1,
  from: "--prove-rollback, which exists so the rollback can be watched happening",
};

/** Write the plan, check it, and commit only if it checks out. */
export async function writeBooks(
  url: string,
  plan: Plan,
  options: WriteOptions = {}
): Promise<Outcome> {
  const client = new Client({ connectionString: url });
  await client.connect();

  const count = async (sql: string): Promise<number> => {
    const { rows } = await client.query<Record<string, string>>(sql);
    return Number(Object.values(rows[0])[0]);
  };

  const run = async (where: string, sql: string, values: readonly unknown[]): Promise<string> => {
    try {
      const { rows } = await client.query<{ id?: string }>(sql, values as unknown[]);
      return rows[0]?.id ?? "";
    } catch (cause) {
      throw new Refused(where, cause);
    }
  };

  try {
    await client.query("begin");

    // Before anything: has this sheet been imported already?
    const titles = plan.stories.map((story) => story.title);
    const { rows: clashes } = await client.query<{ title: string }>(
      "select title from story where lower(title) = any($1::text[])",
      [titles.map((title) => title.toLowerCase())]
    );
    if (clashes.length > 0) throw new AlreadyThere(clashes.map((clash) => clash.title));

    const before = {} as Record<keyof Before, number>;
    for (const [what, sql] of Object.entries(BEFORE)) {
      before[what as keyof Before] = await count(sql);
    }

    const storyIds = new Map<string, string>();
    for (const story of plan.stories) {
      storyIds.set(
        story.key,
        await run(story.key, "insert into story (title, type_id) values ($1, $2) returning id", [
          story.title,
          story.typeId,
        ])
      );
    }

    const volumeIds = new Map<string, string>();
    for (const volume of plan.volumes) {
      volumeIds.set(
        volume.key,
        await run(
          volume.key,
          `insert into volume (title, publisher, edition_line, binding_id, language, isbn)
           values ($1, $2, $3, $4, $5, $6) returning id`,
          [
            volume.title,
            volume.publisher,
            volume.editionLine,
            volume.bindingId,
            volume.language,
            volume.isbn,
          ]
        )
      );

      // The two acts ADR-0007 keeps apart, in the order it keeps them: the object is
      // catalogued, and then it is put in the house. **No day and no price**, because the
      // sheet says neither — these are books owned since before any of this was written
      // down, which is exactly the acquisition `CONTEXT.md` describes as ordinary.
      await run(
        `${volume.key} in the house`,
        "insert into acquisition (volume_id, acquired_on, price_paid) values ($1, null, null)",
        [volumeIds.get(volume.key)]
      );

      await run(
        `${volume.key} carries ${volume.storyKey}`,
        "insert into volume_story (volume_id, story_id) values ($1, $2)",
        [volumeIds.get(volume.key), storyIds.get(volume.storyKey)]
      );
    }

    for (const reading of plan.readings) {
      await run(
        reading.key,
        `insert into reading (story_id, medium, outcome, started_on, ended_on, provenance_id, volume_id)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          storyIds.get(reading.storyKey),
          reading.medium,
          reading.outcome,
          reading.startedOn,
          reading.endedOn,
          reading.provenanceId,
          reading.volumeKey === null ? null : volumeIds.get(reading.volumeKey),
        ]
      );
    }

    // The Rating names the Story and no Reading, which is the parent import's choice and
    // holds for the same reason: `Voto` sits on a row, and a row is an object or a line of
    // history — neither says *which act of reading* was being judged. Both of ADR-0008's
    // axes are still stated, the Provenance for where it came from and the scale for the
    // grain it was given in.
    for (const rating of plan.ratings) {
      await run(
        `rating of ${rating.storyKey}`,
        `insert into rating (story_id, reading_id, score, prose, provenance_id, scale)
         values ($1, null, $2, null, $3, $4)`,
        [storyIds.get(rating.storyKey), rating.score, rating.provenanceId, rating.scale]
      );
    }

    // Select-or-insert, in `creditStory`'s own words: a name already known **in any
    // capitalisation** is that person rather than a second row. The comics half already
    // knows thirty-three people and there is no merge verb, so a second spelling would be a
    // second person for ever.
    const personIds = new Map<string, string>();
    for (const name of plan.people) {
      personIds.set(
        name.toLowerCase(),
        await run(
          `person ${name}`,
          `with known as (select id from person where lower(name) = lower(btrim($1))),
                minted as (
                  insert into person (name) select btrim($1)
                  where not exists (select 1 from known) returning id
                )
           select id from known union all select id from minted`,
          [name]
        )
      );
    }

    for (const credit of plan.credits) {
      await run(
        `${credit.name} wrote ${credit.storyKey}`,
        "insert into credit (story_id, person_id, role_id) values ($1, $2, $3)",
        [storyIds.get(credit.storyKey), personIds.get(credit.name.toLowerCase()), credit.roleId]
      );
    }

    // ── the library, asserted before the transaction is allowed to commit ──
    const expectations = expectationsFor(
      plan.counted,
      before as Before,
      plan.people.map((name) => name.toLowerCase())
    );
    const all = options.proveRollback ? [...expectations, IMPOSSIBLE] : expectations;

    const checks: Checked[] = [];
    for (const expectation of all) {
      checks.push({ expectation, found: await count(expectation.sql) });
    }
    const mismatches = checks.filter((check) => check.found !== check.expectation.expected);

    if (mismatches.length > 0) {
      await client.query("rollback");
      return { committed: false, before: before as Before, checks, mismatches };
    }

    await client.query("commit");
    return { committed: true, before: before as Before, checks, mismatches };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
