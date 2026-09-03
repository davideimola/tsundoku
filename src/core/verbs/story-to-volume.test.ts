import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { listStoriesInVolume, listVolumesCarryingStory } from "../queries/story-to-volume.ts";
import { recordReading } from "./reading.ts";
import { declareSeries, placeVolumeInSeries } from "./series.ts";
import { createStory, declareInstalments } from "./story.ts";
import {
  recordVolumeCarriesStories,
  recordVolumeCarriesStory,
  recordVolumeCoversInstalments,
  recordVolumeNoLongerCarriesStory,
} from "./story-to-volume.ts";

// Seam 1. The two cases themselves live in `../queries/story-to-volume.test.ts`, where
// they can be read from both ends; what is here is what the verbs refuse.
beforeEach(async () => {
  await query("truncate story, volume, series cascade");
});

async function aVolume(title: string): Promise<string> {
  const id = await volumeInTheHouse({
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

// WHICH INSTALMENTS OF THE WORK ARE IN THIS OBJECT.
//
// The default is what makes them free: where a line prints one part per Volume, the range
// follows the volumes and this verb is never reached. It is written by hand for the omnibus,
// and very nearly nothing else.
describe("what a Volume covers of a Story", () => {
  async function slamDunk(): Promise<string> {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await declareInstalments(storyId, 20);
    return storyId;
  }

  it("follows the line where one part is printed per Volume, with nothing typed", async () => {
    const storyId = await slamDunk();
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    const volumeId = await aVolume("Slam Dunk 7");
    await placeVolumeInSeries({ volumeId, seriesId, number: 7 });
    await recordVolumeCarriesStory(volumeId, storyId);

    expect(await listVolumesCarryingStory(storyId)).toMatchObject([
      { covers: { from: 7, to: 7, written: false } },
    ]);
  });

  it("says an omnibus covers one to thirty-five, which is the case it is written for", async () => {
    const storyId = await createStory({ title: "Ultimate Spider-Man", typeId: "comic" });
    await declareInstalments(storyId, 160);
    const volumeId = await aVolume("Ultimate Spider-Man Omnibus 1");
    await recordVolumeCarriesStory(volumeId, storyId);

    await recordVolumeCoversInstalments(volumeId, storyId, { from: 1, to: 35 });

    expect(await listStoriesInVolume(volumeId)).toMatchObject([
      {
        title: "Ultimate Spider-Man",
        instalments: 160,
        covers: { from: 1, to: 35, written: true },
      },
    ]);
  });

  it("hands the answer back to the line when the range is taken off again", async () => {
    const storyId = await slamDunk();
    const volumeId = await aVolume("Slam Dunk 7");
    await recordVolumeCarriesStory(volumeId, storyId);
    await recordVolumeCoversInstalments(volumeId, storyId, { from: 7, to: 9 });

    await recordVolumeCoversInstalments(volumeId, storyId, null);

    // Nothing to follow: this object stands in no line, which is an ordinary object.
    expect(await listStoriesInVolume(volumeId)).toMatchObject([{ covers: null }]);
  });

  it("says nothing about an object carrying a Story nobody numbered", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const volumeId = await aVolume("L'uomo che ride");
    await recordVolumeCarriesStory(volumeId, storyId);

    expect(await listStoriesInVolume(volumeId)).toMatchObject([
      { instalments: null, covers: null },
    ]);
  });

  it("refuses half a range, because an object covers from somewhere to somewhere", async () => {
    const storyId = await slamDunk();
    const volumeId = await aVolume("Slam Dunk Deluxe 1");
    await recordVolumeCarriesStory(volumeId, storyId);

    await expect(
      // What the Volume's own page sends when one of the two boxes was filled in.
      recordVolumeCoversInstalments(volumeId, storyId, { from: 1, to: Number.NaN })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "A range is both ends or neither. Say where it starts and where it ends, or leave both empty to follow the line.",
    });
  });

  it("refuses a range that inverts", async () => {
    const storyId = await slamDunk();
    const volumeId = await aVolume("Slam Dunk Deluxe 1");
    await recordVolumeCarriesStory(volumeId, storyId);

    await expect(
      recordVolumeCoversInstalments(volumeId, storyId, { from: 9, to: 3 })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "A range ends where it started or later: one to thirty-five, never thirty-five to one.",
    });
  });

  it("refuses a range that reaches past the end of the work", async () => {
    const storyId = await slamDunk();
    const volumeId = await aVolume("Slam Dunk Deluxe 1");
    await recordVolumeCarriesStory(volumeId, storyId);

    await expect(
      recordVolumeCoversInstalments(volumeId, storyId, { from: 1, to: 21 })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "That reaches past the end of the Story. An object cannot cover more of a work than there is.",
    });
  });

  it("refuses a range on a Story that has no Instalments to cover", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const volumeId = await aVolume("L'uomo che ride");
    await recordVolumeCarriesStory(volumeId, storyId);

    await expect(
      recordVolumeCoversInstalments(volumeId, storyId, { from: 1, to: 2 })
    ).rejects.toMatchObject({ name: "Refusal", code: "invalid" });
  });

  it("refuses to qualify a fact that is not there", async () => {
    const storyId = await slamDunk();
    const volumeId = await aVolume("Akira 1");

    await expect(
      recordVolumeCoversInstalments(volumeId, storyId, { from: 1, to: 2 })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Volume does not carry that Story.",
    });
  });

  it("refuses to shorten the work under an object that covers further", async () => {
    const storyId = await slamDunk();
    const volumeId = await aVolume("Slam Dunk Deluxe 1");
    await recordVolumeCarriesStory(volumeId, storyId);
    await recordVolumeCoversInstalments(volumeId, storyId, { from: 1, to: 12 });

    await expect(declareInstalments(storyId, 10)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "An object carrying this Story covers further than that. Correct what it covers first.",
    });
  });
});

// **A WHOLE BAND IN ONE PRESS** (#47), which is the run the owner is working through poured
// into an object in one gesture rather than twenty. It is one verb rather than the singular
// one called twenty times, because twenty calls from an adapter would invent a transaction
// that does not exist (`./README.md`).
describe("recording that a Volume carries several Stories", () => {
  it("records the whole band in one act, and answers with how many were new", async () => {
    const volumeId = await aVolume("Slam Dunk, the lot");
    const band = [];
    for (const number of [1, 2, 3]) {
      band.push(await createStory({ title: `Slam Dunk ${number}`, typeId: "manga" }));
    }

    expect(await recordVolumeCarriesStories(volumeId, band)).toBe(3);
    expect((await listStoriesInVolume(volumeId)).map((story) => story.title)).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
      "Slam Dunk 3",
    ]);
  });

  it("says the same true thing twice without refusing, like the singular one", async () => {
    const volumeId = await aVolume("L'uomo che ride");
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await recordVolumeCarriesStories(volumeId, [storyId, storyId]);
    await recordVolumeCarriesStories(volumeId, [storyId]);

    expect(await listStoriesInVolume(volumeId)).toHaveLength(1);
  });

  it("lands whole or not at all, so one unknown id records none of them", async () => {
    const volumeId = await aVolume("L'uomo che ride");
    const known = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await expect(recordVolumeCarriesStories(volumeId, [known, NO_SUCH_ID])).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
    });
    expect(await listStoriesInVolume(volumeId)).toEqual([]);
  });

  it("refuses an empty band rather than reporting that nothing happened", async () => {
    const volumeId = await aVolume("L'uomo che ride");

    await expect(recordVolumeCarriesStories(volumeId, [])).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
    });
  });

  it("refuses an object the library does not know", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await expect(recordVolumeCarriesStories(NO_SUCH_ID, [storyId])).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
    });
    await expect(recordVolumeCarriesStories("banana", [storyId])).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
    });
  });
});
