import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { acquireVolume, releaseVolume } from "../verbs/collection.ts";
import {
  declareSeries,
  declareSeriesCollected,
  placeVolumeInSeries,
  recordVolumesPublished,
} from "../verbs/series.ts";
import { findSeries, listMissingVolumes, listSeries, listVolumesOutsideASeries } from "./series.ts";

// Seam 1, and the slice's whole point: **the missing Volumes are derived and never
// typed**. The four Death Note Black Edition rows the owner writes by hand in the
// spreadsheet today are `generate_series` against the shelf, so the assertion below is
// four numbers nobody entered.
beforeEach(async () => {
  await query("truncate table series, volume");
});

/** Own the numbered Volumes of a Series, as the owner does one purchase at a time. */
async function own(seriesId: string, title: string, numbers: number[]): Promise<string[]> {
  const ids: string[] = [];
  for (const number of numbers) {
    const volume = await acquireVolume({
      title: `${title} ${number}`,
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume.id, seriesId, number });
    ids.push(volume.id);
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
    await acquireVolume({
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
