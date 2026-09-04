import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { recordPass } from "../verbs/pass.ts";
import { declareSeries, declareSeriesCollected, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import { type Covered, libraryInFigures, thePile, unrecorded, whole } from "./library.ts";

// Seam 1, and this file is about **the coverage rather than the numbers**.
//
// The dashboard's figures are ordinary counts and one sum; what is worth a test is the
// second half of every answer — how much of the library the figure speaks for. Eighteen of
// seventy-seven acquisitions carry a price, so a total that arrived on its own would read
// as complete and would be a lie, and the page has no way to invent a denominator it was
// never given. That is what these assertions hold: the denominator comes back with the
// figure, always, and it is the count of records that *could* have carried the fact rather
// than the count that did.
beforeEach(async () => {
  await query("truncate table volume, story, series cascade");
});

describe("what the library is, in figures", () => {
  it("counts the Volumes in the house over the Volumes the library knows", async () => {
    await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    // Catalogued and never acquired: the library knows it, the house does not hold it.
    await catalogueVolume({
      title: "Slam Dunk 2",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    const { owned } = await libraryInFigures();

    expect(owned).toEqual({ figure: 1, from: 2, of: 2 });
    // Whole, and permanently so: every Volume says whether it is in the house.
    expect(whole(owned)).toBe(true);
  });

  it("stops counting a Volume that left the house", async () => {
    const id = await volumeInTheHouse({
      title: "Berserk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await releaseVolume(id);

    const { owned } = await libraryInFigures();

    expect(owned).toEqual({ figure: 0, from: 1, of: 1 });
  });

  it("counts the Series being collected over the Series declared", async () => {
    const collected = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });
    await declareSeriesCollected(collected);
    // Naruto: 42 of 72 on the shelf opens no project, so it is declared and not collected.
    await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });

    const { collecting } = await libraryInFigures();

    expect(collecting).toEqual({ figure: 1, from: 2, of: 2 });
  });

  it("adds up what every collected Series is missing, and never what an uncollected one is", async () => {
    const collected = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });
    const volume = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume, seriesId: collected, number: 1 });
    await declareSeriesCollected(collected);

    await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });

    const { missing } = await libraryInFigures();

    // Five of the Black Edition, and not one of Naruto's seventy-two: nothing is missing
    // from a Series the owner never decided to complete.
    expect(missing).toEqual({ figure: 5, from: 1, of: 1 });
  });

  it("says a collected Series with no published count recorded is outside the missing figure", async () => {
    const counted = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });
    await declareSeriesCollected(counted);
    // Collected, and nobody has recorded how many are out. Zero missing here is not a
    // complete Series — it is a Series the ledger cannot speak for.
    const uncounted = await declareSeries({
      name: "Vagabond",
      publisher: "Planet Manga",
      publishedCount: 0,
      status: "ongoing",
    });
    await declareSeriesCollected(uncounted);

    const { missing } = await libraryInFigures();

    expect(missing).toEqual({ figure: 6, from: 1, of: 2 });
    expect(whole(missing)).toBe(false);
  });

  it("adds up what was paid, over the acquisitions that carry a price", async () => {
    await volumeInTheHouse(
      { title: "Slam Dunk 1", publisher: "Planet Manga", binding: "tankobon", language: "it" },
      { pricePaid: "6.50" }
    );
    await volumeInTheHouse(
      { title: "Slam Dunk 2", publisher: "Planet Manga", binding: "tankobon", language: "it" },
      { pricePaid: "24.90" }
    );
    // No receipt: an acquisition with no price is the ordinary case in this library.
    await volumeInTheHouse({
      title: "Slam Dunk 3",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    const { spent } = await libraryInFigures();

    expect(spent).toEqual({ figure: "31.40", from: 2, of: 3 });
    expect(whole(spent)).toBe(false);
  });

  it("keeps what was paid for a Volume that has since left the house", async () => {
    const id = await volumeInTheHouse(
      { title: "Berserk 1", publisher: "Planet Manga", binding: "tankobon", language: "it" },
      { pricePaid: "9.90" }
    );
    await releaseVolume(id);

    const { spent, owned } = await libraryInFigures();

    // The money was spent. Selling the object does not unspend it, which is why the sum is
    // over every acquisition and not over the shelf.
    expect(spent).toEqual({ figure: "9.90", from: 1, of: 1 });
    expect(owned.figure).toBe(0);
  });

  it("answers a library with nothing in it without inventing a denominator", async () => {
    const { owned, collecting, missing, spent } = await libraryInFigures();

    expect(owned).toEqual({ figure: 0, from: 0, of: 0 });
    expect(collecting).toEqual({ figure: 0, from: 0, of: 0 });
    expect(missing).toEqual({ figure: 0, from: 0, of: 0 });
    expect(spent).toEqual({ figure: "0.00", from: 0, of: 0 });

    // Nothing recorded is not partial coverage: there was nothing to cover. What the page
    // says about an empty figure is decided by the figure being zero, not by the coverage.
    expect(whole(spent)).toBe(true);
  });
});

// The two predicates the whole contract turns on, tested as arithmetic rather than through a
// query: they are the line between *nobody wrote this down* and *there was nothing to write*,
// and a screen that got it backwards would print a dash over a fact the library knows, or a
// zero over one it does not.
describe("how far a figure can be read", () => {
  const figure = (from: number, of: number): Covered<number> => ({ figure: 0, from, of });

  it.each([
    [0, 0, "an empty library"],
    [3, 3, "every record carrying the fact"],
  ])("is whole at %i of %i — %s", (from, of) => {
    expect(whole(figure(from, of))).toBe(true);
    expect(unrecorded(figure(from, of))).toBe(false);
  });

  it("is short where some records carry the fact and some do not", () => {
    expect(whole(figure(18, 77))).toBe(false);
    // Short is not the same as unprintable: eighteen prices are a floor, and a floor is worth
    // printing beside what it was counted over.
    expect(unrecorded(figure(18, 77))).toBe(false);
  });

  it("is unrecorded only where the records exist and not one of them carries the fact", () => {
    expect(unrecorded(figure(0, 77))).toBe(true);
    expect(whole(figure(0, 77))).toBe(false);
  });

  // The case that makes `unrecorded` more than `from === 0`. Nothing bought is a measurement:
  // the figure is a true zero and hiding it behind a dash would be the mirror-image lie.
  it("does not call an empty library unrecorded", () => {
    expect(unrecorded(figure(0, 0))).toBe(false);
  });
});

describe("the pile", () => {
  /** A Story nobody has opened, which is what puts it in the pile. */
  async function unread(title: string): Promise<string> {
    return createStory({ title, typeId: "manga" });
  }

  it("is the Stories with no Pass, counted against every Story there is", async () => {
    await unread("Vinland Saga");
    await unread("Vagabond");

    const read = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await recordPass({
      storyId: read,
      medium: "paper",
      provenanceId: "remembered",
      outcome: "finished",
    });

    const pile = await thePile();

    expect(pile.spines.map((spine) => spine.title)).toEqual(["Vagabond", "Vinland Saga"]);
    expect(pile.stories).toBe(3);
  });

  it("leaves out a Story being reread, because it is in the owner's hands", async () => {
    const reread = await createStory({ title: "Berserk", typeId: "manga" });
    await recordPass({
      storyId: reread,
      medium: "paper",
      provenanceId: "remembered",
      outcome: "finished",
    });
    await recordPass({ storyId: reread, medium: "paper", provenanceId: "remembered" });

    const pile = await thePile();

    expect(pile.spines).toEqual([]);
    expect(pile.stories).toBe(1);
  });

  it("carries the line each spine stands in, so the pile is drawn in the shelf's colours", async () => {
    const story = await unread("Death Note");
    const series = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });
    const volume = await volumeInTheHouse({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 1 });
    await recordVolumeCarriesStory(volume, story);

    const [spine] = (await thePile()).spines;

    expect(spine?.series).toEqual({
      id: series,
      name: "Death Note",
      editionLine: "Black Edition",
    });
  });

  it("is empty, and says how many Stories it is empty of", async () => {
    const pile = await thePile();

    expect(pile).toEqual({ spines: [], stories: 0 });
  });
});
