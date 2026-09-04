import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { releaseVolume } from "../verbs/collection.ts";
import { recordPass } from "../verbs/pass.ts";
import { setRating } from "../verbs/rating.ts";
import {
  declareSeries,
  declareSeriesCollected,
  placeVolumeInSeries,
  recordSeriesPublishesStory,
  recordVolumesPublished,
} from "../verbs/series.ts";
import { createStory, createStoryCarriedBy } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import {
  findSeries,
  listMissingVolumes,
  listSeries,
  listSeriesPublishingNothing,
  listSeriesPublishingStory,
  listVolumesOutsideASeries,
  whatAMergeWouldCarry,
  whatAMergeWouldCollapse,
} from "./series.ts";

// Seam 1, and the slice's whole point: **the missing Volumes are derived and never
// typed**. The four Death Note Black Edition rows the owner writes by hand in the
// spreadsheet today are `generate_series` against the shelf, so the assertion below is
// four numbers nobody entered.
beforeEach(async () => {
  await query("truncate table series, volume, story cascade");
});

/** Own the numbered Volumes of a Series, as the owner does one purchase at a time. */
async function own(seriesId: string, title: string, numbers: number[]): Promise<string[]> {
  const ids: string[] = [];
  for (const number of numbers) {
    const volume = await volumeInTheHouse({
      title: `${title} ${number}`,
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume, seriesId, number });
    ids.push(volume);
  }
  return ids;
}

/** The Black Edition, collected, with I and II in the house. */
async function deathNoteBlackEdition(): Promise<string> {
  const id = await declareSeries({
    name: "Death Note",
    publisher: "Panini Comics",
    editionLine: "Black Edition",
    publishedCount: 6,
    status: "concluded",
  });
  await own(id, "Death Note Black Edition", [1, 2]);
  await declareSeriesCollected(id);
  return id;
}

describe("what am I missing", () => {
  it("names Death Note Black Edition III to VI without a row being typed", async () => {
    await deathNoteBlackEdition();

    expect(await listMissingVolumes()).toEqual([
      {
        id: expect.any(String),
        name: "Death Note",
        publisher: "Panini Comics",
        editionLine: "Black Edition",
        status: "concluded",
        publishedCount: 6,
        ownedCount: 2,
        collectingSince: expect.any(String),
        missing: [3, 4, 5, 6],
        nextMissing: 3,
        publishes: null,
      },
    ]);
  });

  it("grows the list the day the publisher puts another Volume out", async () => {
    const id = await declareSeries({
      name: "Chainsaw Man",
      publisher: "Planet Manga",
      publishedCount: 2,
      status: "ongoing",
    });
    await own(id, "Chainsaw Man", [1, 2]);
    await declareSeriesCollected(id);

    expect(await listMissingVolumes()).toEqual([]);

    await recordVolumesPublished(id, 4);
    const [series] = await listMissingVolumes();
    expect(series.missing).toEqual([3, 4]);
  });

  it("asks again for a Volume that left the house", async () => {
    const id = await deathNoteBlackEdition();
    const [first] = await query<{ id: string }>(
      "select id from volume where series_id = $1 and series_number = 1",
      [id]
    );
    await releaseVolume(first.id);

    const [series] = await listMissingVolumes();
    expect(series.missing).toEqual([1, 3, 4, 5, 6]);
    expect(series.ownedCount).toBe(1);
  });

  it("says nothing about a Series the owner never decided to collect: the Naruto case", async () => {
    const id = await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });
    await own(id, "Naruto", [1, 2, 3]);

    expect(await listMissingVolumes()).toEqual([]);

    const [naruto] = await listSeries();
    expect(naruto).toMatchObject({
      name: "Naruto",
      ownedCount: 3,
      publishedCount: 72,
      collectingSince: null,
      // Holding some of a Series is not a project, so there is nothing missing from it —
      // not an empty list, which would read as "complete", but no list at all.
      missing: null,
      nextMissing: null,
    });

    await declareSeriesCollected(id);
    const [collected] = await listSeries();
    expect(collected.missing).toHaveLength(69);
    expect(collected.nextMissing).toBe(4);
  });
});

// The Fullmetal Alchemist case, and with it the reason `series` carries no story column:
// one Story runs in two Series with different volume counts, and the two Series know
// nothing of each other. What ties either of them to the narrative is which Stories their
// Volumes carry — the Story ↔ Volume join, which belongs to its own slice — and nothing
// here has to change when it arrives.
describe("one Story in more than one Series", () => {
  it("keeps two Series of the same name with different counts and separate ledgers", async () => {
    const standard = await declareSeries({
      name: "Fullmetal Alchemist",
      publisher: "Planet Manga",
      publishedCount: 27,
      status: "concluded",
    });
    const deluxe = await declareSeries({
      name: "Fullmetal Alchemist",
      publisher: "Planet Manga",
      editionLine: "Ultimate Deluxe Edition",
      publishedCount: 18,
      status: "concluded",
    });

    await own(standard, "Fullmetal Alchemist", [1, 2, 3, 4]);
    await own(deluxe, "Fullmetal Alchemist Ultimate Deluxe", [1]);
    await declareSeriesCollected(standard);
    await declareSeriesCollected(deluxe);

    const collected = await listMissingVolumes();
    expect(
      collected.map((series) => ({
        editionLine: series.editionLine,
        publishedCount: series.publishedCount,
        ownedCount: series.ownedCount,
        nextMissing: series.nextMissing,
        missing: series.missing?.length,
      }))
    ).toEqual([
      {
        editionLine: null,
        publishedCount: 27,
        ownedCount: 4,
        nextMissing: 5,
        missing: 23,
      },
      {
        editionLine: "Ultimate Deluxe Edition",
        publishedCount: 18,
        ownedCount: 1,
        nextMissing: 2,
        missing: 17,
      },
    ]);
  });
});

describe("the Series a screen lists", () => {
  it("lists every declared Series, collected or not, by name and then by edition", async () => {
    await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });
    await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });
    await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      publishedCount: 12,
      status: "concluded",
    });

    expect((await listSeries()).map((series) => [series.name, series.editionLine])).toEqual([
      ["Death Note", null],
      ["Death Note", "Black Edition"],
      ["Naruto", null],
    ]);
  });
});

describe("one Series in detail", () => {
  it("shows what is on the shelf by position, and what is not", async () => {
    const id = await deathNoteBlackEdition();
    const found = await findSeries(id);

    expect(found).toMatchObject({
      name: "Death Note",
      editionLine: "Black Edition",
      missing: [3, 4, 5, 6],
      volumes: [
        { number: 1, title: "Death Note Black Edition 1" },
        { number: 2, title: "Death Note Black Edition 2" },
      ],
    });
  });

  it("is nothing when no Series has that id", async () => {
    expect(await findSeries("11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(await findSeries("banana")).toBeNull();
  });
});

describe("the Volumes a Series screen can place", () => {
  it("offers what is owned and belongs to no Series yet", async () => {
    const id = await deathNoteBlackEdition();
    await volumeInTheHouse({
      title: "L'uomo che ride",
      publisher: "Panini Comics",
      binding: "hardcover",
      language: "it",
    });

    expect((await listVolumesOutsideASeries()).map((volume) => volume.title)).toEqual([
      "L'uomo che ride",
    ]);
    expect(id).toBeTruthy();
  });
});

// THE ARROW, READ (#39). What a Series prints is one fact on the ledger: two editions of
// *Fullmetal Alchemist* are two completeness ledgers over one narrative, and that is the
// whole shape being asserted — missing is per Series, and the Story is one.

/** *Fullmetal Alchemist* as two Series over one Story: the standard printing and the Deluxe. */
async function twoSeriesOfOneStory() {
  const story = await createStory({ title: "Fullmetal Alchemist", typeId: "manga" });

  const standard = await declareSeries({
    name: "Fullmetal Alchemist",
    publisher: "Planet Manga",
    publishedCount: 27,
    status: "concluded",
  });
  await own(standard, "Fullmetal Alchemist", [1, 2]);
  await declareSeriesCollected(standard);
  await recordSeriesPublishesStory(standard, story);

  const deluxe = await declareSeries({
    name: "Fullmetal Alchemist",
    publisher: "Planet Manga",
    editionLine: "Ultimate Deluxe Edition",
    publishedCount: 4,
    status: "ongoing",
  });
  await own(deluxe, "Fullmetal Alchemist Ultimate Deluxe", [1]);
  await declareSeriesCollected(deluxe);
  await recordSeriesPublishesStory(deluxe, story);

  return { story, standard, deluxe };
}

describe("which Story a Series publishes", () => {
  it("names it on the ledger, and says nothing where the Series names none", async () => {
    const { standard, story } = await twoSeriesOfOneStory();
    await deathNoteBlackEdition();

    expect((await findSeries(standard))?.publishes).toEqual({
      id: story,
      title: "Fullmetal Alchemist",
    });

    const named = new Map((await listSeries()).map((one) => [one.editionLine, one.publishes]));
    expect(named.get("Black Edition")).toBeNull();
  });

  it("is two ledgers and one narrative: what is missing is per Series, the Story is one", async () => {
    const { story } = await twoSeriesOfOneStory();

    const missing = await listMissingVolumes();
    expect(missing.map((one) => [one.editionLine, one.missing?.length, one.publishes?.id])).toEqual(
      [
        [null, 25, story],
        ["Ultimate Deluxe Edition", 3, story],
      ]
    );
  });
});

describe("what a merge would collapse", () => {
  it("counts the objects of the line and the narratives they stand for", async () => {
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    const [first, second, third] = await own(series, "Slam Dunk", [1, 2, 3]);
    // Two objects standing for one narrative and a third standing for its own: three objects,
    // two narratives, and the sentence the panel prints is both numbers.
    const shared = await createStoryCarriedBy({ title: "Slam Dunk", typeId: "manga" }, first);
    await recordVolumeCarriesStory(second, shared);
    await createStoryCarriedBy({ title: "Slam Dunk 3", typeId: "manga" }, third);

    expect(await whatAMergeWouldCollapse(series)).toEqual({ objects: 3, narratives: 2 });
  });

  it("counts an object the house no longer holds, because a merge is not about the shelf", async () => {
    const series = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      publishedCount: 2,
      status: "concluded",
    });
    const [first] = await own(series, "Death Note", [1, 2]);
    await releaseVolume(first);

    expect(await whatAMergeWouldCollapse(series)).toMatchObject({ objects: 2 });
  });

  it("answers nothing at all for a Series the library does not know", async () => {
    expect(await whatAMergeWouldCollapse("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await whatAMergeWouldCollapse("banana")).toBeNull();
  });
});

// What a merge would carry (#44). The merge itself moves a Pass and a Rating onto the
// work and is right to; this is the question a *conversion* asks before it runs unattended
// over the whole library, where the answer has to be *nothing* for the run to be lossless.
describe("what a merge would carry", () => {
  /** Three tankōbon of one line, each standing for a narrative of its own. */
  async function aLineOfThree(): Promise<{ series: string; narratives: string[] }> {
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 3,
      status: "concluded",
    });
    const objects = await own(series, "Slam Dunk", [1, 2, 3]);
    const narratives: string[] = [];
    for (const [index, volume] of objects.entries()) {
      narratives.push(
        await createStoryCarriedBy({ title: `Slam Dunk ${index + 1}`, typeId: "manga" }, volume)
      );
    }
    return { series, narratives };
  }

  it("says nothing at all for a line nobody has read or judged", async () => {
    const { series } = await aLineOfThree();

    expect(await whatAMergeWouldCarry(series)).toEqual([]);
  });

  it("names the narrative a pass went through, and how many passes there were", async () => {
    const { series, narratives } = await aLineOfThree();
    await recordPass({ storyId: narratives[1], medium: "paper", provenanceId: "remembered" });
    await recordPass({
      storyId: narratives[1],
      medium: "digital",
      provenanceId: "remembered",
      outcome: "finished",
    });

    expect(await whatAMergeWouldCarry(series)).toEqual([
      { id: narratives[1], title: "Slam Dunk 2", passes: 2, judged: false },
    ]);
  });

  it("names the narrative that carries a score, in the order the objects stand on the shelf", async () => {
    const { series, narratives } = await aLineOfThree();
    await setRating({ storyId: narratives[2], score: 9, provenanceId: "remembered" });
    await recordPass({ storyId: narratives[0], medium: "paper", provenanceId: "remembered" });

    expect(await whatAMergeWouldCarry(series)).toEqual([
      { id: narratives[0], title: "Slam Dunk 1", passes: 1, judged: false },
      { id: narratives[2], title: "Slam Dunk 3", passes: 0, judged: true },
    ]);
  });

  it("answers nothing for a Series the library does not know", async () => {
    expect(await whatAMergeWouldCarry("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(await whatAMergeWouldCarry("banana")).toEqual([]);
  });
});

// THE TWO QUESTIONS A STORY'S PAGE ASKS OF THE LEDGER (#34, user stories 35 and 36).
//
// The work is managed from the Story, so both are asked from the narrative's end: which lines
// print it, and which lines could be said to.
describe("the Series publishing one Story", () => {
  it("answers every line that names it, each with its own ledger", async () => {
    const work = await createStory({ title: "Death Note", typeId: "manga" });
    const black = await deathNoteBlackEdition();
    const standard = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      publishedCount: 12,
      status: "concluded",
    });
    await recordSeriesPublishesStory(black, work);
    await recordSeriesPublishesStory(standard, work);

    const ledgers = await listSeriesPublishingStory(work);

    // Two ledgers over one narrative, the standard printing first, each answering how far
    // along it is and what is missing from it — the same answer `listSeries` gives.
    expect(
      ledgers.map((one) => [one.editionLine, one.ownedCount, one.publishedCount, one.missing])
    ).toEqual([
      [null, 0, 12, null],
      ["Black Edition", 2, 6, [3, 4, 5, 6]],
    ]);
  });

  it("answers nothing where no line names it, which is the ordinary case", async () => {
    const work = await createStory({ title: "Daredevil: L'Uomo Senza Paura", typeId: "comic" });
    await deathNoteBlackEdition();

    expect(await listSeriesPublishingStory(work)).toEqual([]);
    expect(await listSeriesPublishingStory("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(await listSeriesPublishingStory("banana")).toEqual([]);
  });
});

describe("the Series that could be said to publish a Story", () => {
  it("offers a line naming none, with what saying it would collapse", async () => {
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    const [first, second] = await own(series, "Slam Dunk", [1, 2]);
    const shared = await createStoryCarriedBy({ title: "Slam Dunk 1", typeId: "manga" }, first);
    await recordVolumeCarriesStory(second, shared);

    expect(await listSeriesPublishingNothing()).toEqual([
      { id: series, name: "Slam Dunk", editionLine: null, objects: 2, narratives: 1 },
    ]);
  });

  it("leaves out a line that already publishes one: a line is said to print a work once", async () => {
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    const [first] = await own(series, "Slam Dunk", [1]);
    const story = await createStoryCarriedBy({ title: "Slam Dunk 1", typeId: "manga" }, first);
    await recordSeriesPublishesStory(series, story);

    expect(await listSeriesPublishingNothing()).toEqual([]);
  });

  it("leaves out a line with nothing to collapse, so no choice is a refusal", async () => {
    // Declared and empty, and declared with an object carrying no narrative: the gesture
    // refuses both, so neither is offered.
    await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });
    const black = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });
    await own(black, "Death Note Black Edition", [1]);

    expect(await listSeriesPublishingNothing()).toEqual([]);
  });
});
