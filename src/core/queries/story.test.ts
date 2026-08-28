import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { creditStory } from "../verbs/credit.ts";
import { setRating } from "../verbs/rating.ts";
import { abandonReading, finishReading, recordReading } from "../verbs/reading.ts";
import { createStory } from "../verbs/story.ts";
import { findStory, listReadStories, listStories } from "./story.ts";

beforeEach(async () => {
  await query("truncate story, person cascade");
});

// The state a Story is in is the thing the owner never wants to maintain again: the
// sheets had a `Stato lettura` column and it was wrong the moment a reread began. Here
// it is derived from the Readings and **stored nowhere**, which is why every transition
// is walked through the verbs rather than asserted on a fixture.
describe("a Story's state, derived from its Readings", () => {
  it("is `to read` while there is no Reading at all", async () => {
    const storyId = await createStory({ title: "Vagabond", typeId: "manga" });

    expect((await findStory(storyId))?.state).toBe("to-read");
  });

  it("becomes `reading` when a Reading opens, and `read` when it finishes", async () => {
    const storyId = await createStory({ title: "Vinland Saga", typeId: "manga" });

    const readingId = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2024-01-02",
      provenanceId: "remembered",
    });
    expect((await findStory(storyId))?.state).toBe("reading");

    await finishReading(readingId, "2024-03-03");
    expect((await findStory(storyId))?.state).toBe("read");
  });

  it("becomes `abandoned` when the only Reading was abandoned", async () => {
    const storyId = await createStory({ title: "Ulysses", typeId: "novel" });
    const readingId = await recordReading({
      storyId,
      medium: "digital",
      provenanceId: "remembered",
    });

    await abandonReading(readingId, "2024-07-01");

    expect((await findStory(storyId))?.state).toBe("abandoned");
  });

  it("is `read` once anything was finished, whatever was abandoned before it", async () => {
    const storyId = await createStory({ title: "Berserk", typeId: "manga" });
    const gaveUp = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });
    await abandonReading(gaveUp, "2019-04-04");

    const tried = await recordReading({ storyId, medium: "digital", provenanceId: "remembered" });
    await finishReading(tried, "2024-04-04");

    expect((await findStory(storyId))?.state).toBe("read");
  });

  it("goes back to `reading` while a reread is open, so nothing recommends what is in hand", async () => {
    const storyId = await createStory({
      title: "La storia della mia vita - Spider-Man",
      typeId: "comic",
    });
    const first = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });
    await finishReading(first, "2021-06-01");
    expect((await findStory(storyId))?.state).toBe("read");

    await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2026-08-01",
      provenanceId: "remembered",
    });

    expect((await findStory(storyId))?.state).toBe("reading");
  });

  it("is nowhere among the Story's own columns", async () => {
    const columns = await query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'story'"
    );

    expect(columns.map((column) => column.column_name).sort()).toEqual([
      "created_at",
      "id",
      "title",
      "type_id",
    ]);
  });
});

describe("rereading a Story", () => {
  it("keeps both Readings, each with the Rating it carried", async () => {
    const storyId = await createStory({
      title: "La storia della mia vita - Spider-Man",
      typeId: "comic",
    });

    const first = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2021-05-01",
      provenanceId: "remembered",
    });
    await finishReading(first, "2021-06-01");
    await setRating({
      storyId,
      readingId: first,
      score: 7,
      prose: "Good, but I had read almost nothing else.",
      provenanceId: "remembered",
    });

    const second = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2026-01-10",
      provenanceId: "remembered",
    });
    await finishReading(second, "2026-02-01");
    await setRating({
      storyId,
      readingId: second,
      score: 9,
      prose: "It reads differently now that I have the classics behind me.",
      provenanceId: "remembered",
    });

    const story = await findStory(storyId);
    // Newest first: a Story is read from the last thing that happened to it.
    expect(story?.readings.map((reading) => [reading.startedOn, reading.rating?.score])).toEqual([
      ["2026-01-10", 9],
      ["2021-05-01", 7],
    ]);
    expect(story?.readings[1]?.rating?.prose).toBe("Good, but I had read almost nothing else.");
  });
});

describe("the Stories, listed", () => {
  it("carry their Type, their state and their best-known score", async () => {
    const read = await createStory({ title: "Pluto", typeId: "manga" });
    const reading = await recordReading({
      storyId: read,
      medium: "paper",
      provenanceId: "remembered",
    });
    await finishReading(reading, "2024-02-02");
    await setRating({ storyId: read, readingId: reading, score: 9.5, provenanceId: "remembered" });

    await createStory({ title: "Zeru", typeId: "novel" });

    expect(await listStories()).toEqual([
      {
        id: read,
        title: "Pluto",
        type: { id: "manga", name: "Manga" },
        state: "read",
        readingCount: 1,
        latestScore: 9.5,
      },
      {
        id: expect.any(String),
        title: "Zeru",
        type: { id: "novel", name: "Novel" },
        state: "to-read",
        readingCount: 0,
        latestScore: null,
      },
    ]);
  });

  it("shows the score the owner set most recently, and not the one they replaced", async () => {
    // Setting a Rating again edits the row, so the list has to order by when the
    // judgement was *set* rather than by when the row appeared.
    const storyId = await createStory({ title: "Sapiens", typeId: "non-fiction" });
    await setRating({ storyId, score: 6, provenanceId: "remembered" });
    const reading = await recordReading({
      storyId,
      medium: "paper",
      outcome: "finished",
      provenanceId: "remembered",
    });
    await setRating({ storyId, readingId: reading, score: 9, provenanceId: "remembered" });
    await setRating({ storyId, score: 7.5, provenanceId: "remembered" });

    expect((await listStories())[0]).toMatchObject({ title: "Sapiens", latestScore: 7.5 });
  });

  it("answers with nothing for a Story that is not there", async () => {
    expect(await findStory("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

// The corpus, as the external reader reads it (ADR-0002). This is the one question the
// whole application exists to answer from outside, so what it must carry is not "a
// Story" but the *evidence* to recommend from: the score, the prose the owner wrote,
// and the Provenance that says how far either can be trusted.
describe("what the owner has read", () => {
  it("carries every Rating with its prose and its Provenance", async () => {
    const storyId = await createStory({ title: "Pluto", typeId: "manga" });
    const reading = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2024-01-02",
      provenanceId: "goodreads-history",
    });
    await finishReading(reading, "2024-02-02");
    await setRating({
      storyId,
      readingId: reading,
      score: 9.5,
      prose: "The best thing Urasawa has done.",
      provenanceId: "remembered",
    });

    // Credited too, because who made it is evidence a recommender reasons about, and the
    // corpus read is the only place that claim can be checked.
    await creditStory({ storyId, person: "Naoki Urasawa", roleId: "writer" });

    expect(await listReadStories()).toEqual([
      {
        id: storyId,
        title: "Pluto",
        type: { id: "manga", name: "Manga" },
        state: "read",
        credits: [
          {
            id: expect.any(String),
            person: { id: expect.any(String), name: "Naoki Urasawa" },
            role: { id: "writer", name: "Writer" },
          },
        ],
        readings: [
          {
            id: reading,
            medium: "paper",
            outcome: "finished",
            startedOn: "2024-01-02",
            endedOn: "2024-02-02",
            provenance: {
              id: "goodreads-history",
              name: "Goodreads history",
            },
            rating: {
              id: expect.any(String),
              score: 9.5,
              prose: "The best thing Urasawa has done.",
              provenance: { id: "remembered", name: "Remembered" },
              // The other axis, and it travels with every score: this one was given in
              // the owner's own scale rather than doubled from a coarser one (ADR-0008).
              scale: "half-points",
            },
          },
        ],
        standaloneRatings: [],
      },
    ]);
  });

  // The three states that are not `read` are all absent for their own reason: nothing
  // has been read yet, it is in the owner's hands right now (user story 33), or they
  // gave up on it. A recommender told "you have read this" about any of the three would
  // be recommending from a fact that is not one.
  it("leaves out what was never read, what is in hand, and what was abandoned", async () => {
    await createStory({ title: "Vagabond", typeId: "manga" });

    const inHand = await createStory({ title: "Vinland Saga", typeId: "manga" });
    await recordReading({ storyId: inHand, medium: "paper", provenanceId: "remembered" });

    const gaveUp = await createStory({ title: "Ulysses", typeId: "novel" });
    const attempt = await recordReading({
      storyId: gaveUp,
      medium: "digital",
      provenanceId: "remembered",
    });
    await abandonReading(attempt, "2019-04-04");

    const finished = await createStory({ title: "Sapiens", typeId: "non-fiction" });
    const reading = await recordReading({
      storyId: finished,
      medium: "paper",
      provenanceId: "remembered",
    });
    await finishReading(reading, "2024-05-05");

    expect((await listReadStories()).map((story) => story.title)).toEqual(["Sapiens"]);
  });

  // A reread that is still open makes the Story `reading` again, and the derivation is
  // the same expression `findStory` uses — so this is really an assertion that there is
  // one derivation and not two.
  it("drops a Story the owner has started reading again", async () => {
    const storyId = await createStory({ title: "Berserk", typeId: "manga" });
    const first = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });
    await finishReading(first, "2021-06-01");
    expect((await listReadStories()).map((story) => story.title)).toEqual(["Berserk"]);

    await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    expect(await listReadStories()).toEqual([]);
  });

  // A score imported from a spreadsheet has no act of reading to point at. It is still
  // the owner's judgement, so it travels — with the grain it was given in and, separately,
  // where it came from (ADR-0008).
  it("carries a judgement that points at no Reading, marked for what it is", async () => {
    const storyId = await createStory({ title: "Death Note", typeId: "manga" });
    const reading = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });
    await finishReading(reading, "2020-01-01");
    await setRating({
      storyId,
      score: 8,
      prose: "Four out of five, doubled.",
      scale: "coarse",
      provenanceId: "typed-from-the-shelf",
    });

    const [story] = await listReadStories();

    expect(story.standaloneRatings).toEqual([
      {
        id: expect.any(String),
        score: 8,
        prose: "Four out of five, doubled.",
        provenance: { id: "typed-from-the-shelf", name: "Typed from the shelf" },
        scale: "coarse",
      },
    ]);
  });

  it("is by title, so that reading it twice reads the same", async () => {
    for (const title of ["Zeru", "Akira", "Monster"]) {
      const storyId = await createStory({ title, typeId: "manga" });
      const reading = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });
      await finishReading(reading, "2024-01-01");
    }

    expect((await listReadStories()).map((story) => story.title)).toEqual([
      "Akira",
      "Monster",
      "Zeru",
    ]);
  });
});
