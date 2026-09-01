import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { findStory } from "../queries/story.ts";
import {
  abandonReading,
  finishReading,
  recordInstalmentReached,
  recordReading,
} from "./reading.ts";
import { createStory, declareInstalments } from "./story.ts";

// Seam 1, against the real Postgres. `truncate story cascade` takes the Readings and
// the Ratings with it and leaves the two data-row tables — Type and Provenance —
// alone, because those are schema rather than fixtures.
beforeEach(async () => {
  // `volume` joins it now that a pass can go through an object: an omnibus left behind by
  // one test is an object standing in a line in the next.
  await query("truncate story, volume cascade");
});

describe("recording a Reading", () => {
  it("records when, by what medium, how it ended and how it is known", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2024-03-01",
      endedOn: "2024-03-04",
      outcome: "finished",
      provenanceId: "remembered",
    });

    const story = await findStory(storyId);
    expect(story?.readings).toEqual([
      expect.objectContaining({
        medium: "paper",
        outcome: "finished",
        startedOn: "2024-03-01",
        endedOn: "2024-03-04",
        provenance: { id: "remembered", name: "Remembered" },
        rating: null,
      }),
    ]);
  });

  it("records a Reading with no Volume anywhere in sight — digital, borrowed, or Goodreads history", async () => {
    const storyId = await createStory({ title: "Vita di Pi", typeId: "novel" });

    await recordReading({
      storyId,
      medium: "digital",
      outcome: "finished",
      provenanceId: "goodreads-history",
    });

    const story = await findStory(storyId);
    expect(story?.readings[0]).toMatchObject({
      medium: "digital",
      startedOn: null,
      endedOn: null,
      provenance: { id: "goodreads-history", name: "Goodreads history" },
    });
  });

  it("refuses a medium the model does not have, because digital ownership is not modelled", async () => {
    const storyId = await createStory({ title: "Akira", typeId: "manga" });

    const attempt = recordReading({
      // @ts-expect-error the type says paper or digital; the database says so too
      medium: "audiobook",
      storyId,
      provenanceId: "remembered",
    });

    await expect(attempt).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Reading is on paper or digital, and nothing else.",
    });
  });

  it("refuses a Reading of a Story that is not in the library", async () => {
    const attempt = recordReading({
      storyId: "00000000-0000-0000-0000-000000000000",
      medium: "paper",
      provenanceId: "remembered",
    });

    await expect(attempt).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Story is not in the library yet.",
    });
  });

  it("refuses a Provenance nobody declared, so no reading arrives unattributed", async () => {
    const storyId = await createStory({ title: "Sandman", typeId: "comic" });

    const attempt = recordReading({
      storyId,
      medium: "paper",
      provenanceId: "somebody-told-me",
    });

    await expect(attempt).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That is not a Provenance this library knows.",
    });
  });

  it("refuses a Reading that ended before it started", async () => {
    const storyId = await createStory({ title: "Berserk", typeId: "manga" });

    const attempt = recordReading({
      storyId,
      medium: "paper",
      startedOn: "2024-05-10",
      endedOn: "2024-05-01",
      outcome: "finished",
      provenanceId: "remembered",
    });

    await expect(attempt).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Reading cannot end before it started.",
    });
  });

  it("refuses an end date on a Reading that has not concluded", async () => {
    const storyId = await createStory({ title: "Monster", typeId: "manga" });

    const attempt = recordReading({
      storyId,
      medium: "paper",
      endedOn: "2024-05-01",
      provenanceId: "remembered",
    });

    await expect(attempt).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Reading that has not ended has no end date.",
    });
  });
});

describe("concluding a Reading", () => {
  it("finishes one that was in progress, and records the day it ended", async () => {
    const storyId = await createStory({ title: "Vinland Saga", typeId: "manga" });
    const readingId = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2024-01-02",
      provenanceId: "remembered",
    });

    await finishReading(readingId, "2024-02-11");

    const story = await findStory(storyId);
    expect(story?.readings[0]).toMatchObject({ outcome: "finished", endedOn: "2024-02-11" });
  });

  it("abandons one that was in progress", async () => {
    const storyId = await createStory({ title: "Ulysses", typeId: "novel" });
    const readingId = await recordReading({
      storyId,
      medium: "digital",
      provenanceId: "remembered",
    });

    await abandonReading(readingId, "2024-07-01");

    const story = await findStory(storyId);
    expect(story?.readings[0]).toMatchObject({ outcome: "abandoned", endedOn: "2024-07-01" });
  });

  it("refuses to conclude one that has already ended, because a Reading is never overwritten", async () => {
    const storyId = await createStory({ title: "Pluto", typeId: "manga" });
    const readingId = await recordReading({
      storyId,
      medium: "paper",
      outcome: "finished",
      provenanceId: "remembered",
    });

    await expect(abandonReading(readingId)).rejects.toMatchObject({
      name: "Refusal",
      code: "not-allowed",
      message: "That Reading has already ended. Reading it again is a new Reading.",
    });
  });

  it("refuses to conclude a Reading that does not exist", async () => {
    await expect(finishReading("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Reading is not in the library.",
    });
  });
});

// HOW FAR A PASS GOT, which is the whole of *seven of twenty*.
//
// The number is on the **pass** and never on the Story, because how far you are is a fact
// about an event (`CONTEXT.md`). Two things follow, and both are tested below: a reread
// starts again at nothing without the pass before it forgetting where it reached, and the
// number is in the work's own units, so it survives changing edition halfway.
describe("the Instalment a pass reached", () => {
  async function slamDunk(): Promise<string> {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await declareInstalments(storyId, 20);
    return storyId;
  }

  it("records the last Instalment this pass finished, and the run reads 7 of 20", async () => {
    const storyId = await slamDunk();
    const readingId = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2026-01-01",
      provenanceId: "remembered",
    });

    await recordInstalmentReached(readingId, 7);

    const story = await findStory(storyId);
    expect(story).toMatchObject({ howFarItGot: { atInstalment: 7, instalments: 20 } });
    expect(story?.readings[0]).toMatchObject({ atInstalment: 7, outcome: null });
  });

  it("takes it in the same breath as the Reading itself", async () => {
    const storyId = await slamDunk();

    await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "goodreads-history",
      atInstalment: 12,
    });

    expect(await findStory(storyId)).toMatchObject({
      howFarItGot: { atInstalment: 12, instalments: 20 },
    });
  });

  it("reads 0 of 20 while nobody has said where they are, which is a measurement", async () => {
    const storyId = await slamDunk();
    await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    expect(await findStory(storyId)).toMatchObject({
      howFarItGot: { atInstalment: 0, instalments: 20 },
    });
  });

  it("says nothing about a run nobody has opened, because there is no pass to be at", async () => {
    const storyId = await slamDunk();

    // Not *0 of 20*: nought is what an open pass that has read none of it says, and there is
    // no pass here at all. The count is still on the record and is read on its own.
    expect(await findStory(storyId)).toMatchObject({ instalments: 20, howFarItGot: null });
  });

  it("says nothing at all about a Story nobody numbered", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    expect(await findStory(storyId)).toMatchObject({ howFarItGot: null });
  });

  it("survives changing edition, because the number is the work's and not the object's", async () => {
    const storyId = await slamDunk();
    // An omnibus: one object, standing at position 1 of its own line, carrying a pass that
    // is at instalment 12 of the work. *One of three omnibus* is a fact about a shelf.
    const omnibus = await volumeInTheHouse({
      title: "Slam Dunk Deluxe 1",
      publisher: "Planet Manga",
      binding: "deluxe",
      language: "it",
    });
    const readingId = await recordReading({
      storyId,
      medium: "paper",
      volumeId: omnibus,
      provenanceId: "remembered",
    });

    await recordInstalmentReached(readingId, 12);

    expect(await findStory(storyId)).toMatchObject({
      howFarItGot: { atInstalment: 12, instalments: 20 },
    });
  });

  it("starts a reread again at nothing, and the pass before it keeps where it got", async () => {
    const storyId = await slamDunk();
    const gaveUp = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2019-01-01",
      provenanceId: "remembered",
    });
    await recordInstalmentReached(gaveUp, 9);
    await abandonReading(gaveUp, "2019-03-01");

    await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2026-01-01",
      provenanceId: "remembered",
    });

    const story = await findStory(storyId);
    // Where the owner is *now* is the open pass, which has read none of it — and the pass
    // that gave up in 2019 still says it got to nine.
    expect(story).toMatchObject({ howFarItGot: { atInstalment: 0, instalments: 20 } });
    expect(story?.readings.map((reading) => reading.atInstalment)).toEqual([null, 9]);
  });

  it("is written over rather than added to: I am at seven replaces I am at six", async () => {
    const storyId = await slamDunk();
    const readingId = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    await recordInstalmentReached(readingId, 6);
    await recordInstalmentReached(readingId, 7);

    expect(await findStory(storyId)).toMatchObject({
      howFarItGot: { atInstalment: 7, instalments: 20 },
    });
  });

  it("stops counting again, and the run goes back to saying nothing about where it is", async () => {
    const storyId = await slamDunk();
    const readingId = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });
    await recordInstalmentReached(readingId, 7);

    await recordInstalmentReached(readingId, null);

    expect(await findStory(storyId)).toMatchObject({
      howFarItGot: { atInstalment: 0, instalments: 20 },
    });
  });

  // Postgres refuses both of these, not an `if` in the verb: a check constraint cannot read
  // the Story, so the migration's trigger is where the rule lives.
  it("refuses an Instalment past the end of the work", async () => {
    const storyId = await slamDunk();
    const readingId = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    await expect(recordInstalmentReached(readingId, 21)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "That is past the end of this Story. A pass cannot get further than the work goes.",
    });
  });

  it("refuses to stand at an Instalment of a Story that has none", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const readingId = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    await expect(recordInstalmentReached(readingId, 2)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "That Story has no Instalments. Say how many it has before saying where you are in it.",
    });
  });

  it("refuses an Instalment that is not a whole part of the work", async () => {
    const storyId = await slamDunk();
    const readingId = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    await expect(recordInstalmentReached(readingId, 0)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "An Instalment is a whole part of the work, counted from one.",
    });
  });

  it("refuses a Reading the library does not have", async () => {
    await expect(
      recordInstalmentReached("00000000-0000-0000-0000-000000000000", 3)
    ).rejects.toMatchObject({ name: "Refusal", code: "not-found" });
  });
});
