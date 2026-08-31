import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { acquireVolume, catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import {
  countCollection,
  findVolume,
  listAcquisitions,
  listCataloguedOutsideTheCollection,
  listCollectionPublishers,
  listCollectionSeries,
  listCollectionWall,
  searchCollection,
} from "./collection.ts";

// Seam 1. The Collection is the question asked standing in a shop, so what is asserted
// here is what the owner sees after typing a word into it.
// `cascade` since the Story to Volume slice: a Volume is now referred to by the join that
// says what it carries, and by the Readings that went through it, so truncating it alone is
// refused. Both go with it, which is what this file wants — and the two data-row tables,
// Type and Binding, stay, because those are schema rather than fixtures.
// `series` joined them when the wall arrived: the wall is *ordered* by the line an object
// stands in, so a Series left standing between two tests would order the next one's shelf.
beforeEach(async () => {
  await query("truncate volume, story, series cascade");
});

async function threeVolumesInTheHouse(): Promise<void> {
  await volumeInTheHouse({
    title: "Slam Dunk 1",
    publisher: "Planet Manga",
    binding: "tankobon",
    language: "it",
  });
  await volumeInTheHouse({
    title: "Batman: Il lungo Halloween",
    publisher: "Panini Comics",
    editionLine: "DC Must Have",
    binding: "must-have",
    language: "it",
  });
  await volumeInTheHouse({
    title: "Ultimate Spider-Man Omnibus 1",
    publisher: "Panini Comics",
    binding: "omnibus",
    language: "it",
  });
}

function titles(volumes: { title: string }[]): string[] {
  return volumes.map((volume) => volume.title);
}

describe("searching the Collection", () => {
  beforeEach(threeVolumesInTheHouse);

  it("lists everything owned, by title, when nothing is asked", async () => {
    expect(titles(await searchCollection({}))).toEqual([
      "Batman: Il lungo Halloween",
      "Slam Dunk 1",
      "Ultimate Spider-Man Omnibus 1",
    ]);
  });

  it("finds a title by a word inside it, whatever the case", async () => {
    expect(titles(await searchCollection({ title: "spider" }))).toEqual([
      "Ultimate Spider-Man Omnibus 1",
    ]);
  });

  it("narrows by publisher", async () => {
    expect(titles(await searchCollection({ publisher: "panini" }))).toEqual([
      "Batman: Il lungo Halloween",
      "Ultimate Spider-Man Omnibus 1",
    ]);
  });

  it("narrows by Binding, which is what tells two editions of one story apart", async () => {
    expect(titles(await searchCollection({ binding: "must-have" }))).toEqual([
      "Batman: Il lungo Halloween",
    ]);
  });

  it("narrows by several at once", async () => {
    expect(
      titles(await searchCollection({ publisher: "panini", binding: "omnibus", title: "1" }))
    ).toEqual(["Ultimate Spider-Man Omnibus 1"]);
  });

  it("answers with the Binding's name as well as its id, because MCP reads this", async () => {
    const [volume] = await searchCollection({ title: "Halloween" });
    expect(volume.binding).toEqual({ id: "must-have", name: "Must Have" });
  });
});

// The one structural claim in this slice, and the one test that can hold it: *digital
// ownership is not representable*. It is asserted against the schema rather than through
// a verb on purpose — the point is not that a check rejects an ebook, it is that there is
// nothing on a Volume to say `digital` with. A validation could be relaxed by an `if`; a
// column that does not exist cannot be set.
//
// It also guards the word: `format` meant binding in one spreadsheet and reading medium in
// the other, and it may not come back on this table under either meaning.
describe("digital ownership", () => {
  it("has nowhere to be recorded on a Volume", async () => {
    const columns = await query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'volume'"
    );

    expect(
      columns
        .map((column) => column.column_name)
        .filter((name) => /medium|digital|ebook|format|file/.test(name))
    ).toEqual([]);
  });
});

// The Collection is a *subset* of the catalogue now (ADR-0007), so the screen needs the
// other half of it too: an object the library knows and the house does not hold would
// otherwise be invisible the moment it was catalogued.
describe("the catalogue outside the Collection", () => {
  it("answers with what is known and not held, and with nothing that is", async () => {
    await threeVolumesInTheHouse();
    await catalogueVolume({
      title: "Blame! 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    expect(titles(await listCataloguedOutsideTheCollection())).toEqual(["Blame! 1"]);
    expect(titles(await searchCollection({}))).not.toContain("Blame! 1");
  });

  it("tells one never acquired apart from one let go, by the day it left", async () => {
    const gone = await volumeInTheHouse({
      title: "Death Note 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await releaseVolume(gone);
    await catalogueVolume({
      title: "Blame! 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    expect(await listCataloguedOutsideTheCollection()).toMatchObject([
      { title: "Blame! 1", releasedOn: null },
      { title: "Death Note 1", releasedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    ]);
  });

  it("answers with one row for an object acquired and released twice", async () => {
    const twice = await volumeInTheHouse({
      title: "Akira 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await releaseVolume(twice);
    await acquireVolume({ volumeId: twice });
    await releaseVolume(twice);

    expect(await listCataloguedOutsideTheCollection()).toHaveLength(1);
  });
});

describe("counting the Collection", () => {
  it("is the number of Volumes in the house, and a release takes one off it", async () => {
    await threeVolumesInTheHouse();
    expect(await countCollection()).toBe(3);

    const [first] = await searchCollection({});
    await releaseVolume(first.id);

    expect(await countCollection()).toBe(2);
  });

  it("counts nothing where nothing is owned", async () => {
    expect(await countCollection()).toBe(0);
  });
});

// A search box takes a word, not a pattern.
describe("a title with a wildcard character in it", () => {
  it("is searched for literally", async () => {
    await volumeInTheHouse({
      title: "100% Doraemon",
      publisher: "Star Comics",
      binding: "tankobon",
      language: "it",
    });

    expect(titles(await searchCollection({ title: "100%" }))).toEqual(["100% Doraemon"]);
    expect(await searchCollection({ title: "%%%" })).toEqual([]);
  });
});

// **The fourth filter, and the criterion this slice inherited.** Searching the Collection
// by Type could not be answered when the Collection was built: Type is an attribute of a
// *Story* (ADR-0006), so reaching it from a Volume needs the Story ↔ Volume join. Giving
// `volume` a `type_id` would have answered the search by contradicting the model — a
// Volume holding three Stories of two Types has no one Type — so the filter waited for
// the join, and this is it.
describe("narrowing the Collection by Type", () => {
  beforeEach(async () => {
    const lUomoCheRide = await volumeInTheHouse({
      title: "L'uomo che ride",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });
    const slamDunk = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await volumeInTheHouse({
      title: "Sapiens",
      publisher: "Bompiani",
      binding: "paperback",
      language: "it",
    });

    for (const [title, typeId] of [
      ["Gotham Noir", "comic"],
      // The Volume holding two Types at once, which is why a Volume has no Type of its own.
      ["Il buio dentro", "graphic-novel"],
    ] as const) {
      await recordVolumeCarriesStory(lUomoCheRide, await createStory({ title, typeId }));
    }
    await recordVolumeCarriesStory(
      slamDunk,
      await createStory({ title: "Slam Dunk", typeId: "manga" })
    );
  });

  it("answers with the Volumes carrying a Story of that Type", async () => {
    expect(titles(await searchCollection({ type: "manga" }))).toEqual(["Slam Dunk 1"]);
  });

  it("answers with a Volume of two Types under either of them, and once", async () => {
    expect(titles(await searchCollection({ type: "comic" }))).toEqual(["L'uomo che ride"]);
    expect(titles(await searchCollection({ type: "graphic-novel" }))).toEqual(["L'uomo che ride"]);
  });

  it("leaves out a Volume carrying nothing, because nothing says what Type it is", async () => {
    expect(titles(await searchCollection({ type: "non-fiction" }))).toEqual([]);
    // And it is still in the Collection, which is the whole of what a Collection claims.
    expect(titles(await searchCollection({}))).toContain("Sapiens");
  });

  it("narrows alongside the other three", async () => {
    expect(titles(await searchCollection({ type: "comic", publisher: "panini" }))).toEqual([
      "L'uomo che ride",
    ]);
    expect(await searchCollection({ type: "comic", binding: "tankobon" })).toEqual([]);
  });
});

// One object's own page, which is where the Stories it carries and its Edition note are
// read. It is a record of the object rather than a claim about the house, so it answers
// for a Volume the owner has released.
describe("finding one Volume", () => {
  it("says a catalogued object is not in the house, and names no day it left", async () => {
    const { id } = await catalogueVolume({
      title: "Blame! 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    expect(await findVolume(id)).toMatchObject({
      title: "Blame! 1",
      inTheHouse: false,
      releasedOn: null,
      pricePaid: null,
      acquiredOn: null,
    });
  });

  it("answers with the object, Binding and all", async () => {
    const id = await volumeInTheHouse(
      {
        title: "L'uomo che ride",
        publisher: "Panini Comics",
        editionLine: "DC Must Have",
        binding: "must-have",
        language: "it",
      },
      { pricePaid: "14.90" }
    );

    expect(await findVolume(id)).toMatchObject({
      title: "L'uomo che ride",
      editionLine: "DC Must Have",
      binding: { id: "must-have", name: "Must Have" },
      pricePaid: "14.90",
    });
  });

  it("answers with one that left the house, which the Collection does not", async () => {
    const id = await volumeInTheHouse({
      title: "Death Note 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await releaseVolume(id);

    expect(await searchCollection({ title: "Death Note" })).toEqual([]);
    expect(await findVolume(id)).toMatchObject({ title: "Death Note 1" });
  });

  it("answers with nothing for an id that is not one, rather than raising", async () => {
    expect(await findVolume("banana")).toBeNull();
    expect(await findVolume("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

// THE COLLECTION WALL (#23), and the criterion that is hard to see in a list of titles:
// **it stands the way the shelf stands**. A list ordered by title puts *Slam Dunk 10*
// between 1 and 2 and answers *what am I missing* by making the owner read; a wall ordered
// by the line an object stands in, and by its number inside that line, answers it by
// looking — which is the whole reason this screen exists (ADR-0007, user story 24).
//
// The other half of the order is the one nothing else in this file tests: an object in **no**
// Series is not an exception to be dropped at the end. Sixteen of this library's Volumes are
// standalones, and they take their place under their own title, among the Series, exactly as
// they do on a real shelf.

/** The two Series the fixture declared, so a test can name the one it narrows to. */
let declared: { slamDunk: string; blackEdition: string };

/** Own a numbered Volume of a Series, as the owner does — one purchase, then its position. */
async function ownIn(
  seriesId: string,
  volume: { title: string; publisher: string; binding: string; editionLine?: string },
  number: number
): Promise<string> {
  const id = await volumeInTheHouse({ language: "it", ...volume });
  await placeVolumeInSeries({ volumeId: id, seriesId, number });
  return id;
}

/** Stand a shelf up: two Series, an object in neither, and what two of the Volumes carry. */
async function standTheShelfUp(): Promise<void> {
  const slamDunk = await declareSeries({
    name: "Slam Dunk",
    publisher: "Planet Manga",
    publishedCount: 31,
    status: "concluded",
  });
  const blackEdition = await declareSeries({
    name: "Death Note",
    publisher: "Planet Manga",
    editionLine: "Black Edition",
    publishedCount: 6,
    status: "concluded",
  });
  declared = { slamDunk, blackEdition };

  // Acquired in the order they were bought in, which is deliberately not the order they
  // stand in: an order that came out right because the rows went in right proves nothing.
  await ownIn(
    slamDunk,
    { title: "Slam Dunk 2", publisher: "Planet Manga", binding: "tankobon" },
    2
  );
  const first = await ownIn(
    slamDunk,
    { title: "Slam Dunk 1", publisher: "Planet Manga", binding: "tankobon" },
    1
  );
  await ownIn(
    blackEdition,
    { title: "Death Note Black Edition I", publisher: "Planet Manga", binding: "deluxe" },
    1
  );

  const alone = await volumeInTheHouse({
    title: "L'uomo che ride",
    publisher: "Panini Comics",
    editionLine: "DC Must Have",
    binding: "must-have",
    language: "it",
  });

  await recordVolumeCarriesStory(first, await createStory({ title: "Slam Dunk", typeId: "manga" }));
  await recordVolumeCarriesStory(
    alone,
    await createStory({ title: "Gotham Noir", typeId: "comic" })
  );
}

describe("the Collection wall", () => {
  beforeEach(standTheShelfUp);

  it("stands by the line an object is in, and by its number inside that line", async () => {
    expect(titles(await listCollectionWall({}))).toEqual([
      "Death Note Black Edition I",
      "L'uomo che ride",
      "Slam Dunk 1",
      "Slam Dunk 2",
    ]);
  });

  it("gives an object that stands in no line its place under its own title", async () => {
    const [, alone] = await listCollectionWall({});

    expect(alone).toMatchObject({
      title: "L'uomo che ride",
      series: null,
      seriesNumber: null,
      binding: { id: "must-have", name: "Must Have" },
    });
  });

  it("carries the line and the number, which is what the tile wears", async () => {
    const [deathNote] = await listCollectionWall({});

    expect(deathNote).toMatchObject({
      title: "Death Note Black Edition I",
      series: { id: declared.blackEdition, name: "Death Note", editionLine: "Black Edition" },
      seriesNumber: 1,
    });
  });

  it("shows two editions of one Story as two objects", async () => {
    const story = await createStory({ title: "Il lungo Halloween", typeId: "comic" });
    const mustHave = await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      editionLine: "DC Must Have",
      binding: "must-have",
      language: "it",
    });
    const omnibus = await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      binding: "omnibus",
      language: "it",
    });
    await recordVolumeCarriesStory(mustHave, story);
    await recordVolumeCarriesStory(omnibus, story);

    const both = (await listCollectionWall({})).filter((volume) =>
      volume.title.startsWith("Batman")
    );

    expect(new Set(both.map((volume) => volume.id))).toEqual(new Set([mustHave, omnibus]));
    expect(new Set(both.map((volume) => volume.binding.id))).toEqual(
      new Set(["must-have", "omnibus"])
    );
  });

  it("shows what is in the house, and never what is merely catalogued", async () => {
    await catalogueVolume({
      title: "Blame! 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    const gone = await volumeInTheHouse({
      title: "Akira 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await releaseVolume(gone);

    expect(titles(await listCollectionWall({}))).toEqual([
      "Death Note Black Edition I",
      "L'uomo che ride",
      "Slam Dunk 1",
      "Slam Dunk 2",
    ]);
  });

  it("narrows to one line at a time", async () => {
    expect(titles(await listCollectionWall({ series: declared.slamDunk }))).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
    ]);
  });

  it("narrows by publisher exactly, because the publisher comes off a picker", async () => {
    expect(titles(await listCollectionWall({ publisher: "Panini Comics" }))).toEqual([
      "L'uomo che ride",
    ]);
    expect(await listCollectionWall({ publisher: "panini" })).toEqual([]);
  });

  it("narrows by Type, through what the object carries", async () => {
    expect(titles(await listCollectionWall({ type: "comic" }))).toEqual(["L'uomo che ride"]);
    expect(titles(await listCollectionWall({ type: "manga" }))).toEqual(["Slam Dunk 1"]);
  });

  it("narrows by Binding, which is what tells two editions apart", async () => {
    expect(titles(await listCollectionWall({ binding: "deluxe" }))).toEqual([
      "Death Note Black Edition I",
    ]);
  });

  it("narrows by a word inside the title, whatever the case", async () => {
    expect(titles(await listCollectionWall({ title: "slam" }))).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
    ]);
  });

  it("narrows by several at once", async () => {
    expect(titles(await listCollectionWall({ series: declared.slamDunk, type: "manga" }))).toEqual([
      "Slam Dunk 1",
    ]);
    expect(
      await listCollectionWall({ series: declared.slamDunk, publisher: "Panini Comics" })
    ).toEqual([]);
  });

  it("narrows to nothing for a line, a publisher or a Type that is none", async () => {
    expect(await listCollectionWall({ series: "banana" })).toEqual([]);
    expect(await listCollectionWall({ publisher: "Nobody" })).toEqual([]);
    expect(await listCollectionWall({ type: "banana" })).toEqual([]);
  });
});

// What the wall's two pickers offer, and the rule both follow: **only what the house
// holds**. A picker naming a line the owner owns nothing of, or a publisher off a Volume
// they never had, is a control whose every use empties the wall.
describe("the vocabularies the wall narrows by", () => {
  beforeEach(standTheShelfUp);

  it("offers the lines the house holds, by name and then edition", async () => {
    expect(await listCollectionSeries()).toEqual([
      { id: declared.blackEdition, name: "Death Note", editionLine: "Black Edition" },
      { id: declared.slamDunk, name: "Slam Dunk", editionLine: null },
    ]);
  });

  it("leaves out a line the house holds nothing of", async () => {
    await declareSeries({
      name: "Berserk",
      publisher: "Panini Comics",
      editionLine: "Deluxe",
      publishedCount: 41,
      status: "ongoing",
    });

    expect((await listCollectionSeries()).map((series) => series.name)).toEqual([
      "Death Note",
      "Slam Dunk",
    ]);
  });

  it("offers the publishers the house holds, once each", async () => {
    expect(await listCollectionPublishers()).toEqual(["Panini Comics", "Planet Manga"]);
  });

  it("leaves out the publisher of an object the house does not hold", async () => {
    await catalogueVolume({
      title: "Sapiens",
      publisher: "Bompiani",
      binding: "paperback",
      language: "it",
    });

    expect(await listCollectionPublishers()).not.toContain("Bompiani");
  });
});

// **What the object has been through in the house** (#30), which is the half of ADR-0007
// nothing read back until the Volume got its own screen: an acquisition that ended is not a
// deleted row, so a Volume sold and bought again is *one object acquired twice* and the page
// has to be able to say so. The assertion worth having here is the shape of the answer — two
// rows for two acquisitions, each with its own price — because that is the sentence the
// model makes true and a list of one would quietly reduce to.
describe("what a Volume has been through in the house", () => {
  it("reads an object acquired, released and acquired again as one object acquired twice", async () => {
    const id = await volumeInTheHouse(
      {
        title: "Berserk 1",
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      },
      { acquiredOn: "2019-04-02", pricePaid: "4.90" }
    );
    await releaseVolume(id);
    await acquireVolume({ volumeId: id, acquiredOn: "2024-11-08", pricePaid: "9.90" });

    const history = await listAcquisitions(id);

    // Newest first, which is the order the page reads in: what is true now, then what was.
    expect(history).toMatchObject([
      { acquiredOn: "2024-11-08", pricePaid: "9.90", releasedOn: null },
      { acquiredOn: "2019-04-02", pricePaid: "4.90" },
    ]);
    expect(history[1].releasedOn).not.toBeNull();
  });

  it("answers with nothing for an object the house has never held", async () => {
    const { id } = await catalogueVolume({
      title: "Blame! 2",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    expect(await listAcquisitions(id)).toEqual([]);
  });

  // The day and the price are both optional on the fact itself: a book owned since before
  // any of this was written down has no receipt (ADR-0007), and the record still says it
  // was in the house.
  it("answers for an acquisition with neither a day nor a price", async () => {
    const id = await volumeInTheHouse({
      title: "Akira 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    expect(await listAcquisitions(id)).toMatchObject([
      { acquiredOn: null, pricePaid: null, releasedOn: null },
    ]);
  });

  it("answers with nothing for an id that is not one, rather than raising", async () => {
    expect(await listAcquisitions("banana")).toEqual([]);
  });
});

// The line an object stands in is a fact about the *thing* (ADR-0001), so the object's own
// page carries it: which Series, and which position of it. It is what colours the tile the
// page opens with, and the tint is a function of the Series' identity — so the page cannot
// draw it without this.
describe("the line one Volume stands in", () => {
  it("carries the Series and the position, as the wall does", async () => {
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 31,
      status: "concluded",
    });
    const id = await volumeInTheHouse({
      title: "Slam Dunk 3",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: id, seriesId, number: 3 });

    expect(await findVolume(id)).toMatchObject({
      series: { id: seriesId, name: "Slam Dunk", editionLine: null },
      seriesNumber: 3,
    });
  });

  it("stands in none, which is an ordinary answer and not a gap", async () => {
    const id = await volumeInTheHouse({
      title: "Ultimate Spider-Man Omnibus 2",
      publisher: "Panini Comics",
      binding: "omnibus",
      language: "it",
    });

    expect(await findVolume(id)).toMatchObject({ series: null, seriesNumber: null });
  });
});
