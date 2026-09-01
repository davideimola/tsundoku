import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listOpenWants, theWantOnTheStory } from "../queries/want.ts";
import { isRefusal } from "../refusal.ts";
import { recordReading } from "./reading.ts";
import { createStory } from "./story.ts";
import { openWant, strikeWant } from "./want.ts";

// Seam 1, the write side of the Want. Everything here is asserted through what the database
// then holds, or through the prose the verb answers with — never through a helper.
//
// The two things this file exists to pin are the two the design turns on: there is **no verb
// that closes a Want**, and a Want that has fallen quiet did so by comparison rather than by
// anything being written.

beforeEach(async () => {
  await query("truncate story cascade");
});

async function slamDunk(): Promise<string> {
  return createStory({ title: "Slam Dunk", typeId: "manga" });
}

/** What is actually stored, which is the point of most of this file. */
async function wants(): Promise<{ story_id: string }[]> {
  return query("select story_id from want order by opened_at");
}

describe("opening a Want", () => {
  it("stores one row naming the Story, with no Path, no order and no name", async () => {
    const storyId = await slamDunk();

    await openWant(storyId);

    expect(await wants()).toEqual([{ story_id: storyId }]);
    const [{ paths }] = await query<{ paths: string }>("select count(*) as paths from path");
    expect(paths).toBe("0");
  });

  it("is refused where there is no such Story, rather than inventing one", async () => {
    await expect(openWant("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      code: "not-found",
    });

    // A URL and an assistant can both carry anything. Prose, not a 500.
    await expect(openWant("banana")).rejects.toSatisfy(isRefusal);
  });

  it("is refused a second time by Postgres, not by an `if`", async () => {
    const storyId = await slamDunk();
    await openWant(storyId);

    const refusal = await openWant(storyId).catch((error) => error);

    expect(refusal).toSatisfy(isRefusal);
    // The unique constraint is what said no: the code is the SQLSTATE's, and the constraint
    // it names is the one in the migration.
    expect(refusal).toMatchObject({
      code: "already-exists",
      constraint: "want_one_open_per_story",
      message: "There is already a Want on that Story.",
    });
    expect(await wants()).toHaveLength(1);
  });
});

describe("what ends a Want", () => {
  it("falls quiet once a Reading begins after it, and nothing was written to retire it", async () => {
    const storyId = await slamDunk();
    await openWant(storyId);

    expect(await listOpenWants()).toHaveLength(1);

    await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    expect(await listOpenWants()).toEqual([]);
    // The row is exactly as it was: what answered the Want is the Reading, by comparison.
    expect(await wants()).toHaveLength(1);
    expect(await theWantOnTheStory(storyId)).toMatchObject({ quiet: true });
  });

  it("stands on a Story read years ago, and nothing anywhere says it is a reread", async () => {
    const storyId = await slamDunk();
    await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "goodreads-history",
      startedOn: "2019-03-01",
      endedOn: "2019-04-01",
      outcome: "finished",
    });

    await openWant(storyId);

    expect(await listOpenWants()).toHaveLength(1);
    expect(await theWantOnTheStory(storyId)).toMatchObject({ quiet: false });
  });

  it("stands where an undated old Reading was recorded first, that same evening", async () => {
    const storyId = await slamDunk();
    // *I read this at some point* — no date at all, recorded now — and then *I want to read it
    // again*. The Want was opened after the Reading was written down, so it is live.
    await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    await openWant(storyId);

    expect(await listOpenWants()).toHaveLength(1);
  });

  it("has no verb that closes one: opening and striking are the whole of this file", async () => {
    // The design, asserted rather than described. Nobody closes a Want, so a third verb here
    // would be the second truth this model deliberately does not keep.
    const verbs = await import("./want.ts");
    expect(Object.keys(verbs).sort()).toEqual(["openWant", "strikeWant"]);
  });
});

describe("striking a Want", () => {
  it("takes the row away and leaves the Story standing", async () => {
    const storyId = await slamDunk();
    const { id } = await openWant(storyId);

    await strikeWant(id);

    expect(await wants()).toEqual([]);
    const [{ stories }] = await query<{ stories: string }>("select count(*) as stories from story");
    expect(stories).toBe("1");
  });

  it("frees the Story to be wanted again, because a slip leaves no trace", async () => {
    const storyId = await slamDunk();
    const { id } = await openWant(storyId);

    await strikeWant(id);
    await openWant(storyId);

    expect(await wants()).toHaveLength(1);
  });

  it("is refused where there is no such Want, rather than passing silently", async () => {
    await expect(strikeWant("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(strikeWant("banana")).rejects.toSatisfy(isRefusal);
  });
});
