import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume } from "../verbs/collection.ts";
import { dropOwnStoryImage, setOwnCover, setOwnStoryImage } from "../verbs/cover.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import { coverStanding } from "./cover.ts";
import { findStory, listStoryWall } from "./story.ts";

// Seam 1. Two questions, and they are separate because they are asked by two different
// screens: *how far have the covers got* is the Collection's, and *what jacket does this
// narrative wear* is the Story wall's.
beforeEach(async () => {
  await query("truncate volume cascade");
  await query("truncate story cascade");
  await query("truncate series cascade");
});

const A_COVER = "https://books.google.com/books/content?id=njT-zgEACAAJ&img=1&zoom=5";

/** Put a cover on a Volume the way an answered lookup would have. */
async function looked(volumeId: string, url = A_COVER): Promise<void> {
  await query(
    `update volume set cover_source = 'google-books', cover_url = $2,
                       cover_looked_up_at = now()
      where id = $1`,
    [volumeId, url]
  );
}

describe("how far the covers have got", () => {
  it("counts what is faced, what a lookup could still reach, and what no lookup ever will", async () => {
    const withACover = await volumeInTheHouse({
      title: "One Piece 100",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
      isbn: "9788828765431",
    });
    await looked(withACover);

    // An ISBN and no cover: the lookup's own queue.
    await volumeInTheHouse({
      title: "One Piece 101",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
      isbn: "9788828765448",
    });

    // A Bonelli monthly: an ISSN-derived periodical EAN and no ISBN at all, so it is not in
    // the queue and never will be. The two numbers are separate for exactly this object.
    const noIsbn = await volumeInTheHouse({
      title: "Dylan Dog 450",
      publisher: "Sergio Bonelli Editore",
      binding: "stapled",
      language: "it",
    });

    expect(await coverStanding()).toEqual({ volumes: 3, faced: 1, due: 1, withoutAnIsbn: 1 });

    // A photograph faces the one thing no lookup can reach, and moves neither queue.
    await setOwnCover(noIsbn, "https://tsundoku.davideimola.dev/images/dylan-dog-450.jpg");

    expect(await coverStanding()).toEqual({ volumes: 3, faced: 2, due: 1, withoutAnIsbn: 1 });
  });

  it("counts the whole catalogue and not the Collection, because a cover is the object's", async () => {
    await catalogueVolume({
      title: "One Piece 102",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
      isbn: "9788828765455",
    });

    expect(await coverStanding()).toMatchObject({ volumes: 1, due: 1 });
  });
});

describe("the jacket a Story wears on the wall", () => {
  /** A Story carried by the Volumes named, in the order they are given. */
  async function aStoryAcross(volumes: { title: string; number: number; cover?: string }[]) {
    const story = await createStory({ title: "One Piece", typeId: "manga" });
    const series = await declareSeries({
      name: "One Piece",
      publisher: "Planet Manga",
      publishedCount: 110,
      status: "ongoing",
    });

    for (const one of volumes) {
      const volume = await volumeInTheHouse({
        title: one.title,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: one.number });
      if (one.cover) await looked(volume, one.cover);
      await recordVolumeCarriesStory(volume, story);
    }

    return story;
  }

  // A Story is not an object and has no ISBN of its own (ADR-0001), so what it wears is
  // borrowed — and *Slam Dunk* across twenty tankōbon wears the first one, which is what a
  // bookshop does and what the owner would point at.
  it("is the first Volume's, where several carry it", async () => {
    await aStoryAcross([
      { title: "One Piece 100", number: 100, cover: A_COVER },
      {
        title: "One Piece 101",
        number: 101,
        cover: "https://books.google.com/books/content?id=LATER",
      },
    ]);

    const [story] = await listStoryWall();
    expect(story.cover).toMatchObject({ url: A_COVER });
  });

  it("is the first one that has one, where the earlier Volumes have none", async () => {
    await aStoryAcross([
      { title: "One Piece 100", number: 100 },
      { title: "One Piece 101", number: 101, cover: A_COVER },
    ]);

    const [story] = await listStoryWall();
    expect(story.cover).toMatchObject({ url: A_COVER });
  });

  it("is nothing at all where no Volume carrying it has one, which is the drawn tile", async () => {
    await aStoryAcross([{ title: "One Piece 100", number: 100 }]);

    const [story] = await listStoryWall();
    expect(story.cover).toBeNull();
  });

  it("is nothing at all for a Story with no Volume, which is an ordinary Story", async () => {
    await createStory({ title: "Slam Dunk", typeId: "manga" });

    const [story] = await listStoryWall();
    expect(story.cover).toBeNull();
  });

  // And the Story's own page wears the one the wall faced it with (#29). It is the same
  // borrowing read by a second query, so it is the same fragment: a tile the owner tapped
  // that arrived showing a different volume's jacket would be the wall lying about where it
  // led.
  it("is the same jacket on the Story's own page, because the borrowing is written once", async () => {
    const story = await aStoryAcross([
      { title: "One Piece 100", number: 100 },
      { title: "One Piece 101", number: 101, cover: A_COVER },
    ]);

    expect((await findStory(story))?.cover).toMatchObject({ url: A_COVER });
  });
});

// **How many narratives wear that jacket**, which is the other direction of the same
// borrowing and the one the wall was wrong in: an omnibus holds several works judged apart,
// they all borrow its picture, and a faced tile printed no title — so seven tales stood on
// the wall as seven identical jackets. The count is what tells a tile to print its own title
// over the picture (`@/components/cover`).
//
// It is asserted here rather than beside the wall for the reason the jacket is: the question
// is about which object lends the face, and the two are read off one pick.
describe("how many narratives wear that jacket", () => {
  /** One object, faced, carrying each of the titles named. */
  async function anOmnibus(titles: string[], cover: string | null = A_COVER) {
    const volume = await volumeInTheHouse({
      title: "Batman di Jeph Loeb e Tim Sale 1",
      publisher: "Panini Comics",
      binding: "omnibus",
      language: "it",
    });
    if (cover) await looked(volume, cover);

    for (const title of titles) {
      await recordVolumeCarriesStory(volume, await createStory({ title, typeId: "comic" }));
    }

    return volume;
  }

  it("counts the works in the object the jacket came off", async () => {
    await anOmnibus(["Il lungo Halloween", "Vittoria oscura", "Catwoman: A Roma"]);

    expect((await listStoryWall()).map((story) => story.wornBy)).toEqual([3, 3, 3]);
  });

  // The ordinary case, and the tile nobody touched: a book that holds one work lends its face
  // to that work alone, so the picture answers on its own and no band is drawn over it.
  it("counts one where the object holds one work, which is the tile as it was", async () => {
    await anOmnibus(["Il lungo Halloween"]);

    expect((await listStoryWall())[0].wornBy).toBe(1);
  });

  // Nought, and it is an answer rather than a gap — the same shape `carriedBy` takes. A Story
  // no faced object carries is the drawn tile, which prints its own title already, so there is
  // nothing for a band to add and no object to count the works of.
  it("counts nought where no object faces it, which is the drawn tile", async () => {
    await anOmnibus(["Il lungo Halloween"], null);

    expect((await listStoryWall())[0].wornBy).toBe(0);
  });

  // **It is counted on the object that lent the face, not on every object carrying the
  // Story**, which is the whole reason the pick is a fragment of its own. A work that spans a
  // faceless volume and then an omnibus wears the omnibus' jacket, so what it shares is that
  // book's other tales — counting over its own carriers would have it saying *two others wear
  // this* about a picture only one book has.
  it("counts the works in the object that lent the face, not in every carrier", async () => {
    const story = await createStory({ title: "Il lungo Halloween", typeId: "comic" });
    const single = await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      binding: "paperback",
      language: "it",
    });
    await recordVolumeCarriesStory(single, story);

    const omnibus = await anOmnibus(["Vittoria oscura"]);
    await recordVolumeCarriesStory(omnibus, story);

    const wall = await listStoryWall();
    const halloween = wall.find((one) => one.title === "Il lungo Halloween");

    // Carried by two objects, faced by the one of them that has a jacket, and sharing that
    // jacket with the one other tale in it.
    expect(halloween).toMatchObject({ carriedBy: 2, wornBy: 2 });
  });
});

// **The precedence, which is this ticket's decision and is therefore the thing tested rather
// than discovered** (#65). Three images can be true about one tile at once — the Story's own,
// the lending Volume's own, and the looked-up cover behind it — and the order they are
// resolved in is written in `THE_COVER_IT_IS_FACED_OUT_WITH`: **the image nearest the record
// wins**, and a looked-up cover never reaches a Story except by being lent.
describe("which image a Story wears, and in what order", () => {
  const A_SCREENSHOT = "https://tsundoku.davideimola.dev/images/expedition-33.jpg";
  const A_PHOTOGRAPH = "https://tsundoku.davideimola.dev/images/one-piece-100.jpg";

  /** What the wall faces one Story with. */
  async function facing(storyId: string) {
    const wall = await listStoryWall();
    return wall.find((one) => one.id === storyId)?.cover ?? null;
  }

  /** One object carrying one Story, faced with whichever of the two images is asked for. */
  async function aBookCarrying(
    storyId: string,
    faced: { looked?: string; own?: string }
  ): Promise<string> {
    const volume = await volumeInTheHouse({
      title: "One Piece 100",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    if (faced.looked) await looked(volume, faced.looked);
    if (faced.own) await setOwnCover(volume, faced.own);
    await recordVolumeCarriesStory(volume, storyId);
    return volume;
  }

  // The case the whole column exists for: a videogame carries no object at all (ADR-0021), so
  // there is nothing to borrow a face from and this is the only image it can ever have.
  it("is the Story's own where nothing carries it, which is every videogame", async () => {
    const game = await createStory({ title: "Clair Obscur: Expedition 33", typeId: "videogame" });

    await setOwnStoryImage(game, A_SCREENSHOT);

    expect(await facing(game)).toEqual({ url: A_SCREENSHOT, from: "own" });
  });

  // **First rung over second.** Both are the owner's own bytes; the Story's is about the work
  // this tile stands for, and the Volume's is borrowed off one printing of it.
  it("is the Story's own over the photograph on an object carrying it", async () => {
    const story = await createStory({ title: "One Piece", typeId: "manga" });
    await aBookCarrying(story, { own: A_PHOTOGRAPH });

    await setOwnStoryImage(story, A_SCREENSHOT);

    expect(await facing(story)).toMatchObject({ url: A_SCREENSHOT });
  });

  // **First rung over third**, which is the one that matters most: a looked-up cover is
  // somebody else's and revocable, and it may never stand over something the owner said.
  it("is the Story's own over a looked-up cover on an object carrying it", async () => {
    const story = await createStory({ title: "One Piece", typeId: "manga" });
    await aBookCarrying(story, { looked: A_COVER });

    await setOwnStoryImage(story, A_SCREENSHOT);

    expect(await facing(story)).toMatchObject({ url: A_SCREENSHOT, from: "own" });
  });

  // **Second rung over third, unchanged** — the Volume's own chain, resolved where it always
  // was (`THE_COVER_IT_IS_FACED_WITH`) and reached here only because no Story image stands
  // over it.
  it("is the object's own photograph over its looked-up cover, where the Story has none", async () => {
    const story = await createStory({ title: "One Piece", typeId: "manga" });
    await aBookCarrying(story, { looked: A_COVER, own: A_PHOTOGRAPH });

    expect(await facing(story)).toMatchObject({ url: A_PHOTOGRAPH, from: "own" });
  });

  it("goes back to what an object lends it once the Story's own image comes off", async () => {
    const story = await createStory({ title: "One Piece", typeId: "manga" });
    await aBookCarrying(story, { looked: A_COVER });
    await setOwnStoryImage(story, A_SCREENSHOT);

    await dropOwnStoryImage(story);

    expect(await facing(story)).toMatchObject({ url: A_COVER, from: "google-books" });
  });

  // The ordinary case, and the one the tint is for: a game with no image is a drawn tile,
  // which is what every Story with no object has always been (ADR-0013).
  it("is nothing at all for a game nobody has photographed, which is the drawn tile", async () => {
    const game = await createStory({ title: "Hollow Knight: Silksong", typeId: "videogame" });

    expect(await facing(game)).toBeNull();
  });

  // The Story's own page reads the same fragment, so the tile the owner tapped is the tile
  // they arrive at — the rule #29 established, said again about the new first rung.
  it("is the same image on the Story's own page, because the order is written once", async () => {
    const game = await createStory({ title: "Clair Obscur: Expedition 33", typeId: "videogame" });
    await setOwnStoryImage(game, A_SCREENSHOT);

    expect((await findStory(game))?.cover).toMatchObject({ url: A_SCREENSHOT });
  });

  // And the page says which of the two it is, because the panel that replaces the image has
  // to arrive holding what this record carries rather than what an object lent it.
  it("says on the Story's own page whether the image is the record's own", async () => {
    const borrowing = await createStory({ title: "One Piece", typeId: "manga" });
    await aBookCarrying(borrowing, { looked: A_COVER });
    const owned = await createStory({ title: "Clair Obscur: Expedition 33", typeId: "videogame" });
    await setOwnStoryImage(owned, A_SCREENSHOT);

    expect((await findStory(borrowing))?.ownImage).toBeNull();
    expect((await findStory(owned))?.ownImage).toBe(A_SCREENSHOT);
  });

  // A tile wearing the Story's own image is wearing it alone, whatever the object it also
  // stands in holds — so the band that prints a title over a shared jacket stays off it.
  it("is worn by one narrative where the Story owns it, even out of an omnibus", async () => {
    const first = await createStory({ title: "Il lungo Halloween", typeId: "comic" });
    const second = await createStory({ title: "Vittoria oscura", typeId: "comic" });
    const omnibus = await volumeInTheHouse({
      title: "Batman di Jeph Loeb e Tim Sale 1",
      publisher: "Panini Comics",
      binding: "omnibus",
      language: "it",
    });
    await looked(omnibus, A_COVER);
    await recordVolumeCarriesStory(omnibus, first);
    await recordVolumeCarriesStory(omnibus, second);

    await setOwnStoryImage(first, A_SCREENSHOT);

    const wall = await listStoryWall();
    expect(wall.find((one) => one.id === first)?.wornBy).toBe(1);
    expect(wall.find((one) => one.id === second)?.wornBy).toBe(2);
  });

  // **Nothing is ever looked up onto a Story, and the schema is what says so.** There is no
  // source to ask — every one of them is keyed by an ISBN, which belongs to an object — so the
  // narrative carries one column and not the Volume's six. A `cover_url` appearing on this
  // table would be a second place a third party's bytes could land, out of reach of the
  // hotlink constraint that governs the first.
  it("carries the owner's own image and no looked-up cover at all", async () => {
    const columns = await query<{ name: string }>(
      `select column_name as name from information_schema.columns
        where table_name = 'story' and column_name like '%cover%' or
              table_name = 'story' and column_name like '%image%'`
    );

    expect(columns.map((one) => one.name)).toEqual(["own_image_url"]);
  });
});
