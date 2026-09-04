import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { recordPass } from "../verbs/pass.ts";
import { definePath, placeStoriesOnPath } from "../verbs/path.ts";
import { setRating } from "../verbs/rating.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import {
  listStoriesInVolume,
  listStoriesInVolumes,
  listStoriesNotInVolume,
  listStoriesToOffer,
  listVolumesCarryingNothing,
  listVolumesCarryingStory,
} from "./story-to-volume.ts";

// Seam 1, against the real Postgres — and the two cases in this file are the whole
// argument of ADR-0001. They are the two the spreadsheets could not hold: one cell for
// three opinions, and twenty cells for one. Both are written with the owner's own titles
// and the owner's own numbers, because a made-up fixture would prove a shape and these
// prove the cases.
beforeEach(async () => {
  await query("truncate story, volume, series, path cascade");
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
      const passId = await recordPass({
        storyId,
        medium: "paper",
        volumeId,
        outcome: "finished",
        provenanceId: "remembered",
      });
      await setRating({ storyId, readingId: passId, score, provenanceId: "remembered" });
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

    const passId = await recordPass({
      storyId,
      medium: "paper",
      outcome: "finished",
      provenanceId: "remembered",
    });
    await setRating({
      storyId,
      readingId: passId,
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
// **Whether a narrative is this object's own**, read from the object — which is the one thing
// on a Volume's contents that is about the join rather than about either end of it. From one
// Volume, a tale inside an omnibus and a work running across twenty tankōbon look identical,
// and telling them apart is what decides whether an object can be split at all (#38).
describe("a narrative other objects carry too", () => {
  it("says so on a volume of a work, and not on an object's own tale", async () => {
    const own = await volumeInTheHouse({
      title: "Batman: L'uomo che ride",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });
    const first = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    const second = await volumeInTheHouse({
      title: "Slam Dunk 2",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    const tale = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const work = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await recordVolumeCarriesStory(own, tale);
    await recordVolumeCarriesStory(first, work);
    await recordVolumeCarriesStory(second, work);

    expect(await listStoriesInVolume(own)).toMatchObject([{ alsoCarriedElsewhere: false }]);
    expect(await listStoriesInVolume(first)).toMatchObject([{ alsoCarriedElsewhere: true }]);
    expect(await listStoriesInVolume(second)).toMatchObject([{ alsoCarriedElsewhere: true }]);
  });
});

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

// A Volume the house does not hold still carries what it held: the Passes made through
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

// **WHY A ROW DRAWS ITS BIN**, which is the same expression `strikeStoryCarriedBy` refuses
// with, read the other way round (#47). The row cannot come to offer a press the verb would
// refuse, because the row and the verb read one answer.
describe("what stands in the way of unmaking a narrative from the object carrying it", () => {
  async function ilLungoHalloween(): Promise<{ volumeId: string; storyId: string }> {
    const volumeId = await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });
    const storyId = await createStory({ title: "Batman: Il lungo Halloween", typeId: "comic" });
    await recordVolumeCarriesStory(volumeId, storyId);
    return { volumeId, storyId };
  }

  it("says nothing stands in the way of a narrative this object alone holds", async () => {
    const { volumeId } = await ilLungoHalloween();

    expect(await listStoriesInVolume(volumeId)).toEqual([
      expect.objectContaining({ whyItStands: null }),
    ]);
  });

  it("names the other objects carrying it, because a line is not one volume's to unmake", async () => {
    const { volumeId, storyId } = await ilLungoHalloween();
    const second = await volumeInTheHouse({
      title: "Slam Dunk 2",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(second, storyId);

    const [carried] = await listStoriesInVolume(volumeId);
    expect(carried?.whyItStands).toMatch(/other objects carry it too/);
  });

  it("names a Pass, a Rating and a Path, each in its own words", async () => {
    const read = await ilLungoHalloween();
    await recordPass({
      storyId: read.storyId,
      medium: "paper",
      outcome: "finished",
      provenanceId: "remembered",
    });
    expect((await listStoriesInVolume(read.volumeId))[0]?.whyItStands).toMatch(
      /a Pass went through it/
    );

    const judged = await ilLungoHalloween();
    await setRating({ storyId: judged.storyId, score: 8, provenanceId: "remembered" });
    expect((await listStoriesInVolume(judged.volumeId))[0]?.whyItStands).toMatch(/you judged it/);

    const routed = await ilLungoHalloween();
    const path = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(path, [routed.storyId]);
    expect((await listStoriesInVolume(routed.volumeId))[0]?.whyItStands).toMatch(
      /a Path names it as a stop/
    );
  });
});

// **THE ONE FIELD UNDER THE ROWS**, asked of the catalogue as the owner types (#47,
// ADR-0019). It is the many-to-many read as an absence: the Stories this object does *not*
// carry, so the field can only ever propose something that would change the record.
describe("the Stories an object does not carry", () => {
  async function slamDunk(): Promise<{ volumeId: string; seriesId: string }> {
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    const volumeId = await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });

    for (const number of [2, 10, 1]) {
      const tankobon = await volumeInTheHouse({
        title: `Slam Dunk ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      await placeVolumeInSeries({ volumeId: tankobon, seriesId, number });
      const storyId = await createStory({ title: `Slam Dunk ${number}`, typeId: "manga" });
      await recordVolumeCarriesStory(tankobon, storyId);
    }

    return { volumeId, seriesId };
  }

  it("offers what the library holds and this object does not", async () => {
    const { volumeId } = await slamDunk();

    expect((await listStoriesNotInVolume(volumeId)).map((story) => story.title)).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
      "Slam Dunk 10",
    ]);
  });

  it("never offers one the object already carries", async () => {
    const { volumeId } = await slamDunk();
    const held = await createStory({ title: "Gotham Noir", typeId: "comic" });
    await recordVolumeCarriesStory(volumeId, held);

    expect((await listStoriesNotInVolume(volumeId)).map((story) => story.title)).not.toContain(
      "Gotham Noir"
    );
  });

  it("narrows to what was typed, folding accents and ignoring case", async () => {
    const { volumeId } = await slamDunk();
    await createStory({ title: "Perché no", typeId: "novel" });

    expect(
      (await listStoriesNotInVolume(volumeId, { title: "slam dunk 1" })).map((s) => s.title)
    ).toEqual(["Slam Dunk 1", "Slam Dunk 10"]);
    expect(
      (await listStoriesNotInVolume(volumeId, { title: "perche" })).map((s) => s.title)
    ).toEqual(["Perché no"]);
  });

  // **The band is the line**, and the order inside it is the order the objects stand on the
  // shelf — 1, 2, 10 — because that is how the owner reads a run and how they add one.
  it("carries the line each Story stands in, and where it stands in it", async () => {
    const { volumeId, seriesId } = await slamDunk();

    expect(await listStoriesNotInVolume(volumeId)).toEqual([
      expect.objectContaining({ series: expect.objectContaining({ id: seriesId }), standsAt: 1 }),
      expect.objectContaining({ standsAt: 2 }),
      expect.objectContaining({ standsAt: 10 }),
    ]);
  });

  it("stands what is in no line after what is, and says so with nothing", async () => {
    const { volumeId } = await slamDunk();
    await createStory({ title: "Neuromancer", typeId: "novel" });

    const offered = await listStoriesNotInVolume(volumeId);
    expect(offered.at(-1)).toMatchObject({
      title: "Neuromancer",
      series: null,
      standsAt: null,
      type: { id: "novel", name: "Novel" },
    });
  });

  it("offers nothing for an id that names no object, and for one that is not an id", async () => {
    await slamDunk();

    expect(await listStoriesNotInVolume("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(await listStoriesNotInVolume("banana")).toEqual([]);
  });
});

// **THE GAP READ FROM THE OBJECT'S END** (#51). Two ordinary paths produce an object that
// carries nothing — one approved from the Inbox, and one catalogued from a photograph before
// the owner knows what is inside — and neither is refused anywhere. What is asserted here is
// the pair of sentences the screen over it stands on: an object carrying nothing is in the
// answer, and an object carrying something never is.
describe("the objects carrying no narrative", () => {
  it("answers with the object nobody has named the contents of", async () => {
    const gap = await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });

    expect(await listVolumesCarryingNothing()).toEqual([
      expect.objectContaining({ id: gap, title: "Batman: Il lungo Halloween" }),
    ]);
  });

  it("never answers with an object that carries something", async () => {
    const carrying = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await recordVolumeCarriesStory(carrying, storyId);

    expect(await listVolumesCarryingNothing()).toEqual([]);
  });

  // The order is the wall's own, and it is asserted here rather than left to the fragment:
  // seventeen objects approved from the Inbox in one gesture are a run, a list that sorted
  // them 1, 10, 11, 2 would be a picture of nobody's shelf, and an object in no line takes
  // its place *among* the lines under its own title rather than being swept to the end.
  it("stands them the way the shelf stands, and says where each one stands in its line", async () => {
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });

    for (const number of [2, 10, 1]) {
      const tankobon = await volumeInTheHouse({
        title: `Slam Dunk ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      await placeVolumeInSeries({ volumeId: tankobon, seriesId, number });
    }

    await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });

    expect(await listVolumesCarryingNothing()).toEqual([
      // In no line, so it sorts under its own title — *among* the lines, where it stands on
      // the real shelf — and says where it stands with nothing.
      expect.objectContaining({ title: "Batman: Il lungo Halloween", seriesNumber: null }),
      expect.objectContaining({ title: "Slam Dunk 1", seriesNumber: 1 }),
      expect.objectContaining({ title: "Slam Dunk 2", seriesNumber: 2 }),
      expect.objectContaining({ title: "Slam Dunk 10", seriesNumber: 10 }),
    ]);
  });

  // Both halves of the catalogue produce this gap, so both are answered with and neither is
  // filtered on: the object from the Inbox has never been owned, the one catalogued from a
  // photograph is on the shelf, and the one let go is still an object carrying nothing.
  it("says whether the house holds it, and answers for the objects it does not", async () => {
    await catalogueVolume({
      title: "Berserk 1",
      publisher: "Panini Comics",
      binding: "tankobon",
      language: "it",
    });
    await volumeInTheHouse({
      title: "Akira 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    const letGo = await volumeInTheHouse({
      title: "Zerocalcare",
      publisher: "Bao Publishing",
      binding: "paperback",
      language: "it",
    });
    await releaseVolume(letGo);

    expect(await listVolumesCarryingNothing()).toEqual([
      expect.objectContaining({ title: "Akira 1", inTheHouse: true }),
      // Catalogued and never acquired, which is what an approval from the Inbox leaves.
      expect.objectContaining({ title: "Berserk 1", inTheHouse: false }),
      expect.objectContaining({ title: "Zerocalcare", inTheHouse: false }),
    ]);
  });

  // What tells two objects of one title apart, which is what the row is read for.
  it("carries the publisher, the edition line and the Binding by name", async () => {
    await volumeInTheHouse({
      title: "Batman: Il lungo Halloween",
      publisher: "Panini Comics",
      editionLine: "DC Must Have",
      binding: "must-have",
      language: "it",
    });

    expect(await listVolumesCarryingNothing()).toEqual([
      expect.objectContaining({
        publisher: "Panini Comics",
        editionLine: "DC Must Have",
        binding: { id: "must-have", name: "Must Have" },
      }),
    ]);
  });
});

// **THE SAME FIELD, ON AN OBJECT THAT DOES NOT EXIST YET** (#48, ADR-0019).
//
// At cataloguing time the one field under the rows searches the same catalogue and bands it
// the same way, and there is no Volume to ask *not in that* about: the object is being written
// in the submission this list feeds. So what is excluded is what the owner has already named
// in the screen they are standing in, which they hold as rows rather than as links.
describe("the Stories the field offers while an object is being catalogued", () => {
  async function aLibrary() {
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 21,
      status: "concluded",
    });

    const stories: Record<string, string> = {};
    for (const number of [2, 10, 1]) {
      const tankobon = await volumeInTheHouse({
        title: `Slam Dunk ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      await placeVolumeInSeries({ volumeId: tankobon, seriesId, number });
      const storyId = await createStory({ title: `Slam Dunk ${number}`, typeId: "manga" });
      await recordVolumeCarriesStory(tankobon, storyId);
      stories[`Slam Dunk ${number}`] = storyId;
    }

    stories["Gotham Noir"] = await createStory({ title: "Gotham Noir", typeId: "comic" });
    return { seriesId, stories };
  }

  it("offers the whole catalogue, in the order a run is read in", async () => {
    await aLibrary();

    expect((await listStoriesToOffer()).map((story) => story.title)).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
      "Slam Dunk 10",
      "Gotham Noir",
    ]);
  });

  it("leaves out the ones the owner has already named in the screen", async () => {
    const { stories } = await aLibrary();

    expect(
      (await listStoriesToOffer({ except: [stories["Slam Dunk 1"], stories["Gotham Noir"]] })).map(
        (story) => story.title
      )
    ).toEqual(["Slam Dunk 2", "Slam Dunk 10"]);
  });

  it("narrows to what was typed, folding accents and ignoring case", async () => {
    await aLibrary();
    await createStory({ title: "Perché no", typeId: "novel" });

    expect((await listStoriesToOffer({ title: "slam dunk 1" })).map((s) => s.title)).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 10",
    ]);
    expect((await listStoriesToOffer({ title: "perche" })).map((s) => s.title)).toEqual([
      "Perché no",
    ]);
  });

  // The band and the tint the walls taught come off the same two facts here as they do on a
  // Volume's own page, because it is the same answer to the same question.
  it("carries the line each Story stands in, and where it stands in it", async () => {
    const { seriesId } = await aLibrary();

    expect(await listStoriesToOffer({ title: "slam dunk" })).toEqual([
      expect.objectContaining({ series: expect.objectContaining({ id: seriesId }), standsAt: 1 }),
      expect.objectContaining({ standsAt: 2 }),
      expect.objectContaining({ standsAt: 10 }),
    ]);
  });

  it("stands what is in no line after what is, and says so with nothing", async () => {
    await aLibrary();

    expect((await listStoriesToOffer({ title: "gotham" })).at(-1)).toMatchObject({
      title: "Gotham Noir",
      series: null,
      standsAt: null,
      type: { id: "comic", name: "Comic" },
    });
  });

  // An id that is not one is the same event as one naming nothing, for the reason every
  // question in this file gives: it came off a screen rather than off a keyboard.
  it("ignores a named id that is not an id, rather than answering with nothing at all", async () => {
    await aLibrary();

    expect((await listStoriesToOffer({ except: ["banana"] })).map((s) => s.title)).toEqual([
      "Slam Dunk 1",
      "Slam Dunk 2",
      "Slam Dunk 10",
      "Gotham Noir",
    ]);
  });
});
