import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { listCataloguedOutsideTheCollection, searchCollection } from "../queries/collection.ts";
import { isRefusal } from "../refusal.ts";
import {
  acquireVolume,
  amendVolume,
  type CataloguedVolume,
  catalogueVolume,
  correctAcquisition,
  releaseVolume,
  strikeVolumes,
} from "./collection.ts";
import { writeEditionNote } from "./edition-note.ts";
import { recordPass } from "./pass.ts";
import { createStory } from "./story.ts";
import { openWish } from "./wish.ts";

// Seam 1: the verbs and the query surface against a real Postgres. What is asserted is
// what the owner can see afterwards — the Collection — rather than the row that was
// written, because the row is the schema's business and the Collection is the product.
// `cascade` since the Story to Volume slice: a Volume is now referred to by the join saying
// what it carries, by its Edition note, by an acquisition and by the Passes that went
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

// **Correcting an acquisition**, which is the one repair this file had no verb for and the
// one the shelves needed: a Volume stands in production carrying a price the owner never
// paid, and every figure about money counted it.
//
// What is asserted is the pair of absences, because that is the whole of the design. A fact
// the correction does not name is left standing; a fact it names as null is **taken off the
// record**, which is what no `amend` in this file can do and what *I never paid that* means.
describe("correcting an acquisition", () => {
  /** One acquisition of one object, and its id, which is what a correction names. */
  async function anAcquisition(made: { pricePaid?: string; acquiredOn?: string } = {}) {
    const volumeId = await volumeInTheHouse(aTankobon(), made);
    const [row] = await query<{ id: string }>("select id from acquisition where volume_id = $1", [
      volumeId,
    ]);
    return { volumeId, id: row.id };
  }

  /** What the record says now, read back rather than trusted. */
  async function asRecorded(id: string) {
    const [row] = await query<{ pricePaid: string | null; acquiredOn: string | null }>(
      `select price_paid::text as "pricePaid", to_char(acquired_on, 'YYYY-MM-DD') as "acquiredOn"
         from acquisition where id = $1`,
      [id]
    );
    return row;
  }

  it("rewrites a price that was wrong", async () => {
    const { id } = await anAcquisition({ pricePaid: "24.90", acquiredOn: "2026-03-02" });

    await correctAcquisition(id, { pricePaid: "6,50" });

    // Written as the owner typed it, comma and all: that is `priceAsTyped`'s rule, and this
    // verb spends it rather than keeping a second copy.
    expect(await asRecorded(id)).toEqual({ pricePaid: "6.50", acquiredOn: "2026-03-02" });
  });

  // The sentence this verb exists for.
  it("takes a price off the record where the owner never paid one", async () => {
    const { id } = await anAcquisition({ pricePaid: "24.90", acquiredOn: "2026-03-02" });

    await correctAcquisition(id, { pricePaid: null });

    // Null and never nought. A zero would be a claim about money where the truth is that no
    // money is recorded, and every figure in the app reads the two apart.
    expect(await asRecorded(id)).toEqual({ pricePaid: null, acquiredOn: "2026-03-02" });
  });

  it("leaves a fact the correction does not name standing", async () => {
    const { id } = await anAcquisition({ pricePaid: "6.50", acquiredOn: "2026-03-02" });

    await correctAcquisition(id, { acquiredOn: "2026-03-09" });

    expect(await asRecorded(id)).toEqual({ pricePaid: "6.50", acquiredOn: "2026-03-09" });
  });

  it("takes the day off the record too, for an object that was simply always here", async () => {
    const { id } = await anAcquisition({ pricePaid: "6.50", acquiredOn: "2026-03-02" });

    await correctAcquisition(id, { acquiredOn: null });

    expect(await asRecorded(id)).toEqual({ pricePaid: "6.50", acquiredOn: null });
  });

  it("keeps the acquisition rather than unmaking it, so nothing else moves", async () => {
    const { volumeId, id } = await anAcquisition({ pricePaid: "24.90" });

    await correctAcquisition(id, { pricePaid: null });

    // Still in the house, still one acquisition. Correcting a fact is not striking a record,
    // and a verb that unmade the row and said it again would lose what is not wrong.
    expect(await searchCollection({})).toMatchObject([{ id: volumeId }]);
  });

  it("refuses a correction that names nothing, rather than reporting a write it did not make", async () => {
    const { id } = await anAcquisition({ pricePaid: "6.50" });

    await expect(correctAcquisition(id, {})).rejects.toMatchObject({
      code: "invalid",
      message: "A correction rewrites at least one fact of the acquisition.",
    });
  });

  it("refuses a price that is not one, in the words every field that takes money uses", async () => {
    const { id } = await anAcquisition();

    await expect(
      correctAcquisition(id, { pricePaid: "sei euro e cinquanta" })
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses a day written as prose", async () => {
    const { id } = await anAcquisition();

    await expect(correctAcquisition(id, { acquiredOn: "il 2 marzo" })).rejects.toMatchObject({
      code: "invalid",
      message: "A purchase date is a day, written 2024-03-11.",
    });
  });

  // The object's own history arguing with itself, which is the one refusal the database owns
  // here rather than this verb.
  it("refuses a day that would have the object come home after it left", async () => {
    const { volumeId, id } = await anAcquisition({ acquiredOn: "2026-03-02" });
    await releaseVolume(volumeId);

    // `invalid` rather than `not-allowed`, because it is a check constraint and that is the
    // code every check violation in this repository comes back as.
    await expect(correctAcquisition(id, { acquiredOn: "2099-01-01" })).rejects.toMatchObject({
      code: "invalid",
      message:
        "That would have the object coming home after it left the house. Correct the day it went, or pick an earlier one.",
    });
  });

  it("refuses an id that names no acquisition", async () => {
    await expect(
      correctAcquisition("3f7c1b2e-0000-4000-8000-000000000000", { pricePaid: null })
    ).rejects.toMatchObject({ code: "not-found", message: "No acquisition has that id." });
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
// into an answer — so if these ever stop being handled here, the owner meets a 500 with their
// whole entry gone, which is the failure this pair exists to prevent. They are on the
// acquisition now, because that is where a price and a day are facts (ADR-0007).
describe("what the owner is most likely to mistype", () => {
  // **This used to be a refusal, and reversing it is the point.** The numeric keyboard on an
  // Italian phone offers a comma and no dot, and the Collection is the screen used one-handed
  // in a shop — so refusing the only separator that keyboard has was the app calling the
  // owner wrong for typing what they were given. What a price *looks like* is `../money.ts`
  // now; this asserts it reaches the acquisition as a number Postgres took.
  it("takes a price written with a comma, which is what the phone's number pad offers", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await acquireVolume({ volumeId: id, pricePaid: "6,50" });

    expect(await searchCollection({})).toMatchObject([{ pricePaid: "6.50" }]);
  });

  it("still refuses a price that is not one, rather than meeting a syntax error", async () => {
    const { id } = await catalogueVolume(aTankobon());

    await expect(acquireVolume({ volumeId: id, pricePaid: "€6,50" })).rejects.toMatchObject({
      code: "invalid",
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

// **Striking a Volume from the catalogue**, and the whole of what makes it not the delete
// ADR-0007 refuses: releasing is about the world, striking is about the record.
//
// It exists because an assistant filed duplicates the owner approved in bulk and noticed a
// day later — *Slam Dunk 5* to *9*, catalogued twice, under an edition line never bought.
// What keeps it safe is not a confirmation dialog, it is the four refusals below: an object
// with any of the owner's own life on it is not a mistaken record, and no duplicate has any.
describe("striking a Volume from the catalogue", () => {
  async function aCatalogued(title = "Slam Dunk 5"): Promise<string> {
    const { id } = await catalogueVolume({ ...aTankobon(), title });
    return id;
  }

  it("takes a mistaken record out of the catalogue entirely", async () => {
    const duplicate = await aCatalogued();

    expect(await strikeVolumes([duplicate])).toBe(1);
    expect(await listCataloguedOutsideTheCollection()).toEqual([]);
  });

  it("strikes the whole selection in one gesture, because a mess arrives by the dozen", async () => {
    const five = await aCatalogued("Slam Dunk 5");
    const six = await aCatalogued("Slam Dunk 6");
    const keep = await aCatalogued("Slam Dunk 7");

    expect(await strikeVolumes([five, six])).toBe(2);
    expect(await listCataloguedOutsideTheCollection()).toMatchObject([{ id: keep }]);
  });

  it("takes an acquisition that ended with it, which is the deliberate half", async () => {
    // A duplicate's purchase history is as fictional as the duplicate. This is why the line
    // is the *open* acquisition rather than any acquisition at all.
    const duplicate = await aCatalogued();
    await acquireVolume({ volumeId: duplicate, pricePaid: "6.50" });
    await releaseVolume(duplicate);

    expect(await strikeVolumes([duplicate])).toBe(1);
    expect(await query("select * from acquisition where volume_id = $1", [duplicate])).toEqual([]);
  });

  // The rail that makes a bulk control over the catalogue safe at all.
  it("refuses an object that is in the house, and says to release it first", async () => {
    const onTheShelf = await volumeInTheHouse(aTankobon());

    await expect(strikeVolumes([onTheShelf])).rejects.toSatisfy(
      (error: unknown) =>
        isRefusal(error) && error.code === "not-allowed" && error.message.includes("Release it")
    );
  });

  it("refuses one a Pass went through, because that is an event in the owner's life", async () => {
    const read = await volumeInTheHouse(aTankobon());
    const story = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await recordPass({
      storyId: story,
      medium: "paper",
      volumeId: read,
      provenanceId: "typed-from-the-shelf",
    });
    await releaseVolume(read);

    await expect(strikeVolumes([read])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.includes("Pass")
    );
  });

  it("refuses one the owner wrote an Edition note about", async () => {
    const judged = await aCatalogued();
    await writeEditionNote(judged, "The paper is thin but the price is right.");

    await expect(strikeVolumes([judged])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.includes("Edition note")
    );
  });

  it("refuses one a Wish names, and says to close the Wish first", async () => {
    const wanted = await aCatalogued();
    await openWish({ volumeId: wanted, period: "2026-09" });

    await expect(strikeVolumes([wanted])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.includes("Wish")
    );
  });

  // Half a clean-up is worse than none: the owner would have to work out which half.
  it("strikes nothing at all when one of the selection stands", async () => {
    const duplicate = await aCatalogued("Slam Dunk 5");
    const onTheShelf = await volumeInTheHouse({ ...aTankobon(), title: "Slam Dunk 6" });

    await expect(strikeVolumes([duplicate, onTheShelf])).rejects.toSatisfy(isRefusal);
    expect(await listCataloguedOutsideTheCollection()).toMatchObject([{ id: duplicate }]);
  });

  it("names the one that stands, so the owner knows which to untick", async () => {
    const onTheShelf = await volumeInTheHouse({ ...aTankobon(), title: "Berserk Deluxe 3" });

    await expect(strikeVolumes([onTheShelf])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.startsWith("Berserk Deluxe 3 stays:")
    );
  });

  it("refuses an empty selection rather than reporting nothing done", async () => {
    await expect(strikeVolumes([])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "invalid"
    );
    await expect(strikeVolumes(["banana"])).rejects.toSatisfy(isRefusal);
  });

  it("refuses an id no Volume has, rather than striking the rest of the selection", async () => {
    const duplicate = await aCatalogued();

    await expect(
      strikeVolumes([duplicate, "00000000-0000-4000-8000-000000000000"])
    ).rejects.toSatisfy((error: unknown) => isRefusal(error) && error.code === "not-found");
    expect(await listCataloguedOutsideTheCollection()).toMatchObject([{ id: duplicate }]);
  });
});
