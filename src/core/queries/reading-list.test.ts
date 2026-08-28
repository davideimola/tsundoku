import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { deactivatePath, definePath, placeStoryOnPath } from "../verbs/path.ts";
import { finishReading, recordReading } from "../verbs/reading.ts";
import { pinToReadingList, unpinFromReadingList } from "../verbs/reading-list.ts";
import { declareSeries, declareSeriesCollected, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import { openWish } from "../verbs/wish.ts";
import { composeReadingList } from "./reading-list.ts";

// Seam 1, and **the product** (#1). Everything asserted in this file is a derivation with
// no row behind it: the list, its order, the medium each entry is intended in, and the
// Wish an entry needing an object proposes without opening.

beforeEach(async () => {
  await query("truncate path, series, story, volume cascade");
});

/** *Angolo Giappone*, in the order the owner put it in. */
async function angoloGiappone(): Promise<{ pathId: string; stories: string[] }> {
  const pathId = await definePath({
    name: "Angolo Giappone",
    intent: "privilegiare titoli davvero coerenti con samurai e cultura giapponese",
  });

  const stories = [
    await createStory({ title: "Vagabond", typeId: "manga" }),
    await createStory({ title: "Lone Wolf and Cub", typeId: "manga" }),
  ];
  for (const story of stories) await placeStoryOnPath(pathId, story);

  return { pathId, stories };
}

describe("what the Reading list composes itself from", () => {
  it("offers the next unread Story of an active Path, and moves on when that one is read", async () => {
    const { stories } = await angoloGiappone();

    expect((await composeReadingList()).map((entry) => entry.story?.title)).toEqual(["Vagabond"]);

    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect((await composeReadingList()).map((entry) => entry.story?.title)).toEqual([
      "Lone Wolf and Cub",
    ]);
  });

  it("says which route an entry extends, and what the owner said that route is for", async () => {
    await angoloGiappone();

    const [entry] = await composeReadingList();

    expect(entry.because).toBe("path");
    expect(entry.path?.name).toBe("Angolo Giappone");
    expect(entry.path?.intent).toBe(
      "privilegiare titoli davvero coerenti con samurai e cultura giapponese"
    );
    expect(entry.series).toBeNull();
  });

  it("drops a route the owner put aside, and one they have walked to the end", async () => {
    const { pathId, stories } = await angoloGiappone();

    await deactivatePath(pathId);
    expect(await composeReadingList()).toEqual([]);

    // Walked out rather than put aside: every stop read, and the route contributes
    // nothing for a different reason and with the same answer.
    const walked = await definePath({ name: "Recupero Batman" });
    await placeStoryOnPath(walked, stories[0]);
    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect(await composeReadingList()).toEqual([]);
  });

  it("skips a Story the owner is in the middle of rather than telling them to start it", async () => {
    const { stories } = await angoloGiappone();

    await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" });

    expect((await composeReadingList()).map((entry) => entry.story?.title)).toEqual([
      "Lone Wolf and Cub",
    ]);
  });
});

describe("the intended medium each entry carries", () => {
  it("is digital where no object carries the Story: nothing to buy, start it tonight", async () => {
    await angoloGiappone();

    const [entry] = await composeReadingList();

    expect(entry.medium).toBe("digital");
    expect(entry.atHand).toBe(true);
    expect(entry.object).toBeNull();
  });

  it("is paper and at hand where the object is on the shelf", async () => {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);

    const [entry] = await composeReadingList();

    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(true);
    expect(entry.object?.title).toBe("Vagabond 1");
    expect(entry.object?.inTheHouse).toBe(true);
    expect(entry.object?.binding).toEqual({ id: "tankobon", name: "Tankōbon" });
  });

  it("is paper and not at hand where the library knows the object and the house does not hold it", async () => {
    const { stories } = await angoloGiappone();
    const { id } = await catalogueVolume({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(id, stories[0]);

    const [entry] = await composeReadingList();

    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(false);
    expect(entry.object?.inTheHouse).toBe(false);
  });

  it("prefers the object the house holds over one it does not, when both carry the Story", async () => {
    const { stories } = await angoloGiappone();
    const wanted = await catalogueVolume({
      title: "Vagabond Deluxe 1",
      publisher: "Planet Manga",
      binding: "deluxe",
      language: "it",
    });
    const held = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(wanted.id, stories[0]);
    await recordVolumeCarriesStory(held, stories[0]);

    const [entry] = await composeReadingList();

    // The owner can start it tonight, and an entry that offered to buy the deluxe while
    // the tankōbon sat on the shelf would be the shopping list talking over the Reading list.
    expect(entry.object?.title).toBe("Vagabond 1");
    expect(entry.atHand).toBe(true);
  });

  it("is not at hand again once the object has left the house", async () => {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);
    await releaseVolume(volumeId);

    const [entry] = await composeReadingList();

    expect(entry.atHand).toBe(false);
    expect(entry.object?.inTheHouse).toBe(false);
  });
});

describe("an entry that needs a Volume the owner does not own", () => {
  /** *Vagabond*, catalogued and never acquired: the entry has to be bought first. */
  async function toBuy(): Promise<{ storyId: string; volumeId: string }> {
    const { stories } = await angoloGiappone();
    const { id } = await catalogueVolume({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(id, stories[0]);
    return { storyId: stories[0], volumeId: id };
  }

  it("proposes a Wish naming that Volume", async () => {
    const { volumeId } = await toBuy();

    const [entry] = await composeReadingList();

    expect(entry.proposedWish).toEqual({ volumeId, priority: 2 });
  });

  it("proposes it and does not open it: reading the whole list leaves no Wish behind", async () => {
    await toBuy();

    const list = await composeReadingList();
    // Walked, entry by entry, the way a screen renders it and an assistant reads it.
    for (const entry of list) expect(entry.proposedWish ?? entry.object).toBeTruthy();

    const [{ wishes }] = await query<{ wishes: string }>("select count(*) as wishes from wish");
    expect(wishes).toBe("0");
  });

  it("stops proposing once the owner has opened the Wish themselves", async () => {
    const { volumeId } = await toBuy();

    await openWish({ volumeId, priority: 1 });

    const [entry] = await composeReadingList();
    expect(entry.wishAlreadyOpen).toBe(true);
    expect(entry.proposedWish).toBeNull();
    // Still to be bought. Meaning to buy it is not having it.
    expect(entry.atHand).toBe(false);
  });

  it("proposes nothing for an entry already on the shelf", async () => {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);

    const [entry] = await composeReadingList();
    expect(entry.proposedWish).toBeNull();
  });
});

describe("what the Series being collected contribute", () => {
  /** *Death Note Black Edition*: six out, one on the shelf, being collected. */
  async function blackEdition(): Promise<{ seriesId: string; volumeId: string }> {
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });
    const volumeId = await volumeInTheHouse({
      title: "Death Note Black Edition I",
      publisher: "Panini",
      editionLine: "Black Edition",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });
    await declareSeriesCollected(seriesId);

    return { seriesId, volumeId };
  }

  it("offers the first position the house has none of", async () => {
    const { seriesId } = await blackEdition();

    const [entry] = await composeReadingList();

    expect(entry.because).toBe("series");
    expect(entry.series).toEqual({
      id: seriesId,
      name: "Death Note",
      publisher: "Panini",
      editionLine: "Black Edition",
      position: 2,
      publishedCount: 6,
    });
    // A Series is a line of objects and says nothing about the narrative (ADR-0001).
    expect(entry.story).toBeNull();
    expect(entry.path).toBeNull();
  });

  it("is paper and has to be bought, whatever the library knows of the object", async () => {
    await blackEdition();

    const [entry] = await composeReadingList();

    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(false);
    // Nobody has catalogued volume 2, so there is nothing to wish for: recording the
    // object is the owner's act or an Inbox proposal, never this list's (ADR-0005).
    expect(entry.object).toBeNull();
    expect(entry.proposedWish).toBeNull();
  });

  it("proposes a Wish on the position the owner had and let go", async () => {
    const { seriesId } = await blackEdition();
    const second = await volumeInTheHouse({
      title: "Death Note Black Edition II",
      publisher: "Panini",
      editionLine: "Black Edition",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: second, seriesId, number: 2 });
    await releaseVolume(second);

    const [entry] = await composeReadingList();

    expect(entry.series?.position).toBe(2);
    expect(entry.object?.title).toBe("Death Note Black Edition II");
    expect(entry.proposedWish).toEqual({ volumeId: second, priority: 2 });
  });

  it("says nothing about a Series the owner never decided to collect", async () => {
    const seriesId = await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });
    const volumeId = await volumeInTheHouse({
      title: "Naruto 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });

    // Holding 1 of 72 opens no project, so nothing is missing from it (CONTEXT.md).
    expect(await composeReadingList()).toEqual([]);
  });

  it("says nothing about a Series being collected with nothing missing", async () => {
    const seriesId = await declareSeries({
      name: "Gotham Central",
      publisher: "Panini",
      publishedCount: 1,
      status: "concluded",
    });
    const volumeId = await volumeInTheHouse({
      title: "Gotham Central 1",
      publisher: "Panini",
      binding: "omnibus",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });
    await declareSeriesCollected(seriesId);

    expect(await composeReadingList()).toEqual([]);
  });

  it("comes after the routes, which are what the owner chose to read", async () => {
    await angoloGiappone();
    await blackEdition();

    expect((await composeReadingList()).map((entry) => entry.because)).toEqual(["path", "series"]);
  });
});

describe("the order the owner imposes with a pin", () => {
  it("brings a pinned source to the front, and the most recent pin leads", async () => {
    const recupero = await definePath({ name: "Recupero Batman" });
    await placeStoryOnPath(
      recupero,
      await createStory({ title: "Batman: Anno Uno", typeId: "comic" })
    );
    const technical = await definePath({ name: "Technical Leadership" });
    await placeStoryOnPath(
      technical,
      await createStory({ title: "The Manager's Path", typeId: "non-fiction" })
    );

    // Composed, the routes come back by name: Recupero Batman, then Technical Leadership.
    expect((await composeReadingList()).map((entry) => entry.path?.name)).toEqual([
      "Recupero Batman",
      "Technical Leadership",
    ]);

    await pinToReadingList({ kind: "path", id: technical });

    expect((await composeReadingList()).map((entry) => entry.path?.name)).toEqual([
      "Technical Leadership",
      "Recupero Batman",
    ]);

    // Pinning is saying *this next*, so the newer pin leads the older one.
    await pinToReadingList({ kind: "path", id: recupero });

    const pinned = await composeReadingList();
    expect(pinned.map((entry) => entry.path?.name)).toEqual([
      "Recupero Batman",
      "Technical Leadership",
    ]);
    expect(pinned.map((entry) => entry.pinned)).toEqual([true, true]);
  });

  it("puts a Series ahead of the routes when that is what the owner pinned", async () => {
    await angoloGiappone();
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);

    await pinToReadingList({ kind: "series", id: seriesId });

    expect((await composeReadingList()).map((entry) => entry.because)).toEqual(["series", "path"]);
  });

  it("gives the entry back its composed place when the pin is lifted", async () => {
    await angoloGiappone();
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);

    await pinToReadingList({ kind: "series", id: seriesId });
    await unpinFromReadingList({ kind: "series", id: seriesId });

    expect((await composeReadingList()).map((entry) => entry.because)).toEqual(["path", "series"]);
  });

  it("introduces nothing: a pin on a route put aside contributes no entry at all", async () => {
    const { pathId } = await angoloGiappone();

    await pinToReadingList({ kind: "path", id: pathId });
    await deactivatePath(pathId);

    // The pin is still stored, and the list is still composed. A pin is an order and
    // never an entry, so there is nothing here for it to bring to the front.
    expect(await composeReadingList()).toEqual([]);
    const [{ stored }] = await query<{ stored: string }>(
      "select count(*) as stored from reading_list_pin"
    );
    expect(stored).toBe("1");
  });
});

describe("where the Reading list is stored", () => {
  it("is nowhere: the only table this slice added holds pins, and holds nothing else", async () => {
    // The criterion, as a query. A `reading_list` table of entries is the failure mode
    // this whole slice is shaped to avoid, and its absence is worth asserting rather than
    // trusting: the `Prossimo` column of the spreadsheet is exactly such a table, kept by
    // hand and wrong the moment the owner finishes something (#1).
    const tables = await query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name like '%reading_list%'
        order by table_name`
    );
    expect(tables.map((table) => table.table_name)).toEqual(["reading_list_pin"]);

    const columns = await query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'reading_list_pin'
        order by column_name`
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      "path_id",
      "pinned_at",
      "series_id",
    ]);
  });
});
