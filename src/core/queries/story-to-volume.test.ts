import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { acquireVolume } from "../verbs/collection.ts";
import { setRating } from "../verbs/rating.ts";
import { recordReading } from "../verbs/reading.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import {
  listStoriesInVolume,
  listStoriesInVolumes,
  listVolumesCarryingStory,
} from "./story-to-volume.ts";

// Seam 1, against the real Postgres — and the two cases in this file are the whole
// argument of ADR-0001. They are the two the spreadsheets could not hold: one cell for
// three opinions, and twenty cells for one. Both are written with the owner's own titles
// and the owner's own numbers, because a made-up fixture would prove a shape and these
// prove the cases.
beforeEach(async () => {
  await query("truncate story, volume cascade");
});

describe("one Volume holding three Stories: L'uomo che ride", () => {
  // The object on the shelf is one Volume. Inside it are three narratives the owner read
  // and judged separately, which is the fact the `Voto` column destroyed.
  async function lUomoCheRide() {
    const volumeId = (
      await acquireVolume({
        title: "L'uomo che ride",
        publisher: "Panini Comics",
        editionLine: "DC Must Have",
        binding: "must-have",
        language: "it",
      })
    ).id;

    const scores: Record<string, number> = {
      "L'uomo che ride": 9,
      "Gotham Noir": 7.5,
      "Uomo di legno": 6,
    };

    for (const [title, score] of Object.entries(scores)) {
      const storyId = await createStory({ title, typeId: "comic" });
      await recordVolumeCarriesStory(volumeId, storyId);
      const readingId = await recordReading({
        storyId,
        medium: "paper",
        volumeId,
        outcome: "finished",
        provenanceId: "remembered",
      });
      await setRating({ storyId, readingId, score, provenanceId: "remembered" });
    }

    return volumeId;
  }

  it("holds all three, each with the judgement it earned on its own", async () => {
    const volumeId = await lUomoCheRide();

    expect(await listStoriesInVolume(volumeId)).toEqual([
      expect.objectContaining({ title: "Gotham Noir", latestScore: 7.5 }),
      expect.objectContaining({ title: "L'uomo che ride", latestScore: 9 }),
      expect.objectContaining({ title: "Uomo di legno", latestScore: 6 }),
    ]);
  });

  it("gives each Story its own Volume back, which is the same one", async () => {
    const volumeId = await lUomoCheRide();
    const stories = await listStoriesInVolume(volumeId);

    for (const story of stories) {
      expect(await listVolumesCarryingStory(story.id)).toEqual([
        expect.objectContaining({ id: volumeId, title: "L'uomo che ride" }),
      ]);
    }
  });

  it("carries the Type and the Binding by name, because MCP reads both", async () => {
    const volumeId = await lUomoCheRide();

    const [story] = await listStoriesInVolume(volumeId);
    expect(story.type).toEqual({ id: "comic", name: "Comic" });

    const [volume] = await listVolumesCarryingStory(story.id);
    expect(volume.binding).toEqual({ id: "must-have", name: "Must Have" });
  });
});

describe("one Story across twenty Volumes: Slam Dunk", () => {
  // Twenty objects, one narrative, one judgement. The owner would never rate volume 13.
  async function slamDunk() {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    for (let number = 1; number <= 20; number++) {
      const volumeId = (
        await acquireVolume({
          title: `Slam Dunk ${number}`,
          publisher: "Planet Manga",
          binding: "tankobon",
          language: "it",
        })
      ).id;
      await recordVolumeCarriesStory(volumeId, storyId);
    }

    const readingId = await recordReading({
      storyId,
      medium: "paper",
      outcome: "finished",
      provenanceId: "remembered",
    });
    await setRating({
      storyId,
      readingId,
      score: 10,
      prose: "The one that made me read manga.",
      provenanceId: "remembered",
    });

    return storyId;
  }

  it("is carried by twenty Volumes and rated once", async () => {
    const storyId = await slamDunk();
    const volumes = await listVolumesCarryingStory(storyId);

    expect(volumes).toHaveLength(20);
    // Ordered by title as text, which puts *Slam Dunk 10* between 1 and 2. The order the
    // owner means is the position in the line, and that is a Series' fact rather than
    // this join's — so what is asserted here is that all twenty are there.
    expect(new Set(volumes.map((volume) => volume.title))).toEqual(
      new Set(Array.from({ length: 20 }, (_, index) => `Slam Dunk ${index + 1}`))
    );

    const [row] = await query<{ ratings: number }>(
      "select count(*)::int as ratings from rating where story_id = $1",
      [storyId]
    );
    expect(row.ratings).toBe(1);
  });

  it("shows that one judgement from every one of the twenty objects", async () => {
    const storyId = await slamDunk();
    const volumes = await listVolumesCarryingStory(storyId);

    for (const volume of volumes) {
      expect(await listStoriesInVolume(volume.id)).toEqual([
        expect.objectContaining({ id: storyId, title: "Slam Dunk", latestScore: 10 }),
      ]);
    }
  });
});

// The claim the ticket makes in one line, and the only way to hold it: delete the rows
// that say the fact, and *both* directions go quiet together. If either side were derived
// from the other, one of them would survive.
describe("neither side is derived from the other", () => {
  it("is one stored fact, read from both ends", async () => {
    const volumeId = (
      await acquireVolume({
        title: "Akira 1",
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      })
    ).id;
    const storyId = await createStory({ title: "Akira", typeId: "manga" });

    expect(await listStoriesInVolume(volumeId)).toEqual([]);
    expect(await listVolumesCarryingStory(storyId)).toEqual([]);

    await recordVolumeCarriesStory(volumeId, storyId);

    expect((await listStoriesInVolume(volumeId)).map((story) => story.id)).toEqual([storyId]);
    expect((await listVolumesCarryingStory(storyId)).map((volume) => volume.id)).toEqual([
      volumeId,
    ]);

    await query("delete from volume_story");

    expect(await listStoriesInVolume(volumeId)).toEqual([]);
    expect(await listVolumesCarryingStory(storyId)).toEqual([]);
  });

  it("keeps a Story with no Volume at all readable, which is the ordinary case", async () => {
    const storyId = await createStory({ title: "Vita di Pi", typeId: "novel" });
    expect(await listVolumesCarryingStory(storyId)).toEqual([]);
  });
});

// A Volume that left the house still carries what it held: the Readings made through it
// are true, and the owner asking *did I ever have this?* is asking about the past.
describe("a Volume the owner released", () => {
  it("is still shown as carrying the Story, and says it is gone", async () => {
    const volumeId = (
      await acquireVolume({
        title: "Death Note 1",
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
        purchaseDate: "2019-05-02",
      })
    ).id;
    const storyId = await createStory({ title: "Death Note", typeId: "manga" });
    await recordVolumeCarriesStory(volumeId, storyId);

    await query("update volume set released_on = '2023-01-01' where id = $1", [volumeId]);

    expect(await listVolumesCarryingStory(storyId)).toEqual([
      expect.objectContaining({ title: "Death Note 1", releasedOn: "2023-01-01" }),
    ]);
  });
});

// The Collection screen lists a hundred Volumes and shows what each one holds. Asking per
// row would be a hundred round trips; this is the one statement that answers for all of
// them, and it exists because the screen needs it rather than for symmetry.
describe("what a page's worth of Volumes hold", () => {
  it("answers for many Volumes at once, keyed by Volume", async () => {
    const first = (
      await acquireVolume({
        title: "L'uomo che ride",
        publisher: "Panini Comics",
        binding: "must-have",
        language: "it",
      })
    ).id;
    const second = (
      await acquireVolume({
        title: "Slam Dunk 1",
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      })
    ).id;
    const third = (
      await acquireVolume({
        title: "Berserk 1",
        publisher: "Panini Comics",
        binding: "tankobon",
        language: "it",
      })
    ).id;

    const gothamNoir = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const uomoDiLegno = await createStory({ title: "Uomo di legno", typeId: "comic" });
    const slamDunk = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await recordVolumeCarriesStory(first, gothamNoir);
    await recordVolumeCarriesStory(first, uomoDiLegno);
    await recordVolumeCarriesStory(second, slamDunk);

    const held = await listStoriesInVolumes([first, second, third]);

    expect(held[first].map((story) => story.title)).toEqual(["Gotham Noir", "Uomo di legno"]);
    expect(held[second].map((story) => story.title)).toEqual(["Slam Dunk"]);
    // A Volume carrying nothing yet is an ordinary Volume, not a missing key: the screen
    // renders a row for it either way.
    expect(held[third]).toEqual([]);
  });

  it("answers nothing for no Volumes, without asking the database", async () => {
    expect(await listStoriesInVolumes([])).toEqual({});
  });
});
