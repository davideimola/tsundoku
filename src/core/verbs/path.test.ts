import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { isRefusal } from "../refusal.ts";
import {
  activatePath,
  deactivatePath,
  declareConstraint,
  definePath,
  moveStoryEarlier,
  moveStoryLater,
  moveStoryOnPath,
  placeStoryOnPath,
  removeStoryFromPath,
  restatePathIntent,
  withdrawConstraint,
} from "./path.ts";
import { createStory } from "./story.ts";

// Seam 1, the write side of a Path. What is asserted here is the owner's judgement
// surviving exactly as they expressed it — the route in the order they put it in, and the
// prose in the words they used.

beforeEach(async () => {
  await query("truncate path, story cascade");
});

/** The route, as the owner reads it: the titles in their places. */
async function route(pathId: string): Promise<string[]> {
  const rows = await query<{ title: string }>(
    `select s.title
       from path_item i
       join story s on s.id = i.story_id
      where i.path_id = $1
      order by i.position`,
    [pathId]
  );
  return rows.map((row) => row.title);
}

/** Where each Story sits, which is the one thing only the schema can answer. */
async function positions(pathId: string): Promise<Record<string, string>> {
  const rows = await query<{ title: string; position: string }>(
    `select s.title, i.position::text
       from path_item i
       join story s on s.id = i.story_id
      where i.path_id = $1`,
    [pathId]
  );
  return Object.fromEntries(rows.map((row) => [row.title, row.position]));
}

async function batmanStories(): Promise<string[]> {
  return Promise.all([
    createStory({ title: "Batman: Anno Uno", typeId: "comic" }),
    createStory({ title: "Batman: Il lungo Halloween", typeId: "comic" }),
    createStory({ title: "Batman: Silenzio", typeId: "comic" }),
  ]);
}

describe("defining a Path", () => {
  it("keeps the name and the intent in the owner's own words", async () => {
    const pathId = await definePath({
      name: "Angolo Giappone",
      intent: "privilegiare titoli davvero coerenti con samurai e cultura giapponese",
    });

    const [path] = await query<{ name: string; intent: string; active: boolean }>(
      "select name, intent, active from path where id = $1",
      [pathId]
    );

    expect(path.name).toBe("Angolo Giappone");
    expect(path.intent).toBe(
      "privilegiare titoli davvero coerenti con samurai e cultura giapponese"
    );
  });

  it("starts active, because a route the owner has just defined is one they mean to walk", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });

    const [path] = await query<{ active: boolean }>("select active from path where id = $1", [
      pathId,
    ]);
    expect(path.active).toBe(true);
  });

  it("takes no intent at all, for a route the owner has no words for yet", async () => {
    const pathId = await definePath({ name: "Technical Leadership" });

    const [path] = await query<{ intent: string | null }>("select intent from path where id = $1", [
      pathId,
    ]);
    expect(path.intent).toBeNull();
  });

  it("refuses a second route with the same name, whatever the case", async () => {
    await definePath({ name: "Angolo Giappone" });

    await expect(definePath({ name: "angolo giappone" })).rejects.toMatchObject({
      code: "already-exists",
      message: "There is already a Path called that.",
    });
  });

  it("refuses a nameless route", async () => {
    await expect(definePath({ name: "   " })).rejects.toMatchObject({
      code: "invalid",
      message: "A Path needs a name.",
    });
  });
});

describe("restating what a Path is for", () => {
  it("replaces the prose, because the intent is what the owner thinks now", async () => {
    const pathId = await definePath({ name: "Angolo Giappone", intent: "manga giapponesi" });

    await restatePathIntent(
      pathId,
      "privilegiare titoli davvero coerenti con samurai e cultura giapponese"
    );

    const [path] = await query<{ intent: string }>("select intent from path where id = $1", [
      pathId,
    ]);
    expect(path.intent).toBe(
      "privilegiare titoli davvero coerenti con samurai e cultura giapponese"
    );
  });

  it("takes the prose away when the owner clears it", async () => {
    const pathId = await definePath({ name: "Angolo Giappone", intent: "manga giapponesi" });

    await restatePathIntent(pathId, null);

    const [path] = await query<{ intent: string | null }>("select intent from path where id = $1", [
      pathId,
    ]);
    expect(path.intent).toBeNull();
  });

  it("refuses a Path that is not there", async () => {
    await expect(
      restatePathIntent("00000000-0000-0000-0000-000000000000", "anything")
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("putting a Path aside and taking it up again", () => {
  it("marks it inactive, and the route survives untouched", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [first] = await batmanStories();
    await placeStoryOnPath(pathId, first);

    await deactivatePath(pathId);

    const [aside] = await query<{ active: boolean }>("select active from path where id = $1", [
      pathId,
    ]);
    expect(aside.active).toBe(false);
    expect(await route(pathId)).toEqual(["Batman: Anno Uno"]);

    await activatePath(pathId);
    const [taken] = await query<{ active: boolean }>("select active from path where id = $1", [
      pathId,
    ]);
    expect(taken.active).toBe(true);
  });

  it("refuses a Path that is not there", async () => {
    await expect(deactivatePath("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("a route through Stories", () => {
  it("keeps the Stories in the order the owner placed them", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();

    await placeStoryOnPath(pathId, three);
    await placeStoryOnPath(pathId, one);
    await placeStoryOnPath(pathId, two);

    expect(await route(pathId)).toEqual([
      "Batman: Silenzio",
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
    ]);
  });

  it("crosses Types freely, because it points at Stories and Types are their attribute", async () => {
    const pathId = await definePath({ name: "Technical Leadership" });

    await placeStoryOnPath(
      pathId,
      await createStory({ title: "The Manager's Path", typeId: "non-fiction" })
    );
    await placeStoryOnPath(pathId, await createStory({ title: "Vagabond", typeId: "manga" }));
    await placeStoryOnPath(
      pathId,
      await createStory({ title: "Batman: Anno Uno", typeId: "comic" })
    );
    await placeStoryOnPath(pathId, await createStory({ title: "Dune", typeId: "novel" }));

    expect(await route(pathId)).toEqual([
      "The Manager's Path",
      "Vagabond",
      "Batman: Anno Uno",
      "Dune",
    ]);
  });

  it("refuses the same Story twice on one route", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [first] = await batmanStories();
    await placeStoryOnPath(pathId, first);

    await expect(placeStoryOnPath(pathId, first)).rejects.toMatchObject({
      code: "already-exists",
      message: "That Story is already on this Path.",
    });
  });

  it("takes a Story off the route without touching the Story", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two] = await batmanStories();
    await placeStoryOnPath(pathId, one);
    await placeStoryOnPath(pathId, two);

    await removeStoryFromPath(pathId, one);

    expect(await route(pathId)).toEqual(["Batman: Il lungo Halloween"]);
    const [story] = await query<{ title: string }>("select title from story where id = $1", [one]);
    expect(story.title).toBe("Batman: Anno Uno");
  });

  it("refuses to take off a Story that is not on the route", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two] = await batmanStories();
    await placeStoryOnPath(pathId, one);

    await expect(removeStoryFromPath(pathId, two)).rejects.toMatchObject({
      code: "not-found",
      message: "That Story is not on this Path.",
    });
  });

  it("refuses a Story the library does not have", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });

    await expect(
      placeStoryOnPath(pathId, "00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses a Path the library does not have", async () => {
    const [first] = await batmanStories();

    await expect(
      placeStoryOnPath("00000000-0000-0000-0000-000000000000", first)
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("re-ordering the route by hand", () => {
  it("moves a Story to sit after another one", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    for (const story of [one, two, three]) await placeStoryOnPath(pathId, story);

    await moveStoryOnPath(pathId, three, one);

    expect(await route(pathId)).toEqual([
      "Batman: Anno Uno",
      "Batman: Silenzio",
      "Batman: Il lungo Halloween",
    ]);
  });

  it("moves a Story to the front", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    for (const story of [one, two, three]) await placeStoryOnPath(pathId, story);

    await moveStoryOnPath(pathId, three, null);

    expect(await route(pathId)).toEqual([
      "Batman: Silenzio",
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
    ]);
  });

  it("moves a Story one place earlier and one place later", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    for (const story of [one, two, three]) await placeStoryOnPath(pathId, story);

    await moveStoryEarlier(pathId, three);
    expect(await route(pathId)).toEqual([
      "Batman: Anno Uno",
      "Batman: Silenzio",
      "Batman: Il lungo Halloween",
    ]);

    await moveStoryLater(pathId, three);
    expect(await route(pathId)).toEqual([
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
      "Batman: Silenzio",
    ]);

    await moveStoryEarlier(pathId, three);
    await moveStoryEarlier(pathId, three);
    expect(await route(pathId)).toEqual([
      "Batman: Silenzio",
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
    ]);
  });

  it("leaves the first Story alone when it is asked to go earlier, and the last one to go later", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    for (const story of [one, two, three]) await placeStoryOnPath(pathId, story);

    await moveStoryEarlier(pathId, one);
    await moveStoryLater(pathId, three);

    expect(await route(pathId)).toEqual([
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
      "Batman: Silenzio",
    ]);
  });

  // The structural claim of this slice, and the reason `position` is sparse `numeric`
  // rather than a dense `1, 2, 3`: recording one decision writes one row, however long
  // the route is. A re-numbering would write all of them, and a re-numbering is not what
  // the owner did.
  it("writes one row, and leaves every other Story's place exactly as it was", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    for (const story of [one, two, three]) await placeStoryOnPath(pathId, story);

    const before = await positions(pathId);
    await moveStoryOnPath(pathId, three, one);
    const after = await positions(pathId);

    expect(after["Batman: Anno Uno"]).toBe(before["Batman: Anno Uno"]);
    expect(after["Batman: Il lungo Halloween"]).toBe(before["Batman: Il lungo Halloween"]);
    expect(after["Batman: Silenzio"]).not.toBe(before["Batman: Silenzio"]);
  });

  it("survives being re-ordered into the same gap over and over", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    for (const story of [one, two, three]) await placeStoryOnPath(pathId, story);

    // Each pair of moves halves the gap between the first two Stories, so after forty
    // passes the two neighbours are a thousandth of a billionth apart. `numeric` is
    // arbitrary precision, so they are still two places; a float would have collapsed
    // them into one and the unique constraint would have refused the move.
    for (let pass = 0; pass < 40; pass += 1) {
      await moveStoryOnPath(pathId, three, one);
      await moveStoryOnPath(pathId, two, one);
    }

    expect(await route(pathId)).toEqual([
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
      "Batman: Silenzio",
    ]);
  });

  it("refuses to place a Story after itself", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one] = await batmanStories();
    await placeStoryOnPath(pathId, one);

    await expect(moveStoryOnPath(pathId, one, one)).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses to move a Story that is not on the route", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two] = await batmanStories();
    await placeStoryOnPath(pathId, one);

    await expect(moveStoryOnPath(pathId, two, one)).rejects.toMatchObject({
      code: "not-found",
      message: "That Story is not on this Path.",
    });
    await expect(moveStoryEarlier(pathId, two)).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses to move a Story after one that is not on the route", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two] = await batmanStories();
    await placeStoryOnPath(pathId, one);

    await expect(moveStoryOnPath(pathId, one, two)).rejects.toMatchObject({
      code: "not-found",
      message: "The Story it was to follow is not on this Path.",
    });
  });
});

describe("declaring a constraint", () => {
  it("records the sentence globally, as the owner said it", async () => {
    const id = await declareConstraint({ prose: "don't accumulate too many unread books" });

    const [declared] = await query<{ prose: string; path_id: string | null }>(
      "select prose, path_id from declared_constraint where id = $1",
      [id]
    );
    expect(declared.prose).toBe("don't accumulate too many unread books");
    expect(declared.path_id).toBeNull();
  });

  it("records the sentence on a Path, where it holds over that route only", async () => {
    const pathId = await definePath({ name: "Angolo Giappone" });

    const id = await declareConstraint({ pathId, prose: "take it slowly, given the cost" });

    const [declared] = await query<{ prose: string; path_id: string | null }>(
      "select prose, path_id from declared_constraint where id = $1",
      [id]
    );
    expect(declared.prose).toBe("take it slowly, given the cost");
    expect(declared.path_id).toBe(pathId);
  });

  it("refuses an empty sentence, because a blank instruction is worse than none", async () => {
    await expect(declareConstraint({ prose: "  " })).rejects.toMatchObject({
      code: "invalid",
      message: "A constraint is a sentence the recommender can read.",
    });
  });

  it("refuses a constraint on a Path that is not there", async () => {
    await expect(
      declareConstraint({ pathId: "00000000-0000-0000-0000-000000000000", prose: "slowly" })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("ends only by a deliberate act, and says so when there is nothing to withdraw", async () => {
    const id = await declareConstraint({ prose: "take it slowly, given the cost" });

    await withdrawConstraint(id);
    expect(await query("select 1 from declared_constraint where id = $1", [id])).toEqual([]);

    await expect(withdrawConstraint(id)).rejects.toMatchObject({ code: "not-found" });
  });

  it("goes with the Path it was declared on, and never with a global one", async () => {
    const pathId = await definePath({ name: "Angolo Giappone" });
    await declareConstraint({ pathId, prose: "take it slowly, given the cost" });
    await declareConstraint({ prose: "don't accumulate too many unread books" });

    await query("delete from path where id = $1", [pathId]);

    const left = await query<{ prose: string }>("select prose from declared_constraint");
    expect(left.map((row) => row.prose)).toEqual(["don't accumulate too many unread books"]);
  });
});

// Nothing above `src/core` reads a SQLSTATE (`verbs/README.md`), so what a refused write
// throws is checked once here as well as case by case above.
describe("what a refusal is", () => {
  it("is a Refusal carrying prose and a code, never a driver error", async () => {
    const failed = await definePath({ name: "Angolo Giappone" }).then(
      () => definePath({ name: "Angolo Giappone" }).catch((error: unknown) => error),
      () => undefined
    );

    expect(isRefusal(failed)).toBe(true);
  });
});
