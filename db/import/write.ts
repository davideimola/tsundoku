// One transaction, which checks its own work before it is allowed to commit.
//
// Everything below happens on a single `pg` client between one `begin` and one `commit`,
// and the counts are asserted **before** the commit rather than after it. So the import
// either leaves the whole migration or leaves nothing, and a wrong run leaves a database
// that still looks exactly like a fresh one — which is what makes fixing the mapping and
// running it again cheap enough to actually do.
//
// ## Why this writes SQL and does not call the verbs
//
// `bindex`'s import calls its verbs, because there the verbs are SQL functions and calling
// one inside a transaction is a `select`. Here the verbs are TypeScript over a pool
// (`src/core/verbs/`), and **one verb is one transaction** by design — so an import made of
// verb calls would be two hundred transactions and could not roll back. The acceptance
// criterion that the whole thing lands or nothing does is not negotiable, so the import
// writes SQL.
//
// That costs less than it looks like, and the reason is this repo's posture: **invariants
// live in Postgres.** Every rule the verbs lean on refuses these inserts too — the score in
// half points, one open acquisition per Volume, one open Wish per Volume, a digital Pass
// through no Volume, the Series position trigger. What the import does *not* get for free is
// the handful of rules that live in TypeScript above them, and exactly one of those matters
// here: `placeVolumeInSeries` refuses a Volume the house does not hold. This import honours
// that rule by construction — `plan.ts` never gives an unowned Volume a position — and
// asserts it below as a count that must be zero, so the back door is closed by the same
// check that closes the front one.
//
// ## Re-runnable only from scratch
//
// It refuses a database that already holds imported data rather than merging into it. There
// is no key in these sheets to match a second run against: a row is a title and a shop
// receipt, and two runs would leave two of everything with nothing to tell them apart. So
// the second run is `pnpm db:reset` and then this, and the refusal is what makes that the
// only way.

import { Client } from "pg";
import type { Expectation } from "./expectations.ts";
import type { Plan } from "./plan.ts";

/** The tables an import writes, and therefore the tables that say it has already run. */
const WRITTEN_TABLES = [
  "story",
  "volume",
  "series",
  "path",
  "person",
  "pass",
  "rating",
  "wish",
  "acquisition",
] as const;

/** One expectation, and what the database actually answered. */
export type Checked = {
  readonly expectation: Expectation;
  readonly found: number;
};

export type Outcome = {
  readonly committed: boolean;
  readonly checks: readonly Checked[];
  readonly mismatches: readonly Checked[];
  /** Rows written per table, read back inside the transaction. */
  readonly written: ReadonlyMap<string, number>;
};

/** The database already holds a library, so there is nothing here to import into. */
export class AlreadyImported extends Error {
  readonly holding: readonly string[];

  constructor(holding: readonly string[]) {
    super(
      "This database already holds imported data: " +
        `${holding.join(", ")}.\n` +
        "  The import is one deliberate act and is re-runnable only from scratch — there is\n" +
        "  no key in the sheets to match a second run against, so a merge would leave two of\n" +
        "  everything. Start over with `pnpm db:reset`, then run this again."
    );
    this.name = "AlreadyImported";
    this.holding = holding;
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

export type ImportOptions = {
  /**
   * Add an expectation that cannot hold, so the rollback can be watched happening.
   *
   * It is a flag rather than a test because that is the honest instrument: the criterion is
   * that a failed check leaves the database untouched, and the only way to see that is to
   * fail a check on a real run against a real database and then look.
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
export async function writeImport(
  url: string,
  plan: Plan,
  options: ImportOptions = {}
): Promise<Outcome> {
  const client = new Client({ connectionString: url });
  await client.connect();

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

    // Before anything: is this a database to import into at all?
    const holding: string[] = [];
    for (const table of WRITTEN_TABLES) {
      const { rows } = await client.query<{ count: string }>(`select count(*) from ${table}`);
      const count = Number(rows[0].count);
      if (count > 0) holding.push(`${count} in ${table}`);
    }
    if (holding.length > 0) throw new AlreadyImported(holding);

    const seriesIds = new Map<string, string>();
    for (const series of plan.series) {
      seriesIds.set(
        series.key,
        await run(
          series.key,
          `insert into series (name, publisher, edition_line, published_count, status, collecting_since)
           values ($1, $2, $3, $4, $5, $6) returning id`,
          [
            series.name,
            series.publisher,
            series.editionLine,
            series.publishedCount,
            series.status,
            series.collectingSince,
          ]
        )
      );
    }

    const pathIds = new Map<string, string>();
    for (const path of plan.paths) {
      pathIds.set(
        path.key,
        await run(
          path.key,
          "insert into path (name, intent, active) values ($1, $2, $3) returning id",
          [path.name, path.intent, path.active]
        )
      );
    }

    for (const constraint of plan.constraints) {
      await run(
        `constraint on ${constraint.pathKey ?? "the library"}`,
        "insert into declared_constraint (path_id, prose) values ($1, $2)",
        [constraint.pathKey === null ? null : pathIds.get(constraint.pathKey), constraint.prose]
      );
    }

    const personIds = new Map<string, string>();
    for (const person of plan.persons) {
      personIds.set(
        person.key,
        await run(person.key, "insert into person (name) values ($1) returning id", [person.name])
      );
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

    // The plan says a Credit once however many rows said it, so there is nothing to
    // de-duplicate here — and the rows that repeated one are counted and asserted.
    for (const credit of plan.credits) {
      await run(
        `${credit.storyKey}|${credit.personKey}|${credit.roleId}`,
        "insert into credit (story_id, person_id, role_id) values ($1, $2, $3)",
        [storyIds.get(credit.storyKey), personIds.get(credit.personKey), credit.roleId]
      );
    }

    const volumeIds = new Map<string, string>();
    for (const volume of plan.volumes) {
      volumeIds.set(
        volume.key,
        await run(
          volume.key,
          `insert into volume (title, publisher, edition_line, binding_id, language, isbn, series_id, series_number)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
          [
            volume.title,
            volume.publisher,
            volume.editionLine,
            volume.bindingId,
            volume.language,
            volume.isbn,
            volume.seriesKey === null ? null : seriesIds.get(volume.seriesKey),
            volume.seriesNumber,
          ]
        )
      );
    }

    // The second of ADR-0007's two acts, and the one that puts an object in the house. It
    // is also where the Series position trigger fires, so a sheet claiming two objects at
    // one position of one Series is refused here and the whole import rolls back.
    for (const acquisition of plan.acquisitions) {
      await run(
        acquisition.volumeKey,
        "insert into acquisition (volume_id, acquired_on, price_paid) values ($1, $2, $3)",
        [volumeIds.get(acquisition.volumeKey), acquisition.acquiredOn, acquisition.pricePaid]
      );
    }

    for (const carried of plan.volumeStories) {
      await run(
        `${carried.volumeKey} carries ${carried.storyKey}`,
        "insert into volume_story (volume_id, story_id) values ($1, $2)",
        [volumeIds.get(carried.volumeKey), storyIds.get(carried.storyKey)]
      );
    }

    for (const note of plan.editionNotes) {
      await run(
        `edition note on ${note.volumeKey}`,
        "insert into edition_note (volume_id, note) values ($1, $2)",
        [volumeIds.get(note.volumeKey), note.note]
      );
    }

    for (const pass of plan.passes) {
      await run(
        pass.key,
        `insert into pass (story_id, medium, outcome, started_on, ended_on, provenance_id, volume_id)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          storyIds.get(pass.storyKey),
          pass.medium,
          pass.outcome,
          pass.startedOn,
          pass.endedOn,
          pass.provenanceId,
          pass.volumeKey === null ? null : volumeIds.get(pass.volumeKey),
        ]
      );
    }

    // The Rating names the Story and no Pass. The sheets put `Voto` on a row, and a row
    // is an object or a line of history — neither of them says *which pass* was being
    // judged, and a Pass picked to carry it would be a fact nobody wrote down.
    // Both axes are stated: the Provenance says where the judgement came from, the scale
    // says what grain it was given in (ADR-0008).
    for (const rating of plan.ratings) {
      await run(
        `${rating.where} rating of ${rating.storyKey}`,
        `insert into rating (story_id, pass_id, score, prose, provenance_id, scale)
         values ($1, null, $2, $3, $4, $5)`,
        [
          storyIds.get(rating.storyKey),
          rating.score,
          rating.prose,
          rating.provenanceId,
          rating.scale,
        ]
      );
    }

    for (const wish of plan.wishes) {
      await run(
        `wish on ${wish.volumeKey}`,
        // No period: a spreadsheet never said which month, and *someday* is the honest
        // reading of that (ADR-0023).
        `insert into wish (volume_id, target_price, price_found, shop, opened_on, closed_on)
         values ($1, $2, $3, $4, coalesce($5::date, current_date), $5)`,
        [volumeIds.get(wish.volumeKey), wish.targetPrice, wish.priceFound, wish.shop, wish.closedOn]
      );
    }

    for (const stop of plan.pathItems) {
      await run(
        `${stop.pathKey} stop ${stop.position}`,
        "insert into path_item (path_id, story_id, position) values ($1, $2, $3)",
        [pathIds.get(stop.pathKey), storyIds.get(stop.storyKey), stop.position]
      );
    }

    // ── the library, asserted before the transaction is allowed to commit ──
    const expectations = options.proveRollback
      ? [...plan.expectations, IMPOSSIBLE]
      : plan.expectations;

    const checks: Checked[] = [];
    for (const expectation of expectations) {
      const { rows } = await client.query<{ count: string }>(expectation.sql);
      checks.push({ expectation, found: Number(Object.values(rows[0])[0]) });
    }
    const mismatches = checks.filter((check) => check.found !== check.expectation.expected);

    const written = new Map<string, number>();
    for (const table of WRITTEN_TABLES) {
      const { rows } = await client.query<{ count: string }>(`select count(*) from ${table}`);
      written.set(table, Number(rows[0].count));
    }

    if (mismatches.length > 0) {
      await client.query("rollback");
      return { committed: false, checks, mismatches, written };
    }

    await client.query("commit");
    return { committed: true, checks, mismatches, written };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
