import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { findStory, listStories } from "../queries/story.ts";
import { listStoriesInVolume } from "../queries/story-to-volume.ts";
import { amendStory, createStory, createStoryCarriedBy } from "./story.ts";

beforeEach(async () => {
  await query("truncate story, volume cascade");
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

// **Creating a Story inside the object that carries it**, which is the owner standing with a
// volume in their hand reading its contents page. Two facts said in one breath — the
// narrative exists, and this object holds it — and the tests that matter are the ones about
// the *half*: neither side may be left standing on its own.
describe("creating a Story a Volume carries", () => {
  const NO_SUCH_ID = "00000000-0000-0000-0000-000000000000";

  async function hulkRosso(): Promise<string> {
    return volumeInTheHouse({
      title: "Hulk Rosso",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });
  }

  it("writes both facts, and the Story is an ordinary one", async () => {
    const volumeId = await hulkRosso();

    const storyId = await createStoryCarriedBy({ title: "Hulk Rosso", typeId: "comic" }, volumeId);

    expect(await findStory(storyId)).toMatchObject({
      title: "Hulk Rosso",
      type: { id: "comic" },
      state: "to-read",
    });
    expect((await listStoriesInVolume(volumeId)).map((story) => story.id)).toEqual([storyId]);
  });

  // The case the whole volume is: one object holding an arc and a back-up story from
  // somewhere else. Two Stories, one Volume, and the second one is the one that used to go
  // unrecorded because saying it meant a trip back to the wall.
  it("says it twice for an object holding two narratives", async () => {
    const volumeId = await hulkRosso();

    await createStoryCarriedBy({ title: "Hulk Rosso", typeId: "comic" }, volumeId);
    await createStoryCarriedBy({ title: "Wolverine 50, the back-up", typeId: "comic" }, volumeId);

    expect((await listStoriesInVolume(volumeId)).map((story) => story.title)).toEqual([
      "Hulk Rosso",
      "Wolverine 50, the back-up",
    ]);
  });

  it("creates no Story where the Volume is not in the library", async () => {
    await expect(
      createStoryCarriedBy({ title: "Hulk Rosso", typeId: "comic" }, NO_SUCH_ID)
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Volume is not in the library.",
    });

    // The half that would otherwise be left standing: a Story nothing carries, which reads
    // as something read digitally rather than as a write that failed.
    expect(await listStories()).toEqual([]);
  });

  it("records nothing on the Volume where the Type is not one of the library's", async () => {
    const volumeId = await hulkRosso();

    await expect(
      createStoryCarriedBy({ title: "Hulk Rosso", typeId: "cyberpunk" }, volumeId)
    ).rejects.toMatchObject({ name: "Refusal", message: "That is not a Type this library knows." });

    expect(await listStoriesInVolume(volumeId)).toEqual([]);
    expect(await listStories()).toEqual([]);
  });

  it("refuses a blank title in the verb's own words", async () => {
    const volumeId = await hulkRosso();

    await expect(
      createStoryCarriedBy({ title: "   ", typeId: "comic" }, volumeId)
    ).rejects.toMatchObject({ name: "Refusal", message: "A Story needs a title." });
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
