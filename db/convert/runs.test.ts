import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../../src/core/db.ts";
import { listPaths } from "../../src/core/queries/path.ts";
import { recordPass } from "../../src/core/verbs/pass.ts";
import { definePath, placeStoriesOnPath } from "../../src/core/verbs/path.ts";
import { setRating } from "../../src/core/verbs/rating.ts";
import { declareSeries, placeVolumeInSeries } from "../../src/core/verbs/series.ts";
import { createStory, createStoryCarriedBy } from "../../src/core/verbs/story.ts";
import { recordVolumeCarriesStory } from "../../src/core/verbs/story-to-volume.ts";
import {
  convertTheRuns,
  planTheConversion,
  Refused,
  StoppedPartway,
  THE_FIVE_RUNS,
} from "./runs.ts";

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
  it("refuses the whole conversion when a narrative it would collapse has been read", async () => {
    const { runs } = await theLibraryAsItStands();
    const opm = runs.get("One-Punch Man");
    if (!opm) throw new Error("One-Punch Man was not built");
    await recordPass({
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
    await recordPass({
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
  it("leaves the second press with nothing to do, and says so", async () => {
    await theLibraryAsItStands();
    await convertTheRuns();
    const after = await stories();

    const again = await convertTheRuns();

    expect(again.works).toEqual([]);
    expect(again.alreadyConverted.sort()).toEqual([...THE_FIVE_RUNS].sort());
    expect(again.pathStruck).toBeNull();
    expect(await stories()).toBe(after);
  });

  // The acceptance criterion this conversion exists for is *one score to give*, so the owner
  // giving one is the likeliest thing to happen next — and the guard reading a converted line
  // would then refuse everything, over a Rating that is on the work rather than lost to it.
  it("is unbothered by a score given to a work it already made", async () => {
    await theLibraryAsItStands();
    const converted = await convertTheRuns();
    for (const work of converted.works) {
      await setRating({ storyId: work.storyId, score: 9, provenanceId: "remembered" });
    }

    const plan = await planTheConversion();

    expect(plan.refusals).toEqual([]);
    expect((await convertTheRuns()).alreadyConverted).toHaveLength(5);
  });

  it("stops and names what it converted when a merge refuses for its own reasons", async () => {
    const { runs } = await theLibraryAsItStands();
    const deathNote = runs.get("Death Note");
    if (!deathNote) throw new Error("Death Note was not built");
    // An omnibus outside the line carries one of Death Note's narratives, so that narrative
    // runs past the line and `mergeSeriesIntoOneStory` refuses to collapse it — a refusal the
    // guard does not foresee, reached after the four lines before it have landed.
    const omnibus = await volumeInTheHouse({
      title: "Death Note All-in-One",
      publisher: "Planet Manga",
      binding: "deluxe",
      language: "it",
    });
    await recordVolumeCarriesStory(omnibus, deathNote.narratives[0]);

    const stopped = await convertTheRuns().then(
      () => null,
      (error: unknown) => error
    );

    expect(stopped).toBeInstanceOf(StoppedPartway);
    expect((stopped as StoppedPartway).message).toMatch(/Death Note 1 stays/);
    expect((stopped as StoppedPartway).converted.map((one) => one.line)).toEqual([
      "One-Punch Man",
      "Slam Dunk",
      "La via del grembiule",
      "Fullmetal Alchemist",
    ]);
    // And the four that landed are left as they are: running it again finishes the rest.
    const plan = await planTheConversion();
    expect(plan.lines.filter((line) => line.already)).toHaveLength(4);
  });
});

// The mismatches are the signature of rows kept by hand: One-Punch Man is 22 objects and 21
// narratives, Slam Dunk 20 and 18. The last object of such a line carries the narrative before
// it rather than one of its own, and it must come out of the conversion carrying the work like
// every other object of the line.
describe("a line whose rows have drifted", () => {
  it("collapses fewer narratives than objects, and every object carries the work", async () => {
    const runs = new Map<string, { id: string; narratives: string[] }>();
    for (const name of THE_FIVE_RUNS) runs.set(name, await aRun(name, VOLUMES[name]));
    const opm = runs.get("One-Punch Man");
    if (!opm) throw new Error("One-Punch Man was not built");
    // A fourth object of the line, standing for the narrative the third already stood for.
    const fourth = await volumeInTheHouse({
      title: "One-Punch Man 4",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(fourth, opm.narratives[2]);
    await placeVolumeInSeries({ volumeId: fourth, seriesId: opm.id, number: 4 });

    const plan = await planTheConversion();
    expect(plan.lines[0]).toMatchObject({ name: "One-Punch Man", objects: 4, narratives: 3 });

    const converted = await convertTheRuns(plan);

    const work = converted.works.find((one) => one.line === "One-Punch Man");
    if (!work) throw new Error("One-Punch Man was not converted");
    const carried = await query<{ story_id: string }>(
      `select distinct vs.story_id
         from volume_story vs join volume v on v.id = vs.volume_id
        where v.series_id = $1`,
      [opm.id]
    );
    expect(carried).toEqual([{ story_id: work.storyId }]);
    // Serialized to the length of the line and not to the number of narratives it had.
    const [row] = await query<{ instalments: number }>(
      "select instalments from story where id = $1",
      [work.storyId]
    );
    expect(row.instalments).toBe(4);
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
