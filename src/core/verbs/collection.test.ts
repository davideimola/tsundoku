import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { searchCollection } from "../queries/collection.ts";
import { type AcquiredVolume, acquireVolume, releaseVolume } from "./collection.ts";

// Seam 1: the verbs and the query surface against a real Postgres. What is asserted is
// what the owner can see afterwards — the Collection — rather than the row that was
// written, because the row is the schema's business and the Collection is the product.
// `cascade` since the Story to Volume slice: a Volume is now referred to by the join saying
// what it carries, by its Edition note and by the Readings that went through it, so
// truncating it alone is refused. Those go with it, which is what this file wants; Binding
// stays, because a data row is schema rather than a fixture.
beforeEach(async () => {
  await query("truncate volume cascade");
});

describe("acquiring a Volume", () => {
  it("puts it in the Collection with everything about the object", async () => {
    await acquireVolume({
      title: "L'uomo che ride",
      publisher: "Panini Comics",
      editionLine: "DC Black Label",
      binding: "hardcover",
      language: "it",
      pricePaid: "24.90",
      purchaseDate: "2024-03-11",
      isbn: "9788828765431",
    });

    expect(await searchCollection({})).toEqual([
      {
        id: expect.any(String),
        title: "L'uomo che ride",
        publisher: "Panini Comics",
        editionLine: "DC Black Label",
        binding: { id: "hardcover", name: "Hardcover" },
        language: "it",
        pricePaid: "24.90",
        purchaseDate: "2024-03-11",
        isbn: "9788828765431",
      },
    ]);
  });
});

describe("releasing a Volume", () => {
  it("stops the Collection claiming it, without destroying the record of it", async () => {
    const { id } = await acquireVolume(aTankobon());

    await releaseVolume(id);

    expect(await searchCollection({})).toEqual([]);
    // The row is still there, and this is the evidence: a released Volume can be told
    // apart from one that never existed, which a delete would have made impossible.
    await expect(releaseVolume(id)).rejects.toMatchObject({
      code: "not-allowed",
      message: "That Volume has already left the house.",
    });
  });

  it("refuses an id that names no Volume", async () => {
    await expect(releaseVolume("3f7c1b2e-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

function aTankobon(): AcquiredVolume {
  return {
    title: "Slam Dunk 1",
    publisher: "Planet Manga",
    binding: "tankobon",
    language: "it",
  };
}

describe("what the model refuses about an object", () => {
  it("refuses a Binding it does not know, rather than inventing one", async () => {
    await expect(acquireVolume({ ...aTankobon(), binding: "hardback" })).rejects.toMatchObject({
      code: "not-found",
      message: "That is not a Binding. The pickers offer the ones the model knows.",
    });
  });

  it("refuses a language written as prose, because the Collection is answered against", async () => {
    await expect(acquireVolume({ ...aTankobon(), language: "Italian" })).rejects.toMatchObject({
      code: "invalid",
      message: "A language is a code like it, en or ja.",
    });
  });

  it("refuses a Volume with no title on it", async () => {
    await expect(acquireVolume({ ...aTankobon(), title: "  " })).rejects.toMatchObject({
      code: "invalid",
      message: "A Volume needs the title printed on it.",
    });
  });
});

// The two values Postgres parses rather than checks. A wrong shape reaches the driver as
// a syntax error, which is not an integrity violation and is deliberately never laundered
// into an answer — so if these ever stop being refusals, the owner meets a 500 with their
// whole entry gone, which is the failure this pair exists to prevent.
describe("what the owner is most likely to mistype", () => {
  it("refuses a price written with a comma, as an Italian keyboard offers first", async () => {
    await expect(acquireVolume({ ...aTankobon(), pricePaid: "6,50" })).rejects.toMatchObject({
      code: "invalid",
      message: "A price is written with a dot and no currency: 6.50.",
    });
  });

  it("refuses a purchase date written the way it is spoken", async () => {
    await expect(
      acquireVolume({ ...aTankobon(), purchaseDate: "11/03/2024" })
    ).rejects.toMatchObject({
      code: "invalid",
      message: "A purchase date is a day, written 2024-03-11.",
    });
  });
});
