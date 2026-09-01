import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
import { openWish } from "../verbs/wish.ts";
import { listOpenWishes, listVolumesToWishFor } from "./wish.ts";

// Seam 1, the question side: what the Wish screen and the MCP door read. The shopping
// list's own behaviour — what opens it, what ends it — is asserted beside the verbs; here
// what matters is which Volumes a Wish may name, and what a reader is told about each one.
beforeEach(async () => {
  await query("truncate volume, series cascade");
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

// **What a shopping list has to show of an object is what a shop shows of it** (#31): the
// list is read standing in front of a shelf, and a row of text is the format the
// spreadsheet already had. So a Wish carries the jacket and the line the object stands in,
// which is what the tile beside it is drawn from — the same tile, in the same colour, as
// the walls the owner learns their shelf by.
describe("the object a Wish is read by", () => {
  // An object the owner had, let go, and means to buy again — which is where a wished-for
  // Volume comes to stand in a line at all: a position of a Series is filled by what is on
  // the shelf (`placeVolumeInSeries`), so something catalogued and never owned stands in
  // none and is the drawn tile below.
  async function wishedFor(): Promise<{ volumeId: string; seriesId: string }> {
    const volumeId = await aVolume("Vagabond 12");
    const seriesId = await declareSeries({
      name: "Vagabond",
      publisher: "Planet Manga",
      publishedCount: 37,
      status: "concluded",
    });
    await placeVolumeInSeries({ volumeId, seriesId, number: 12 });
    await releaseVolume(volumeId);
    await openWish({ volumeId, priority: 1 });

    return { volumeId, seriesId };
  }

  it("carries the line the object stands in and the position it stands at", async () => {
    const { seriesId } = await wishedFor();

    const [wish] = await listOpenWishes();

    expect(wish.volume.seriesId).toBe(seriesId);
    expect(wish.volume.seriesNumber).toBe(12);
  });

  it("carries the jacket the object is faced with", async () => {
    const { volumeId } = await wishedFor();
    await query(
      `update volume set cover_source = 'google-books', cover_url = $2, cover_looked_up_at = now()
        where id = $1`,
      [volumeId, "https://books.google.com/books/content?id=njT&img=1&zoom=5"]
    );

    const [wish] = await listOpenWishes();

    expect(wish.volume.cover).toMatchObject({
      url: "https://books.google.com/books/content?id=njT&img=1&zoom=5",
    });
  });

  // The ordinary answer and not a gap, the same one every wall gets: an object standing in
  // no line has no colour to wear and no number to print, and the tile drawn for it is the
  // library's own paper.
  it("says so plainly where the object stands in no line and wears no jacket", async () => {
    const { id } = await catalogueVolume({
      title: "Akira",
      publisher: "Planet Manga",
      binding: "omnibus",
      language: "it",
    });
    await openWish({ volumeId: id, priority: 3 });

    const [wish] = await listOpenWishes();

    expect(wish.volume.seriesId).toBeNull();
    expect(wish.volume.seriesNumber).toBeNull();
    expect(wish.volume.cover).toBeNull();
  });
});
