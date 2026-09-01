import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import {
  deactivatePath,
  declareConstraint,
  definePath,
  moveStoryOnPath,
  placeStoriesOnPath,
} from "../verbs/path.ts";
import { abandonReading, finishReading, recordReading } from "../verbs/reading.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import {
  findPath,
  listDeclaredConstraints,
  listPaths,
  listStoriesNotOnPath,
  nextUnreadOnActivePaths,
  nextUnreadOnPath,
  stillAheadOnActivePaths,
} from "./path.ts";

// Seam 1, the read side. This is the surface both doors read — the screen and, once #4
// mounts it, the MCP door — so what is asserted here is what an external assistant sees
// when it asks what the owner's routes are and what comes next on them.

// `series` and `volume` join it for the picker's order: which run a Story belongs to and
// where it stands in that run are facts about the objects carrying it, so the fixture that
// tests the order has to build a shelf.
beforeEach(async () => {
  await query("truncate path, series, story, volume cascade");
});

/** *Angolo Giappone*, in the order the owner put it in. */
async function angoloGiappone(): Promise<{ pathId: string; stories: string[] }> {
  const pathId = await definePath({
    name: "Angolo Giappone",
    intent: "privilegiare titoli davvero coerenti con samurai e cultura giapponese",
  });

  const stories = [
    await createStory({ title: "Vagabond", typeId: "manga" }),
    await createStory({ title: "Lone Wolf and Cub", typeId: "manga" }),
    await createStory({ title: "Musashi", typeId: "novel" }),
  ];
  await placeStoriesOnPath(pathId, stories);

  return { pathId, stories };
}

function titles(stops: { title: string }[]): string[] {
  return stops.map((stop) => stop.title);
}

describe("a Path, whole", () => {
  it("carries the owner's own words about what it is for", async () => {
    const { pathId } = await angoloGiappone();

    expect((await findPath(pathId))?.intent).toBe(
      "privilegiare titoli davvero coerenti con samurai e cultura giapponese"
    );
  });

  it("reads its route in the owner's order, and re-reads it after a move", async () => {
    const { pathId, stories } = await angoloGiappone();

    expect(titles((await findPath(pathId))?.stops ?? [])).toEqual([
      "Vagabond",
      "Lone Wolf and Cub",
      "Musashi",
    ]);

    await moveStoryOnPath(pathId, stories[2], null);

    expect(titles((await findPath(pathId))?.stops ?? [])).toEqual([
      "Musashi",
      "Vagabond",
      "Lone Wolf and Cub",
    ]);
  });

  it("crosses Types, and says which one each Story is", async () => {
    const { pathId } = await angoloGiappone();

    expect((await findPath(pathId))?.stops.map((stop) => stop.type)).toEqual([
      { id: "manga", name: "Manga" },
      { id: "manga", name: "Manga" },
      { id: "novel", name: "Novel" },
    ]);
  });

  it("says where the owner is with each Story, derived and not stored", async () => {
    const { pathId, stories } = await angoloGiappone();

    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );
    await recordReading({ storyId: stories[1], medium: "paper", provenanceId: "remembered" });

    expect((await findPath(pathId))?.stops.map((stop) => stop.state)).toEqual([
      "read",
      "reading",
      "to-read",
    ]);
  });

  it("is nothing when there is no such Path, and nothing for an id no row could have", async () => {
    expect(await findPath("00000000-0000-0000-0000-000000000000")).toBeNull();
    // A URL can carry anything. Nothing is the answer; a 500 is not.
    expect(await findPath("banana")).toBeNull();
    expect(await nextUnreadOnPath("banana")).toBeNull();
  });
});

describe("the next unread Story of a Path", () => {
  it("is the first one on the route while nothing has been read", async () => {
    const { pathId } = await angoloGiappone();

    expect((await nextUnreadOnPath(pathId))?.title).toBe("Vagabond");
  });

  it("moves on when the owner finishes one", async () => {
    const { pathId, stories } = await angoloGiappone();

    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect((await nextUnreadOnPath(pathId))?.title).toBe("Lone Wolf and Cub");
  });

  it("skips a Story the owner is in the middle of, because it is not what comes next", async () => {
    const { pathId, stories } = await angoloGiappone();

    await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" });

    expect((await nextUnreadOnPath(pathId))?.title).toBe("Lone Wolf and Cub");
  });

  it("skips a Story the owner gave up on", async () => {
    const { pathId, stories } = await angoloGiappone();

    await abandonReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect((await nextUnreadOnPath(pathId))?.title).toBe("Lone Wolf and Cub");
  });

  it("follows the owner's order and never the order the Stories were added in", async () => {
    const { pathId, stories } = await angoloGiappone();

    await moveStoryOnPath(pathId, stories[2], null);

    expect((await nextUnreadOnPath(pathId))?.title).toBe("Musashi");
  });

  // The answer #11 has to handle, and the reason it is written down here.
  it("is nothing at all when the route is exhausted", async () => {
    const { pathId, stories } = await angoloGiappone();

    for (const story of stories) {
      await finishReading(
        await recordReading({ storyId: story, medium: "paper", provenanceId: "remembered" }),
        "2024-02-02"
      );
    }

    expect(await nextUnreadOnPath(pathId)).toBeNull();
  });

  it("is nothing at all for an empty route", async () => {
    const pathId = await definePath({ name: "Technical Leadership" });

    expect(await nextUnreadOnPath(pathId)).toBeNull();
  });

  it("is nothing at all for a Path that is not there", async () => {
    expect(await nextUnreadOnPath("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("what comes next on every active Path", () => {
  it("is one entry per route, by name", async () => {
    const { pathId: giappone } = await angoloGiappone();

    const batman = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(batman, [
      await createStory({ title: "Batman: Anno Uno", typeId: "comic" }),
    ]);

    const ahead = await nextUnreadOnActivePaths();

    expect(ahead.map((entry) => [entry.path.name, entry.next.title])).toEqual([
      ["Angolo Giappone", "Vagabond"],
      ["Recupero Batman", "Batman: Anno Uno"],
    ]);
    expect(ahead[0].path.id).toBe(giappone);
  });

  it("carries the intent, because that is what the recommendation is meant to extend", async () => {
    await angoloGiappone();

    const [ahead] = await nextUnreadOnActivePaths();
    expect(ahead.path.intent).toBe(
      "privilegiare titoli davvero coerenti con samurai e cultura giapponese"
    );
  });

  it("leaves out a Path the owner put aside", async () => {
    const { pathId } = await angoloGiappone();
    await deactivatePath(pathId);

    expect(await nextUnreadOnActivePaths()).toEqual([]);
  });

  it("leaves out an exhausted route rather than answering with nothing for it", async () => {
    const { stories } = await angoloGiappone();
    for (const story of stories) {
      await finishReading(
        await recordReading({ storyId: story, medium: "paper", provenanceId: "remembered" }),
        "2024-02-02"
      );
    }

    const batman = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(batman, [
      await createStory({ title: "Batman: Anno Uno", typeId: "comic" }),
    ]);

    expect((await nextUnreadOnActivePaths()).map((entry) => entry.path.name)).toEqual([
      "Recupero Batman",
    ]);
  });

  it("does not care that the Stories cross Types and publishers", async () => {
    const path = await definePath({ name: "Technical Leadership" });
    await placeStoriesOnPath(path, [
      await createStory({ title: "The Manager's Path", typeId: "non-fiction" }),
    ]);

    const [ahead] = await nextUnreadOnActivePaths();
    expect(ahead.next.type).toEqual({ id: "non-fiction", name: "Non-fiction" });
  });
});

describe("everything still ahead on every active Path", () => {
  it("is every stop still to read, in the owner's order and not just the next one", async () => {
    const { stories } = await angoloGiappone();
    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    const [route] = await stillAheadOnActivePaths();

    // What stands behind the next stop has to be visible before the owner can pin it,
    // which is what the Reading list's head is for (#40).
    expect(route.path.name).toBe("Angolo Giappone");
    expect(titles(route.ahead)).toEqual(["Lone Wolf and Cub", "Musashi"]);
  });

  it("keeps the routes in the owner's order of routes", async () => {
    await angoloGiappone();
    const batman = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(batman, [
      await createStory({ title: "Batman: Anno Uno", typeId: "comic" }),
    ]);

    expect((await stillAheadOnActivePaths()).map((route) => route.path.name)).toEqual([
      "Angolo Giappone",
      "Recupero Batman",
    ]);
  });

  it("leaves out a route put aside and one walked to the end, as its neighbour does", async () => {
    const { pathId, stories } = await angoloGiappone();
    await deactivatePath(pathId);

    const walked = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(walked, [stories[0]]);
    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect(await stillAheadOnActivePaths()).toEqual([]);
  });
});

describe("the Paths, as a list", () => {
  it("counts the route and what is left of it, and puts the active ones first", async () => {
    const { pathId, stories } = await angoloGiappone();
    await finishReading(
      await recordReading({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    const aside = await definePath({ name: "Recupero Batman" });
    await deactivatePath(aside);
    await definePath({ name: "Technical Leadership" });

    const paths = await listPaths();

    expect(
      paths.map((path) => [
        path.name,
        path.active,
        path.stops,
        path.unread,
        path.next?.title ?? null,
      ])
    ).toEqual([
      ["Angolo Giappone", true, 3, 2, "Lone Wolf and Cub"],
      ["Technical Leadership", true, 0, 0, null],
      ["Recupero Batman", false, 0, 0, null],
    ]);
    expect(paths[0].id).toBe(pathId);
  });
});

describe("the declared constraints", () => {
  it("are read in the owner's words, the global ones before the routes'", async () => {
    const { pathId } = await angoloGiappone();
    await declareConstraint({ pathId, prose: "take it slowly, given the cost" });
    await declareConstraint({ prose: "don't accumulate too many unread books" });

    const constraints = await listDeclaredConstraints();

    expect(
      constraints.map((constraint) => [constraint.prose, constraint.path?.name ?? null])
    ).toEqual([
      ["don't accumulate too many unread books", null],
      ["take it slowly, given the cost", "Angolo Giappone"],
    ]);
  });

  it("come back on the Path they were declared on, and the global ones do not", async () => {
    const { pathId } = await angoloGiappone();
    await declareConstraint({ pathId, prose: "take it slowly, given the cost" });
    await declareConstraint({ prose: "don't accumulate too many unread books" });

    expect((await findPath(pathId))?.constraints.map((constraint) => constraint.prose)).toEqual([
      "take it slowly, given the cost",
    ]);
  });

  it("are none where the owner has declared none", async () => {
    expect(await listDeclaredConstraints()).toEqual([]);
  });
});

// **What can still go on a route, and in what order** — the picker's question, and the order
// is the whole of it: a route through *Slam Dunk* is twenty stops, and the reason twenty was
// never worth building by hand is that the owner had to find each title in a list of
// seventy-seven and could not see that they belonged together.
describe("the Stories that could still go on a route", () => {
  /** One tankōbon of *Slam Dunk*, in the house, at its position, carrying its Story. */
  async function slamDunk(number: number, pathTo: { seriesId: string }): Promise<string> {
    const storyId = await createStory({ title: `Slam Dunk ${number}`, typeId: "manga" });
    const volumeId = await volumeInTheHouse({
      title: `Slam Dunk ${number}`,
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId, seriesId: pathTo.seriesId, number });
    await recordVolumeCarriesStory(volumeId, storyId);
    return storyId;
  }

  it("leaves out what is already on the route", async () => {
    const { pathId, stories } = await angoloGiappone();
    await createStory({ title: "Dune", typeId: "novel" });

    expect(titles(await listStoriesNotOnPath(pathId))).toEqual(["Dune"]);
    expect((await listStoriesNotOnPath(pathId)).map((one) => one.id)).not.toContain(stories[0]);
  });

  // 1, 2, 10 — and never 1, 10, 2, which is what a list ordered by title does to a run of
  // twenty and what makes the owner check each tick.
  it("stands a run in the order its objects stand on the shelf", async () => {
    const pathId = await definePath({ name: "Slam Dunk, in order" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    await slamDunk(10, { seriesId });
    await slamDunk(1, { seriesId });
    await slamDunk(2, { seriesId });

    expect(titles(await listStoriesNotOnPath(pathId))).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
      "Slam Dunk 10",
    ]);
  });

  it("carries the line each stands in, so a picker can band them by it", async () => {
    const pathId = await definePath({ name: "Slam Dunk, in order" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    await slamDunk(1, { seriesId });

    expect(await listStoriesNotOnPath(pathId)).toMatchObject([
      {
        title: "Slam Dunk 1",
        type: { id: "manga", name: "Manga" },
        state: "to-read",
        series: { id: seriesId, name: "Slam Dunk", editionLine: null },
        standsAt: 1,
      },
    ]);
  });

  // A Story nothing carries is not part of any run, so it cannot be poured onto a route with
  // one — it comes after everything that stands in a line, with nothing where a position goes.
  it("puts what stands in no line last, and says so with nothing", async () => {
    const pathId = await definePath({ name: "Angolo Giappone" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    await createStory({ title: "Aaaa, a novel with no objects", typeId: "novel" });
    await slamDunk(1, { seriesId });

    const candidates = await listStoriesNotOnPath(pathId);

    expect(titles(candidates)).toEqual(["Slam Dunk 1", "Aaaa, a novel with no objects"]);
    expect(candidates[1]).toMatchObject({ series: null, standsAt: null });
  });

  it("narrows by title, folding accents and reading no wildcards", async () => {
    const pathId = await definePath({ name: "Recupero" });
    await createStory({ title: "Perché no", typeId: "novel" });
    await createStory({ title: "100% Doraemon", typeId: "manga" });

    expect(titles(await listStoriesNotOnPath(pathId, { title: "perche" }))).toEqual(["Perché no"]);
    expect(titles(await listStoriesNotOnPath(pathId, { title: "100%" }))).toEqual([
      "100% Doraemon",
    ]);
    // A pattern is not a search: `%` matched literally above, and `%o%` matches nothing.
    expect(await listStoriesNotOnPath(pathId, { title: "%o%" })).toEqual([]);
  });

  it("answers with nothing for a Path that is not there", async () => {
    await createStory({ title: "Dune", typeId: "novel" });

    expect(await listStoriesNotOnPath("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(await listStoriesNotOnPath("banana")).toEqual([]);
  });
});
