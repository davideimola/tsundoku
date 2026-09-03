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

// `path` is in the list because one of the tests below asserts the door minted none, and a
// test asserting a table is empty has to be the thing that emptied it: left out, it passed
// on whichever file happened to have run before it and failed the day a new file ran there
// instead.
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

/** What one object is recorded as carrying, by title, in the order the library reads it back. */
async function inside(volumeId: string): Promise<string[]> {
  return (await listStoriesInVolume(volumeId)).map((story) => story.title);
}

/**
 * A line that publishes a work, which is the owner's own arrow (#39) and the reason the row
 * standing in the screen's list is sometimes a Story rather than a title.
 */
async function aLinePublishing(name: string, work: string) {
  const storyId = await createStory({ title: work, typeId: "manga" });
  const seriesId = await declareSeries({
    name,
    publisher: "Planet Manga",
    publishedCount: 21,
    status: "concluded",
  });
  await recordSeriesPublishesStory(seriesId, storyId);

  return { seriesId, storyId };
}

describe("I bought it", () => {
  it("records the object, says it is in the house, and records what it holds", async () => {
    const said = await sayWhatHappened({
      title: "Slam Dunk 21",
      typeId: "manga",
      said: "bought",
      object: {
        ...TANKOBON,
        isbn: "9788828765431",
        pricePaid: "6,50",
        acquiredOn: "2026-03-11",
        // The row the screen stood in front of the owner, untouched: no line, so the volume's
        // own title. It arrives as a title rather than as an id because the library has never
        // heard of it, and this is the ordinary case for a novel and for a one-off object.
        holds: [{ title: "Slam Dunk 21" }],
      },
    });

    const [object] = await theObject("Slam Dunk 21");
    expect(object).toMatchObject({ publisher: "Planet Manga", inTheHouse: true });
    expect(object.pricePaid).toBe("6.50");

    expect(await stories()).toEqual([{ id: said.storyIds[0], title: "Slam Dunk 21" }]);
    expect(said.appeared).toEqual(said.storyIds);
    expect(said.volumeId).toBe(object.id);

    // And the link, which used to be the third act on a third screen.
    expect(await inside(object.id)).toEqual(["Slam Dunk 21"]);
  });

  // **The case the whole of #46 is about.** One object, three tales judged apart, said in one
  // submission: one the library already held and two it had never heard of.
  it("records several narratives in one object, minting only the titles it was given", async () => {
    const gothamNoir = await createStory({ title: "Gotham Noir", typeId: "comic" });

    const said = await sayWhatHappened({
      title: "Batman: L'uomo che ride",
      typeId: "comic",
      said: "bought",
      object: {
        publisher: "Panini",
        binding: "hardcover",
        language: "it",
        holds: [{ storyId: gothamNoir }, { title: "L'uomo che ride" }, { title: "Uomo di legno" }],
      },
    });

    const [object] = await theObject("Batman: L'uomo che ride");
    expect(await inside(object.id)).toEqual(["Gotham Noir", "L'uomo che ride", "Uomo di legno"]);

    // Three narratives on the object, and only two of them appeared here.
    expect(said.storyIds).toHaveLength(3);
    expect(said.storyIds[0]).toBe(gothamNoir);
    expect(said.appeared).toHaveLength(2);
    expect(said.appeared).not.toContain(gothamNoir);

    // Nothing was named after the jacket, which is the default this slice ended.
    expect((await stories()).map((one) => one.title)).toEqual([
      "Gotham Noir",
      "L'uomo che ride",
      "Uomo di legno",
    ]);
  });

  it("attaches to the work its line publishes rather than minting a Story", async () => {
    const { seriesId, storyId } = await aLinePublishing("Slam Dunk", "Slam Dunk");

    const said = await sayWhatHappened({
      title: "Slam Dunk 21",
      typeId: "manga",
      said: "bought",
      // The row the screen stood in front of the owner where there is a line: the work that
      // line publishes, by id, and not a title.
      object: { ...TANKOBON, inSeries: { seriesId, number: 21 }, holds: [{ storyId }] },
    });

    // One narrative in the library, and it is the one that was already there.
    expect(await stories()).toEqual([{ id: storyId, title: "Slam Dunk" }]);
    expect(said.storyIds).toEqual([storyId]);
    expect(said.appeared).toEqual([]);

    const [object] = await theObject("Slam Dunk 21");
    expect(object.seriesNumber).toBe(21);
    expect(await inside(object.id)).toEqual(["Slam Dunk"]);
  });

  // **The row can be taken off, and taking it off has to mean something** (ADR-0019). The
  // placement attaches the line's work in its own statement, so an object catalogued into a
  // line that publishes one would carry it whatever the owner said — and the shown default
  // would be a default they cannot correct.
  it("takes the line's work back off where the owner took the row off", async () => {
    const { seriesId, storyId } = await aLinePublishing("Slam Dunk", "Slam Dunk");

    const said = await sayWhatHappened({
      title: "Slam Dunk 21",
      typeId: "manga",
      said: "bought",
      object: {
        ...TANKOBON,
        inSeries: { seriesId, number: 21 },
        holds: [{ title: "Il canestro" }],
      },
    });

    const [object] = await theObject("Slam Dunk 21");
    expect(await inside(object.id)).toEqual(["Il canestro"]);

    // The object still stands at its position of the line: what the owner corrected is what
    // the object holds, and never where it stands on the shelf.
    expect(object.seriesNumber).toBe(21);
    // And the work the line publishes is untouched in the library.
    // By title, so the minted one comes first: what matters is that both stand.
    expect(await stories()).toMatchObject([{ title: "Il canestro" }, { id: storyId }]);
    expect(said.storyIds).not.toContain(storyId);
  });

  it("mints one narrative per object where the line names no work", async () => {
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
      object: { ...TANKOBON, inSeries: { seriesId, number: 1 }, holds: [{ title: "Naruto 1" }] },
    });
    await sayWhatHappened({
      title: "Naruto 2",
      typeId: "manga",
      said: "bought",
      object: { ...TANKOBON, inSeries: { seriesId, number: 2 }, holds: [{ title: "Naruto 2" }] },
    });

    expect((await stories()).map((one) => one.title)).toEqual(["Naruto 1", "Naruto 2"]);
  });

  // **An object the owner's own hands catalogue carries at least one narrative** (ADR-0019).
  // They are holding it, or a photograph of it; an object carrying nothing is what an
  // assistant's proposal may leave behind, and the Inbox is that door rather than this one.
  it("refuses an object nothing was said to be inside, and catalogues nothing", async () => {
    await expect(
      sayWhatHappened({
        title: "Slam Dunk 21",
        typeId: "manga",
        said: "bought",
        object: { ...TANKOBON, holds: [] },
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "An object you catalogue by hand carries at least one narrative. Name what is inside it — the line's work, its own title, or whatever the library already holds.",
    });

    expect(await theObject("Slam Dunk 21")).toEqual([]);
    expect(await stories()).toEqual([]);
  });

  // Half of this is worse than none, and a narrative that is not in the library is the one
  // way a *named* row can be wrong: the screen offered an id it found, and the record went
  // between the offer and the press.
  it("leaves no object behind when a narrative it was told about is not in the library", async () => {
    await expect(
      sayWhatHappened({
        title: "Slam Dunk 21",
        typeId: "manga",
        said: "bought",
        object: {
          ...TANKOBON,
          holds: [{ storyId: "5d3f6e3a-2b4f-4a1e-9c1a-0f0e6b7a1d22" }],
        },
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      message: "That Story is not in the library yet.",
    });

    expect(await theObject("Slam Dunk 21")).toEqual([]);
  });

  // **The half-placement, and it is the case this door exists to prevent.** A line chosen with
  // no position in it used to be a placement quietly dropped — and on a line that names a work
  // that is a second narrative minted for a volume that already had one. Either half means the
  // owner meant to place it, and the verb refuses the half that is missing.
  it("refuses a line chosen with no position, and leaves nothing behind", async () => {
    const { seriesId, storyId } = await aLinePublishing("Slam Dunk", "Slam Dunk");

    await expect(
      sayWhatHappened({
        title: "Slam Dunk 21",
        typeId: "manga",
        said: "bought",
        object: {
          ...TANKOBON,
          inSeries: { seriesId, number: Number.NaN },
          holds: [{ storyId }],
        },
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      message: "A position in a Series is a whole number: 1, 2, 3.",
    });

    expect(await stories()).toEqual([{ id: storyId, title: "Slam Dunk" }]);
    expect(await theObject("Slam Dunk 21")).toEqual([]);
  });

  it("refuses a position given with no line", async () => {
    await expect(
      sayWhatHappened({
        title: "Slam Dunk 21",
        typeId: "manga",
        said: "bought",
        object: {
          ...TANKOBON,
          inSeries: { seriesId: "", number: 21 },
          holds: [{ title: "Slam Dunk 21" }],
        },
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
        object: { ...TANKOBON, binding: "banana", holds: [{ title: "Slam Dunk 21" }] },
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
        object: { ...TANKOBON, holds: [{ title: "Slam Dunk 21" }] },
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
      object: { ...TANKOBON, inSeries: { seriesId, number: 1 }, holds: [{ title: "Naruto 1" }] },
    });

    await expect(
      sayWhatHappened({
        title: "Naruto 1, again",
        typeId: "manga",
        said: "bought",
        object: {
          ...TANKOBON,
          inSeries: { seriesId, number: 1 },
          holds: [{ title: "Naruto 1, again" }],
        },
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
      medium: "digital",
    });

    const [storyId] = said.storyIds;
    expect(await stories()).toEqual([{ id: storyId, title: "Daredevil: L'Uomo Senza Paura" }]);
    expect(said.appeared).toEqual([storyId]);
    expect(said.volumeId).toBeNull();

    expect(await readings()).toEqual([
      { story_id: storyId, medium: "digital", volume_id: null, outcome: "finished" },
    ]);

    // Nothing about an object was recorded, which is the case this door exists for.
    expect(await query("select id from volume")).toEqual([]);
  });

  // The case #50 exists for: a paperback off somebody else's shelf. It is the same three
  // facts as the sentence above with one word different, and it still leaves no object —
  // which is what makes it sayable here at all.
  it("records a pass on paper through no object, where that is what the owner said", async () => {
    const said = await sayWhatHappened({
      title: "Il nome della rosa",
      typeId: "novel",
      said: "read",
      medium: "paper",
    });

    const [storyId] = said.storyIds;
    expect(await readings()).toEqual([
      { story_id: storyId, medium: "paper", volume_id: null, outcome: "finished" },
    ]);

    expect(await query("select id from volume")).toEqual([]);
  });

  // The medium is the Reading's own check constraint and the prose is `recordReading`'s: this
  // door has no copy of it to keep true, and the sentence the owner reads is the verb's.
  it("refuses a medium that is neither, in the Reading's own words", async () => {
    await expect(
      sayWhatHappened({
        title: "Il nome della rosa",
        typeId: "novel",
        said: "read",
        medium: "audiobook" as never,
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      message: "A Reading is on paper or digital, and nothing else.",
    });

    // The whole sentence is one transaction, so a medium that is not one leaves no narrative
    // behind either (`../transaction.ts`).
    expect(await stories()).toEqual([]);
  });

  it("refuses a title with nothing in it", async () => {
    await expect(
      sayWhatHappened({ title: "   ", typeId: "comic", said: "read", medium: "digital" })
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

    const [storyId] = said.storyIds;
    expect(await stories()).toEqual([{ id: storyId, title: "Vagabond" }]);
    expect(await wants()).toEqual([{ story_id: storyId }]);
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
  it("catalogues the object without bringing it home, opens a Wish, and records what it holds", async () => {
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
        holds: [{ title: "Vinland Saga 1" }],
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

    expect(await stories()).toEqual([{ id: said.storyIds[0], title: "Vinland Saga 1" }]);
    expect(said.appeared).toEqual(said.storyIds);
    expect(await inside(object.id)).toEqual(["Vinland Saga 1"]);
  });

  it("says nothing about reading it: no Want, no Reading", async () => {
    await sayWhatHappened({
      title: "Vinland Saga 1",
      typeId: "manga",
      said: "wished",
      object: { ...TANKOBON, priority: 2, holds: [{ title: "Vinland Saga 1" }] },
    });

    expect(await wants()).toEqual([]);
    expect(await readings()).toEqual([]);
  });

  // The arrow reaches this sentence the way it reaches the other one, and it now reaches it
  // through the owner: the screen stood the line's work in the list, they left it there, and
  // what arrives here is an id. No twenty-second narrative is minted, and nothing about a
  // position is written — an object nobody owns yet fills no position of a Series.
  it("carries the work its line publishes without taking a position of it", async () => {
    const { storyId } = await aLinePublishing("Slam Dunk", "Slam Dunk");

    const said = await sayWhatHappened({
      title: "Slam Dunk 21",
      typeId: "manga",
      said: "wished",
      object: { ...TANKOBON, priority: 3, holds: [{ storyId }] },
    });

    expect(await stories()).toEqual([{ id: storyId, title: "Slam Dunk" }]);
    expect(said.storyIds).toEqual([storyId]);
    expect(said.appeared).toEqual([]);

    const [object] = await theObject("Slam Dunk 21");
    expect(object.seriesNumber).toBeNull();
    expect(object.inTheHouse).toBe(false);
    expect(await inside(object.id)).toEqual(["Slam Dunk"]);
  });

  it("refuses an object nothing was said to be inside, and catalogues nothing", async () => {
    await expect(
      sayWhatHappened({
        title: "Vinland Saga 1",
        typeId: "manga",
        said: "wished",
        object: { ...TANKOBON, priority: 2, holds: [] },
      })
    ).rejects.toMatchObject({ name: "Refusal", code: "invalid" });

    expect(await theObject("Vinland Saga 1")).toEqual([]);
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
        object: { ...TANKOBON, priority: 9, holds: [{ title: "Vinland Saga 1" }] },
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
