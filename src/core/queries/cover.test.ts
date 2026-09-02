import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume } from "../verbs/collection.ts";
import { setOwnCover } from "../verbs/cover.ts";
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
