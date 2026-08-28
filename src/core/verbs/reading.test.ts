import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { findStory } from "../queries/story.ts";
import { abandonReading, finishReading, recordReading } from "./reading.ts";
import { createStory } from "./story.ts";

// Seam 1, against the real Postgres. `truncate story cascade` takes the Readings and
// the Ratings with it and leaves the two data-row tables — Type and Provenance —
// alone, because those are schema rather than fixtures.
beforeEach(async () => {
  await query("truncate story cascade");
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
