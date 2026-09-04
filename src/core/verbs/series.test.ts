import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { listSeries } from "../queries/series.ts";
import { isRefusal } from "../refusal.ts";
import { acquireVolume, catalogueVolume, releaseVolume } from "./collection.ts";
import { creditStory } from "./credit.ts";
import { recordPass } from "./pass.ts";
import { definePath, placeStoriesOnPath } from "./path.ts";
import { pinToPile } from "./pile.ts";
import { setRating } from "./rating.ts";
import {
  amendSeries,
  concludeSeries,
  declareSeries,
  declareSeriesCollected,
  mergeSeriesIntoOneStory,
  placeVolumeInSeries,
  recordSeriesNoLongerPublishesStory,
  recordSeriesPublishesStory,
  recordVolumesPublished,
  stopCollectingSeries,
} from "./series.ts";
import { createStory, createStoryCarriedBy, declareInstalments } from "./story.ts";
import { recordVolumeCarriesStory } from "./story-to-volume.ts";
import { openWant } from "./want.ts";

// Seam 1. What is asserted here is the ledger's write side: that a Series can be declared,
// that **collecting it is a separate act nothing else performs**, and that every way of
// getting it wrong comes back as prose rather than as a SQLSTATE.
beforeEach(async () => {
  await query("truncate table series, volume, story, path, person cascade");
});

/** The refusal a call produced, or a failure saying it produced none. */
async function refusalFrom(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    if (isRefusal(error)) return error;
    throw error;
  }
  throw new Error("expected a Refusal, and the call succeeded");
}

async function blackEdition(): Promise<string> {
  return declareSeries({
    name: "Death Note",
    publisher: "Panini Comics",
    editionLine: "Black Edition",
    publishedCount: 6,
    status: "concluded",
  });
}

describe("declaring a Series", () => {
  it("records the publisher, the edition line, the count published and whether it is over", async () => {
    const id = await blackEdition();

    const [row] = await query<{
      name: string;
      publisher: string;
      edition_line: string | null;
      published_count: number;
      status: string;
      collecting_since: Date | null;
    }>("select * from series where id = $1", [id]);

    expect(row).toMatchObject({
      name: "Death Note",
      publisher: "Panini Comics",
      edition_line: "Black Edition",
      published_count: 6,
      status: "concluded",
    });
  });

  it("opens no collecting project by itself", async () => {
    const id = await blackEdition();
    const [row] = await query<{ collecting_since: Date | null }>(
      "select collecting_since from series where id = $1",
      [id]
    );
    expect(row.collecting_since).toBeNull();
  });

  it("takes the same name twice when the edition line differs, with its own count", async () => {
    await blackEdition();
    const standard = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      publishedCount: 12,
      status: "concluded",
    });

    const [row] = await query<{ published_count: number }>(
      "select published_count from series where id = $1",
      [standard]
    );
    expect(row.published_count).toBe(12);
  });

  it("refuses the same Series twice, standard printing included", async () => {
    const standard = {
      name: "Death Note",
      publisher: "Panini Comics",
      publishedCount: 12,
      status: "concluded" as const,
    };
    await declareSeries(standard);

    const refusal = await refusalFrom(() => declareSeries(standard));
    expect(refusal.code).toBe("already-exists");
    expect(refusal.message).toMatch(/already declared/i);
  });

  it("refuses a Series with no name", async () => {
    const refusal = await refusalFrom(() =>
      declareSeries({
        name: "   ",
        publisher: "Panini Comics",
        publishedCount: 1,
        status: "ongoing",
      })
    );
    expect(refusal.code).toBe("invalid");
  });

  it("refuses a negative count of published Volumes", async () => {
    const refusal = await refusalFrom(() =>
      declareSeries({
        name: "Naruto",
        publisher: "Planet Manga",
        publishedCount: -1,
        status: "concluded",
      })
    );
    expect(refusal.code).toBe("invalid");
  });
});

describe("deciding to collect a Series", () => {
  it("is what opens the project, and it says which day", async () => {
    const id = await blackEdition();
    await declareSeriesCollected(id);

    const [row] = await query<{ collecting: boolean }>(
      "select collecting_since = current_date as collecting from series where id = $1",
      [id]
    );
    expect(row.collecting).toBe(true);
  });

  it("is not performed by owning Volumes of the Series", async () => {
    const id = await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });
    const volume = await volumeInTheHouse({
      title: "Naruto 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume, seriesId: id, number: 1 });

    const [row] = await query<{ collecting_since: Date | null }>(
      "select collecting_since from series where id = $1",
      [id]
    );
    expect(row.collecting_since).toBeNull();
  });

  it("is refused twice over, because the project is already open", async () => {
    const id = await blackEdition();
    await declareSeriesCollected(id);

    const refusal = await refusalFrom(() => declareSeriesCollected(id));
    expect(refusal.code).toBe("not-allowed");
  });

  it("is refused on a Series nobody declared", async () => {
    const refusal = await refusalFrom(() =>
      declareSeriesCollected("11111111-1111-1111-1111-111111111111")
    );
    expect(refusal.code).toBe("not-found");
  });

  it("is refused on something that is not an id at all, rather than breaking", async () => {
    const refusal = await refusalFrom(() => declareSeriesCollected("banana"));
    expect(refusal.code).toBe("not-found");
  });

  it("ends by the same kind of deliberate act", async () => {
    const id = await blackEdition();
    await declareSeriesCollected(id);
    await stopCollectingSeries(id);

    const [row] = await query<{ collecting_since: Date | null }>(
      "select collecting_since from series where id = $1",
      [id]
    );
    expect(row.collecting_since).toBeNull();

    const refusal = await refusalFrom(() => stopCollectingSeries(id));
    expect(refusal.code).toBe("not-allowed");
  });
});

describe("keeping the ledger true as the publisher moves", () => {
  it("records that more Volumes are out", async () => {
    const id = await declareSeries({
      name: "Chainsaw Man",
      publisher: "Planet Manga",
      publishedCount: 11,
      status: "ongoing",
    });
    await recordVolumesPublished(id, 12);

    const [row] = await query<{ published_count: number }>(
      "select published_count from series where id = $1",
      [id]
    );
    expect(row.published_count).toBe(12);
  });

  it("records that the Series is over, once", async () => {
    const id = await declareSeries({
      name: "Chainsaw Man",
      publisher: "Planet Manga",
      publishedCount: 11,
      status: "ongoing",
    });
    await concludeSeries(id);

    const [row] = await query<{ status: string }>("select status from series where id = $1", [id]);
    expect(row.status).toBe("concluded");

    const refusal = await refusalFrom(() => concludeSeries(id));
    expect(refusal.code).toBe("not-allowed");
  });

  it("refuses a count that is not a whole number of Volumes", async () => {
    const id = await blackEdition();
    const refusal = await refusalFrom(() => recordVolumesPublished(id, 6.5));
    expect(refusal.code).toBe("invalid");
  });
});

describe("placing a Volume in a Series", () => {
  it("records which position of the Series the object is", async () => {
    const series = await blackEdition();
    const volume = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      editionLine: "Black Edition",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 1 });

    const [row] = await query<{ series_id: string; series_number: number }>(
      "select series_id, series_number from volume where id = $1",
      [volume]
    );
    expect(row).toEqual({ series_id: series, series_number: 1 });
  });

  it("said again, moves the object rather than refusing the correction", async () => {
    const series = await blackEdition();
    const volume = await volumeInTheHouse({
      title: "Death Note Black Edition 2",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 1 });
    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 2 });

    const [row] = await query<{ series_number: number }>(
      "select series_number from volume where id = $1",
      [volume]
    );
    expect(row.series_number).toBe(2);
  });

  it("refuses a second object at a position the house already holds", async () => {
    const series = await blackEdition();
    const first = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    const twice = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: first, seriesId: series, number: 1 });

    const refusal = await refusalFrom(() =>
      placeVolumeInSeries({ volumeId: twice, seriesId: series, number: 1 })
    );
    expect(refusal.code).toBe("already-exists");
  });

  // The other door to the same invariant, and the reason it is a function in Postgres
  // rather than the partial unique index #7 wrote (ADR-0007). Ownership is an acquisition
  // now, so *acquiring* an object can be what makes two of one position sit in the house —
  // and it is refused with the same words as placing one.
  it("refuses acquiring an object again into a position the house has filled since", async () => {
    const series = await blackEdition();
    const sold = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    const replacement = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: sold, seriesId: series, number: 1 });
    await releaseVolume(sold);
    await placeVolumeInSeries({ volumeId: replacement, seriesId: series, number: 1 });

    const refusal = await refusalFrom(() => acquireVolume({ volumeId: sold }));

    expect(refusal.code).toBe("already-exists");
    expect(refusal.message).toBe("That position of the Series is already in the house.");
  });

  // Two ways of not being on the shelf, and the owner is told which one they are looking
  // at (ADR-0007). The restriction itself is #7's and is left standing: an object not in
  // the house fills no position, whether it left or was never there.
  it("refuses an object catalogued and never owned, without saying it left", async () => {
    const series = await blackEdition();
    const { id } = await catalogueVolume({
      title: "Death Note Black Edition 4",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });

    const refusal = await refusalFrom(() =>
      placeVolumeInSeries({ volumeId: id, seriesId: series, number: 4 })
    );

    expect(refusal.code).toBe("not-allowed");
    expect(refusal.message).toBe(
      "That Volume is not in the house, so it fills no position of the Series."
    );
  });

  it("refuses an object that has left the house, which fills no position", async () => {
    const series = await blackEdition();
    const volume = await volumeInTheHouse({
      title: "Death Note Black Edition 3",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await releaseVolume(volume);

    const refusal = await refusalFrom(() =>
      placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 3 })
    );
    expect(refusal.code).toBe("not-allowed");
  });

  it("refuses a position before the first", async () => {
    const series = await blackEdition();
    const volume = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });

    const refusal = await refusalFrom(() =>
      placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 0 })
    );
    expect(refusal.code).toBe("invalid");
  });

  it("refuses an object nobody owns and a Series nobody declared", async () => {
    const series = await blackEdition();
    const volume = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });

    expect(
      (
        await refusalFrom(() =>
          placeVolumeInSeries({
            volumeId: "11111111-1111-1111-1111-111111111111",
            seriesId: series,
            number: 3,
          })
        )
      ).code
    ).toBe("not-found");

    expect(
      (
        await refusalFrom(() =>
          placeVolumeInSeries({
            volumeId: volume,
            seriesId: "11111111-1111-1111-1111-111111111111",
            number: 3,
          })
        )
      ).code
    ).toBe("not-found");
  });
});

// What an approved Amendment does to the ledger (ADR-0011): an assistant reading a shop page
// is exactly who notices that a line has moved on, and exactly who might invent it. The
// Inbox is the door it reaches this through, and `verbs/inbox.test.ts` holds that boundary.
describe("amending a Series", () => {
  async function aSeries(): Promise<string> {
    return declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "ongoing",
    });
  }

  it("changes the fields it names, several at once, and leaves the rest standing", async () => {
    const seriesId = await aSeries();

    await amendSeries(seriesId, { publishedCount: 31, status: "concluded" });

    expect(await listSeries()).toMatchObject([
      {
        id: seriesId,
        name: "Slam Dunk",
        publisher: "Planet Manga",
        publishedCount: 31,
        status: "concluded",
        // The one thing an amendment of the ledger never does: nothing here opens a
        // collecting project (CONTEXT.md).
        collectingSince: null,
      },
    ]);
  });

  it("accepts a value the Series already holds, where the owner's own verb refuses it", async () => {
    const seriesId = await aSeries();

    // `recordVolumesPublished` refuses a count the Series is already at, because saying it
    // twice is a mistake. An amendment naming several fields is approved as a whole, so a
    // field that changes nothing is not one.
    await amendSeries(seriesId, { publishedCount: 20, status: "concluded" });

    expect(await listSeries()).toMatchObject([{ publishedCount: 20, status: "concluded" }]);
  });

  it("refuses to take a concluded Series back to ongoing, because there is no verb back", async () => {
    const seriesId = await aSeries();
    await concludeSeries(seriesId);

    const refusal = await refusalFrom(() => amendSeries(seriesId, { status: "ongoing" }));

    expect(refusal.code).toBe("not-allowed");
    expect(refusal.message).toMatch(/new edition, which is a new Series/);
    expect(await listSeries()).toMatchObject([{ status: "concluded" }]);
  });

  it("amends a concluded Series in every other field, so a name spelt wrong is fixable", async () => {
    const seriesId = await aSeries();
    await concludeSeries(seriesId);

    await amendSeries(seriesId, { name: "Slam Dunk", publishedCount: 31 });

    expect(await listSeries()).toMatchObject([
      { name: "Slam Dunk", publishedCount: 31, status: "concluded" },
    ]);
  });

  it("refuses an amendment that names nothing, and a count that is not whole", async () => {
    const seriesId = await aSeries();

    expect((await refusalFrom(() => amendSeries(seriesId, {}))).code).toBe("invalid");
    expect((await refusalFrom(() => amendSeries(seriesId, { publishedCount: 31.5 }))).code).toBe(
      "invalid"
    );
  });

  it("refuses a Series that is not there, and a malformed id is the same event", async () => {
    expect(
      (
        await refusalFrom(() =>
          amendSeries("11111111-1111-1111-1111-111111111111", { publishedCount: 31 })
        )
      ).code
    ).toBe("not-found");
    expect((await refusalFrom(() => amendSeries("banana", { publishedCount: 31 }))).code).toBe(
      "not-found"
    );
  });
});

// THE ARROW BETWEEN THE SERIES AND THE NARRATIVE (#39).
//
// One fact, and the whole of what a Series and a Story say to each other: *this Series prints
// that Story*. What is asserted here is that it is **many Series to one Story**, that taking
// it back leaves the ledger exactly as it was, and that it never becomes a judgement — a
// Series answers *what am I missing* and a Story answers *was it any good*, and the arrow
// does not blur them (ADR-0001).

/** *Slam Dunk*, as one Story rather than as twenty numbered rows. */
async function slamDunk(): Promise<string> {
  return createStory({ title: "Slam Dunk", typeId: "manga" });
}

/** The ledger's own numbers, read back as the owner would see them on the screen. */
async function ledgerOf(seriesId: string) {
  const [row] = await query<{
    name: string;
    published_count: number;
    status: string;
    collecting_since: Date | null;
    story_id: string | null;
  }>("select name, published_count, status, collecting_since, story_id from series where id = $1", [
    seriesId,
  ]);
  return row;
}

describe("saying which Story a Series publishes", () => {
  it("records the Story it prints", async () => {
    const series = await blackEdition();
    const story = await createStory({ title: "Death Note", typeId: "manga" });

    await recordSeriesPublishesStory(series, story);

    expect((await ledgerOf(series)).story_id).toBe(story);
  });

  it("takes one Story for two Series, because two editions are one narrative", async () => {
    const story = await slamDunk();
    const tankobon = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    const deluxe = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      editionLine: "Deluxe",
      publishedCount: 10,
      status: "concluded",
    });

    await recordSeriesPublishesStory(tankobon, story);
    await recordSeriesPublishesStory(deluxe, story);

    expect((await ledgerOf(tankobon)).story_id).toBe(story);
    expect((await ledgerOf(deluxe)).story_id).toBe(story);
  });

  it("said again with another Story, moves the arrow rather than refusing the correction", async () => {
    const series = await blackEdition();
    const wrong = await slamDunk();
    const right = await createStory({ title: "Death Note", typeId: "manga" });

    await recordSeriesPublishesStory(series, wrong);
    await recordSeriesPublishesStory(series, right);

    expect((await ledgerOf(series)).story_id).toBe(right);
  });

  it("leaves the ledger a ledger: nothing it counts moves, and it says nothing about quality", async () => {
    const series = await blackEdition();
    await declareSeriesCollected(series);
    const before = await ledgerOf(series);

    await recordSeriesPublishesStory(series, await slamDunk());

    const after = await ledgerOf(series);
    expect({ ...after, story_id: null }).toEqual({ ...before, story_id: null });
    const [judgements] = await query<{ count: string }>("select count(*) from rating");
    expect(judgements.count).toBe("0");
  });

  it("refuses a Series nobody declared and a Story the library does not hold", async () => {
    const series = await blackEdition();
    const story = await slamDunk();

    expect(
      (
        await refusalFrom(() =>
          recordSeriesPublishesStory("11111111-1111-1111-1111-111111111111", story)
        )
      ).message
    ).toBe("No Series has that id.");
    expect(
      (
        await refusalFrom(() =>
          recordSeriesPublishesStory(series, "11111111-1111-1111-1111-111111111111")
        )
      ).message
    ).toBe("That Story is not in the library yet.");
    expect((await refusalFrom(() => recordSeriesPublishesStory("banana", story))).code).toBe(
      "not-found"
    );
  });
});

describe("taking the arrow back", () => {
  it("leaves the Series naming no Story, and everything else standing", async () => {
    const series = await blackEdition();
    await declareSeriesCollected(series);
    const story = await slamDunk();
    await recordSeriesPublishesStory(series, story);

    await recordSeriesNoLongerPublishesStory(series);

    expect((await ledgerOf(series)).story_id).toBeNull();
    const [stories] = await query<{ count: string }>("select count(*) from story");
    expect(stories.count).toBe("1");
  });

  it("refuses a Series that publishes nothing, rather than passing silently", async () => {
    const series = await blackEdition();

    const refusal = await refusalFrom(() => recordSeriesNoLongerPublishesStory(series));

    expect(refusal.code).toBe("not-found");
    expect(refusal.message).toBe("That Series publishes no Story.");
  });
});

describe("a Volume joining a Series that names a Story", () => {
  /** The Series, the Story it prints, and one object waiting to be placed in it. */
  async function seriesNaming(story: string | null) {
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    if (story) await recordSeriesPublishesStory(series, story);
    const volume = await volumeInTheHouse({
      title: "Slam Dunk 21",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    return { series, volume };
  }

  it("attaches to the Story already there rather than minting a twenty-first narrative", async () => {
    const story = await slamDunk();
    const { series, volume } = await seriesNaming(story);

    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 21 });

    const carried = await query<{ story_id: string }>(
      "select story_id from volume_story where volume_id = $1",
      [volume]
    );
    expect(carried).toEqual([{ story_id: story }]);
    const [stories] = await query<{ count: string }>("select count(*) from story");
    expect(stories.count).toBe("1");
  });

  it("says the same fact once, however often the object is moved along the Series", async () => {
    const story = await slamDunk();
    const { series, volume } = await seriesNaming(story);

    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 21 });
    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 20 });

    const carried = await query<{ story_id: string }>(
      "select story_id from volume_story where volume_id = $1",
      [volume]
    );
    expect(carried).toEqual([{ story_id: story }]);
  });

  it("moving the object to another Series attaches the second Story and leaves the first standing", async () => {
    const first = await slamDunk();
    const second = await createStory({ title: "Vagabond", typeId: "manga" });
    const { series: slam, volume } = await seriesNaming(first);
    const vagabond = await declareSeries({
      name: "Vagabond",
      publisher: "Planet Manga",
      publishedCount: 37,
      status: "concluded",
    });
    await recordSeriesPublishesStory(vagabond, second);

    await placeVolumeInSeries({ volumeId: volume, seriesId: slam, number: 21 });
    await placeVolumeInSeries({ volumeId: volume, seriesId: vagabond, number: 1 });

    // Both, deliberately: a placement adds and never deletes, because the link it would
    // delete is one the owner may have written by hand and the schema cannot tell the two
    // apart. Taking one off is `recordVolumeNoLongerCarriesStory`, which is the owner saying
    // so.
    const carried = await query<{ story_id: string }>(
      "select story_id from volume_story where volume_id = $1 order by story_id",
      [volume]
    );
    expect(carried.map((one) => one.story_id).sort()).toEqual([first, second].sort());
  });

  it("leaves a Series that names no Story exactly as it was: the object carries nothing", async () => {
    const { series, volume } = await seriesNaming(null);

    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 21 });

    const carried = await query("select story_id from volume_story where volume_id = $1", [volume]);
    expect(carried).toEqual([]);
    const [stories] = await query<{ count: string }>("select count(*) from story");
    expect(stories.count).toBe("0");
  });

  it("attaches nothing when the placement is refused", async () => {
    const story = await slamDunk();
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    await recordSeriesPublishesStory(series, story);
    const { id } = await catalogueVolume({
      title: "Slam Dunk 21",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    await refusalFrom(() => placeVolumeInSeries({ volumeId: id, seriesId: series, number: 21 }));

    expect(await query("select story_id from volume_story where volume_id = $1", [id])).toEqual([]);
  });
});

// MERGING A LINE INTO ONE STORY (#41).
//
// The gesture that undoes a split the owner never asked for: twenty tankōbon standing as
// twenty narratives become one work carried by twenty objects. What is asserted here is the
// pair of halves the ticket is about — **what is carried across** (a Rating, the Passes, the
// Credits, the Path stops, the Wants, the arrow) and **what is untouched** (every Volume,
// every Acquisition and the completeness ledger) — and the refusals that stop the collapse
// losing something.
describe("merging a Series into one Story", () => {
  /**
   * A line of `volumes` tankōbon, each an object in the house standing for a narrative of its
   * own — which is the state the whole gesture exists to undo.
   */
  async function aLineOfTankobon(volumes: number, editionLine?: string) {
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      editionLine,
      publishedCount: volumes,
      status: "concluded",
    });

    const objects: string[] = [];
    const narratives: string[] = [];
    for (let number = 1; number <= volumes; number += 1) {
      const volume = await volumeInTheHouse({
        title: `Slam Dunk ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      const story = await createStoryCarriedBy(
        { title: `Slam Dunk ${number}`, typeId: "manga" },
        volume
      );
      await placeVolumeInSeries({ volumeId: volume, seriesId: series, number });
      objects.push(volume);
      narratives.push(story);
    }

    return { series, objects, narratives };
  }

  /** Every row of a table, as JSON, so *untouched* can be asserted rather than argued. */
  async function snapshotOf(table: "volume" | "acquisition") {
    return query<{ row: unknown }>(`select to_jsonb(t) as row from ${table} t order by t.id`);
  }

  /** Which Stories an object carries. */
  async function carriedBy(volumeId: string): Promise<string[]> {
    const rows = await query<{ story_id: string }>(
      "select story_id from volume_story where volume_id = $1 order by story_id",
      [volumeId]
    );
    return rows.map((one) => one.story_id);
  }

  it("makes one Story of the line, and every object of it carries that one", async () => {
    const { series, objects, narratives } = await aLineOfTankobon(4);

    const work = await mergeSeriesIntoOneStory(series);

    for (const volume of objects) expect(await carriedBy(volume)).toEqual([work]);
    const [count] = await query<{ count: string }>("select count(*) from story");
    expect(count.count).toBe("1");
    expect(narratives).toHaveLength(4);
  });

  it("takes the Series' own name where the owner names nothing else", async () => {
    const { series } = await aLineOfTankobon(2);

    const work = await mergeSeriesIntoOneStory(series);

    const [row] = await query<{ title: string; type_id: string }>(
      "select title, type_id from story where id = $1",
      [work]
    );
    expect(row).toMatchObject({ title: "Slam Dunk", type_id: "manga" });
  });

  it("takes the title the owner gave it instead", async () => {
    const { series } = await aLineOfTankobon(2);

    const work = await mergeSeriesIntoOneStory(series, { title: "  Slam Dunk, the whole run  " });

    const [row] = await query<{ title: string }>("select title from story where id = $1", [work]);
    expect(row.title).toBe("Slam Dunk, the whole run");
  });

  it("sets the arrow, so a volume arriving later attaches instead of minting", async () => {
    const { series } = await aLineOfTankobon(3);
    const work = await mergeSeriesIntoOneStory(series);

    expect((await ledgerOf(series)).story_id).toBe(work);

    const later = await volumeInTheHouse({
      title: "Slam Dunk 4",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: later, seriesId: series, number: 4 });

    expect(await carriedBy(later)).toEqual([work]);
    const [count] = await query<{ count: string }>("select count(*) from story");
    expect(count.count).toBe("1");
  });

  it("serializes the work to the length of the line, so there is a place to read progress", async () => {
    const { series } = await aLineOfTankobon(3);

    const work = await mergeSeriesIntoOneStory(series);

    const [row] = await query<{ instalments: number }>(
      "select instalments from story where id = $1",
      [work]
    );
    expect(row.instalments).toBe(3);
  });

  // **And the line is what said so, rather than the gesture typing it** (#34, ADR-0017). The
  // owner records how many Volumes are out on the ledger, once, and is never asked the same
  // number again in the narrative's words — which is what the arrow this sets buys.
  it("leaves the length of the work to the line, so it grows with it", async () => {
    const { series } = await aLineOfTankobon(3);

    const work = await mergeSeriesIntoOneStory(series);
    await recordVolumesPublished(series, 4);

    const [row] = await query<{ instalments: number; instalments_said_by: string }>(
      "select instalments, instalments_said_by from story where id = $1",
      [work]
    );
    expect(row).toEqual({ instalments: 4, instalments_said_by: "line" });
  });

  // The one number this gesture still writes, because no line will say it: a ledger nobody has
  // filled in cannot make the work shorter than the objects carrying it.
  it("writes the furthest position placed where the shelf reaches past the ledger", async () => {
    const { series, objects } = await aLineOfTankobon(3);
    await recordVolumesPublished(series, 0);
    expect(objects).toHaveLength(3);

    const work = await mergeSeriesIntoOneStory(series);

    const [row] = await query<{ instalments: number; instalments_said_by: string }>(
      "select instalments, instalments_said_by from story where id = $1",
      [work]
    );
    expect(row).toEqual({ instalments: 3, instalments_said_by: "owner" });
  });

  it("leaves every Volume and every Acquisition byte for byte as it was", async () => {
    const { series } = await aLineOfTankobon(4);
    const volumes = await snapshotOf("volume");
    const acquisitions = await snapshotOf("acquisition");

    await mergeSeriesIntoOneStory(series);

    expect(await snapshotOf("volume")).toEqual(volumes);
    expect(await snapshotOf("acquisition")).toEqual(acquisitions);
  });

  it("leaves the completeness ledger alone: only the arrow moves", async () => {
    const { series } = await aLineOfTankobon(3);
    await declareSeriesCollected(series);
    const before = await ledgerOf(series);

    const work = await mergeSeriesIntoOneStory(series);

    expect(await ledgerOf(series)).toEqual({ ...before, story_id: work });
  });

  it("carries the one Rating across, so the work is what carries the judgement", async () => {
    const { series, narratives } = await aLineOfTankobon(3);
    await setRating({
      storyId: narratives[1],
      score: 9,
      provenanceId: "remembered",
      prose: "Yes.",
    });

    const work = await mergeSeriesIntoOneStory(series);

    const [row] = await query<{ story_id: string; score: string; prose: string }>(
      "select story_id, score, prose from rating"
    );
    expect(row).toMatchObject({ story_id: work, prose: "Yes." });
    expect(Number(row.score)).toBe(9);
  });

  it("carries every Pass across, with what it reached and the Rating it carried", async () => {
    const { series, narratives } = await aLineOfTankobon(3);
    const first = await recordPass({
      storyId: narratives[0],
      medium: "paper",
      provenanceId: "remembered",
      outcome: "finished",
    });
    await setRating({
      storyId: narratives[0],
      passId: first,
      score: 8,
      provenanceId: "remembered",
    });
    await recordPass({
      storyId: narratives[2],
      medium: "digital",
      provenanceId: "remembered",
    });

    const work = await mergeSeriesIntoOneStory(series);

    const passes = await query<{ story_id: string; medium: string }>(
      "select story_id, medium from pass order by medium"
    );
    expect(passes).toEqual([
      { story_id: work, medium: "digital" },
      { story_id: work, medium: "paper" },
    ]);
    const [rating] = await query<{ story_id: string; pass_id: string }>(
      "select story_id, pass_id from rating"
    );
    expect(rating).toEqual({ story_id: work, pass_id: first });
  });

  it("carries the Credits across, once each, and leaves the people standing", async () => {
    const { series, narratives } = await aLineOfTankobon(3);
    for (const story of narratives) {
      await creditStory({ storyId: story, person: "Takehiko Inoue", roleId: "writer" });
      await creditStory({ storyId: story, person: "Takehiko Inoue", roleId: "artist" });
    }

    const work = await mergeSeriesIntoOneStory(series);

    const credits = await query<{ story_id: string; role_id: string }>(
      "select c.story_id, c.role_id from credit c order by c.role_id"
    );
    expect(credits).toEqual([
      { story_id: work, role_id: "artist" },
      { story_id: work, role_id: "writer" },
    ]);
    const [people] = await query<{ count: string }>("select count(*) from person");
    expect(people.count).toBe("1");
  });

  it("repoints a Path's stops at the work, and two stops of one route become one", async () => {
    const { series, narratives } = await aLineOfTankobon(3);
    const other = await createStory({ title: "Vagabond", typeId: "manga" });
    const path = await definePath({ name: "The Inoue run" });
    await placeStoriesOnPath(path, [narratives[0], other, narratives[2]]);

    const work = await mergeSeriesIntoOneStory(series);

    const stops = await query<{ story_id: string }>(
      "select story_id from path_item where path_id = $1 order by position",
      [path]
    );
    expect(stops.map((stop) => stop.story_id)).toEqual([work, other]);
  });

  it("repoints the Wants at the work, keeping the most recent of them", async () => {
    const { series, narratives } = await aLineOfTankobon(3);
    await openWant(narratives[0]);
    await query("update want set opened_at = now() - interval '3 days'");
    await openWant(narratives[2]);

    const work = await mergeSeriesIntoOneStory(series);

    const wants = await query<{ story_id: string; recent: boolean }>(
      "select story_id, opened_at > now() - interval '1 day' as recent from want"
    );
    expect(wants).toEqual([{ story_id: work, recent: true }]);
  });

  // A pin names a Story since #40, so a collapse reaches one — and `on delete cascade` means
  // it would go *silently*, which is the one way this gesture could take a decision the owner
  // made off the front of their own list without saying so.
  it("repoints a pin at the work, keeping the most recent of them", async () => {
    const { series, narratives } = await aLineOfTankobon(3);
    await pinToPile({ kind: "story", id: narratives[0] });
    await query("update pile_pin set pinned_at = now() - interval '3 days'");
    await pinToPile({ kind: "story", id: narratives[2] });

    const work = await mergeSeriesIntoOneStory(series);

    const pins = await query<{ story_id: string; recent: boolean }>(
      "select story_id, pinned_at > now() - interval '1 day' as recent from pile_pin"
    );
    expect(pins).toEqual([{ story_id: work, recent: true }]);
  });

  it("leaves a pin on a position of the line alone: the shopping half names an object", async () => {
    const { series } = await aLineOfTankobon(2);
    await pinToPile({ kind: "series", id: series, position: 3 });

    const work = await mergeSeriesIntoOneStory(series);

    const pins = await query<{ story_id: string | null; series_position: number | null }>(
      "select story_id, series_position from pile_pin"
    );
    expect(pins).toEqual([{ story_id: null, series_position: 3 }]);
    expect(work).toBeTruthy();
  });

  it("refuses a second merge of the same line, which is what the arrow is for", async () => {
    const { series } = await aLineOfTankobon(2);
    await mergeSeriesIntoOneStory(series);

    const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series));

    expect(refusal.code).toBe("not-allowed");
    expect(refusal.message).toMatch(/already publishes a Story/i);
  });

  it("refuses when two of the narratives are judged apart, because a work has one score", async () => {
    const { series, narratives } = await aLineOfTankobon(3);
    await setRating({ storyId: narratives[0], score: 9, provenanceId: "remembered" });
    await setRating({ storyId: narratives[1], score: 6, provenanceId: "remembered" });

    const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series));

    expect(refusal.code).toBe("not-allowed");
    expect(refusal.message).toMatch(/one score/i);
    expect(refusal.message).toMatch(/Nothing was merged/);
    const [count] = await query<{ count: string }>("select count(*) from story");
    expect(count.count).toBe("3");
    expect((await ledgerOf(series)).story_id).toBeNull();
  });

  it("refuses when a pass counted its way through one of the narratives", async () => {
    const { series, narratives } = await aLineOfTankobon(2);
    // The narrative under volume one is itself serialized, and a pass got to part three of it.
    // Three of *that* is not three of the line, so the collapse would change what the number
    // means rather than move it.
    await declareInstalments(narratives[0], 5);
    await recordPass({
      storyId: narratives[0],
      medium: "paper",
      provenanceId: "remembered",
      atInstalment: 3,
    });

    const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series));

    expect(refusal.code).toBe("not-allowed");
    expect(refusal.message).toMatch(/recorded how far it got/i);
    expect(refusal.message).toMatch(/Nothing was merged/);
    const [count] = await query<{ count: string }>("select count(*) from story");
    expect(count.count).toBe("2");
    expect((await ledgerOf(series)).story_id).toBeNull();
  });

  it("carries a pass that counted nothing, which is every ordinary pass", async () => {
    const { series, narratives } = await aLineOfTankobon(2);
    await recordPass({
      storyId: narratives[0],
      medium: "paper",
      provenanceId: "remembered",
      outcome: "finished",
    });

    const work = await mergeSeriesIntoOneStory(series);

    const [row] = await query<{ story_id: string; at_instalment: number | null }>(
      "select story_id, at_instalment from pass"
    );
    expect(row).toEqual({ story_id: work, at_instalment: null });
  });

  it("refuses a narrative another line's object carries too, which is not this line's to collapse", async () => {
    const { series, narratives } = await aLineOfTankobon(2);
    const omnibus = await volumeInTheHouse({
      title: "Slam Dunk Omnibus",
      publisher: "Planet Manga",
      binding: "omnibus",
      language: "it",
    });
    await recordVolumeCarriesStory(omnibus, narratives[1]);

    const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series));

    expect(refusal.code).toBe("not-allowed");
    expect(refusal.message).toMatch(/Nothing was merged/);
    const [count] = await query<{ count: string }>("select count(*) from story");
    expect(count.count).toBe("2");
  });

  it("refuses a line with no objects placed in it", async () => {
    const series = await blackEdition();

    const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series));

    expect(refusal.code).toBe("not-allowed");
    expect(refusal.message).toMatch(/no objects/i);
  });

  it("refuses a line whose objects carry no narrative at all", async () => {
    const series = await blackEdition();
    const volume = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 1 });

    const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series));

    expect(refusal.code).toBe("not-allowed");
    expect(refusal.message).toMatch(/carry no narrative/i);
  });

  it("refuses a Series the library does not know", async () => {
    const refusal = await refusalFrom(() =>
      mergeSeriesIntoOneStory("00000000-0000-4000-8000-000000000000")
    );
    expect(refusal.code).toBe("not-found");
  });

  it("leaves the work with one score to give", async () => {
    const { series } = await aLineOfTankobon(3);
    const work = await mergeSeriesIntoOneStory(series);

    await setRating({ storyId: work, score: 9, provenanceId: "remembered" });

    const [row] = await query<{ score: string }>("select score from rating where story_id = $1", [
      work,
    ]);
    expect(Number(row.score)).toBe(9);
  });

  // THE ARROW SET FROM THE STORY'S END.
  //
  // The same gesture, performed from the page the work is managed on: the owner is standing on
  // a Story and says *this line publishes this*. What is asserted here is that the collapse
  // lands on the work they were already looking at rather than on a narrative minted under
  // them, that the shelf and the ledger are as untouched as they are from the other end, and
  // that every refusal the gesture carries still refuses.
  describe("from the Story the owner is standing on", () => {
    /** A Story with nothing on it, standing for the work the owner already has a page for. */
    async function aWorkAlreadyInTheLibrary(title = "Slam Dunk"): Promise<string> {
      return createStory({ title, typeId: "manga" });
    }

    it("collapses the line onto the work the owner was already looking at", async () => {
      const work = await aWorkAlreadyInTheLibrary();
      const { series, objects, narratives } = await aLineOfTankobon(4);

      expect(await mergeSeriesIntoOneStory(series, { storyId: work })).toBe(work);

      for (const volume of objects) expect(await carriedBy(volume)).toEqual([work]);
      expect((await ledgerOf(series)).story_id).toBe(work);
      const titles = await query<{ title: string }>("select title from story");
      expect(titles).toEqual([{ title: "Slam Dunk" }]);
      expect(narratives).toHaveLength(4);
    });

    it("mints nothing and renames nothing: the work keeps its own title and count", async () => {
      const work = await aWorkAlreadyInTheLibrary("Slam Dunk, the whole run");
      await declareInstalments(work, 31);
      const { series } = await aLineOfTankobon(2);

      await mergeSeriesIntoOneStory(series, { storyId: work, title: "Ignored" });

      const [row] = await query<{ title: string; instalments: number | null }>(
        "select title, instalments from story where id = $1",
        [work]
      );
      expect(row).toEqual({ title: "Slam Dunk, the whole run", instalments: 31 });
    });

    it("leaves every Volume, every Acquisition and the ledger byte for byte as they were", async () => {
      const work = await aWorkAlreadyInTheLibrary();
      const { series } = await aLineOfTankobon(4);
      await declareSeriesCollected(series);
      const volumes = await snapshotOf("volume");
      const acquisitions = await snapshotOf("acquisition");
      const before = await ledgerOf(series);

      await mergeSeriesIntoOneStory(series, { storyId: work });

      expect(await snapshotOf("volume")).toEqual(volumes);
      expect(await snapshotOf("acquisition")).toEqual(acquisitions);
      expect(await ledgerOf(series)).toEqual({ ...before, story_id: work });
    });

    it("carries what the collapsed narratives held onto the work", async () => {
      const work = await aWorkAlreadyInTheLibrary();
      const { series, narratives } = await aLineOfTankobon(3);
      await setRating({ storyId: narratives[1], score: 9, provenanceId: "remembered" });
      await recordPass({
        storyId: narratives[0],
        medium: "paper",
        provenanceId: "remembered",
        outcome: "finished",
      });
      await openWant(narratives[2]);

      await mergeSeriesIntoOneStory(series, { storyId: work });

      expect(await query("select story_id from rating")).toEqual([{ story_id: work }]);
      expect(await query("select story_id from pass")).toEqual([{ story_id: work }]);
      expect(await query("select story_id from want")).toEqual([{ story_id: work }]);
    });

    it("keeps the work's own open Want rather than colliding with it", async () => {
      const work = await aWorkAlreadyInTheLibrary();
      await openWant(work);
      const { series, narratives } = await aLineOfTankobon(2);
      await openWant(narratives[0]);

      await mergeSeriesIntoOneStory(series, { storyId: work });

      expect(await query("select story_id from want")).toEqual([{ story_id: work }]);
    });

    it("keeps the work's own pin and its own stop rather than colliding with them", async () => {
      const work = await aWorkAlreadyInTheLibrary();
      const route = await definePath({ name: "Marvel" });
      await placeStoriesOnPath(route, [work]);
      await pinToPile({ kind: "story", id: work });
      const { series, narratives } = await aLineOfTankobon(2);
      await placeStoriesOnPath(route, [narratives[1]]);
      await pinToPile({ kind: "story", id: narratives[1] });

      await mergeSeriesIntoOneStory(series, { storyId: work });

      // One stop, at the place the owner had already decided for it: their own was the
      // earlier of the two, and the route holds one stop per Story either way.
      expect(await query("select story_id from path_item")).toEqual([{ story_id: work }]);
      expect(await query("select story_id from pile_pin")).toEqual([{ story_id: work }]);
    });

    it("is two ledgers over one narrative: a second line publishes it without minting anything", async () => {
      const { series: standard } = await aLineOfTankobon(3);
      const work = await mergeSeriesIntoOneStory(standard);
      const { series: deluxe, objects } = await aLineOfTankobon(2, "Ultimate Deluxe Edition");

      expect(await mergeSeriesIntoOneStory(deluxe, { storyId: work })).toBe(work);

      const [count] = await query<{ count: string }>("select count(*) from story");
      expect(count.count).toBe("1");
      expect((await ledgerOf(standard)).story_id).toBe(work);
      expect((await ledgerOf(deluxe)).story_id).toBe(work);
      for (const volume of objects) expect(await carriedBy(volume)).toEqual([work]);
    });

    it("refuses when the work and a narrative of the line are judged apart", async () => {
      const work = await aWorkAlreadyInTheLibrary();
      await setRating({ storyId: work, score: 9, provenanceId: "remembered" });
      const { series, narratives } = await aLineOfTankobon(2);
      await setRating({ storyId: narratives[0], score: 6, provenanceId: "remembered" });

      const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series, { storyId: work }));

      expect(refusal.code).toBe("not-allowed");
      expect(refusal.message).toMatch(/one score/i);
      expect(refusal.message).toMatch(/Nothing was merged/);
      const [count] = await query<{ count: string }>("select count(*) from story");
      expect(count.count).toBe("3");
      expect((await ledgerOf(series)).story_id).toBeNull();
    });

    it("refuses when a pass counted its way through one of the narratives", async () => {
      const work = await aWorkAlreadyInTheLibrary();
      const { series, narratives } = await aLineOfTankobon(2);
      await declareInstalments(narratives[0], 5);
      await recordPass({
        storyId: narratives[0],
        medium: "paper",
        provenanceId: "remembered",
        atInstalment: 3,
      });

      const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series, { storyId: work }));

      expect(refusal.code).toBe("not-allowed");
      expect(refusal.message).toMatch(/recorded how far it got/i);
      expect((await ledgerOf(series)).story_id).toBeNull();
    });

    it("refuses a line that already publishes a Story, which is what the arrow is for", async () => {
      const work = await aWorkAlreadyInTheLibrary();
      const { series } = await aLineOfTankobon(2);
      await mergeSeriesIntoOneStory(series, { storyId: work });

      const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series, { storyId: work }));

      expect(refusal.code).toBe("not-allowed");
      expect(refusal.message).toMatch(/already publishes a Story/i);
    });

    it("refuses a Story the library does not know, and a malformed one alike", async () => {
      const { series } = await aLineOfTankobon(2);

      for (const storyId of ["00000000-0000-4000-8000-000000000000", "banana"]) {
        const refusal = await refusalFrom(() => mergeSeriesIntoOneStory(series, { storyId }));
        expect(refusal.code).toBe("not-found");
        expect(refusal.message).toMatch(/not in the library/i);
      }
      expect((await ledgerOf(series)).story_id).toBeNull();
    });
  });
});
