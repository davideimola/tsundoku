import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { setRating } from "../verbs/rating.ts";
import { abandonReading, finishReading, recordReading } from "../verbs/reading.ts";
import { createStory } from "../verbs/story.ts";
import { findStory, listStories } from "./story.ts";

beforeEach(async () => {
  await query("truncate story cascade");
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
