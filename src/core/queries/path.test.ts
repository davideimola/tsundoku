import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import {
  deactivatePath,
  declareConstraint,
  definePath,
  moveStoryOnPath,
  placeStoryOnPath,
} from "../verbs/path.ts";
import { abandonReading, finishReading, recordReading } from "../verbs/reading.ts";
import { createStory } from "../verbs/story.ts";
import {
  findPath,
  listDeclaredConstraints,
  listPaths,
  nextUnreadOnActivePaths,
  nextUnreadOnPath,
} from "./path.ts";

// Seam 1, the read side. This is the surface both doors read — the screen and, once #4
// mounts it, the MCP door — so what is asserted here is what an external assistant sees
// when it asks what the owner's routes are and what comes next on them.

beforeEach(async () => {
  await query("truncate path, story cascade");
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
  for (const story of stories) await placeStoryOnPath(pathId, story);

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

  it("is nothing when there is no such Path", async () => {
    expect(await findPath("00000000-0000-0000-0000-000000000000")).toBeNull();
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
    await placeStoryOnPath(
      batman,
      await createStory({ title: "Batman: Anno Uno", typeId: "comic" })
    );

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
    await placeStoryOnPath(
      batman,
      await createStory({ title: "Batman: Anno Uno", typeId: "comic" })
    );

    expect((await nextUnreadOnActivePaths()).map((entry) => entry.path.name)).toEqual([
      "Recupero Batman",
    ]);
  });

  it("does not care that the Stories cross Types and publishers", async () => {
    const path = await definePath({ name: "Technical Leadership" });
    await placeStoryOnPath(
      path,
      await createStory({ title: "The Manager's Path", typeId: "non-fiction" })
    );

    const [ahead] = await nextUnreadOnActivePaths();
    expect(ahead.next.type).toEqual({ id: "non-fiction", name: "Non-fiction" });
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
