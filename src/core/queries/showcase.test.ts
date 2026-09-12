import { beforeEach, describe, expect, it } from "vitest";

import { volumeInTheHouse } from "@/test/volumes";

import { query } from "../db.ts";
import { abandonPass, finishPass, recordInstalmentReached, recordPass } from "../verbs/pass.ts";
import { setRating } from "../verbs/rating.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory, declareInstalments } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import { openWish } from "../verbs/wish.ts";
import { type Showcase, THE_SHELF_SHOWN, THE_VERDICTS_SHOWN, theShowcase } from "./showcase.ts";

// Seam 1, and it is about a **Rendering** rather than about a derivation: every fact here
// already has a query behind it, and what this file asserts is which of them may be seen from
// outside, in what words, and what is missing by construction (ADR-0025).
//
// The document's own rules, in the order they are asserted: the vocabulary travels with every
// row; what concluded is published only where a verdict was passed on it, and an abandoned
// pass is a verdict with no number on it rather than a row to filter; an unknown Type refuses
// rather than emptying the document; and nothing about money, provenance or plans is anywhere
// in it.

beforeEach(async () => {
  await query("truncate path, series, story, volume cascade");
});

/** The document, with the wishlist off, which is how the door is configured by default. */
async function showcase(types: string[] | null = null): Promise<Showcase> {
  const answer = await theShowcase({ types });
  if (!answer.ok) throw new Error(`the showcase refused: ${answer.unknown.join(", ")}`);
  return answer.showcase;
}

/** A manga in the house: the object, the narrative, and the arrow between them. */
async function slamDunk(): Promise<{ storyId: string; volumeId: string }> {
  const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
  await declareInstalments(storyId, 20);

  const seriesId = await declareSeries({
    name: "Slam Dunk",
    publisher: "Panini Comics",
    publishedCount: 20,
    status: "concluded",
  });
  const volumeId = await volumeInTheHouse(
    { title: "Slam Dunk 1", publisher: "Panini Comics", binding: "tankobon", language: "it" },
    { acquiredOn: "2024-01-01", pricePaid: "4.90" }
  );
  await placeVolumeInSeries({ volumeId, seriesId, number: 1 });
  await recordVolumeCarriesStory(volumeId, storyId);

  return { storyId, volumeId };
}

/**
 * A pass through a work that was finished **and scored**, which is the ordinary verdict.
 *
 * Written once because most of these cases are about something else (the order, the cap, the
 * figure beside the sample) and each of them needs a row that qualifies.
 */
async function judged(storyId: string, endedOn: string, score = 8): Promise<void> {
  const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });
  await finishPass(passId, endedOn);
  await setRating({ storyId, passId, score, provenanceId: "remembered" });
}

describe("what the showcase publishes", () => {
  it("shows an open pass as what is being gone through now", async () => {
    const { storyId } = await slamDunk();
    const passId = await recordPass({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
      startedOn: "2026-03-01",
    });
    await recordInstalmentReached(passId, 7);

    const { now } = await showcase();

    expect(now).toHaveLength(1);
    expect(now[0]).toMatchObject({
      title: "Slam Dunk",
      // A pair, because the consumer must never title-case a slug and guess where the
      // capitals fall: `playstation-5` is *PlayStation 5* and no rule produces that.
      medium: { slug: "paper", label: "Paper" },
      startedAt: "2026-03-01",
      // The unit is the model's own word for what a work declares a count of, and it is sent
      // so the page has a noun to print under the ratio.
      progress: { reached: 7, total: 20, unit: "instalments" },
    });
  });

  // The verb is the Type's own and it is on every row that names one, so a consumer heads one
  // block *Reading* and the next *Playing* without keeping a table of slugs of its own
  // (ADR-0021). *read* is its own past and *play* is not, which is why two words travel.
  it("carries the whole Type on a row, both verbs included", async () => {
    const storyId = await createStory({ title: "Death Stranding", typeId: "videogame" });
    await recordPass({ storyId, medium: "playstation-5", provenanceId: "remembered" });

    const { now } = await showcase();

    expect(now[0].medium).toEqual({ slug: "playstation-5", label: "PlayStation 5" });
    expect(now[0].type).toEqual({
      slug: "videogame",
      label: "Videogame",
      verb: "played",
      verbBase: "play",
    });
  });

  // **The most interesting row on the page**, and the reason an abandonment is a verdict
  // with no number on it. A library that published only its finishes would be a shelf of
  // somebody else's taste, so a pass given up is shown, marked, and at the part it reached.
  it("shows a pass that was given up, and says so", async () => {
    const { storyId } = await slamDunk();
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });
    await recordInstalmentReached(passId, 3);
    await abandonPass(passId, "2026-02-02");

    const { finished } = await showcase();

    expect(finished.recent).toHaveLength(1);
    expect(finished.recent[0]).toMatchObject({
      title: "Slam Dunk",
      outcome: "given-up",
      endedAt: "2026-02-02",
      progress: { reached: 3, total: 20, unit: "instalments" },
    });
  });

  it("orders the verdicts by the day they ended, most recent first", async () => {
    const older = await createStory({ title: "Vagabond", typeId: "manga" });
    const newer = await createStory({ title: "Lone Wolf and Cub", typeId: "manga" });

    await judged(older, "2024-05-05");
    await judged(newer, "2026-05-05");

    expect((await showcase()).finished.recent.map((pass) => pass.title)).toEqual([
      "Lone Wolf and Cub",
      "Vagabond",
    ]);
  });

  // The score and the grain, and neither the prose nor the Provenance: the number is a
  // judgement about a work, and the prose is the owner writing to themselves (ADR-0008).
  it("carries a rating as a score, and nothing else at all", async () => {
    const storyId = await createStory({ title: "Berserk", typeId: "manga" });
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });
    await finishPass(passId, "2026-01-01");
    await setRating({
      storyId,
      passId,
      score: 9,
      provenanceId: "remembered",
      scale: "coarse",
      prose: "the one everything else is measured against",
    });

    const { finished } = await showcase();

    // **The score and nothing else.** The prose is the owner writing to themselves, and the
    // grain is an axis about how far their own record can be trusted: neither is a question a
    // reader of a shelf page is answering.
    expect(finished.recent[0].rating).toEqual({ score: 9 });
  });

  // **The block is the verdicts and not the log.** A pass that ended with nothing said about
  // it is most of a library typed in from a shelf, and a page handed all of them would be a
  // list of titles the owner once held rather than a page about what they thought.
  it("leaves out a pass that finished with nothing said about it", async () => {
    const judgedOn = await createStory({ title: "Berserk", typeId: "manga" });
    const silent = await createStory({ title: "Vagabond", typeId: "manga" });

    await judged(judgedOn, "2026-01-01");
    await finishPass(
      await recordPass({ storyId: silent, medium: "paper", provenanceId: "remembered" }),
      "2026-02-02"
    );

    const { finished } = await showcase();

    expect(finished.recent.map((pass) => pass.title)).toEqual(["Berserk"]);
    // The figure is the verdicts too, and not every pass that ever ended: the sample and the
    // number beside it answer the same question or the page prints a fraction of two things.
    expect(finished.count).toBe(1);
  });

  // **An abandonment is a judgement with no number on it**, and the one case the rule had to
  // be written for: dropping it for want of a score would publish only what went well.
  it("keeps a pass that was given up with no score on it", async () => {
    const storyId = await createStory({ title: "Vinland Saga", typeId: "manga" });
    await abandonPass(
      await recordPass({ storyId, medium: "paper", provenanceId: "remembered" }),
      "2026-03-03"
    );

    const { finished } = await showcase();

    expect(finished.recent).toHaveLength(1);
    expect(finished.recent[0]).toMatchObject({ outcome: "given-up", rating: null });
    expect(finished.count).toBe(1);
  });

  it("counts the unopened works and names the most recently catalogued of them", async () => {
    await createStory({ title: "Akira", typeId: "manga" });
    await createStory({ title: "Nausicaa", typeId: "manga" });

    const { pile } = await showcase();

    expect(pile.count).toBe(2);
    // By when it came in, not by title, which is the one thing this block asks the library
    // that no wall does.
    expect(pile.recent.map((entry) => entry.title)).toEqual(["Nausicaa", "Akira"]);
    expect(pile.byType).toContainEqual(
      expect.objectContaining({ count: 2, type: expect.objectContaining({ slug: "manga" }) })
    );
  });

  it("shows the shelf as the objects in the house, each carrying the Type inside it", async () => {
    await slamDunk();

    const { shelf } = await showcase();

    expect(shelf.total).toBe(1);
    expect(shelf.volumes[0]).toMatchObject({
      title: "Slam Dunk 1",
      type: expect.objectContaining({ slug: "manga" }),
      series: { name: "Slam Dunk", tint: expect.stringMatching(/^oklch|^#|^rgb|^color/) },
    });
  });

  // An object the library holds and no narrative has been named inside is a gap the library
  // shows rather than a state it refuses, exactly as it is on the owner's own side.
  it("shows an object holding no narrative, with no Type on it", async () => {
    await volumeInTheHouse({
      title: "Qualcosa di non catalogato",
      publisher: "Bonelli",
      binding: "paperback",
      language: "it",
    });

    const { shelf } = await showcase();

    expect(shelf.total).toBe(1);
    expect(shelf.volumes[0].type).toBeNull();
  });
});

describe("how the showcase is narrowed", () => {
  beforeEach(async () => {
    await slamDunk();
    const game = await createStory({ title: "Death Stranding", typeId: "videogame" });
    await recordPass({ storyId: game, medium: "playstation-5", provenanceId: "remembered" });
    const manga = await createStory({ title: "Vagabond", typeId: "manga" });
    await recordPass({ storyId: manga, medium: "paper", provenanceId: "remembered" });
  });

  it("narrows every block by Type", async () => {
    const narrowed = await showcase(["videogame"]);

    expect(narrowed.now.map((pass) => pass.title)).toEqual(["Death Stranding"]);
    expect(narrowed.shelf.total).toBe(0);
    expect(narrowed.pile.byType.map((counted) => counted.type.slug)).toEqual(["videogame"]);
  });

  // **An unknown slug refuses rather than narrowing to nothing**, which is the one place this
  // parts from every wall on the owner's side: a consumer fetching on a schedule would publish
  // an empty shelf for a week and never learn that a Type had been renamed.
  it("refuses a slug that is not a Type, and names it", async () => {
    expect(await theShowcase({ types: ["manga", "banana"] })).toEqual({
      ok: false,
      unknown: ["banana"],
    });
  });

  // Asking for nothing gets nothing. It is the honest answer to a consumer that built the
  // parameter out of an empty array, and the one case where saying *everything* would publish
  // more than was asked for.
  it("answers an empty list with an empty document", async () => {
    const nothing = await showcase([]);

    expect(nothing.now).toEqual([]);
    expect(nothing.pile.count).toBe(0);
    expect(nothing.shelf.total).toBe(0);
    expect(nothing.shelf.byType).toEqual([]);
  });
});

describe("what the document is a sample of", () => {
  // **A sample and not the whole history.** Every concluded pass is a number that only ever
  // grows, so the block is the most recent dozen and `count` beside it is what there are.
  it("caps the verdicts and keeps the real number beside them", async () => {
    for (let at = 0; at < THE_VERDICTS_SHOWN + 3; at += 1) {
      const storyId = await createStory({ title: `Storia ${at}`, typeId: "manga" });
      await judged(storyId, `2026-01-${String(at + 1).padStart(2, "0")}`);
    }

    const { finished } = await showcase();

    expect(finished.count).toBe(THE_VERDICTS_SHOWN + 3);
    expect(finished.recent).toHaveLength(THE_VERDICTS_SHOWN);
    // The most recent dozen, and the three oldest are the ones left out.
    expect(finished.recent[0].title).toBe(`Storia ${THE_VERDICTS_SHOWN + 2}`);
    expect(finished.recent.map((pass) => pass.title)).not.toContain("Storia 0");
  });

  // **A sample and not the whole shelf.** The figure beside it is the real one, so a page can
  // say *showing 60 of 412* rather than quietly printing sixty and calling it a library.
  it("caps the shelf and keeps the real count beside it", async () => {
    for (let at = 0; at < THE_SHELF_SHOWN + 3; at += 1) {
      await volumeInTheHouse(
        { title: `Volume ${at}`, publisher: "Bonelli", binding: "paperback", language: "it" },
        { acquiredOn: `2026-01-${String((at % 28) + 1).padStart(2, "0")}` }
      );
    }

    const { shelf } = await showcase();

    expect(shelf.total).toBe(THE_SHELF_SHOWN + 3);
    expect(shelf.volumes).toHaveLength(THE_SHELF_SHOWN);
  });

  // Most recently acquired first, because a wall truncated in shelf order would be the
  // letter A for ever. Only the order is read off the acquisitions; the day never leaves.
  it("shows the objects that came home most recently", async () => {
    await volumeInTheHouse(
      { title: "Vecchio", publisher: "Bonelli", binding: "paperback", language: "it" },
      { acquiredOn: "2019-01-01" }
    );
    await volumeInTheHouse(
      { title: "Nuovo", publisher: "Bonelli", binding: "paperback", language: "it" },
      { acquiredOn: "2026-06-01" }
    );

    expect((await showcase()).shelf.volumes.map((volume) => volume.title)).toEqual([
      "Nuovo",
      "Vecchio",
    ]);
  });

  // **By count, largest first**, and it is a decision rather than whatever the database
  // returned: the consumer renders the order it receives.
  it("orders the counts by Type from the largest down", async () => {
    await createStory({ title: "Akira", typeId: "manga" });
    await createStory({ title: "Nausicaa", typeId: "manga" });
    await createStory({ title: "Watchmen", typeId: "comic" });

    const { pile } = await showcase(["comic", "manga"]);

    expect(pile.byType.map((counted) => [counted.type.slug, counted.count])).toEqual([
      ["manga", 2],
      ["comic", 1],
    ]);
  });
});

describe("what never leaves the door", () => {
  // The list is the ADR's, asserted by name rather than by reading the code: what stops a
  // price reaching this document is that nothing composes one, and a test that re-read the
  // composition would only be agreeing with it.
  const FORBIDDEN = [
    "price",
    "pricePaid",
    "targetPrice",
    "priceFound",
    "shop",
    "acquiredOn",
    "acquisition",
    "acquisitions",
    "releasedOn",
    "isbn",
    "inbox",
    "proposal",
    "proposals",
    "path",
    "paths",
    "stops",
    "period",
    "openedOn",
    "withinTarget",
    "provenance",
    "prose",
    "scale",
    "grain",
    "email",
  ];

  /** Every key anywhere in the document, however deep. */
  function keysIn(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(keysIn);
    if (value && typeof value === "object") {
      return Object.entries(value).flatMap(([key, held]) => [key, ...keysIn(held)]);
    }
    return [];
  }

  it("carries none of the fields the door was built to keep in", async () => {
    const { storyId, volumeId } = await slamDunk();
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });
    await finishPass(passId, "2026-01-01");
    await setRating({ storyId, passId, score: 8, provenanceId: "remembered", prose: "great" });
    await openWish({ volumeId, period: "2026-09", targetPrice: "15.00", shop: "Amazon" });

    const found = new Set(keysIn(await showcase()));

    expect(FORBIDDEN.filter((field) => found.has(field))).toEqual([]);
  });

  // The Wish is off unless the door is configured to publish one, and it is off here because
  // the default is off: a fork may reasonably want a public wishlist, and this library does
  // not have one.
  it("publishes no wishlist unless the door asks for one", async () => {
    const { volumeId } = await slamDunk();
    await openWish({ volumeId, targetPrice: "15.00" });

    expect((await showcase()).wish).toBeUndefined();

    const published = await theShowcase({ wishlist: true });
    if (!published.ok) throw new Error("the showcase refused");

    expect(published.showcase.wish).toEqual([
      expect.objectContaining({
        title: "Slam Dunk 1",
        type: expect.objectContaining({ slug: "manga" }),
      }),
    ]);
  });
});
