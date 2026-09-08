import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { searchCollection } from "../queries/collection.ts";
import { listOpenWishes } from "../queries/wish.ts";
import { boughtWhatWasWished } from "./bought-what-was-wished.ts";
import { acquireVolume, catalogueVolume } from "./collection.ts";
import { openWish } from "./wish.ts";

// Seam 1: *Bought it*, the one press that ends a Wish by saying why (ADR-0023). What is
// asserted is the pair of facts as the two areas answer with them — the object is in the house
// and the Wish is off the list — because that pair is the whole claim of this verb.
beforeEach(async () => {
  await query("truncate volume cascade");
});

/**
 * A catalogued Volume the house does **not** hold, which is what an ordinary Wish names
 * (ADR-0007) — so the fixture here is `catalogueVolume` alone rather than `volumeInTheHouse`.
 */
async function anObjectToBuy(title = "Vinland Saga 1"): Promise<string> {
  const { id } = await catalogueVolume({
    title,
    publisher: "Star Comics",
    binding: "tankobon",
    language: "it",
  });
  return id;
}

describe("the object a Wish named came home", () => {
  it("puts it in the house and takes the Wish off the list, in one press", async () => {
    const volumeId = await anObjectToBuy();
    const { id } = await openWish({ volumeId, period: "2026-09", priceFound: "12.90" });

    await boughtWhatWasWished(id, { pricePaid: "12,90", acquiredOn: "2026-09-08" });

    expect(await listOpenWishes()).toEqual([]);
    expect(await searchCollection({})).toMatchObject([
      { id: volumeId, title: "Vinland Saga 1", pricePaid: "12.90", acquiredOn: "2026-09-08" },
    ]);
  });

  // The object is in the house whether or not the receipt survived, which is `acquireVolume`'s
  // own posture about money and not a second rule here.
  it("records the acquisition with no price at all", async () => {
    const volumeId = await anObjectToBuy();
    const { id } = await openWish({ volumeId });

    await boughtWhatWasWished(id);

    expect(await listOpenWishes()).toEqual([]);
    expect(await searchCollection({})).toMatchObject([{ id: volumeId, pricePaid: null }]);
  });

  // **What the Wish said is not a receipt.** The price found is what a shop was asking, and
  // nothing copies it into what was paid on the owner's behalf.
  it("does not write the price the Wish found as the price paid", async () => {
    const volumeId = await anObjectToBuy();
    const { id } = await openWish({ volumeId, priceFound: "19.90" });

    await boughtWhatWasWished(id);

    expect(await searchCollection({})).toMatchObject([{ pricePaid: null }]);
  });

  it("refuses a Wish that has already ended", async () => {
    const volumeId = await anObjectToBuy();
    const { id } = await openWish({ volumeId, period: "2026-09" });
    await boughtWhatWasWished(id);

    await expect(boughtWhatWasWished(id)).rejects.toMatchObject({
      code: "not-allowed",
      message: "That Wish has already ended.",
    });
  });

  it("refuses an id that names no Wish", async () => {
    await expect(boughtWhatWasWished("3f7c1b2e-0000-4000-8000-000000000000")).rejects.toMatchObject(
      { code: "not-found" }
    );
  });

  it("refuses an id that is not an id at all", async () => {
    await expect(boughtWhatWasWished("banana")).rejects.toMatchObject({ code: "not-found" });
  });

  // **One transaction, so it is one event.** The house already holding the object is the
  // Collection's refusal, and the close that had already been written inside the transaction
  // goes back with it — a Wish closed for an acquisition that was refused is exactly the half
  // this verb exists to make impossible.
  it("leaves the Wish open when the acquisition is refused", async () => {
    const volumeId = await anObjectToBuy();
    await acquireVolume({ volumeId });
    const { id } = await openWish({ volumeId, period: "2026-09" });

    await expect(boughtWhatWasWished(id)).rejects.toMatchObject({
      code: "already-exists",
      message: "That Volume is already in the house.",
    });

    expect(await listOpenWishes()).toMatchObject([{ id, period: "2026-09" }]);
  });
});
