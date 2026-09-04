import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { findPath } from "../queries/path.ts";
import { isRefusal } from "../refusal.ts";
import { recordPass } from "./pass.ts";
import {
  activatePath,
  deactivatePath,
  declareConstraint,
  definePath,
  moveStoryEarlier,
  moveStoryLater,
  moveStoryOnPath,
  placeStoriesOnPath,
  removeStoryFromPath,
  renamePath,
  restatePathIntent,
  strikePath,
  withdrawConstraint,
} from "./path.ts";
import { setRating } from "./rating.ts";
import { createStory } from "./story.ts";

// Seam 1, the write side of a Path. What is asserted here is the owner's judgement
// surviving exactly as they expressed it — the route in the order they put it in, and the
// prose in the words they used.

beforeEach(async () => {
  await query("truncate path, story cascade");
});

/**
 * The route, as the owner reads it: the titles in their places.
 *
 * Read back through the query the screens use rather than off `path_item`, so that these
 * tests assert what a verb *did* and not how the row it wrote is shaped.
 */
async function route(pathId: string): Promise<string[]> {
  const path = await findPath(pathId);
  return (path?.stops ?? []).map((stop) => stop.title);
}

/**
 * Where each Story sits — the one thing no query answers, and deliberately so: the place
 * is the schema's business. Used by exactly one test, the structural one below.
 */
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

describe("renaming a Path", () => {
  it("calls it something else, so a typo is not a name lost forever", async () => {
    const pathId = await definePath({ name: "Angolo Gaippone" });

    await renamePath(pathId, "Angolo Giappone");

    const [path] = await query<{ name: string }>("select name from path where id = $1", [pathId]);
    expect(path.name).toBe("Angolo Giappone");
  });

  it("refuses a name another route already holds", async () => {
    await definePath({ name: "Angolo Giappone" });
    const pathId = await definePath({ name: "Recupero Batman" });

    await expect(renamePath(pathId, "Angolo Giappone")).rejects.toMatchObject({
      code: "already-exists",
      message: "There is already a Path called that.",
    });
  });

  it("refuses a blank name, and a Path that is not there", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });

    await expect(renamePath(pathId, " ")).rejects.toMatchObject({ code: "invalid" });
    await expect(
      renamePath("00000000-0000-0000-0000-000000000000", "Anything")
    ).rejects.toMatchObject({ code: "not-found" });
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
    await placeStoriesOnPath(pathId, [first]);

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

    await placeStoriesOnPath(pathId, [three]);
    await placeStoriesOnPath(pathId, [one]);
    await placeStoriesOnPath(pathId, [two]);

    expect(await route(pathId)).toEqual([
      "Batman: Silenzio",
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
    ]);
  });

  it("crosses Types freely, because it points at Stories and Types are their attribute", async () => {
    const pathId = await definePath({ name: "Technical Leadership" });

    await placeStoriesOnPath(pathId, [
      await createStory({ title: "The Manager's Path", typeId: "non-fiction" }),
    ]);
    await placeStoriesOnPath(pathId, [await createStory({ title: "Vagabond", typeId: "manga" })]);
    await placeStoriesOnPath(pathId, [
      await createStory({ title: "Batman: Anno Uno", typeId: "comic" }),
    ]);
    await placeStoriesOnPath(pathId, [await createStory({ title: "Dune", typeId: "novel" })]);

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
    await placeStoriesOnPath(pathId, [first]);

    await expect(placeStoriesOnPath(pathId, [first])).rejects.toMatchObject({
      code: "already-exists",
      message: "That Story is already on this route.",
    });
  });

  // **A route through a series is one act.** Twenty stops placed one press at a time is the
  // same judgement typed twenty times, and the third press is where the owner stops building
  // routes at all.
  it("places a whole selection in the order it was given, in one act", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();

    expect(await placeStoriesOnPath(pathId, [three, one, two])).toBe(3);
    expect(await route(pathId)).toEqual([
      "Batman: Silenzio",
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
    ]);
  });

  it("adds a second selection after the route it already has", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    await placeStoriesOnPath(pathId, [one, two]);

    await placeStoriesOnPath(pathId, [three]);

    expect(await route(pathId)).toEqual([
      "Batman: Anno Uno",
      "Batman: Il lungo Halloween",
      "Batman: Silenzio",
    ]);
  });

  // The spacing is what a later re-order spends, so a selection placed at once has to leave
  // as much room between its stops as twenty separate presses would have.
  it("leaves the room a re-order needs between the stops it placed", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    await placeStoriesOnPath(pathId, [one, two, three]);

    await moveStoryEarlier(pathId, three);

    expect(await route(pathId)).toEqual([
      "Batman: Anno Uno",
      "Batman: Silenzio",
      "Batman: Il lungo Halloween",
    ]);
  });

  // Half a route placed in an order nobody read is worse than none: the owner would have to
  // work out which half landed.
  it("places nothing at all when one of the selection is already on the route, and names it", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    await placeStoriesOnPath(pathId, [two]);

    await expect(placeStoriesOnPath(pathId, [one, two, three])).rejects.toMatchObject({
      code: "already-exists",
      message: "Batman: Il lungo Halloween is already on this route. Nothing was placed.",
    });
    expect(await route(pathId)).toEqual(["Batman: Il lungo Halloween"]);
  });

  it("reads the same Story ticked twice as one intention", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one] = await batmanStories();

    expect(await placeStoriesOnPath(pathId, [one, one])).toBe(1);
    expect(await route(pathId)).toEqual(["Batman: Anno Uno"]);
  });

  it("refuses an empty selection rather than reporting nothing done", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });

    await expect(placeStoriesOnPath(pathId, [])).rejects.toMatchObject({ code: "invalid" });
  });

  it("places nothing when one of the selection is not a Story the library has", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one] = await batmanStories();

    await expect(
      placeStoriesOnPath(pathId, [one, "00000000-0000-4000-8000-000000000000"])
    ).rejects.toMatchObject({ code: "not-found" });
    expect(await route(pathId)).toEqual([]);
  });

  it("takes a Story off the route without touching the Story", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two] = await batmanStories();
    await placeStoriesOnPath(pathId, [one]);
    await placeStoriesOnPath(pathId, [two]);

    await removeStoryFromPath(pathId, one);

    expect(await route(pathId)).toEqual(["Batman: Il lungo Halloween"]);
    const [story] = await query<{ title: string }>("select title from story where id = $1", [one]);
    expect(story.title).toBe("Batman: Anno Uno");
  });

  it("refuses to take off a Story that is not on the route", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two] = await batmanStories();
    await placeStoriesOnPath(pathId, [one]);

    await expect(removeStoryFromPath(pathId, two)).rejects.toMatchObject({
      code: "not-found",
      message: "That Story is not on this Path.",
    });
  });

  it("refuses a Story the library does not have", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });

    await expect(
      placeStoriesOnPath(pathId, ["00000000-0000-0000-0000-000000000000"])
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses a Path the library does not have", async () => {
    const [first] = await batmanStories();

    await expect(
      placeStoriesOnPath("00000000-0000-0000-0000-000000000000", [first])
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("re-ordering the route by hand", () => {
  it("moves a Story to sit after another one", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two, three] = await batmanStories();
    for (const story of [one, two, three]) await placeStoriesOnPath(pathId, [story]);

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
    for (const story of [one, two, three]) await placeStoriesOnPath(pathId, [story]);

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
    for (const story of [one, two, three]) await placeStoriesOnPath(pathId, [story]);

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
    for (const story of [one, two, three]) await placeStoriesOnPath(pathId, [story]);

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
    for (const story of [one, two, three]) await placeStoriesOnPath(pathId, [story]);

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
    for (const story of [one, two, three]) await placeStoriesOnPath(pathId, [story]);

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
    await placeStoriesOnPath(pathId, [one]);

    await expect(moveStoryOnPath(pathId, one, one)).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses to move a Story that is not on the route", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two] = await batmanStories();
    await placeStoriesOnPath(pathId, [one]);

    await expect(moveStoryOnPath(pathId, two, one)).rejects.toMatchObject({
      code: "not-found",
      message: "That Story is not on this Path.",
    });
    await expect(moveStoryEarlier(pathId, two)).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses to move a Story after one that is not on the route", async () => {
    const pathId = await definePath({ name: "Recupero Batman" });
    const [one, two] = await batmanStories();
    await placeStoriesOnPath(pathId, [one]);

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

describe("striking a Path", () => {
  it("removes the route with its stops and the constraints declared on it", async () => {
    const pathId = await definePath({ name: "Slam Dunk", intent: "hand-copied to get it read" });
    const stories = await batmanStories();
    await placeStoriesOnPath(pathId, stories);
    await declareConstraint({ pathId, prose: "take it slowly, given the cost" });
    await declareConstraint({ prose: "don't accumulate too many unread books" });

    expect(await strikePath(pathId)).toBe("Slam Dunk");

    expect(await findPath(pathId)).toBeNull();
    expect(await query("select 1 from path_item where path_id = $1", [pathId])).toEqual([]);
    const left = await query<{ prose: string }>("select prose from declared_constraint");
    expect(left.map((row) => row.prose)).toEqual(["don't accumulate too many unread books"]);
  });

  it("leaves every Story, Pass and Rating the route named exactly as it was", async () => {
    const pathId = await definePath({ name: "Slam Dunk" });
    const [storyId] = await batmanStories();
    await placeStoriesOnPath(pathId, [storyId]);
    const passId = await recordPass({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
      outcome: "finished",
    });
    const ratingId = await setRating({
      storyId,
      score: 9,
      provenanceId: "remembered",
      passId,
    });

    await strikePath(pathId);

    expect(await query("select 1 from story where id = $1", [storyId])).toEqual([
      { "?column?": 1 },
    ]);
    const [pass] = await query<{ outcome: string }>("select outcome from pass where id = $1", [
      passId,
    ]);
    expect(pass.outcome).toBe("finished");
    const [rating] = await query<{ score: string }>(
      "select score::text from rating where id = $1",
      [ratingId]
    );
    expect(rating.score).toBe("9");
  });

  it("frees the name it held, so the same route can be defined again", async () => {
    const pathId = await definePath({ name: "Slam Dunk" });

    await expect(definePath({ name: "Slam Dunk" })).rejects.toMatchObject({
      code: "already-exists",
    });

    await strikePath(pathId);

    const again = await definePath({ name: "Slam Dunk" });
    expect(again).not.toBe(pathId);
  });

  it("is a different act from putting a route aside, which still keeps it whole", async () => {
    const struckId = await definePath({ name: "Slam Dunk" });
    const asideId = await definePath({ name: "Angolo Giappone" });
    const [one, two] = await batmanStories();
    await placeStoriesOnPath(struckId, [one]);
    await placeStoriesOnPath(asideId, [two]);

    await deactivatePath(asideId);
    await strikePath(struckId);

    // Aside says *not now*: the route is still there, with the order the owner made once.
    const aside = await findPath(asideId);
    expect(aside?.active).toBe(false);
    expect(aside?.stops.map((stop) => stop.title)).toEqual(["Batman: Il lungo Halloween"]);

    // Struck says *this was never a route*, and there is nothing left to take up again.
    expect(await findPath(struckId)).toBeNull();
    await expect(deactivatePath(struckId)).rejects.toMatchObject({ code: "not-found" });
  });

  it("says so in words when there is no such route, and refuses an id no row could have", async () => {
    await expect(strikePath("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      code: "not-found",
      message: "That Path is not in the library.",
    });
    await expect(strikePath("banana")).rejects.toMatchObject({
      code: "not-found",
      message: "That Path is not in the library.",
    });
  });
});

// A route is reached by a URL and a form, and both can carry anything at all. An id that
// could not name a row is the same event as one that names none — nothing to act on — and
// it must not arrive as a 500, which is what an unguarded uuid column would raise.
describe("an id no row could have", () => {
  it("is refused as a thing that is not there, and never as a broken query", async () => {
    await expect(placeStoriesOnPath("banana", ["banana"])).rejects.toMatchObject({
      code: "not-found",
      message: "That Path is not in the library.",
    });
    await expect(deactivatePath("banana")).rejects.toMatchObject({ code: "not-found" });
    await expect(moveStoryEarlier("banana", "banana")).rejects.toMatchObject({ code: "not-found" });
    await expect(withdrawConstraint("banana")).rejects.toMatchObject({ code: "not-found" });
    await expect(declareConstraint({ pathId: "banana", prose: "slowly" })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

// The structural half of "a Path crosses Types and publishers freely". A publisher is a
// property of a Volume and a publication order is a property of a Series, and **neither
// is reachable from a route**: there is no column here through which a Path could be
// narrowed to one publisher, or an order derived from a publication sequence. The order
// is the owner's judgement, and this is what makes that structural rather than a habit.
describe("what a route can be ordered or narrowed by", () => {
  it("is the owner's place, and nothing a publisher or a Series could supply", async () => {
    const columns = await query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'path_item'"
    );

    expect(columns.map((column) => column.column_name).sort()).toEqual([
      "added_at",
      "path_id",
      "position",
      "story_id",
    ]);
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
