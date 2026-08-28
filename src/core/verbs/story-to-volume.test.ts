import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listStoriesInVolume, listVolumesCarryingStory } from "../queries/story-to-volume.ts";
import { acquireVolume } from "./collection.ts";
import { recordReading } from "./reading.ts";
import { createStory } from "./story.ts";
import { recordVolumeCarriesStory, recordVolumeNoLongerCarriesStory } from "./story-to-volume.ts";

// Seam 1. The two cases themselves live in `../queries/story-to-volume.test.ts`, where
// they can be read from both ends; what is here is what the verbs refuse.
beforeEach(async () => {
  await query("truncate story, volume cascade");
});

async function aVolume(title: string): Promise<string> {
  const { id } = await acquireVolume({
    title,
    publisher: "Panini Comics",
    binding: "must-have",
    language: "it",
  });
  return id;
}

const NO_SUCH_ID = "00000000-0000-0000-0000-000000000000";

describe("recording that a Volume carries a Story", () => {
  it("says one fact, and saying it again is the same fact", async () => {
    const volumeId = await aVolume("L'uomo che ride");
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await recordVolumeCarriesStory(volumeId, storyId);
    await recordVolumeCarriesStory(volumeId, storyId);

    expect(await listStoriesInVolume(volumeId)).toHaveLength(1);
  });

  it("refuses a Volume that is not in the library", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await expect(recordVolumeCarriesStory(NO_SUCH_ID, storyId)).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Volume is not in the library.",
    });
  });

  it("refuses a Story that is not in the library", async () => {
    const volumeId = await aVolume("L'uomo che ride");

    await expect(recordVolumeCarriesStory(volumeId, NO_SUCH_ID)).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Story is not in the library yet.",
    });
  });

  // An id is generated and never typed: it arrives from the screen the caller was just
  // looking at or from an assistant reading over MCP. So a malformed one is the same
  // event as an unknown one, and not the 500 that `where id = 'banana'` on a uuid column
  // would otherwise be.
  it("refuses an id that is not an id at all", async () => {
    const volumeId = await aVolume("L'uomo che ride");

    await expect(recordVolumeCarriesStory("banana", volumeId)).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(recordVolumeCarriesStory(volumeId, "banana")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("recording that a Volume no longer carries a Story", () => {
  it("takes the fact away from both directions at once", async () => {
    const volumeId = await aVolume("L'uomo che ride");
    const storyId = await createStory({ title: "Uomo di legno", typeId: "comic" });
    await recordVolumeCarriesStory(volumeId, storyId);

    await recordVolumeNoLongerCarriesStory(volumeId, storyId);

    expect(await listStoriesInVolume(volumeId)).toEqual([]);
    expect(await listVolumesCarryingStory(storyId)).toEqual([]);
  });

  // It corrects a typed mistake and nothing else. The Story is still read, still rated,
  // and still in the library; the object is still owned.
  it("leaves the Story and the Volume where they were", async () => {
    const volumeId = await aVolume("L'uomo che ride");
    const storyId = await createStory({ title: "Uomo di legno", typeId: "comic" });
    await recordVolumeCarriesStory(volumeId, storyId);

    await recordVolumeNoLongerCarriesStory(volumeId, storyId);

    const [counts] = await query<{ stories: number; volumes: number }>(
      "select (select count(*)::int from story) as stories, (select count(*)::int from volume) as volumes"
    );
    expect(counts).toEqual({ stories: 1, volumes: 1 });
  });

  it("refuses where there was no such fact to take away", async () => {
    const volumeId = await aVolume("L'uomo che ride");
    const storyId = await createStory({ title: "Uomo di legno", typeId: "comic" });

    await expect(recordVolumeNoLongerCarriesStory(volumeId, storyId)).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Volume does not carry that Story.",
    });
  });
});

// The third fact this join makes expressible, and the column the Reading slice left out
// rather than pointing at a table nothing had built.
describe("the Volume a Reading went through", () => {
  it("is recorded where there was one", async () => {
    const volumeId = await aVolume("L'uomo che ride");
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await recordReading({
      storyId,
      medium: "paper",
      volumeId,
      outcome: "finished",
      provenanceId: "remembered",
    });

    const [row] = await query<{ volume_id: string | null }>(
      "select volume_id from reading where story_id = $1",
      [storyId]
    );
    expect(row.volume_id).toBe(volumeId);
  });

  it("is absent for a Reading that went through no object, which is the ordinary case", async () => {
    const storyId = await createStory({ title: "Vita di Pi", typeId: "novel" });

    await recordReading({ storyId, medium: "digital", provenanceId: "goodreads-history" });

    const [row] = await query<{ volume_id: string | null }>(
      "select volume_id from reading where story_id = $1",
      [storyId]
    );
    expect(row.volume_id).toBeNull();
  });

  // Digital ownership is not modelled, so there is no object a digital Reading could have
  // gone through: an ebook is a Reading with a digital medium and no Volume.
  it("cannot be a digital Reading's, because there is no digital object", async () => {
    const volumeId = await aVolume("L'uomo che ride");
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await expect(
      recordReading({ storyId, medium: "digital", volumeId, provenanceId: "remembered" })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Reading on digital went through no Volume: an owned ebook is not a thing here.",
    });
  });

  it("refuses a Volume that is not in the library", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await expect(
      recordReading({ storyId, medium: "paper", volumeId: NO_SUCH_ID, provenanceId: "remembered" })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Volume is not in the library.",
    });
  });
});
