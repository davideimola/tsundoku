import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { acquireVolume } from "../verbs/collection.ts";
import { searchCollection } from "./collection.ts";

// Seam 1. The Collection is the question asked standing in a shop, so what is asserted
// here is what the owner sees after typing a word into it.
beforeEach(async () => {
  await query("truncate volume");
});

async function shelf(): Promise<void> {
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
  beforeEach(shelf);

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
