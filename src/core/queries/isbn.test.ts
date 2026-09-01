import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import type { AskAboutAnIsbn } from "../records.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { whatIsOnThisIsbn } from "./isbn.ts";

// Seam 1, and the source is handed in — which is the rule `covers.test.ts` set and the reason
// no test in this repository calls a third party. What is asserted here is the **order the
// three answers are asked in**, because that order is the feature:
//
//   1. Is this an ISBN at all? A camera answers with whatever it was pointed at.
//   2. **Does the library already know it?** This is the question the owner is standing in a
//      shop asking, and it is answered from Postgres, in one round trip, before anybody's
//      network is involved.
//   3. Only then, what does the catalogue of record say it is.
//
// The middle one is the whole point. A lookup that asked SBN first would spend a shop's
// signal, and a few seconds of the owner's patience, to fill in a form for an object that is
// already on their shelf.

const ONE_PIECE = "9788822632753";

beforeEach(async () => {
  await query("truncate volume, story, series cascade");
});

/** A source that answers, and remembers whether it was asked at all. */
function sourceThatSays(answer: Awaited<ReturnType<AskAboutAnIsbn>>): {
  ask: AskAboutAnIsbn;
  asked: () => string[];
} {
  const asked: string[] = [];
  return {
    ask: async (isbn) => {
      asked.push(isbn);
      return answer;
    },
    asked: () => asked,
  };
}

const SAYS_ONE_PIECE = {
  answer: "found",
  record: { title: "One piece 100", publisher: "Star Comics" },
} as const;

describe("what is on an ISBN the library already knows", () => {
  it("answers with the object it already catalogued, and never asks the source", async () => {
    const { id } = await catalogueVolume({
      title: "One Piece 100",
      publisher: "Star Comics",
      binding: "tankobon",
      language: "it",
      isbn: ONE_PIECE,
    });
    const source = sourceThatSays(SAYS_ONE_PIECE);

    const said = await whatIsOnThisIsbn(ONE_PIECE, source.ask);

    expect(said).toEqual({
      it: "already-catalogued",
      isbn: ONE_PIECE,
      volumes: [{ id, title: "One Piece 100", publisher: "Star Comics", inTheHouse: false }],
    });
    expect(source.asked()).toEqual([]);
  });

  it("says whether the object is in the house, which is the question being asked", async () => {
    const id = await volumeInTheHouse({
      title: "One Piece 100",
      publisher: "Star Comics",
      binding: "tankobon",
      language: "it",
      isbn: ONE_PIECE,
    });
    const source = sourceThatSays(SAYS_ONE_PIECE);

    const said = await whatIsOnThisIsbn(ONE_PIECE, source.ask);

    expect(said.it === "already-catalogued" && said.volumes).toEqual([
      { id, title: "One Piece 100", publisher: "Star Comics", inTheHouse: true },
    ]);
  });

  it("still knows the object after it has been released, and says it is not in the house", async () => {
    // Catalogued, owned, sold. The library knows the object and the shelf does not hold it —
    // which in a shop is the answer *you had this one and let it go*, and is emphatically not
    // *you do not have it*.
    const id = await volumeInTheHouse({
      title: "One Piece 100",
      publisher: "Star Comics",
      binding: "tankobon",
      language: "it",
      isbn: ONE_PIECE,
    });
    await releaseVolume(id);
    const source = sourceThatSays(SAYS_ONE_PIECE);

    const said = await whatIsOnThisIsbn(ONE_PIECE, source.ask);

    expect(said.it).toBe("already-catalogued");
    expect(said.it === "already-catalogued" && said.volumes[0].inTheHouse).toBe(false);
  });

  it("names every object on that ISBN, because a duplicate is exactly what this catches", async () => {
    await catalogueVolume({
      title: "One Piece 100",
      publisher: "Star Comics",
      binding: "tankobon",
      language: "it",
      isbn: ONE_PIECE,
    });
    await catalogueVolume({
      title: "One Piece 100 (again, by mistake)",
      publisher: "Star Comics",
      binding: "tankobon",
      language: "it",
      isbn: ONE_PIECE,
    });
    const source = sourceThatSays(SAYS_ONE_PIECE);

    const said = await whatIsOnThisIsbn(ONE_PIECE, source.ask);

    expect(said.it === "already-catalogued" && said.volumes).toHaveLength(2);
  });

  it("reads the ISBN the way it is printed and finds what was stored without the hyphens", async () => {
    await catalogueVolume({
      title: "Dimentica il mio nome",
      publisher: "Bao Publishing",
      binding: "hardcover",
      language: "it",
      isbn: "9788865432549",
    });
    const source = sourceThatSays(SAYS_ONE_PIECE);

    const said = await whatIsOnThisIsbn("978-88-6543-254-9", source.ask);

    expect(said.it).toBe("already-catalogued");
  });
});

describe("what is on an ISBN the library has never seen", () => {
  it("answers with what the source says the object is", async () => {
    const source = sourceThatSays(SAYS_ONE_PIECE);

    const said = await whatIsOnThisIsbn(ONE_PIECE, source.ask);

    expect(said).toEqual({
      it: "a-record",
      isbn: ONE_PIECE,
      record: { title: "One piece 100", publisher: "Star Comics" },
    });
    expect(source.asked()).toEqual([ONE_PIECE]);
  });

  it("answers no record where the catalogue of record has nothing under it", async () => {
    const source = sourceThatSays({ answer: "none" });

    expect(await whatIsOnThisIsbn(ONE_PIECE, source.ask)).toEqual({
      it: "no-record",
      isbn: ONE_PIECE,
    });
  });

  it("keeps a source that could not be asked apart from a book that does not exist", async () => {
    // SBN answered 503 for stretches of the session that measured it. Collapsing that into
    // "no such book" is the cover research's false 0% happening again, in front of somebody
    // deciding whether to buy something.
    const source = sourceThatSays({ answer: "unanswered", because: "SBN answered 503." });

    expect(await whatIsOnThisIsbn(ONE_PIECE, source.ask)).toEqual({
      it: "unanswered",
      isbn: ONE_PIECE,
      because: "SBN answered 503.",
    });
  });
});

describe("what is not an ISBN", () => {
  it("refuses before it asks anybody anything", async () => {
    const source = sourceThatSays(SAYS_ONE_PIECE);

    const said = await whatIsOnThisIsbn("977112365904850039", source.ask);

    expect(said.it).toBe("not-an-isbn");
    expect(said.it === "not-an-isbn" && said.because).toMatch(/periodical/i);
    expect(source.asked()).toEqual([]);
  });

  it("refuses an empty field without touching the database or the source", async () => {
    const source = sourceThatSays(SAYS_ONE_PIECE);

    expect((await whatIsOnThisIsbn("", source.ask)).it).toBe("not-an-isbn");
    expect(source.asked()).toEqual([]);
  });
});
