import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import type { AskForACover, CoverAnswer, StillThere } from "../covers.ts";
import { query } from "../db.ts";
import { findVolume, listCollectionWall } from "../queries/collection.ts";
import { listStoryWall } from "../queries/story.ts";
import { isRefusal } from "../refusal.ts";
import { amendVolume, catalogueVolume } from "./collection.ts";
import {
  dropOwnCover,
  dropOwnStoryImage,
  forgetTheCover,
  lookUpCoverFor,
  lookUpCovers,
  setOwnCover,
  setOwnStoryImage,
} from "./cover.ts";
import { createStory } from "./story.ts";

// Seam 1: the verb against a real Postgres, and **the sources handed over rather than
// reached**. What is asserted is what the owner sees afterwards — the tile on the wall and
// the object's own page — because that is the product; the readers that turn a source's
// answer into one of three words are pure and are tested beside themselves in
// `../covers.test.ts`.
//
// No test here opens a socket. A verb that could only be tested against Google Books would
// be a verb nobody could change on a train, and worse: its two most important behaviours —
// *a rate limit is not an absence* and *a cover that has gone is looked up again* — are
// exactly the ones a live source will not produce on demand.
beforeEach(async () => {
  await query("truncate volume cascade");
  await query("truncate story cascade");
});

const A_COVER = "https://books.google.com/books/content?id=njT-zgEACAAJ&img=1&zoom=5";
const ANOTHER_COVER = "https://books.google.com/books/content?id=OTHER-ID&img=1&zoom=5";
const A_THIRD_COVER = "https://books.google.com/books/content?id=THIRD-ID&img=1&zoom=5";

/** A source that answers off a table, and remembers what it was asked. */
function asking(answers: Record<string, CoverAnswer>): AskForACover & { asked: string[] } {
  const asked: string[] = [];
  const ask = (async (isbn: string) => {
    asked.push(isbn);
    return answers[isbn] ?? { answer: "none" };
  }) as AskForACover & { asked: string[] };
  ask.asked = asked;
  return ask;
}

/** A cover found at Google, as the reader would have shaped it. */
function found(url = A_COVER): CoverAnswer {
  return {
    answer: "found",
    cover: {
      source: "google-books",
      reference: "njT-zgEACAAJ",
      url,
      infoUrl: "https://books.google.com/books?id=njT-zgEACAAJ&source=gbs_ViewAPI",
    },
  };
}

/** How a check answers, without a `HEAD` going anywhere. */
function checking(state: "there" | "gone" | "unknown"): StillThere {
  return async () => state;
}

const NOTHING_IS_ASKED: AskForACover = async () => {
  throw new Error("no source should have been asked");
};

async function aVolume(isbn: string | null, title = "One Piece 100"): Promise<string> {
  return volumeInTheHouse({
    title,
    publisher: "Planet Manga",
    binding: "tankobon",
    language: "it",
    isbn,
  });
}

/**
 * A cover already on the record, looked up on a given day — what a previous run would have
 * left. Written directly, because what these tests are about is the *order* a later run
 * reaches things in, and that is a column a verb sets to `now()`.
 */
async function recordedCover(volumeId: string, url: string, on: string): Promise<void> {
  await query(
    `update volume set cover_source = 'google-books', cover_url = $2, cover_looked_up_at = $3
      where id = $1`,
    [volumeId, url, on]
  );
}

/** What one tile on the Collection wall is faced with. */
async function facedWith(volumeId: string) {
  const wall = await listCollectionWall();
  return wall.find((one) => one.id === volumeId)?.cover ?? null;
}

describe("looking up the covers", () => {
  it("records what it found: the source, the address, the id and the book's own page", async () => {
    const id = await aVolume("9788828765431");

    const report = await lookUpCovers({
      ask: asking({ "9788828765431": found() }),
      pace: 0,
    });

    expect(report).toMatchObject({ found: 1, absent: 0, unanswered: 0, refreshed: 0, stillDue: 0 });
    expect(await facedWith(id)).toEqual({
      url: A_COVER,
      from: "google-books",
      at: "https://books.google.com/books?id=njT-zgEACAAJ&source=gbs_ViewAPI",
    });

    const volume = await findVolume(id);
    expect(volume?.lookedUp).toMatchObject({
      source: "google-books",
      reference: "njT-zgEACAAJ",
      infoUrl: "https://books.google.com/books?id=njT-zgEACAAJ&source=gbs_ViewAPI",
    });
  });

  // The other half of "records what it found and what it did not": an absence is an answer,
  // and the row has to be able to say when it was established.
  it("records what it did not find, with the moment it asked", async () => {
    const id = await aVolume("9788828765431");

    const report = await lookUpCovers({
      ask: asking({ "9788828765431": { answer: "none" } }),
      pace: 0,
    });

    expect(report).toMatchObject({ found: 0, absent: 1 });
    expect(await facedWith(id)).toBeNull();

    const volume = await findVolume(id);
    expect(volume?.lookedUp.source).toBeNull();
    expect(volume?.lookedUp.at).not.toBeNull();
  });

  // The mistake that produced a false 0% in the research this is built on. A 403 is a thing
  // that happened to the request, not a fact about the book.
  it("records nothing at all where the source could not answer, so a rate limit is never an absence", async () => {
    const id = await aVolume("9788828765431");

    const report = await lookUpCovers({
      ask: asking({
        "9788828765431": { answer: "unanswered", because: "Open Library is rate-limiting." },
      }),
      pace: 0,
    });

    expect(report).toMatchObject({ found: 0, absent: 0, unanswered: 1, stillDue: 1 });

    const volume = await findVolume(id);
    expect(volume?.lookedUp.at).toBeNull();
  });

  it("skips a Volume with no ISBN rather than probing it, and says how many", async () => {
    await aVolume(null, "Dylan Dog 450");
    await aVolume(null, "Tex 700");
    const looked = await aVolume("9788828765431");

    const ask = asking({ "9788828765431": found() });
    const report = await lookUpCovers({ ask, pace: 0 });

    // Every Bonelli monthly is in this number for ever: an ISSN-derived periodical EAN is
    // not an ISBN, so no source keyed by one will ever answer for them.
    expect(report).toMatchObject({ skipped: 2, found: 1 });
    expect(ask.asked).toEqual(["9788828765431"]);
    expect(await facedWith(looked)).toMatchObject({ from: "google-books" });
  });

  it("touches only a batch of them, and says how many are still due", async () => {
    await aVolume("9788828765431", "One Piece 100");
    await aVolume("9788828765448", "One Piece 101");
    await aVolume("9788828765455", "One Piece 102");

    const report = await lookUpCovers({ ask: asking({}), batch: 2, pace: 0 });

    expect(report).toMatchObject({ absent: 2, stillDue: 1 });
  });

  it("takes the least recently looked at first, so a second run reaches the rest", async () => {
    await aVolume("9788828765431", "One Piece 100");
    await aVolume("9788828765448", "One Piece 101");

    const first = asking({});
    await lookUpCovers({ ask: first, batch: 1, pace: 0 });
    const second = asking({});
    await lookUpCovers({ ask: second, batch: 1, pace: 0 });

    expect([...first.asked, ...second.asked].sort()).toEqual(["9788828765431", "9788828765448"]);
  });
});

describe("a cover that has gone missing", () => {
  it("is looked up again rather than left broken on the wall", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    const report = await lookUpCovers({
      ask: asking({ "9788828765431": found(ANOTHER_COVER) }),
      verify: checking("gone"),
      pace: 0,
    });

    // Counted as a repair and **not** also as a find: every object a run touches is in
    // exactly one number, or the two clauses the screen prints describe it twice.
    expect(report).toMatchObject({ refreshed: 1, found: 0, absent: 0 });
    expect(await facedWith(id)).toMatchObject({ url: ANOTHER_COVER });
  });

  it("is cleared where the source no longer has one either, rather than kept as a broken tile", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    await lookUpCovers({ ask: asking({}), verify: checking("gone"), pace: 0 });

    expect(await facedWith(id)).toBeNull();
  });

  it("is left exactly as it stands where the check itself could not be made", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    const report = await lookUpCovers({
      ask: NOTHING_IS_ASKED,
      verify: checking("unknown"),
      pace: 0,
    });

    expect(report).toMatchObject({ unanswered: 1, checked: 0, refreshed: 0 });
    expect(await facedWith(id)).toMatchObject({ url: A_COVER });
  });

  // **The queue is ordered by when each object was last looked at, so an object that records
  // nothing when its check fails stays at the head of it for ever** — burning a slot on every
  // run while the objects behind it are never re-checked again. A refused `HEAD` or a run of
  // 5xx is a plausible way to get there, and a wall that quietly stopped repairing itself is
  // a silent way to fail.
  it("does not hold up the re-check queue when its own check keeps failing", async () => {
    const stuck = await aVolume("9788828765431", "One Piece 100");
    const behindIt = await aVolume("9788828765448", "One Piece 101");
    await recordedCover(stuck, A_COVER, "2026-01-01");
    await recordedCover(behindIt, ANOTHER_COVER, "2026-02-01");

    // The one at the head can never be verified; the one behind it has gone and wants
    // repairing. One object per run, so the head either lets go of its slot or it does not.
    const verify: StillThere = async (url) => (url === A_COVER ? "unknown" : "gone");
    const ask = asking({ "9788828765448": found(A_THIRD_COVER) });

    await lookUpCovers({ ask, verify, batch: 1, pace: 0 });
    await lookUpCovers({ ask, verify, batch: 1, pace: 0 });

    expect(await facedWith(behindIt)).toMatchObject({ url: A_THIRD_COVER });
    expect(await facedWith(stuck)).toMatchObject({ url: A_COVER });
  });

  it("costs no request to the source where it is still there", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    const report = await lookUpCovers({
      ask: NOTHING_IS_ASKED,
      verify: checking("there"),
      pace: 0,
    });

    expect(report).toMatchObject({ checked: 1, found: 0, refreshed: 0 });
    expect(await facedWith(id)).toMatchObject({ url: A_COVER });
  });
});

describe("looking one object up", () => {
  it("answers with what it found, and faces the tile with it", async () => {
    const id = await aVolume("9788828765431");

    const answer = await lookUpCoverFor(id, {
      ask: asking({ "9788828765431": found() }),
    });

    expect(answer).toMatchObject({ outcome: "found" });
    expect(await facedWith(id)).toMatchObject({ url: A_COVER, from: "google-books" });
  });

  // "A volume with no ISBN is skipped rather than probed, and says so" — on one object the
  // owner is standing in front of, saying so is prose rather than a number in a report.
  it("refuses a Volume with no ISBN in the owner's own words rather than probing it", async () => {
    const id = await aVolume(null, "Dylan Dog 450");

    await expect(lookUpCoverFor(id, { ask: NOTHING_IS_ASKED })).rejects.toSatisfy(
      (error: unknown) =>
        isRefusal(error) && error.code === "not-allowed" && error.message.includes("no ISBN")
    );
  });

  it("refuses an id no Volume has, and a malformed one the same way", async () => {
    await expect(lookUpCoverFor("banana", { ask: NOTHING_IS_ASKED })).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "not-found"
    );
    await expect(
      lookUpCoverFor("00000000-0000-4000-8000-000000000000", { ask: NOTHING_IS_ASKED })
    ).rejects.toSatisfy((error: unknown) => isRefusal(error) && error.code === "not-found");
  });

  // The production failure this verb exists to be able to fix: a wrong ISBN fetched another
  // book's jacket, the ISBN was corrected, and the jacket stayed — live, and passing any
  // check that only asks whether an image still loads. A press here must reach the source.
  it("asks the source again even where the cover it carries loads perfectly well", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCoverFor(id, { ask: asking({ "9788828765431": found() }) });

    const ask = asking({ "9788828765431": found(ANOTHER_COVER) });
    const answer = await lookUpCoverFor(id, { ask, verify: checking("there") });

    expect(ask.asked).toEqual(["9788828765431"]);
    expect(answer).toMatchObject({ outcome: "found" });
    expect(await facedWith(id)).toMatchObject({ url: ANOTHER_COVER });
  });

  it("says so where the source hands back the same address, so the ISBN is what to look at", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCoverFor(id, { ask: asking({ "9788828765431": found() }) });

    const answer = await lookUpCoverFor(id, { ask: asking({ "9788828765431": found() }) });

    expect(answer).toEqual({ outcome: "unchanged" });
  });
});

describe("the owner's own image", () => {
  it("overrides the looked-up cover on the wall", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    await setOwnCover(id, "https://tsundoku.davideimola.dev/images/one-piece-100.jpg");

    expect(await facedWith(id)).toEqual({
      url: "https://tsundoku.davideimola.dev/images/one-piece-100.jpg",
      from: "own",
    });
  });

  it("faces a Volume that has no ISBN and never could have a cover", async () => {
    const id = await aVolume(null, "Dylan Dog 450");

    await setOwnCover(id, "https://tsundoku.davideimola.dev/images/dylan-dog-450.jpg");

    expect(await facedWith(id)).toMatchObject({ from: "own" });
  });

  // ADR-0013, enforced by Postgres rather than by review: hosting is reserved for the
  // owner's own image, and an address on a source's own domain is not one.
  it("is refused where it is somebody else's bytes wearing the owner's name", async () => {
    const id = await aVolume("9788828765431");

    await expect(setOwnCover(id, A_COVER)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "invalid"
    );
    await expect(setOwnCover(id, "http://example.com/cover.jpg")).rejects.toSatisfy(isRefusal);
  });

  it("comes off again, and the looked-up cover is standing underneath it", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });
    await setOwnCover(id, "https://tsundoku.davideimola.dev/images/one-piece-100.jpg");

    await dropOwnCover(id);

    expect(await facedWith(id)).toMatchObject({ url: A_COVER, from: "google-books" });
  });

  it("is refused off an object that carries none, rather than passing silently", async () => {
    const id = await aVolume("9788828765431");

    await expect(dropOwnCover(id)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "not-allowed"
    );
  });
});

describe("what a wall is faced with", () => {
  it("is nothing at all for an object nobody has looked up, which is still the normal case", async () => {
    const id = await aVolume("9788828765431");

    expect(await facedWith(id)).toBeNull();
  });

  it("is nothing for an object the library knows and the house does not hold", async () => {
    // The wall is the Collection, so a catalogued object with a cover is not on it at all —
    // which is ADR-0007 and not a cover rule, asserted here because a cover is the one thing
    // that might tempt a screen to show an object it does not have.
    const { id } = await catalogueVolume({
      title: "One Piece 101",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
      isbn: "9788828765448",
    });
    await lookUpCovers({ ask: asking({ "9788828765448": found() }), pace: 0 });

    expect(await facedWith(id)).toBeNull();
    expect((await findVolume(id))?.cover).toMatchObject({ from: "google-books" });
  });
});

describe("forgetting a looked-up cover", () => {
  // A blank tile is better than a wrong one: an object wearing another book's jacket is the
  // library lying, and the owner should not have to wait on a source to stop it.
  it("takes it off, and the tile goes back to the drawn one", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    await forgetTheCover(id);

    expect(await facedWith(id)).toBeNull();
  });

  it("leaves nothing behind, so a later run asks about it again", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });
    await forgetTheCover(id);

    const ask = asking({ "9788828765431": found(ANOTHER_COVER) });
    const report = await lookUpCovers({ ask, pace: 0 });

    expect(ask.asked).toEqual(["9788828765431"]);
    expect(report).toMatchObject({ found: 1, stillDue: 0 });
  });

  it("leaves an image of the owner's own alone, which was never an answer to an ISBN", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });
    await setOwnCover(id, "https://tsundoku.davideimola.dev/images/one-piece-100.jpg");

    await forgetTheCover(id);

    expect(await facedWith(id)).toMatchObject({ from: "own" });
  });

  it("is refused off an object that carries none, rather than passing silently", async () => {
    const id = await aVolume("9788828765431");

    await expect(forgetTheCover(id)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "not-allowed"
    );
  });
});

describe("looking them all up again", () => {
  // The bulk half of the same failure. An ordinary run checks a recorded cover is still
  // *there* and spends no request where it is, which is right until the covers are wrong
  // rather than missing — and then it is exactly what makes a shelf of them unfixable.
  it("asks the source about covers that are already there, instead of checking them", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    const ask = asking({ "9788828765431": found(ANOTHER_COVER) });
    const report = await lookUpCovers({ ask, again: true, verify: checking("there"), pace: 0 });

    expect(ask.asked).toEqual(["9788828765431"]);
    expect(report).toMatchObject({ refreshed: 1, checked: 0 });
    expect(await facedWith(id)).toMatchObject({ url: ANOTHER_COVER });
  });

  it("clears one the sources no longer have, rather than leaving the old answer standing", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    await lookUpCovers({ ask: asking({}), again: true, verify: checking("there"), pace: 0 });

    expect(await facedWith(id)).toBeNull();
  });
});

// **The failure that put this whole group of tests here.** An assistant proposed an ISBN, the
// owner approved it, and the lookup faithfully fetched the cover of a different book — the
// exact risk ADR-0012 named when it argued an ISBN belongs behind the Inbox: *a wrong one
// quietly fetches another book's cover for as long as the record stands*.
//
// A cover is an answer to the ISBN that stood on the row when it was asked for. So changing
// the ISBN has to take the answer with it, or correcting the mistake leaves the wall exactly
// as wrong as it was — and looking right, because the image loads.
describe("a cover is an answer to the ISBN it was asked about", () => {
  it("goes when a different ISBN is put on the object", async () => {
    const id = await aVolume("9788828765431", "One-Punch Man 9");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    await amendVolume(id, { isbn: "9788828765448" });

    expect(await facedWith(id)).toBeNull();
  });

  it("comes back for the ISBN that is actually there, on the next run", async () => {
    const id = await aVolume("9788828765431", "One-Punch Man 9");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });
    await amendVolume(id, { isbn: "9788828765448" });

    await lookUpCovers({ ask: asking({ "9788828765448": found(ANOTHER_COVER) }), pace: 0 });

    expect(await facedWith(id)).toMatchObject({ url: ANOTHER_COVER });
  });

  // The other half, and the one that would be a silent regression: an amendment about a
  // publisher or a Binding says nothing about the ISBN, and must not unface the shelf.
  it("stays where the amendment is about something else entirely", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    await amendVolume(id, { publisher: "Star Comics" });
    await amendVolume(id, { editionLine: "Ultimate Deluxe Edition" });

    expect(await facedWith(id)).toMatchObject({ url: A_COVER });
  });

  it("stays where the amendment names the very same ISBN again", async () => {
    const id = await aVolume("9788828765431");
    await lookUpCovers({ ask: asking({ "9788828765431": found() }), pace: 0 });

    await amendVolume(id, { isbn: "9788828765431" });

    expect(await facedWith(id)).toMatchObject({ url: A_COVER });
  });
});

// **The Story's own image**, which is the one thing a videogame needed that a book did not
// (#65, ADR-0021). Nothing is ever looked up onto a Story — every source is keyed by an ISBN
// and a narrative has none — so these two verbs have no lookup beside them, and there is no
// `forgetTheStorysCover` because there is never one to forget.
describe("a Story's own image", () => {
  const A_SCREENSHOT = "https://tsundoku.davideimola.dev/images/expedition-33.jpg";

  /** A game: a Story of the Type that owns no object at all. */
  async function aGame(title = "Clair Obscur: Expedition 33"): Promise<string> {
    return createStory({ title, typeId: "videogame" });
  }

  /** What one tile on the Story wall is faced with. */
  async function facing(storyId: string) {
    const wall = await listStoryWall();
    return wall.find((one) => one.id === storyId)?.cover ?? null;
  }

  it("faces a Story that no object carries, which is every videogame", async () => {
    const game = await aGame();

    await setOwnStoryImage(game, A_SCREENSHOT);

    expect(await facing(game)).toEqual({ url: A_SCREENSHOT, from: "own" });
  });

  // ADR-0013's prohibition, said again about the other table: hosting is reserved for the
  // owner's own image, and an address on a source's own domain is not one. Postgres refuses
  // it rather than a reviewer remembering to.
  it("is refused where it is somebody else's bytes wearing the owner's name", async () => {
    const game = await aGame();

    await expect(setOwnStoryImage(game, A_COVER)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "invalid"
    );
    await expect(
      setOwnStoryImage(game, "https://covers.openlibrary.org/b/id/1.jpg")
    ).rejects.toSatisfy(isRefusal);
    await expect(setOwnStoryImage(game, "http://example.com/shot.jpg")).rejects.toSatisfy(
      isRefusal
    );
  });

  it("comes off again, and the tile is the drawn one underneath", async () => {
    const game = await aGame();
    await setOwnStoryImage(game, A_SCREENSHOT);

    await dropOwnStoryImage(game);

    expect(await facing(game)).toBeNull();
  });

  it("is refused off a Story that carries none, rather than passing silently", async () => {
    const game = await aGame();

    await expect(dropOwnStoryImage(game)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "not-allowed"
    );
  });

  it("answers with no such Story for an id nothing stands under, malformed or not", async () => {
    const notFound = (error: unknown) => isRefusal(error) && error.code === "not-found";

    await expect(setOwnStoryImage("banana", A_SCREENSHOT)).rejects.toSatisfy(notFound);
    await expect(
      setOwnStoryImage("00000000-0000-4000-8000-000000000000", A_SCREENSHOT)
    ).rejects.toSatisfy(notFound);
    await expect(dropOwnStoryImage("banana")).rejects.toSatisfy(notFound);
  });
});
