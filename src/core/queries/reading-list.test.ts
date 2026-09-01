import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { deactivatePath, definePath, placeStoriesOnPath } from "../verbs/path.ts";
import { finishReading, recordReading } from "../verbs/reading.ts";
import { pinToReadingList, unpinFromReadingList } from "../verbs/reading-list.ts";
import { declareSeries, declareSeriesCollected, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import { openWant } from "../verbs/want.ts";
import { openWish } from "../verbs/wish.ts";
import { composeReadingList, type ReadingListEntry } from "./reading-list.ts";

// Seam 1, and **the product** (#1). Everything asserted in this file is a derivation with
// no row behind it: the two halves of the list, their order, the reasons each row carries,
// the medium each entry is intended in, and the Wish an entry needing an object proposes
// without opening.

beforeEach(async () => {
  await query("truncate path, series, story, volume cascade");
});

/** The reserve, which is where everything composes before the owner has decided anything. */
async function reserve(): Promise<ReadingListEntry[]> {
  return (await composeReadingList()).reserve;
}

/** What a row is called, which for a Story is its title and for a line its position. */
function called(entry: ReadingListEntry): string {
  return (
    entry.story?.title ?? `${entry.reasons[0]?.series?.name} ${entry.reasons[0]?.series?.position}`
  );
}

/** Which sources put a row on the list, in the order they were composed. */
function why(entry: ReadingListEntry): string[] {
  return entry.reasons.map((reason) => reason.because);
}

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
  await placeStoriesOnPath(pathId, stories);

  return { pathId, stories };
}

describe("what the Reading list composes itself from", () => {
  it("offers every unread stop of an active Path, in the owner's order", async () => {
    await angoloGiappone();

    // Not one stop but the queue behind it: what stands second cannot be pinned before
    // the owner can see it, and *three Marvel stories and then a DC one* is exactly that
    // (#40).
    expect((await reserve()).map(called)).toEqual(["Vagabond", "Lone Wolf and Cub"]);
  });

  it("drops a stop the owner has read, and the rest of the route closes up", async () => {
    const { stories } = await angoloGiappone();

    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect((await reserve()).map(called)).toEqual(["Lone Wolf and Cub"]);
  });

  it("says which route an entry stands on, what that route is for, and where on it", async () => {
    await angoloGiappone();

    const [first, second] = await reserve();

    expect(why(first)).toEqual(["path"]);
    expect(first.reasons[0].path?.name).toBe("Angolo Giappone");
    expect(first.reasons[0].path?.intent).toBe(
      "privilegiare titoli davvero coerenti con samurai e cultura giapponese"
    );
    // Where on the route, counted over what is still to read: one is what comes next.
    expect(first.reasons[0].path?.place).toBe(1);
    expect(second.reasons[0].path?.place).toBe(2);
    expect(first.reasons[0].series).toBeNull();
  });

  it("drops a route the owner put aside, and one they have walked to the end", async () => {
    const { pathId, stories } = await angoloGiappone();

    await deactivatePath(pathId);
    expect(await reserve()).toEqual([]);

    // Walked out rather than put aside: every stop read, and the route contributes
    // nothing for a different reason and with the same answer.
    const walked = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(walked, [stories[0]]);
    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect(await reserve()).toEqual([]);
  });

  it("skips a Story the owner is in the middle of rather than telling them to start it", async () => {
    const { stories } = await angoloGiappone();

    await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" });

    expect((await reserve()).map(called)).toEqual(["Lone Wolf and Cub"]);
  });
});

describe("one Story is one row, however many reasons put it there", () => {
  it("names all three where it is wanted and stands on two routes", async () => {
    const storyId = await createStory({ title: "Batman: Anno Uno", typeId: "comic" });
    const marvel = await definePath({ name: "Marvel" });
    const dc = await definePath({ name: "DC" });
    await placeStoriesOnPath(marvel, [storyId]);
    await placeStoriesOnPath(dc, [storyId]);
    await openWant(storyId);

    const rows = await reserve();

    // One row and not three: the same answer written three times is not three answers.
    expect(rows).toHaveLength(1);
    expect(why(rows[0])).toEqual(["want", "path", "path"]);
    expect(rows[0].reasons.map((reason) => reason.path?.name ?? null)).toEqual([
      null,
      "DC",
      "Marvel",
    ]);
    expect(rows[0].reasons[0].want?.id).toBeTruthy();
  });

  it("enters the list where its first reason put it: the Want, ahead of the routes", async () => {
    const { stories } = await angoloGiappone();
    // The route's *second* stop, wanted as well. It leads, because a Want is the last thing
    // the owner said.
    await openWant(stories[1]);

    expect((await reserve()).map(called)).toEqual(["Lone Wolf and Cub", "Vagabond"]);
    expect(why((await reserve())[0])).toEqual(["want", "path"]);
  });

  it("is one row per Series position, which merges with no narrative", async () => {
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);
    const storyId = await createStory({ title: "Death Note", typeId: "manga" });
    await openWant(storyId);

    // A Series names an object and a Want names a narrative (ADR-0001), so these are two
    // rows even where the owner would say one word for both.
    const rows = await reserve();
    expect(rows).toHaveLength(2);
    expect(rows.map(why)).toEqual([["want"], ["series"]]);
  });
});

describe("what a Want puts on the list", () => {
  it("puts the Story there with no Path and no Series involved", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await openWant(storyId);

    const [entry] = await reserve();
    expect(why(entry)).toEqual(["want"]);
    expect(entry.story?.title).toBe("Slam Dunk");
    expect(entry.subject).toEqual({ kind: "story", id: storyId });
    expect(entry.reasons[0].path).toBeNull();
    expect(entry.reasons[0].series).toBeNull();
    expect(entry.reasons[0].want?.id).toBeTruthy();

    // Said again as the criterion it is: wanting to read something cost a named, ordered
    // route before this, and now it costs neither a route nor a line.
    const [{ routes }] = await query<{ routes: string }>("select count(*) as routes from path");
    expect(routes).toBe("0");
  });

  it("stays on the list when the Story was read years ago, and calls it nothing special", async () => {
    const storyId = await createStory({ title: "Berserk", typeId: "manga" });
    await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "goodreads-history",
      startedOn: "2019-03-01",
      endedOn: "2019-04-01",
      outcome: "finished",
    });

    await openWant(storyId);

    const [entry] = await reserve();
    expect(why(entry)).toEqual(["want"]);
    expect(entry.story?.title).toBe("Berserk");
    // A planned reread is an ordinary entry: there is no field anywhere saying it is one,
    // and the entry carries the same facts every other entry does.
    expect(Object.keys(entry).sort()).toEqual(
      [
        "atHand",
        "medium",
        "object",
        "proposedWish",
        "reasons",
        "story",
        "subject",
        "wishAlreadyOpen",
      ].sort()
    );
  });

  it("falls quiet once a Reading begins after it, and the ordinary case behaves identically", async () => {
    const storyId = await createStory({ title: "Vagabond", typeId: "manga" });
    await openWant(storyId);

    expect(await reserve()).toHaveLength(1);

    await recordReading({ storyId, medium: "digital", provenanceId: "remembered" });

    expect(await reserve()).toEqual([]);
  });

  it("leads the reserve, newest Want first, ahead of the routes and the ledger", async () => {
    const { pathId } = await angoloGiappone();
    expect(pathId).toBeTruthy();
    const first = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const second = await createStory({ title: "One-Punch Man", typeId: "manga" });

    await openWant(first);
    await openWant(second);

    expect((await reserve()).map(called)).toEqual([
      "One-Punch Man",
      "Slam Dunk",
      "Vagabond",
      "Lone Wolf and Cub",
    ]);
  });

  it("follows the object the same way a route's stop does", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const volumeId = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, storyId);

    await openWant(storyId);

    const [entry] = await reserve();
    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(true);
    expect(entry.object?.title).toBe("Slam Dunk 1");
  });

  it("writes nothing by being read: the row is exactly the one the verb wrote", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await openWant(storyId);

    await composeReadingList();
    await composeReadingList();

    expect(await query("select story_id from want")).toEqual([{ story_id: storyId }]);
  });
});

describe("the intended medium each entry carries", () => {
  it("is digital where no object carries the Story: nothing to buy, start it tonight", async () => {
    await angoloGiappone();

    const [entry] = await reserve();

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

    const [entry] = await reserve();

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

    const [entry] = await reserve();

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

    const [entry] = await reserve();

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

    const [entry] = await reserve();

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

    const [entry] = await reserve();

    expect(entry.proposedWish).toEqual({ volumeId, priority: 2 });
  });

  it("proposes it and does not open it: reading the whole list leaves no Wish behind", async () => {
    await toBuy();

    const { head, reserve: rest } = await composeReadingList();
    // Walked, entry by entry, the way a screen renders it and an assistant reads it.
    for (const entry of [...head, ...rest]) expect(entry.reasons.length).toBeGreaterThan(0);

    const [{ wishes }] = await query<{ wishes: string }>("select count(*) as wishes from wish");
    expect(wishes).toBe("0");
  });

  it("stops proposing once the owner has opened the Wish themselves", async () => {
    const { volumeId } = await toBuy();

    await openWish({ volumeId, priority: 1 });

    const [entry] = await reserve();
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

    const [entry] = await reserve();
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

    const [entry] = await reserve();

    expect(why(entry)).toEqual(["series"]);
    expect(entry.reasons[0].series).toEqual({
      id: seriesId,
      name: "Death Note",
      publisher: "Panini",
      editionLine: "Black Edition",
      position: 2,
      publishedCount: 6,
    });
    // The subject is the position and not the line: what is pinned is one object to buy.
    expect(entry.subject).toEqual({ kind: "series", id: seriesId, position: 2 });
    // A Series is a line of objects and says nothing about the narrative (ADR-0001).
    expect(entry.story).toBeNull();
    expect(entry.reasons[0].path).toBeNull();
  });

  it("is paper and has to be bought, whatever the library knows of the object", async () => {
    await blackEdition();

    const [entry] = await reserve();

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

    const [entry] = await reserve();

    expect(entry.reasons[0].series?.position).toBe(2);
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
    expect(await reserve()).toEqual([]);
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

    expect(await reserve()).toEqual([]);
  });

  it("comes after the routes, which are what the owner chose to read", async () => {
    await angoloGiappone();
    await blackEdition();

    expect((await reserve()).map(why)).toEqual([["path"], ["path"], ["series"]]);
  });
});

// **The head and the reserve** (#40). The list stops being one flat answer: a short head the
// owner pinned, in the order they pinned it, and a reserve that composes itself and is
// deliberately unordered. The pin is the whole of what separates them.
describe("the head the owner pinned", () => {
  it("holds the pinned rows and the reserve holds the rest, with nothing in both", async () => {
    const { stories } = await angoloGiappone();

    await pinToReadingList({ kind: "story", id: stories[1] });

    const { head, reserve: rest } = await composeReadingList();
    expect(head.map(called)).toEqual(["Lone Wolf and Cub"]);
    expect(rest.map(called)).toEqual(["Vagabond"]);
  });

  it("reads newest pin first, because a pin is the most recent decision", async () => {
    const first = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const second = await createStory({ title: "Berserk", typeId: "manga" });
    await openWant(first);
    await openWant(second);

    await pinToReadingList({ kind: "story", id: first });
    await pinToReadingList({ kind: "story", id: second });

    expect((await composeReadingList()).head.map(called)).toEqual(["Berserk", "Slam Dunk"]);
  });

  it("takes the second and third stop of one route, in pin order", async () => {
    // The sentence this whole slice exists for: three Marvel stories, and then a DC one.
    const marvel = await definePath({ name: "Marvel" });
    const stops = [
      await createStory({ title: "Daredevil: Born Again", typeId: "comic" }),
      await createStory({ title: "Ultimate Spider-Man", typeId: "comic" }),
      await createStory({ title: "Civil War", typeId: "comic" }),
    ];
    await placeStoriesOnPath(marvel, stops);
    const dc = await definePath({ name: "DC" });
    const batman = await createStory({ title: "Batman: Anno Uno", typeId: "comic" });
    await placeStoriesOnPath(dc, [batman]);

    await pinToReadingList({ kind: "story", id: stops[0] });
    await pinToReadingList({ kind: "story", id: stops[1] });
    await pinToReadingList({ kind: "story", id: stops[2] });
    await pinToReadingList({ kind: "story", id: batman });

    // Pinned in reading order, so the head reads back newest first. What matters is that
    // three stops of one route stand in it at once, which a pin on the *route* could never
    // have said.
    const { head, reserve: rest } = await composeReadingList();
    expect(head.map(called)).toEqual([
      "Batman: Anno Uno",
      "Civil War",
      "Ultimate Spider-Man",
      "Daredevil: Born Again",
    ]);
    expect(rest).toEqual([]);
  });

  it("has no cap: a head of twenty is the owner's to prune", async () => {
    const path = await definePath({ name: "Everything" });
    const stops = [];
    for (let n = 1; n <= 20; n++) {
      stops.push(
        await createStory({ title: `Story ${String(n).padStart(2, "0")}`, typeId: "comic" })
      );
    }
    await placeStoriesOnPath(path, stops);
    for (const storyId of stops) await pinToReadingList({ kind: "story", id: storyId });

    // Twenty decisions look wrong on a screen, and the library refuses none of them: a cap
    // here would be an opinion nobody asked it for.
    const { head, reserve: rest } = await composeReadingList();
    expect(head).toHaveLength(20);
    expect(rest).toEqual([]);
  });

  it("takes a Series position, which is the shopping half of the same list", async () => {
    await angoloGiappone();
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);

    await pinToReadingList({ kind: "series", id: seriesId, position: 1 });

    const { head } = await composeReadingList();
    expect(head.map(why)).toEqual([["series"]]);
    expect(head[0].subject).toEqual({ kind: "series", id: seriesId, position: 1 });
  });

  it("gives the entry back its composed place when the pin is lifted", async () => {
    const { stories } = await angoloGiappone();

    await pinToReadingList({ kind: "story", id: stories[1] });
    await unpinFromReadingList({ kind: "story", id: stories[1] });

    const { head, reserve: rest } = await composeReadingList();
    expect(head).toEqual([]);
    expect(rest.map(called)).toEqual(["Vagabond", "Lone Wolf and Cub"]);
  });

  it("introduces nothing: a pin on a Story no source names contributes no entry at all", async () => {
    const { pathId, stories } = await angoloGiappone();

    await pinToReadingList({ kind: "story", id: stories[0] });
    await deactivatePath(pathId);

    // The pin is still stored, and the list is still composed. A pin is an order and
    // never an entry, so there is nothing here for it to bring to the front.
    expect(await composeReadingList()).toEqual({ head: [], reserve: [] });
    const [{ stored }] = await query<{ stored: string }>(
      "select count(*) as stored from reading_list_pin"
    );
    expect(stored).toBe("1");
  });

  it("carries every reason the pinned row has, exactly as the reserve would", async () => {
    const storyId = await createStory({ title: "Batman: Anno Uno", typeId: "comic" });
    const dc = await definePath({ name: "DC" });
    await placeStoriesOnPath(dc, [storyId]);
    await openWant(storyId);

    await pinToReadingList({ kind: "story", id: storyId });

    const { head } = await composeReadingList();
    expect(why(head[0])).toEqual(["want", "path"]);
  });
});

describe("where the Reading list is stored", () => {
  it("is nowhere: the only table this area added holds pins, and holds nothing else", async () => {
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
      "pinned_at",
      "series_id",
      "series_position",
      "story_id",
    ]);
  });
});

// **The list gained the shelf's vocabulary** (#29). An entry is drawn as the tile the walls
// are laid out as, so it carries the two facts a tile is made of: the line the object stands
// in, which is what tints it and which number it wears at the foot, and the jacket it is
// faced with. All three are the **object's**, because a Story has no Series and no ISBN of
// its own (ADR-0001) — and they come off the object the entry already named rather than from
// a second pick nobody can see, which is what stops the tile from showing one edition while
// the row names another.
describe("what an entry's tile is drawn from", () => {
  /** *Vagabond*, on a route, carried by an object of a Series the owner is collecting. */
  async function carriedByAVolumeInALine(): Promise<{ seriesId: string; volumeId: string }> {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    const seriesId = await declareSeries({
      name: "Vagabond",
      publisher: "Planet Manga",
      publishedCount: 37,
      status: "concluded",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });

    return { seriesId, volumeId };
  }

  it("carries the line the object stands in and the position it stands at", async () => {
    const { seriesId } = await carriedByAVolumeInALine();

    const [entry] = await reserve();

    expect(entry.object?.seriesId).toBe(seriesId);
    expect(entry.object?.seriesNumber).toBe(1);
  });

  it("carries the jacket the object is faced with", async () => {
    const { volumeId } = await carriedByAVolumeInALine();
    await query(
      `update volume set cover_source = 'google-books', cover_url = $2, cover_looked_up_at = now()
        where id = $1`,
      [volumeId, "https://books.google.com/books/content?id=njT&img=1&zoom=5"]
    );

    const [entry] = await reserve();

    expect(entry.object?.cover).toMatchObject({
      url: "https://books.google.com/books/content?id=njT&img=1&zoom=5",
    });
  });

  // The ordinary answer and not a gap, the same one the walls get: an object nobody has
  // placed in a line has no colour to wear and no number to print, and the tile drawn for it
  // falls back to the palette's own paper.
  it("stands in no line and is faced with nothing where the object is in neither", async () => {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);

    const [entry] = await reserve();

    expect(entry.object).toMatchObject({ seriesId: null, seriesNumber: null, cover: null });
  });
});
