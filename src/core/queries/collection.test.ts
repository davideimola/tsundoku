import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { acquireVolume, releaseVolume } from "../verbs/collection.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import { countCollection, findVolume, searchCollection } from "./collection.ts";

// Seam 1. The Collection is the question asked standing in a shop, so what is asserted
// here is what the owner sees after typing a word into it.
// `cascade` since the Story to Volume slice: a Volume is now referred to by the join that
// says what it carries, and by the Readings that went through it, so truncating it alone is
// refused. Both go with it, which is what this file wants — and the two data-row tables,
// Type and Binding, stay, because those are schema rather than fixtures.
beforeEach(async () => {
  await query("truncate volume, story cascade");
});

async function threeVolumesInTheHouse(): Promise<void> {
  await acquireVolume({
    title: "Slam Dunk 1",
    publisher: "Planet Manga",
    binding: "tankobon",
    language: "it",
  });
  await acquireVolume({
    title: "Batman: Il lungo Halloween",
    publisher: "Panini Comics",
    editionLine: "DC Must Have",
    binding: "must-have",
    language: "it",
  });
  await acquireVolume({
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
    await acquireVolume({
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
    const lUomoCheRide = (
      await acquireVolume({
        title: "L'uomo che ride",
        publisher: "Panini Comics",
        binding: "must-have",
        language: "it",
      })
    ).id;
    const slamDunk = (
      await acquireVolume({
        title: "Slam Dunk 1",
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      })
    ).id;
    await acquireVolume({
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
  it("answers with the object, Binding and all", async () => {
    const { id } = await acquireVolume({
      title: "L'uomo che ride",
      publisher: "Panini Comics",
      editionLine: "DC Must Have",
      binding: "must-have",
      language: "it",
      pricePaid: "14.90",
    });

    expect(await findVolume(id)).toMatchObject({
      title: "L'uomo che ride",
      editionLine: "DC Must Have",
      binding: { id: "must-have", name: "Must Have" },
      pricePaid: "14.90",
    });
  });

  it("answers with one that left the house, which the Collection does not", async () => {
    const { id } = await acquireVolume({
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
