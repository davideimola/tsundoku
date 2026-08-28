import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { openWish } from "../verbs/wish.ts";
import { listOpenWishes, listVolumesToWishFor } from "./wish.ts";

// Seam 1, the question side: what the Wish screen and the MCP door read. The shopping
// list's own behaviour — what opens it, what ends it — is asserted beside the verbs; here
// what matters is which Volumes a Wish may name, and what a reader is told about each one.
beforeEach(async () => {
  await query("truncate volume cascade");
});

async function aVolume(title: string, binding = "tankobon"): Promise<string> {
  const id = await volumeInTheHouse({
    title,
    publisher: "Planet Manga",
    binding,
    language: "it",
  });
  return id;
}

describe("the Volumes a Wish can name", () => {
  it("offers the ones the library knows, by title", async () => {
    await aVolume("Vagabond 1");
    await aVolume("Berserk Deluxe 3", "deluxe");

    expect(await listVolumesToWishFor()).toEqual([
      {
        id: expect.any(String),
        title: "Berserk Deluxe 3",
        publisher: "Planet Manga",
        editionLine: null,
        binding: "Deluxe",
        inCollection: true,
      },
      {
        id: expect.any(String),
        title: "Vagabond 1",
        publisher: "Planet Manga",
        editionLine: null,
        binding: "Tankōbon",
        inCollection: true,
      },
    ]);
  });

  // **The case the whole wishlist exists for** (ADR-0007). Until the catalogue and the
  // Collection came apart, every Volume a Wish could name was owned, so the shopping list
  // said *you already have this* about all twenty-one rows of it. An ordinary Wish now
  // names an object the library knows and the house does not hold.
  it("offers a Volume catalogued and never owned, and says the Collection has it not", async () => {
    const { id } = await catalogueVolume({
      title: "Blame! 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await openWish({ volumeId: id, priority: 1 });

    expect(await listVolumesToWishFor()).toMatchObject([
      { title: "Blame! 1", inCollection: false },
    ]);
    expect(await listOpenWishes()).toMatchObject([{ inCollection: false }]);
  });

  // Deliberately not the Collection. A Volume that left the house is a Volume the owner
  // can want again — the copy was sold, lent and lost, or replaced by a better edition —
  // so it stays on offer and says that it is gone.
  it("keeps offering a Volume that left the house, and says that it left", async () => {
    const id = await aVolume("Slam Dunk 1");
    await releaseVolume(id);

    expect(await listVolumesToWishFor()).toMatchObject([{ inCollection: false }]);
  });

  it("offers nothing when the library holds nothing, rather than inventing a Volume", async () => {
    expect(await listVolumesToWishFor()).toEqual([]);
  });
});

describe("the shopping list", () => {
  it("is empty until something is wanted, and says nothing about what ended", async () => {
    await aVolume("Vagabond 1");

    expect(await listOpenWishes()).toEqual([]);
  });

  it("puts the oldest intention first within one priority", async () => {
    const waiting = await aVolume("Vagabond 1");
    const fresh = await aVolume("Vagabond 2");

    await openWish({ volumeId: waiting, priority: 2 });
    await query("update wish set opened_on = current_date - 200");
    await openWish({ volumeId: fresh, priority: 2 });

    expect((await listOpenWishes()).map((wish) => wish.volume.title)).toEqual([
      "Vagabond 1",
      "Vagabond 2",
    ]);
  });
});
