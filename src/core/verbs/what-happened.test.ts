import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listStoriesInVolume } from "../queries/story-to-volume.ts";
import { declareSeries, recordSeriesPublishesStory } from "./series.ts";
import { createStory } from "./story.ts";
import { sayWhatHappened } from "./what-happened.ts";

// Seam 1, and the whole of this slice's seam: the door is a verb, and both surfaces over it
// are thin adapters (ADR-0002). What is asserted is what the database then holds — the object,
// the acquisition, the narrative and the link between them — because the point of one door is
// that three records land together, and a test that only read one of them back would pass on
// exactly the drift this exists to end.

// `path` joins the list because one test below asserts that the door says nothing about a
// route, and *nothing about a route* is a claim about an empty table: a Path left standing by
// an earlier file would fail it, which is a fact about the run order rather than about the
// door. Every other file that reads that table clears it the same way.
beforeEach(async () => {
  await query("truncate story, volume, series, want, wish, path cascade");
});

const TANKOBON = {
  publisher: "Planet Manga",
  binding: "tankobon",
  language: "it",
} as const;

/** What is actually stored about an object, read back by title. */
async function theObject(title: string) {
  return query<{
    id: string;
    publisher: string;
    seriesNumber: number | null;
    inTheHouse: boolean;
    pricePaid: string | null;
  }>(
    `select v.id,
            v.publisher,
            v.series_number as "seriesNumber",
            exists (select 1 from acquisition a
                     where a.volume_id = v.id and a.released_on is null) as "inTheHouse",
            (select a.price_paid::text from acquisition a where a.volume_id = v.id limit 1)
              as "pricePaid"
       from volume v
      where v.title = $1`,
    [title]
  );
}

/** Every narrative the library holds, by title — the count is what most of this file is about. */
async function stories(): Promise<{ id: string; title: string }[]> {
  return query("select id, title from story order by title");
}

async function readings(): Promise<
  { story_id: string; medium: string; volume_id: string | null; outcome: string | null }[]
> {
  return query("select story_id, medium, volume_id, outcome from reading");
}

async function wants(): Promise<{ story_id: string }[]> {
  return query("select story_id from want");
}

/** Every open intention to buy, as the shopping list reads it. */
async function wishes(): Promise<
  { volume_id: string; priority: number; price_found: string | null; shop: string | null }[]
> {
  return query("select volume_id, priority, price_found, shop from wish where closed_on is null");
}

describe("I bought it", () => {
  it("records the object, says it is in the house, and the Story appears by itself", async () => {
    const said = await sayWhatHappened({
      title: "Slam Dunk 21",
      typeId: "manga",
      said: "bought",
      object: { ...TANKOBON, isbn: "9788828765431", pricePaid: "6,50", acquiredOn: "2026-03-11" },
    });

    const [object] = await theObject("Slam Dunk 21");
    expect(object).toMatchObject({ publisher: "Planet Manga", inTheHouse: true });
    expect(object.pricePaid).toBe("6.50");

    // The narrative, which nobody asked for and nobody typed.
    expect(await stories()).toEqual([{ id: said.storyId, title: "Slam Dunk 21" }]);
    expect(said.storyAppeared).toBe(true);
    expect(said.volumeId).toBe(object.id);

    // And the link, which used to be the third act on a third screen.
    expect(await listStoriesInVolume(object.id)).toMatchObject([{ id: said.storyId }]);
  });

  it("attaches to the work its line publishes rather than minting a Story", async () => {
    const slamDunk = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 21,
      status: "concluded",
    });
    await recordSeriesPublishesStory(seriesId, slamDunk);

    const said = await sayWhatHappened({
      title: "Slam Dunk 21",
      typeId: "manga",
      said: "bought",
      object: { ...TANKOBON, inSeries: { seriesId, number: 21 } },
    });

    // One narrative in the library, and it is the one that was already there.
    expect(await stories()).toEqual([{ id: slamDunk, title: "Slam Dunk" }]);
    expect(said.storyId).toBe(slamDunk);
    expect(said.storyAppeared).toBe(false);

    const [object] = await theObject("Slam Dunk 21");
    expect(object.seriesNumber).toBe(21);
    expect(await listStoriesInVolume(object.id)).toMatchObject([{ id: slamDunk }]);
  });

  it("mints one Story per object where the line names no work", async () => {
    const seriesId = await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });

    await sayWhatHappened({
      title: "Naruto 1",
      typeId: "manga",
      said: "bought",
      object: { ...TANKOBON, inSeries: { seriesId, number: 1 } },
    });
    await sayWhatHappened({
      title: "Naruto 2",
      typeId: "manga",
      said: "bought",
      object: { ...TANKOBON, inSeries: { seriesId, number: 2 } },
    });

    expect((await stories()).map((one) => one.title)).toEqual(["Naruto 1", "Naruto 2"]);
  });

  // **The half-placement, and it is the case this door exists to prevent.** A line chosen with
  // no position in it used to be a placement quietly dropped — and on a line that names a work
  // that is a second narrative minted for a volume that already had one, which is exactly the
  // drift the whole ticket is about. Either half means the owner meant to place it, and the
  // verb refuses the half that is missing.
  it("refuses a line chosen with no position rather than minting a second narrative", async () => {
    const slamDunk = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 21,
      status: "concluded",
    });
    await recordSeriesPublishesStory(seriesId, slamDunk);

    await expect(
      sayWhatHappened({
        title: "Slam Dunk 21",
        typeId: "manga",
        said: "bought",
        object: { ...TANKOBON, inSeries: { seriesId, number: Number.NaN } },
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      message: "A position in a Series is a whole number: 1, 2, 3.",
    });

    expect(await stories()).toEqual([{ id: slamDunk, title: "Slam Dunk" }]);
    expect(await theObject("Slam Dunk 21")).toEqual([]);
  });

  it("refuses a position given with no line", async () => {
    await expect(
      sayWhatHappened({
        title: "Slam Dunk 21",
        typeId: "manga",
        said: "bought",
        object: { ...TANKOBON, inSeries: { seriesId: "", number: 21 } },
      })
    ).rejects.toMatchObject({ name: "Refusal", message: "No Series has that id." });

    expect(await theObject("Slam Dunk 21")).toEqual([]);
  });

  it("leaves nothing behind when one half of it is refused", async () => {
    await expect(
      sayWhatHappened({
        title: "Slam Dunk 21",
        typeId: "manga",
        said: "bought",
        object: { ...TANKOBON, binding: "banana" },
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      message: "That is not a Binding. The pickers offer the ones the model knows.",
    });

    expect(await theObject("Slam Dunk 21")).toEqual([]);
    expect(await stories()).toEqual([]);
  });

  it("refuses a Type this library does not know, and catalogues no object either", async () => {
    await expect(
      sayWhatHappened({
        title: "Slam Dunk 21",
        typeId: "banana",
        said: "bought",
        object: { ...TANKOBON },
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      message: "That is not a Type this library knows.",
    });

    expect(await theObject("Slam Dunk 21")).toEqual([]);
  });

  it("refuses a position of the line the house already holds, and keeps the first", async () => {
    const seriesId = await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });

    await sayWhatHappened({
      title: "Naruto 1",
      typeId: "manga",
      said: "bought",
      object: { ...TANKOBON, inSeries: { seriesId, number: 1 } },
    });

    await expect(
      sayWhatHappened({
        title: "Naruto 1, again",
        typeId: "manga",
        said: "bought",
        object: { ...TANKOBON, inSeries: { seriesId, number: 1 } },
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      message: "That position of the Series is already in the house.",
    });

    expect((await stories()).map((one) => one.title)).toEqual(["Naruto 1"]);
  });
});

describe("I read it", () => {
  it("records a Reading with no object at all, and the Story appears", async () => {
    const said = await sayWhatHappened({
      title: "Daredevil: L'Uomo Senza Paura",
      typeId: "comic",
      said: "read",
    });

    expect(await stories()).toEqual([{ id: said.storyId, title: "Daredevil: L'Uomo Senza Paura" }]);
    expect(said.volumeId).toBeNull();

    expect(await readings()).toEqual([
      { story_id: said.storyId, medium: "digital", volume_id: null, outcome: "finished" },
    ]);

    // Nothing about an object was recorded, which is the case this door exists for.
    expect(await query("select id from volume")).toEqual([]);
  });

  it("refuses a title with nothing in it", async () => {
    await expect(
      sayWhatHappened({ title: "   ", typeId: "comic", said: "read" })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "Say what it is called first — a title, or the barcode on the back.",
    });

    expect(await stories()).toEqual([]);
  });
});

describe("I want to read it", () => {
  it("opens a Want on the Story that appeared, and records no object", async () => {
    const said = await sayWhatHappened({ title: "Vagabond", typeId: "manga", said: "wanted" });

    expect(await stories()).toEqual([{ id: said.storyId, title: "Vagabond" }]);
    expect(await wants()).toEqual([{ story_id: said.storyId }]);
    expect(await query("select id from volume")).toEqual([]);
    expect(await readings()).toEqual([]);
  });

  it("says nothing about a Path, a Wish or an order", async () => {
    await sayWhatHappened({ title: "Vagabond", typeId: "manga", said: "wanted" });

    expect(await query("select id from path")).toEqual([]);
    expect(await query("select id from wish")).toEqual([]);
  });
});

describe("I want to buy it", () => {
  it("catalogues the object without bringing it home, and opens a Wish on it", async () => {
    const said = await sayWhatHappened({
      title: "Vinland Saga 1",
      typeId: "manga",
      said: "wished",
      object: {
        ...TANKOBON,
        priority: 1,
        targetPrice: "15,00",
        priceFound: "12,90",
        shop: "Star Shop",
      },
    });

    // Catalogued and not owned, which is the pair ADR-0007 keeps apart and the whole of this
    // sentence: the object is a row the library knows and the house does not hold.
    const [object] = await theObject("Vinland Saga 1");
    expect(object).toMatchObject({ publisher: "Planet Manga", inTheHouse: false });
    expect(said.volumeId).toBe(object.id);

    expect(await wishes()).toEqual([
      { volume_id: object.id, priority: 1, price_found: "12.90", shop: "Star Shop" },
    ]);

    // And the narrative, which nobody asked for here either.
    expect(await stories()).toEqual([{ id: said.storyId, title: "Vinland Saga 1" }]);
    expect(said.storyAppeared).toBe(true);
    expect(await listStoriesInVolume(object.id)).toMatchObject([{ id: said.storyId }]);
  });

  it("says nothing about reading it: no Want, no Reading", async () => {
    await sayWhatHappened({
      title: "Vinland Saga 1",
      typeId: "manga",
      said: "wished",
      object: { ...TANKOBON, priority: 2 },
    });

    expect(await wants()).toEqual([]);
    expect(await readings()).toEqual([]);
  });

  // **The arrow is read on a line the object has not joined**, which is what keeps a wished-for
  // twenty-first tankōbon from minting a twenty-first narrative. What is not written is the
  // position: a position of a Series is filled by an object on the shelf.
  it("joins the work its line publishes, and takes no position of it", async () => {
    const slamDunk = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 21,
      status: "concluded",
    });
    await recordSeriesPublishesStory(seriesId, slamDunk);

    const said = await sayWhatHappened({
      title: "Slam Dunk 21",
      typeId: "manga",
      said: "wished",
      object: { ...TANKOBON, priority: 3, inSeries: { seriesId } },
    });

    expect(await stories()).toEqual([{ id: slamDunk, title: "Slam Dunk" }]);
    expect(said.storyId).toBe(slamDunk);
    expect(said.storyAppeared).toBe(false);

    const [object] = await theObject("Slam Dunk 21");
    expect(object.seriesNumber).toBeNull();
    expect(object.inTheHouse).toBe(false);
    expect(await listStoriesInVolume(object.id)).toMatchObject([{ id: slamDunk }]);
  });

  it("mints its own narrative where the line names no work", async () => {
    const seriesId = await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });

    const said = await sayWhatHappened({
      title: "Naruto 1",
      typeId: "manga",
      said: "wished",
      object: { ...TANKOBON, priority: 2, inSeries: { seriesId } },
    });

    expect(await stories()).toEqual([{ id: said.storyId, title: "Naruto 1" }]);
    expect(said.storyAppeared).toBe(true);
  });

  it("refuses a line the library does not have, and catalogues nothing", async () => {
    await expect(
      sayWhatHappened({
        title: "Naruto 1",
        typeId: "manga",
        said: "wished",
        object: { ...TANKOBON, priority: 2, inSeries: { seriesId: "banana" } },
      })
    ).rejects.toMatchObject({ name: "Refusal", message: "No Series has that id." });

    expect(await theObject("Naruto 1")).toEqual([]);
    expect(await wishes()).toEqual([]);
  });

  // Half of this is worse than none, and the half that would be left is the worst kind of row:
  // an object the library holds that nothing in it accounts for.
  it("leaves no object behind when the Wish is refused", async () => {
    await expect(
      sayWhatHappened({
        title: "Vinland Saga 1",
        typeId: "manga",
        said: "wished",
        object: { ...TANKOBON, priority: 9 },
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      message: "A priority is 1 (next), 2 (soon) or 3 (someday).",
    });

    expect(await theObject("Vinland Saga 1")).toEqual([]);
    expect(await stories()).toEqual([]);
    expect(await wishes()).toEqual([]);
  });
});
