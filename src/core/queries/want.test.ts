import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { recordReading } from "../verbs/reading.ts";
import { createStory } from "../verbs/story.ts";
import { openWant } from "../verbs/want.ts";
import { listOpenWants, theWantOnTheStory } from "./want.ts";

// Seam 1, the read side of the Want — and everything asserted here is a derivation with no
// row behind it: whether a Want is still open, and the one order a Want has.

beforeEach(async () => {
  await query("truncate story cascade");
});

describe("the open Wants", () => {
  it("names the Story and what kind of thing it is, which is all a Want carries", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await openWant(storyId);

    expect(await listOpenWants()).toMatchObject([
      { story: { id: storyId, title: "Slam Dunk", type: { id: "manga", name: "Manga" } } },
    ]);
  });

  it("reads newest first, which is the only order a Want has", async () => {
    const first = await createStory({ title: "Vagabond", typeId: "manga" });
    const second = await createStory({ title: "Lone Wolf and Cub", typeId: "manga" });

    await openWant(first);
    await openWant(second);

    expect((await listOpenWants()).map((want) => want.story.title)).toEqual([
      "Lone Wolf and Cub",
      "Vagabond",
    ]);
  });

  it("leaves out the ones a Reading has answered, and keeps the ones it has not", async () => {
    const read = await createStory({ title: "Death Note", typeId: "manga" });
    const wanted = await createStory({ title: "Vagabond", typeId: "manga" });
    await openWant(read);
    await openWant(wanted);

    await recordReading({ storyId: read, medium: "digital", provenanceId: "remembered" });

    expect((await listOpenWants()).map((want) => want.story.title)).toEqual(["Vagabond"]);
  });
});

describe("the Want standing on one Story", () => {
  it("is nothing at all where the owner never said it", async () => {
    const storyId = await createStory({ title: "Vagabond", typeId: "manga" });

    expect(await theWantOnTheStory(storyId)).toBeNull();
    // A hand-typed address carries anything, and the answer is the same absence.
    expect(await theWantOnTheStory("banana")).toBeNull();
  });

  it("is still there once it has fallen quiet, and says so", async () => {
    const storyId = await createStory({ title: "Vagabond", typeId: "manga" });
    const { id } = await openWant(storyId);

    expect(await theWantOnTheStory(storyId)).toMatchObject({ id, quiet: false });

    await recordReading({ storyId, medium: "digital", provenanceId: "remembered" });

    expect(await theWantOnTheStory(storyId)).toMatchObject({ id, quiet: true });
  });
});
