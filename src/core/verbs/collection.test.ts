import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listCataloguedOutsideTheCollection, searchCollection } from "../queries/collection.ts";
import {
  acquireVolume,
  amendVolume,
  type CataloguedVolume,
  catalogueVolume,
  releaseVolume,
} from "./collection.ts";

// Seam 1: the verbs and the query surface against a real Postgres. What is asserted is
// what the owner can see afterwards — the Collection — rather than the row that was
// written, because the row is the schema's business and the Collection is the product.
// `cascade` since the Story to Volume slice: a Volume is now referred to by the join saying
// what it carries, by its Edition note, by an acquisition and by the Readings that went
// through it, so truncating it alone is refused. Those go with it, which is what this file
// wants; Binding stays, because a data row is schema rather than a fixture.
beforeEach(async () => {
  await query("truncate volume cascade");
});

function aTankobon(): CataloguedVolume {
  return {
    title: "Slam Dunk 1",
    publisher: "Planet Manga",
    binding: "tankobon",
    language: "it",
  };
}

// The whole of ADR-0007, in this file: cataloguing an object and having it are two acts,
// and the Collection is what the second one produces.
describe("cataloguing a Volume", () => {
  it("does not put it in the Collection, because being known is not being owned", async () => {
    await catalogueVolume(aTankobon());

    expect(await searchCollection({})).toEqual([]);
    expect(await listCataloguedOutsideTheCollection()).toMatchObject([
      { title: "Slam Dunk 1", releasedOn: null },
    ]);
  });
});

describe("acquiring a Volume", () => {
  it("puts a catalogued object in the Collection, with what it cost", async () => {
    const { id } = await catalogueVolume({
      title: "L'uomo che ride",
      publisher: "Panini Comics",
      editionLine: "DC Black Label",
      binding: "hardcover",
      language: "it",
      isbn: "9788828765431",
    });

    await acquireVolume({ volumeId: id, pricePaid: "24.90", acquiredOn: "2024-03-11" });

    expect(await searchCollection({})).toEqual([
      {
        id,
        title: "L'uomo che ride",
        publisher: "Panini Comics",
        editionLine: "DC Black Label",
        binding: { id: "hardcover", name: "Hardcover" },
        language: "it",
        pricePaid: "24.90",
        acquiredOn: "2024-03-11",
        isbn: "9788828765431",
      },
    ]);
    expect(await listCataloguedOutsideTheCollection()).toEqual([]);
  });

  it("records the fact without a day, for a Volume owned since before any of this", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await acquireVolume({ volumeId: id });

    expect(await searchCollection({})).toMatchObject([{ acquiredOn: null, pricePaid: null }]);
  });

  it("refuses a second acquisition of a Volume already in the house", async () => {
    const { id } = await catalogueVolume(aTankobon());
    await acquireVolume({ volumeId: id });

    await expect(acquireVolume({ volumeId: id })).rejects.toMatchObject({
      code: "already-exists",
      message: "That Volume is already in the house.",
    });
  });

  it("takes it back after a release, because sold and bought again is a real event", async () => {
    const { id } = await catalogueVolume(aTankobon());
    await acquireVolume({ volumeId: id, pricePaid: "6.50" });
    await releaseVolume(id);

    await acquireVolume({ volumeId: id, pricePaid: "9.90" });

    // One object, two acquisitions, and the Collection claims it once — at the price of the
    // second one, which is the one the owner is holding.
    expect(await searchCollection({})).toMatchObject([{ id, pricePaid: "9.90" }]);
    const [count] = await query<{ acquisitions: string }>(
      "select count(*) as acquisitions from acquisition where volume_id = $1",
      [id]
    );
    expect(count.acquisitions).toBe("2");
  });

  it("refuses an id that names no catalogued Volume, because it creates none", async () => {
    await expect(
      acquireVolume({ volumeId: "3f7c1b2e-0000-4000-8000-000000000000" })
    ).rejects.toMatchObject({ code: "not-found", message: "No Volume has that id." });
  });
});

describe("releasing a Volume", () => {
  it("stops the Collection claiming it, without destroying the record of it", async () => {
    const { id } = await catalogueVolume(aTankobon());
    await acquireVolume({ volumeId: id });

    await releaseVolume(id);

    expect(await searchCollection({})).toEqual([]);
    // The object is still there, and this is the evidence: a released Volume can be told
    // apart from one that never existed, which a delete would have made impossible.
    await expect(releaseVolume(id)).rejects.toMatchObject({
      code: "not-allowed",
      message: "That Volume has already left the house.",
    });
  });

  it("tells a Volume never acquired apart from one let go, because the mistake differs", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await expect(releaseVolume(id)).rejects.toMatchObject({
      code: "not-allowed",
      message: "That Volume is catalogued and has never been in the house.",
    });
  });

  it("refuses an id that names no Volume", async () => {
    await expect(releaseVolume("3f7c1b2e-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("what the model refuses about an object", () => {
  it("refuses a Binding it does not know, rather than inventing one", async () => {
    await expect(catalogueVolume({ ...aTankobon(), binding: "hardback" })).rejects.toMatchObject({
      code: "not-found",
      message: "That is not a Binding. The pickers offer the ones the model knows.",
    });
  });

  it("refuses a language written as prose, because the Collection is answered against", async () => {
    await expect(catalogueVolume({ ...aTankobon(), language: "Italian" })).rejects.toMatchObject({
      code: "invalid",
      message: "A language is a code like it, en or ja.",
    });
  });

  it("refuses a Volume with no title on it", async () => {
    await expect(catalogueVolume({ ...aTankobon(), title: "  " })).rejects.toMatchObject({
      code: "invalid",
      message: "A Volume needs the title printed on it.",
    });
  });
});

// The two values Postgres parses rather than checks. A wrong shape reaches the driver as
// a syntax error, which is not an integrity violation and is deliberately never laundered
// into an answer — so if these ever stop being refusals, the owner meets a 500 with their
// whole entry gone, which is the failure this pair exists to prevent. They are on the
// acquisition now, because that is where a price and a day are facts (ADR-0007).
describe("what the owner is most likely to mistype", () => {
  it("refuses a price written with a comma, as an Italian keyboard offers first", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await expect(acquireVolume({ volumeId: id, pricePaid: "6,50" })).rejects.toMatchObject({
      code: "invalid",
      message: "A price is written with a dot and no currency: 6.50.",
    });
  });

  it("refuses a purchase date written the way it is spoken", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await expect(acquireVolume({ volumeId: id, acquiredOn: "11/03/2024" })).rejects.toMatchObject({
      code: "invalid",
      message: "A purchase date is a day, written 2024-03-11.",
    });
  });
});

// What an approved Amendment does to a catalogued object (ADR-0011). This library imported
// 96 Volumes from spreadsheets with no ISBN column at all, so the ISBN arriving later is the
// case this exists for; the Inbox is the door an assistant reaches it through, and
// `verbs/inbox.test.ts` is where that boundary is held.
describe("amending a Volume", () => {
  /** The whole of a Volume row, so that what an amendment left alone is asserted too. */
  async function volumeRow(volumeId: string): Promise<Record<string, unknown>> {
    const [row] = await query<Record<string, unknown>>(
      "select title, publisher, edition_line, binding_id, language, isbn from volume where id = $1",
      [volumeId]
    );
    return row;
  }

  it("writes the field it names and leaves every other one standing", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await amendVolume(id, { isbn: "9788891234567" });

    expect(await volumeRow(id)).toEqual({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      edition_line: null,
      binding_id: "tankobon",
      language: "it",
      isbn: "9788891234567",
    });
  });

  it("leaves the record standing where a field is emptied rather than changed", async () => {
    const { id } = await catalogueVolume(aTankobon());

    // An amendment completes and corrects; it never empties. Taking a fact out is the
    // owner's act on the record, not something an assistant proposes its way to.
    await amendVolume(id, { isbn: "9788891234567", publisher: null });

    expect(await volumeRow(id)).toMatchObject({ publisher: "Planet Manga" });
  });

  it("refuses an amendment that names nothing, because nothing is not a change", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await expect(amendVolume(id, {})).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
    });
  });

  it("refuses it in the Volume's own prose", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await expect(amendVolume(id, { binding: "hardback" })).rejects.toMatchObject({
      name: "Refusal",
      message: "That is not a Binding. The pickers offer the ones the model knows.",
    });
    await expect(amendVolume(id, { isbn: "978-88-9123-456-7" })).rejects.toMatchObject({
      name: "Refusal",
      message: "An ISBN is 10 or 13 characters with no spaces or dashes.",
    });
  });

  it("refuses a Volume that is not there, and a malformed id is the same event", async () => {
    await expect(
      amendVolume("6f5f4e3d-2c1b-4a09-8877-665544332211", { isbn: "9788891234567" })
    ).rejects.toMatchObject({ name: "Refusal", code: "not-found" });

    await expect(amendVolume("banana", { isbn: "9788891234567" })).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
    });
  });
});
