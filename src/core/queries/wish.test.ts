import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { acquireVolume, releaseVolume } from "../verbs/collection.ts";
import { openWish } from "../verbs/wish.ts";
import { listOpenWishes, listVolumesToWishFor } from "./wish.ts";

// Seam 1, the question side: what the Wish screen and the MCP door read. The shopping
// list's own behaviour — what opens it, what ends it — is asserted beside the verbs; here
// what matters is which Volumes a Wish may name, and what a reader is told about each one.
beforeEach(async () => {
  await query("truncate volume cascade");
});

async function aVolume(title: string, binding = "tankobon"): Promise<string> {
  const { id } = await acquireVolume({
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
