import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { findStory } from "../queries/story.ts";
import {
  abandonPass,
  finishPass,
  recordInstalmentReached,
  recordPass,
  strikePass,
} from "./pass.ts";
import { setRating, strikeRating } from "./rating.ts";
import { createStory, declareInstalments, strikeStories } from "./story.ts";

// Seam 1, against the real Postgres. `truncate story cascade` takes the Passes and
// the Ratings with it and leaves the two data-row tables — Type and Provenance —
// alone, because those are schema rather than fixtures.
beforeEach(async () => {
  // `volume` joins it now that a pass can go through an object: an omnibus left behind by
  // one test is an object standing in a line in the next.
  await query("truncate story, volume cascade");
});

describe("recording a Pass", () => {
  it("records when, by what medium, how it ended and how it is known", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    await recordPass({
      storyId,
      medium: "paper",
      startedOn: "2024-03-01",
      endedOn: "2024-03-04",
      outcome: "finished",
      provenanceId: "remembered",
    });

    const story = await findStory(storyId);
    expect(story?.passes).toEqual([
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

  it("records a Pass with no Volume anywhere in sight — digital, borrowed, or Goodreads history", async () => {
    const storyId = await createStory({ title: "Vita di Pi", typeId: "novel" });

    await recordPass({
      storyId,
      medium: "digital",
      outcome: "finished",
      provenanceId: "goodreads-history",
    });

    const story = await findStory(storyId);
    expect(story?.passes[0]).toMatchObject({
      medium: "digital",
      startedOn: null,
      endedOn: null,
      provenance: { id: "goodreads-history", name: "Goodreads history" },
    });
  });

  // The medium is a vocabulary now (ADR-0022), so what refuses one the library does not have
  // is the foreign key rather than a check constraint over two values — the same refusal a
  // Provenance nobody declared gets, and for the same reason. `audiobook` is not a medium
  // here today; the day it is, it is an insert and this test names something else.
  it("refuses a medium the library does not know, because the vocabulary is what says which exist", async () => {
    const storyId = await createStory({ title: "Akira", typeId: "manga" });

    const attempt = recordPass({
      medium: "audiobook",
      storyId,
      provenanceId: "remembered",
    });

    await expect(attempt).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That is not a medium this library knows.",
    });
  });

  it("refuses a Pass through a Story that is not in the library", async () => {
    const attempt = recordPass({
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

    const attempt = recordPass({
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

  it("refuses a Pass that ended before it started", async () => {
    const storyId = await createStory({ title: "Berserk", typeId: "manga" });

    const attempt = recordPass({
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
      message: "A Pass cannot end before it started.",
    });
  });

  it("refuses an end date on a Pass that has not concluded", async () => {
    const storyId = await createStory({ title: "Monster", typeId: "manga" });

    const attempt = recordPass({
      storyId,
      medium: "paper",
      endedOn: "2024-05-01",
      provenanceId: "remembered",
    });

    await expect(attempt).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Pass that has not ended has no end date.",
    });
  });
});

describe("concluding a Pass", () => {
  it("finishes one that was in progress, and records the day it ended", async () => {
    const storyId = await createStory({ title: "Vinland Saga", typeId: "manga" });
    const passId = await recordPass({
      storyId,
      medium: "paper",
      startedOn: "2024-01-02",
      provenanceId: "remembered",
    });

    await finishPass(passId, "2024-02-11");

    const story = await findStory(storyId);
    expect(story?.passes[0]).toMatchObject({ outcome: "finished", endedOn: "2024-02-11" });
  });

  it("abandons one that was in progress", async () => {
    const storyId = await createStory({ title: "Ulysses", typeId: "novel" });
    const passId = await recordPass({
      storyId,
      medium: "digital",
      provenanceId: "remembered",
    });

    await abandonPass(passId, "2024-07-01");

    const story = await findStory(storyId);
    expect(story?.passes[0]).toMatchObject({ outcome: "abandoned", endedOn: "2024-07-01" });
  });

  it("refuses to conclude one that has already ended, because a Pass is never overwritten", async () => {
    const storyId = await createStory({ title: "Pluto", typeId: "manga" });
    const passId = await recordPass({
      storyId,
      medium: "paper",
      outcome: "finished",
      provenanceId: "remembered",
    });

    await expect(abandonPass(passId)).rejects.toMatchObject({
      name: "Refusal",
      code: "not-allowed",
      message: "That Pass has already ended. Going through it again is a new Pass.",
    });
  });

  it("refuses to conclude a Pass that does not exist", async () => {
    await expect(finishPass("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Pass is not in the library.",
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
    const passId = await recordPass({
      storyId,
      medium: "paper",
      startedOn: "2026-01-01",
      provenanceId: "remembered",
    });

    await recordInstalmentReached(passId, 7);

    const story = await findStory(storyId);
    expect(story).toMatchObject({ howFarItGot: { atInstalment: 7, instalments: 20 } });
    expect(story?.passes[0]).toMatchObject({ atInstalment: 7, outcome: null });
  });

  it("takes it in the same breath as the Pass itself", async () => {
    const storyId = await slamDunk();

    await recordPass({
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
    await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });

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
    await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });

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
    const passId = await recordPass({
      storyId,
      medium: "paper",
      volumeId: omnibus,
      provenanceId: "remembered",
    });

    await recordInstalmentReached(passId, 12);

    expect(await findStory(storyId)).toMatchObject({
      howFarItGot: { atInstalment: 12, instalments: 20 },
    });
  });

  it("starts a reread again at nothing, and the pass before it keeps where it got", async () => {
    const storyId = await slamDunk();
    const gaveUp = await recordPass({
      storyId,
      medium: "paper",
      startedOn: "2019-01-01",
      provenanceId: "remembered",
    });
    await recordInstalmentReached(gaveUp, 9);
    await abandonPass(gaveUp, "2019-03-01");

    await recordPass({
      storyId,
      medium: "paper",
      startedOn: "2026-01-01",
      provenanceId: "remembered",
    });

    const story = await findStory(storyId);
    // Where the owner is *now* is the open pass, which has read none of it — and the pass
    // that gave up in 2019 still says it got to nine.
    expect(story).toMatchObject({ howFarItGot: { atInstalment: 0, instalments: 20 } });
    expect(story?.passes.map((pass) => pass.atInstalment)).toEqual([null, 9]);
  });

  it("is written over rather than added to: I am at seven replaces I am at six", async () => {
    const storyId = await slamDunk();
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });

    await recordInstalmentReached(passId, 6);
    await recordInstalmentReached(passId, 7);

    expect(await findStory(storyId)).toMatchObject({
      howFarItGot: { atInstalment: 7, instalments: 20 },
    });
  });

  it("stops counting again, and the run goes back to saying nothing about where it is", async () => {
    const storyId = await slamDunk();
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });
    await recordInstalmentReached(passId, 7);

    await recordInstalmentReached(passId, null);

    expect(await findStory(storyId)).toMatchObject({
      howFarItGot: { atInstalment: 0, instalments: 20 },
    });
  });

  // Postgres refuses both of these, not an `if` in the verb: a check constraint cannot read
  // the Story, so the migration's trigger is where the rule lives.
  it("refuses an Instalment past the end of the work", async () => {
    const storyId = await slamDunk();
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });

    await expect(recordInstalmentReached(passId, 21)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "That is past the end of this Story. A pass cannot get further than the work goes.",
    });
  });

  it("refuses to stand at an Instalment of a Story that has none", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });

    await expect(recordInstalmentReached(passId, 2)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "That Story has no Instalments. Say how many it has before saying where you are in it.",
    });
  });

  it("refuses an Instalment that is not a whole part of the work", async () => {
    const storyId = await slamDunk();
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });

    await expect(recordInstalmentReached(passId, 0)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "An Instalment is a whole part of the work, counted from one.",
    });
  });

  it("refuses a Pass the library does not have", async () => {
    await expect(
      recordInstalmentReached("00000000-0000-0000-0000-000000000000", 3)
    ).rejects.toMatchObject({ name: "Refusal", code: "not-found" });
  });
});

// STRIKING A PASS (ADR-0018). **The pass that never happened**, which the four verbs above
// had no answer for: *Start reading it* pressed on the wrong tile in a shop put a Story in
// `reading` for ever, because the only exits were finishing and giving up — both false
// statements about a book nobody opened — and striking the Story is refused the moment a
// Pass exists.
//
// It is ADR-0014's boundary applied here: not *is this a delete* but *did anything happen to
// this record*. The one thing that can have happened to a pass is a judgement.
describe("striking a Pass", () => {
  it("takes the pass out, and the state follows from what is left", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });

    expect((await findStory(storyId))?.state).toBe("reading");

    expect(await strikePass(passId)).toBe(storyId);

    const story = await findStory(storyId);
    expect(story?.passes).toEqual([]);
    // Derived on the way out, so there was never a field to put back — which is the whole
    // reason this verb is the only thing the correction needed.
    expect(story?.state).toBe("to-read");
  });

  // The pass is struck and the narrative is not: they are different records, and the Story
  // was real even when the reading of it was a mis-tap.
  it("leaves the Story standing, and the other passes through it", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const first = await recordPass({
      storyId,
      medium: "paper",
      startedOn: "2019-01-01",
      provenanceId: "remembered",
    });
    await finishPass(first, "2019-02-01");
    const misTap = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });

    await strikePass(misTap);

    const story = await findStory(storyId);
    expect(story?.title).toBe("Slam Dunk");
    expect(story?.passes.map((one) => one.id)).toEqual([first]);
    expect(story?.state).toBe("read");
  });

  // **The one refusal, and it is the schema's opinion made explicit.**
  // `rating_belongs_to_the_story_passed_through` is `on delete set null (pass_id)`, so a delete would
  // leave the judgement standing and quietly turn *what I thought of that reading* into *what
  // I think of the narrative*. That is a different sentence, written by nobody.
  it("refuses a pass the owner judged, and says how to answer it", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });
    await finishPass(passId, "2024-01-01");
    await setRating({ storyId, passId: passId, score: 8, provenanceId: "remembered" });

    await expect(strikePass(passId)).rejects.toMatchObject({
      name: "Refusal",
      code: "not-allowed",
      message:
        "That Pass stays: you judged that pass. Strike the score first — a judgement of a pass is not a judgement of the narrative, and this is the one act that could quietly make it one.",
    });

    // And nothing moved: a refused strike is not half a strike.
    expect((await findStory(storyId))?.passes).toHaveLength(1);
  });

  // The pair, end to end, and the reason `strikeRating` exists at all: the refusal above has
  // to be answerable, or it is the dead end this ADR was written about.
  it("goes through once the judgement is struck, and the Story can then be struck too", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const passId = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });
    await finishPass(passId, "2024-01-01");
    const ratingId = await setRating({
      storyId,
      passId: passId,
      score: 8,
      provenanceId: "remembered",
    });

    await strikeRating(ratingId);
    await strikePass(passId);

    // Nothing has happened to it any more, so the last door opens as well — which is what
    // being able to undo a mis-tap actually means.
    await expect(strikeStories([storyId])).resolves.toBe(1);
    expect(await findStory(storyId)).toBeNull();
  });

  it("refuses a Pass the library does not have", async () => {
    await expect(strikePass("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Pass is not in the library.",
    });
  });

  // A malformed id is the same event as an unknown one, never a syntax error crossing the
  // core's edge as a 500 (`verbs/path.ts` states the rule).
  it("refuses an id no row could have", async () => {
    await expect(strikePass("banana")).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
    });
  });
});
