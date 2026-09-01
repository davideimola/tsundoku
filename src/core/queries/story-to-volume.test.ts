import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { releaseVolume } from "../verbs/collection.ts";
import { setRating } from "../verbs/rating.ts";
import { recordReading } from "../verbs/reading.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
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
  await query("truncate story, volume, series cascade");
});

describe("one Volume holding three Stories: L'uomo che ride", () => {
  // The object on the shelf is one Volume. Inside it are three narratives the owner read
  // and judged separately, which is the fact the `Voto` column destroyed.
  async function lUomoCheRide() {
    const volumeId = await volumeInTheHouse({
      title: "L'uomo che ride",
      publisher: "Panini Comics",
      editionLine: "DC Must Have",
      binding: "must-have",
      language: "it",
    });

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
      const volumeId = await volumeInTheHouse({
        title: `Slam Dunk ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
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
    // These twenty are in no line — nobody placed them — so they fall back to the title,
    // which puts *Slam Dunk 10* between 1 and 2. What is asserted here is that all twenty
    // are there; the shelf's own order is asserted below, where there is a line to stand in.
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
    const volumeId = await volumeInTheHouse({
      title: "Akira 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
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

// A Volume the house does not hold still carries what it held: the Readings made through
// it are true, and the owner asking *did I ever have this?* is asking about the past.
describe("a Volume the owner released", () => {
  it("is still shown as carrying the Story, and says the house has it no more", async () => {
    const volumeId = await volumeInTheHouse(
      {
        title: "Death Note 1",
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      },
      { acquiredOn: "2019-05-02" }
    );
    const storyId = await createStory({ title: "Death Note", typeId: "manga" });
    await recordVolumeCarriesStory(volumeId, storyId);

    await releaseVolume(volumeId);

    expect(await listVolumesCarryingStory(storyId)).toEqual([
      expect.objectContaining({ title: "Death Note 1", inTheHouse: false }),
    ]);
  });
});

// **A Story's carriers are drawn as spines** (#29), which is what a shelf looks like seen
// from the side — so they arrive in the order they stand in and each one says which line it
// stands in and where. Twenty tankōbon are one row of colour with the numbers along the foot,
// and a row that read 1, 10, 11, 2 would be a picture of nobody's shelf.
describe("the shelf a Story's carriers stand on", () => {
  /** *Death Note*, carried by three objects of one line, catalogued out of order. */
  async function deathNote(): Promise<{ storyId: string; seriesId: string }> {
    const storyId = await createStory({ title: "Death Note", typeId: "manga" });
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Planet Manga",
      publishedCount: 12,
      status: "concluded",
    });

    for (const number of [10, 1, 2]) {
      const volumeId = await volumeInTheHouse({
        title: `Death Note ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      await recordVolumeCarriesStory(volumeId, storyId);
      await placeVolumeInSeries({ volumeId, seriesId, number });
    }

    return { storyId, seriesId };
  }

  it("stands them in the publisher's order, and not in the order a title sorts in", async () => {
    const { storyId } = await deathNote();

    expect((await listVolumesCarryingStory(storyId)).map((volume) => volume.title)).toEqual([
      "Death Note 1",
      "Death Note 2",
      "Death Note 10",
    ]);
  });

  it("says which line each one stands in and where, which is its colour and its number", async () => {
    const { storyId, seriesId } = await deathNote();

    expect((await listVolumesCarryingStory(storyId))[0]).toMatchObject({
      seriesId,
      seriesNumber: 1,
    });
  });

  // The ordinary answer rather than a gap, as everywhere else: an object nobody has placed in
  // a line has no colour to wear and no number to print, and it stands after the ones that do.
  it("leaves an object in no line without one, and stands it last", async () => {
    const { storyId } = await deathNote();
    const loose = await volumeInTheHouse({
      title: "Death Note Black Edition I",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(loose, storyId);

    const carriers = await listVolumesCarryingStory(storyId);

    expect(carriers.at(-1)).toMatchObject({
      title: "Death Note Black Edition I",
      seriesId: null,
      seriesNumber: null,
    });
  });
});

// The Collection screen lists a hundred Volumes and shows what each one holds. Asking per
// row would be a hundred round trips; this is the one statement that answers for all of
// them, and it exists because the screen needs it rather than for symmetry.
describe("what a page's worth of Volumes hold", () => {
  it("answers for many Volumes at once, keyed by Volume", async () => {
    const first = await volumeInTheHouse({
      title: "L'uomo che ride",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });
    const second = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    const third = await volumeInTheHouse({
      title: "Berserk 1",
      publisher: "Panini Comics",
      binding: "tankobon",
      language: "it",
    });

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
