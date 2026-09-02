import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../../src/core/db.ts";
import { listPaths } from "../../src/core/queries/path.ts";
import { definePath, placeStoriesOnPath } from "../../src/core/verbs/path.ts";
import { setRating } from "../../src/core/verbs/rating.ts";
import { recordReading } from "../../src/core/verbs/reading.ts";
import { declareSeries, placeVolumeInSeries } from "../../src/core/verbs/series.ts";
import { createStory, createStoryCarriedBy } from "../../src/core/verbs/story.ts";
import { convertTheRuns, planTheConversion, Refused, THE_FIVE_RUNS } from "./runs.ts";

// Seam 1, and the one place a `db/` script is tested at it: this composes core verbs and core
// queries and holds no SQL of its own, so what is asserted is the same thing every other test
// in this repository asserts — what the database holds afterwards, and the prose of a refusal.
//
// The library is built here the way the owner built theirs: five lines of numbered tankōbon,
// each object standing for a narrative of its own, plus two real routes and the hand-made one.
// It is the *shape* of the live library rather than its size — five and eighteen numbered
// Stories collapse by the same statement — and the numbers this rehearses against are in
// `README.md`.
beforeEach(async () => {
  await query("truncate table series, volume, story, path, person cascade");
});

/** How many volumes each of the five lines gets here. Slam Dunk is the one with a route. */
const VOLUMES: Record<string, number> = {
  "One-Punch Man": 3,
  "Slam Dunk": 4,
  "La via del grembiule": 2,
  "Fullmetal Alchemist": 2,
  "Death Note": 2,
};

/** One line of numbered tankōbon, each carrying a narrative of its own. */
async function aRun(name: string, volumes: number): Promise<{ id: string; narratives: string[] }> {
  const id = await declareSeries({
    name,
    publisher: "Planet Manga",
    publishedCount: volumes,
    status: "concluded",
  });

  const narratives: string[] = [];
  for (let number = 1; number <= volumes; number += 1) {
    const volume = await volumeInTheHouse({
      title: `${name} ${number}`,
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    narratives.push(
      await createStoryCarriedBy({ title: `${name} ${number}`, typeId: "manga" }, volume)
    );
    await placeVolumeInSeries({ volumeId: volume, seriesId: id, number });
  }

  return { id, narratives };
}

/** The library as the owner keeps it today: five runs, two routes, and the workaround. */
async function theLibraryAsItStands() {
  const runs = new Map<string, { id: string; narratives: string[] }>();
  for (const name of THE_FIVE_RUNS) runs.set(name, await aRun(name, VOLUMES[name]));

  const marvel = await definePath({ name: "Marvel", intent: "Recuperare i personaggi Marvel" });
  await placeStoriesOnPath(marvel, [await createStory({ title: "Civil War", typeId: "comic" })]);
  const dc = await definePath({ name: "DC" });
  await placeStoriesOnPath(dc, [await createStory({ title: "Batman: Anno Uno", typeId: "comic" })]);

  // The route that was never one: four of Slam Dunk's volumes, copied in by hand.
  const handMade = await definePath({ name: "Slam Dunk" });
  const slamDunk = runs.get("Slam Dunk");
  if (!slamDunk) throw new Error("Slam Dunk was not built");
  await placeStoriesOnPath(handMade, slamDunk.narratives);

  return { runs, marvel, dc, handMade };
}

/** How many Stories the library holds. */
async function stories(): Promise<number> {
  const [row] = await query<{ count: string }>("select count(*) from story");
  return Number(row.count);
}

/** Every row of a table, as JSON, so *untouched* can be asserted rather than argued. */
async function snapshotOf(table: "volume" | "acquisition" | "series") {
  return query<{ row: unknown }>(`select to_jsonb(t) as row from ${table} t order by t.id`);
}

describe("converting the five runs", () => {
  it("makes one work of each line, and the numbered narratives are gone", async () => {
    const { runs } = await theLibraryAsItStands();
    const numbered = [...runs.values()].reduce((all, run) => all + run.narratives.length, 0);
    // Thirteen numbered Stories plus the two the routes stand on: the same shape as the
    // library's fifty-one out of eighty-three.
    expect(await stories()).toBe(numbered + 2);

    const converted = await convertTheRuns();

    expect(converted.works.map((work) => work.line).sort()).toEqual([...THE_FIVE_RUNS].sort());
    expect(await stories()).toBe(5 + 2);
    const titles = await query<{ title: string }>(
      "select st.title from story st join series s on s.story_id = st.id order by st.title"
    );
    expect(titles.map((one) => one.title).sort()).toEqual([...THE_FIVE_RUNS].sort());
  });

  it("strikes the hand-made Slam Dunk Path and leaves Marvel and DC standing", async () => {
    await theLibraryAsItStands();

    const converted = await convertTheRuns();

    expect(converted.pathStruck).toBe("Slam Dunk");
    const paths = await listPaths();
    expect(paths.map((one) => one.name).sort()).toEqual(["DC", "Marvel"]);
    expect(paths.find((one) => one.name === "Marvel")?.stops).toBe(1);
    expect(paths.find((one) => one.name === "DC")?.stops).toBe(1);
  });

  it("leaves every Volume, every Acquisition and every ledger but its arrow exactly as it was", async () => {
    await theLibraryAsItStands();
    const volumes = await snapshotOf("volume");
    const acquisitions = await snapshotOf("acquisition");
    const ledgers = await query<{ row: unknown }>(
      "select to_jsonb(t) - 'story_id' as row from series t order by t.id"
    );

    await convertTheRuns();

    expect(await snapshotOf("volume")).toEqual(volumes);
    expect(await snapshotOf("acquisition")).toEqual(acquisitions);
    expect(
      await query<{ row: unknown }>(
        "select to_jsonb(t) - 'story_id' as row from series t order by t.id"
      )
    ).toEqual(ledgers);
  });

  it("leaves each work with one score to give and its progress countable in Instalments", async () => {
    await theLibraryAsItStands();

    const converted = await convertTheRuns();

    for (const work of converted.works) {
      const [row] = await query<{ instalments: number | null }>(
        "select instalments from story where id = $1",
        [work.storyId]
      );
      expect(row.instalments).toBe(VOLUMES[work.line]);
      // One score, on the work, where there were as many places to put one as there were
      // volumes and no place at all to say what the run was worth.
      await setRating({ storyId: work.storyId, score: 9, provenanceId: "remembered" });
    }

    const [scored] = await query<{ count: string }>("select count(*) from rating");
    expect(scored.count).toBe("5");
  });
});

describe("the guard", () => {
  it("refuses the whole run when a narrative it would collapse has been read", async () => {
    const { runs } = await theLibraryAsItStands();
    const opm = runs.get("One-Punch Man");
    if (!opm) throw new Error("One-Punch Man was not built");
    await recordReading({
      storyId: opm.narratives[1],
      medium: "paper",
      provenanceId: "remembered",
      outcome: "finished",
    });
    const before = await stories();

    await expect(convertTheRuns()).rejects.toBeInstanceOf(Refused);

    const plan = await planTheConversion();
    expect(plan.refusals).toEqual([
      "One-Punch Man 2, on One-Punch Man, has been read once, and collapsing it would move " +
        "that onto a narrative nobody was looking at.",
    ]);
    // Nothing at all: not the four lines that would have been fine either.
    expect(await stories()).toBe(before);
    expect((await listPaths()).map((one) => one.name).sort()).toEqual([
      "DC",
      "Marvel",
      "Slam Dunk",
    ]);
  });

  it("refuses when a narrative it would collapse carries a score", async () => {
    const { runs } = await theLibraryAsItStands();
    const deathNote = runs.get("Death Note");
    if (!deathNote) throw new Error("Death Note was not built");
    await setRating({ storyId: deathNote.narratives[0], score: 8, provenanceId: "remembered" });
    const before = await stories();

    await expect(convertTheRuns()).rejects.toThrow(/carries a score/);
    expect(await stories()).toBe(before);
  });

  it("names every reason it found rather than the first", async () => {
    const { runs } = await theLibraryAsItStands();
    const slam = runs.get("Slam Dunk");
    const grembiule = runs.get("La via del grembiule");
    if (!slam || !grembiule) throw new Error("the runs were not built");
    await setRating({ storyId: slam.narratives[0], score: 9, provenanceId: "remembered" });
    await recordReading({
      storyId: grembiule.narratives[1],
      medium: "paper",
      provenanceId: "remembered",
    });

    const plan = await planTheConversion();

    expect(plan.refusals).toHaveLength(2);
    expect(plan.refusals[0]).toMatch(/Slam Dunk 1, on Slam Dunk, carries a score/);
    expect(plan.refusals[1]).toMatch(
      /La via del grembiule 2, on La via del grembiule, has been read once/
    );
  });

  it("refuses a library that has no such line, and says which", async () => {
    await aRun("Slam Dunk", 2);

    const plan = await planTheConversion();

    expect(plan.refusals).toContain("No Series in this library is called One-Punch Man.");
    await expect(convertTheRuns()).rejects.toBeInstanceOf(Refused);
  });

  it("refuses a name held by two ledgers rather than guessing which run was meant", async () => {
    await theLibraryAsItStands();
    await declareSeries({
      name: "Fullmetal Alchemist",
      publisher: "Planet Manga",
      editionLine: "Ultimate Deluxe Edition",
      publishedCount: 18,
      status: "concluded",
    });

    const plan = await planTheConversion();

    expect(plan.refusals).toEqual([
      "2 Series are called Fullmetal Alchemist — Fullmetal Alchemist, Fullmetal Alchemist " +
        "Ultimate Deluxe Edition — and this cannot tell which run the owner meant.",
    ]);
  });
});

describe("running it twice", () => {
  it("leaves the second run with nothing to do, and says so", async () => {
    await theLibraryAsItStands();
    await convertTheRuns();
    const after = await stories();

    const again = await convertTheRuns();

    expect(again.works).toEqual([]);
    expect(again.alreadyConverted.sort()).toEqual([...THE_FIVE_RUNS].sort());
    expect(again.pathStruck).toBeNull();
    expect(await stories()).toBe(after);
  });
});

describe("the plan, read before anything is written", () => {
  it("says what each line would collapse and what would be carried", async () => {
    await theLibraryAsItStands();

    const plan = await planTheConversion();

    expect(plan.lines.map((line) => [line.name, line.objects, line.narratives])).toEqual([
      ["One-Punch Man", 3, 3],
      ["Slam Dunk", 4, 4],
      ["La via del grembiule", 2, 2],
      ["Fullmetal Alchemist", 2, 2],
      ["Death Note", 2, 2],
    ]);
    expect(plan.lines.every((line) => line.carrying.length === 0)).toBe(true);
    expect(plan.path).toMatchObject({ name: "Slam Dunk", stops: 4 });
    expect(plan.refusals).toEqual([]);
    // A plan is a read: the library is exactly as it was.
    expect(await stories()).toBe(15);
  });
});
