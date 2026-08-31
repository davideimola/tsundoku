import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { findStory, listStories } from "../queries/story.ts";
import { amendStory, createStory } from "./story.ts";

beforeEach(async () => {
  await query("truncate story cascade");
});

describe("creating a Story", () => {
  it("takes a title and a Type, and nothing about an object", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    expect(await findStory(storyId)).toMatchObject({
      title: "Slam Dunk",
      type: { id: "manga", name: "Manga" },
      state: "to-read",
      readings: [],
      standaloneRatings: [],
    });
  });

  it("holds a story of any granularity, because the granularity is the owner's choice", async () => {
    // One volume holding three stories, and one story across twenty volumes, are the
    // same shape here (ADR-0001). Nothing records which, and no Volume is involved.
    await createStory({ title: "L'uomo che ride", typeId: "comic" });
    await createStory({ title: "Gotham Noir", typeId: "comic" });
    await createStory({ title: "Slam Dunk", typeId: "manga" });

    expect((await listStories()).map((story) => story.title)).toEqual([
      "Gotham Noir",
      "L'uomo che ride",
      "Slam Dunk",
    ]);
  });

  it("refuses a blank title", async () => {
    await expect(createStory({ title: "   ", typeId: "novel" })).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Story needs a title.",
    });
  });

  it("refuses a Type that is not one of the library's", async () => {
    await expect(createStory({ title: "Neuromancer", typeId: "cyberpunk" })).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That is not a Type this library knows.",
    });
  });
});

// What an approved Amendment does to a Story (ADR-0011). The Inbox is the door an assistant
// reaches this through, and `verbs/inbox.test.ts` is where that boundary is held; here is
// the act itself.
describe("amending a Story", () => {
  it("changes the field it names and leaves the other standing", async () => {
    const storyId = await createStory({ title: "Slamdunk", typeId: "comic" });

    await amendStory(storyId, { title: "Slam Dunk" });

    expect(await findStory(storyId)).toMatchObject({
      title: "Slam Dunk",
      type: { id: "comic" },
    });
  });

  it("refuses an amendment that names nothing, because nothing is not a change", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await expect(amendStory(storyId, {})).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
    });
  });

  it("refuses a Story that is not there, and a malformed id is the same event", async () => {
    await expect(
      amendStory("6f5f4e3d-2c1b-4a09-8877-665544332211", { title: "Slam Dunk" })
    ).rejects.toMatchObject({ name: "Refusal", code: "not-found" });

    await expect(amendStory("banana", { title: "Slam Dunk" })).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
    });
  });

  it("refuses a Type that is not one of the library's", async () => {
    const storyId = await createStory({ title: "Neuromancer", typeId: "novel" });

    await expect(amendStory(storyId, { typeId: "cyberpunk" })).rejects.toMatchObject({
      name: "Refusal",
      message: "That is not a Type this library knows.",
    });
  });
});
