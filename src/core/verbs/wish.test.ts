import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { listOpenWishes } from "../queries/wish.ts";
import { type CataloguedVolume, releaseVolume } from "./collection.ts";
import { closeWish, openWish } from "./wish.ts";

// Seam 1: the verbs and the query surface against a real Postgres. What is asserted is
// the shopping list — what the owner reads before spending money — rather than the row
// that was written.
//
// `cascade` takes the Wishes with the Volumes they name, which is also why the two
// Collection test files now say it: a Wish references `volume`, and Postgres refuses to
// truncate a table something points at unless the pointing table goes too.
beforeEach(async () => {
  await query("truncate volume cascade");
});

/** A Volume to want. Its id is what a Wish names; nothing else about it matters here. */
async function aVolume(overrides: Partial<CataloguedVolume> = {}): Promise<string> {
  const id = await volumeInTheHouse({
    title: "Death Note Black Edition III",
    publisher: "Planet Manga",
    binding: "tankobon",
    language: "it",
    ...overrides,
  });
  return id;
}

describe("opening a Wish", () => {
  it("names an existing Volume and carries the numbers that decide a purchase", async () => {
    const volumeId = await aVolume();

    await openWish({
      volumeId,
      priority: 1,
      targetPrice: "15.00",
      priceFound: "12.90",
      shop: "Star Shop",
    });

    expect(await listOpenWishes()).toEqual([
      {
        id: expect.any(String),
        priority: 1,
        targetPrice: "15.00",
        priceFound: "12.90",
        withinTarget: true,
        shop: "Star Shop",
        openedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        inCollection: true,
        volume: {
          id: volumeId,
          title: "Death Note Black Edition III",
          publisher: "Planet Manga",
          editionLine: null,
          binding: { id: "tankobon", name: "Tankōbon" },
          language: "it",
          isbn: null,
        },
      },
    ]);
  });

  it("is a Wish before any price is known, because wanting comes first", async () => {
    await openWish({ volumeId: await aVolume(), priority: 3 });

    expect(await listOpenWishes()).toMatchObject([
      { priority: 3, targetPrice: null, priceFound: null, withinTarget: null, shop: null },
    ]);
  });

  it("says the price found is over the target rather than leaving the owner to subtract", async () => {
    await openWish({
      volumeId: await aVolume(),
      priority: 2,
      targetPrice: "15.00",
      priceFound: "19.90",
    });

    expect(await listOpenWishes()).toMatchObject([{ withinTarget: false }]);
  });

  // The MCP door may call verbs on entities that already exist and may only *propose* the
  // creation of a Volume, as an Inbox entry the owner approves (ADR-0005). This is that
  // boundary from the Wish's side: a Volume that is not there is a refusal, never an
  // insert.
  it("refuses a Volume that does not exist rather than creating one", async () => {
    await expect(
      openWish({ volumeId: "3f7c1b2e-0000-4000-8000-000000000000", priority: 1 })
    ).rejects.toMatchObject({
      code: "not-found",
      message:
        "No Volume has that id. A Volume that is not in the library yet is a proposal, not a Wish.",
    });

    expect(await listOpenWishes()).toEqual([]);
  });

  it("refuses an id that is not an id at all, for the same reason", async () => {
    await expect(openWish({ volumeId: "banana", priority: 1 })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("refuses a second open Wish on one Volume, so the list never says buy this twice", async () => {
    const volumeId = await aVolume();
    await openWish({ volumeId, priority: 1 });

    await expect(openWish({ volumeId, priority: 2 })).rejects.toMatchObject({
      code: "already-exists",
      message: "There is already an open Wish for that Volume.",
    });
  });

  it("refuses a priority outside the three steps the list is read in", async () => {
    await expect(openWish({ volumeId: await aVolume(), priority: 4 })).rejects.toMatchObject({
      code: "invalid",
      message: "A priority is 1 (next), 2 (soon) or 3 (someday).",
    });
  });

  // The same value Postgres parses rather than checks — see `collection.ts` and
  // `../money.ts`. A comma is what the phone's number pad offers, so it is taken and turned
  // into the dot the column wants; anything that is not a price at all is still a refusal,
  // because a syntax error is never laundered into an answer.
  it("takes a target price written with a comma, and stores the number", async () => {
    await openWish({ volumeId: await aVolume(), priority: 1, targetPrice: "15,00" });

    expect(await listOpenWishes()).toMatchObject([{ targetPrice: "15.00" }]);
  });

  it("still refuses a target price that is not a price", async () => {
    await expect(
      openWish({ volumeId: await aVolume(), priority: 1, targetPrice: "quindici euro" })
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("takes a blank price as no price, rather than sending an empty box to Postgres", async () => {
    // A form field nobody filled, or an assistant with no number to give. `""` in a
    // `numeric` column is a syntax error, which is never laundered into an answer — so
    // this is the difference between an empty box and a 500 with the whole entry gone.
    await openWish({ volumeId: await aVolume(), priority: 1, targetPrice: "", priceFound: "  " });

    expect(await listOpenWishes()).toMatchObject([{ targetPrice: null, priceFound: null }]);
  });

  it("takes a price found written with a comma too, because both boxes are on the same phone", async () => {
    await openWish({ volumeId: await aVolume(), priority: 1, priceFound: "12,90" });

    expect(await listOpenWishes()).toMatchObject([{ priceFound: "12.90" }]);
  });
});

describe("the shopping list", () => {
  it("puts what to buy first at the top", async () => {
    const someday = await aVolume({ title: "Berserk Deluxe 1" });
    const next = await aVolume({ title: "Slam Dunk 1" });
    const soon = await aVolume({ title: "Vagabond 1" });

    await openWish({ volumeId: someday, priority: 3 });
    await openWish({ volumeId: next, priority: 1 });
    await openWish({ volumeId: soon, priority: 2 });

    expect((await listOpenWishes()).map((wish) => wish.volume.title)).toEqual([
      "Slam Dunk 1",
      "Vagabond 1",
      "Berserk Deluxe 1",
    ]);
  });
});

// The criterion an implementation breaks by being helpful. A Wish ends when the owner
// says so and at no other moment: not when the Volume turns out to be in the house, not
// when it leaves it again.
describe("a Wish ends only by a deliberate act", () => {
  it("stays open while the Volume it names is in the Collection", async () => {
    const volumeId = await aVolume();

    await openWish({ volumeId, priority: 1 });

    // The Volume is owned — `acquireVolume` is what put it there — and the Wish is still
    // on the shopping list, saying so.
    expect(await listOpenWishes()).toMatchObject([{ inCollection: true }]);
  });

  it("stays open when the Volume leaves the house", async () => {
    const volumeId = await aVolume();
    await openWish({ volumeId, priority: 2 });

    await releaseVolume(volumeId);

    expect(await listOpenWishes()).toMatchObject([{ inCollection: false }]);
  });

  it("ends when the owner closes it, and then it is off the list", async () => {
    const { id } = await openWish({ volumeId: await aVolume(), priority: 1 });

    await closeWish(id);

    expect(await listOpenWishes()).toEqual([]);
  });

  it("refuses to be closed twice, rather than passing silently", async () => {
    const { id } = await openWish({ volumeId: await aVolume(), priority: 1 });
    await closeWish(id);

    await expect(closeWish(id)).rejects.toMatchObject({
      code: "not-allowed",
      message: "That Wish has already ended.",
    });
  });

  it("refuses an id that names no Wish", async () => {
    await expect(closeWish("3f7c1b2e-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  // "Nothing closes it implicitly" is a claim about the whole database and not only about
  // the two verbs above, so it is asked of the database: no trigger of ours exists
  // anywhere, on `volume` or on anything else, that could reach `wish.closed_on` behind
  // the owner's back.
  it("has nothing in the schema that could close one behind the owner's back", async () => {
    // Only triggers that could touch a Wish: another slice is free to add one of its
    // own, and this must fail for the reason it is named for rather than for that.
    const triggers = await query<{ table: string; trigger: string }>(
      `select c.relname as table, t.tgname as trigger
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_proc p on p.oid = t.tgfoid
        where n.nspname = 'public'
          and not t.tgisinternal
          and (c.relname = 'wish' or p.prosrc ~* 'wish|closed_on')`
    );

    expect(triggers).toEqual([]);
  });

  it("can be wished again once it ended, because the copy sold before the owner got there", async () => {
    const volumeId = await aVolume();
    const { id } = await openWish({ volumeId, priority: 1, shop: "Star Shop" });
    await closeWish(id);

    await openWish({ volumeId, priority: 1, shop: "Amazon" });

    expect(await listOpenWishes()).toMatchObject([{ shop: "Amazon" }]);
  });
});

// `Acquistato` sits among the wish states in the owner's spreadsheet, and it is not a
// state: it is a wish that ended. So it is not enough for this slice to leave it unused —
// there must be nowhere to put it.
//
// This is the one place in the repo that asks the schema a question rather than the core,
// and it is deliberate: the criterion *is* structural. A test written at the seam could
// only show that today's verbs never set such a field, which is exactly what stops being
// true the moment somebody adds one.
describe("there is no Acquistato state", () => {
  it("has nowhere on a Wish to record one", async () => {
    const columns = await query<{ column_name: string; data_type: string }>(
      `select column_name, data_type
         from information_schema.columns
        where table_schema = 'public' and table_name = 'wish'
        order by ordinal_position`
    );

    // Every column is an id, a number the owner shops by, a name, or a day. A Wish knows
    // when it ended and nothing about what ending meant.
    expect(columns.map((column) => column.column_name)).toEqual([
      "id",
      "volume_id",
      "priority",
      "target_price",
      "price_found",
      "shop",
      "opened_on",
      "closed_on",
    ]);

    const stateish = columns.filter((column) =>
      /state|status|stato|acquist|purchas|bought|owned|fulfil/i.test(column.column_name)
    );
    expect(stateish).toEqual([]);

    // And no column of it is an enum, which is the other way a state could have been
    // written down. Days, numbers, ids and prose: nothing here can hold a vocabulary.
    expect([...new Set(columns.map((column) => column.data_type))].sort()).toEqual([
      "date",
      "integer",
      "numeric",
      "text",
      "uuid",
    ]);
  });
});
