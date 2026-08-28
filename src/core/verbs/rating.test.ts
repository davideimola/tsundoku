import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { findStory } from "../queries/story.ts";
import { setRating } from "./rating.ts";
import { recordReading } from "./reading.ts";
import { createStory } from "./story.ts";

beforeEach(async () => {
  await query("truncate story cascade");
});

describe("setting a Rating", () => {
  it("scores the Story from 1 to 10 in half points, with prose where there is some", async () => {
    const storyId = await createStory({ title: "Pluto", typeId: "manga" });

    await setRating({
      storyId,
      score: 8.5,
      prose: "Urasawa doing Tezuka, and getting away with it.",
      provenanceId: "remembered",
    });

    const story = await findStory(storyId);
    expect(story?.standaloneRatings).toEqual([
      expect.objectContaining({
        score: 8.5,
        prose: "Urasawa doing Tezuka, and getting away with it.",
        provenance: { id: "remembered", name: "Remembered" },
      }),
    ]);
  });

  it("takes a score with no prose, because most of them have none", async () => {
    const storyId = await createStory({ title: "Akira", typeId: "manga" });

    await setRating({ storyId, score: 7, provenanceId: "remembered" });

    expect((await findStory(storyId))?.standaloneRatings[0]).toMatchObject({
      score: 7,
      prose: null,
    });
  });

  it("keeps the grain of a score and its origin as two separate axes", async () => {
    // The books sheet scored 1-5; those double onto this scale on import (#14) and say
    // so, because a 7 that was a 3.5 out of 5 is not the same evidence as a 7 given in
    // half points. **The grain is not a Provenance** (ADR-0008, correcting ADR-0001):
    // this score is coarse *and* it was typed off the sheet, and both are sayable at
    // once — which the single Provenance value it used to carry could never do.
    const storyId = await createStory({ title: "Sapiens", typeId: "non-fiction" });

    await setRating({
      storyId,
      score: 8,
      scale: "coarse",
      provenanceId: "typed-from-the-shelf",
    });

    expect((await findStory(storyId))?.standaloneRatings[0]).toMatchObject({
      score: 8,
      scale: "coarse",
      provenance: { id: "typed-from-the-shelf", name: "Typed from the shelf" },
    });
  });

  it("is given in half points unless the caller says otherwise, which is the owner's scale", async () => {
    const storyId = await createStory({ title: "Monster", typeId: "manga" });

    await setRating({ storyId, score: 9.5, provenanceId: "remembered" });

    expect((await findStory(storyId))?.standaloneRatings[0]).toMatchObject({
      scale: "half-points",
    });
  });

  it("no longer knows a Provenance that named a scale, because that was two facts in one", async () => {
    const [gone] = await query<{ still: boolean }>(
      "select exists (select 1 from provenance where id = 'converted-from-a-coarser-scale') as still"
    );
    expect(gone.still).toBe(false);
  });

  it("refuses a score off the scale", async () => {
    const storyId = await createStory({ title: "Watchmen", typeId: "comic" });

    await expect(
      setRating({ storyId, score: 11, provenanceId: "remembered" })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Rating is a score from 1 to 10.",
    });
  });

  it("refuses a score finer than half points", async () => {
    const storyId = await createStory({ title: "Watchmen", typeId: "comic" });

    await expect(
      setRating({ storyId, score: 8.2, provenanceId: "remembered" })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Rating moves in half points: 8, 8.5, 9.",
    });
  });

  it("refuses a score that would only be a half point after rounding", async () => {
    const storyId = await createStory({ title: "Watchmen", typeId: "comic" });

    await expect(
      setRating({ storyId, score: 8.49, provenanceId: "remembered" })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Rating moves in half points: 8, 8.5, 9.",
    });
  });

  it("refuses a Rating on a Story that is not in the library", async () => {
    await expect(
      setRating({
        storyId: "00000000-0000-0000-0000-000000000000",
        score: 6,
        provenanceId: "remembered",
      })
    ).rejects.toMatchObject({ name: "Refusal", code: "not-found" });
  });

  it("refuses a Rating pointing at a Reading of some other Story", async () => {
    const one = await createStory({ title: "Berserk", typeId: "manga" });
    const other = await createStory({ title: "Vagabond", typeId: "manga" });
    const readingOfTheOther = await recordReading({
      storyId: other,
      medium: "paper",
      outcome: "finished",
      provenanceId: "remembered",
    });

    await expect(
      setRating({
        storyId: one,
        readingId: readingOfTheOther,
        score: 9,
        provenanceId: "remembered",
      })
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Reading is not a Reading of this Story.",
    });
  });

  it("replaces the judgement of the Story itself rather than stacking a second one", async () => {
    // One meaning of "set", whether or not a Reading is named. Without this the same verb
    // would replace in one case and accumulate in the other.
    const storyId = await createStory({ title: "Sapiens", typeId: "non-fiction" });

    await setRating({ storyId, score: 6, provenanceId: "remembered" });
    await setRating({
      storyId,
      score: 7.5,
      prose: "Kinder on a second look.",
      provenanceId: "remembered",
    });

    const story = await findStory(storyId);
    expect(story?.standaloneRatings).toEqual([
      expect.objectContaining({ score: 7.5, prose: "Kinder on a second look." }),
    ]);
  });

  it("replaces the judgement carried by one Reading rather than stacking a second on it", async () => {
    const storyId = await createStory({ title: "Nausicaa", typeId: "manga" });
    const readingId = await recordReading({
      storyId,
      medium: "paper",
      outcome: "finished",
      provenanceId: "remembered",
    });

    await setRating({ storyId, readingId, score: 7, provenanceId: "remembered" });
    await setRating({
      storyId,
      readingId,
      score: 9,
      prose: "Better than I said.",
      provenanceId: "remembered",
    });

    const story = await findStory(storyId);
    expect(story?.readings[0]?.rating).toMatchObject({ score: 9, prose: "Better than I said." });
    expect(story?.standaloneRatings).toEqual([]);
  });
});

describe("a Rating and a Volume", () => {
  it("cannot be attached to one, because the table has no column for it (ADR-0001)", async () => {
    // Structural rather than a check somebody could forget to write: the judgement is
    // of the Story, so there is nothing on `rating` an object could be written into.
    // What the owner thinks of an *object* is an Edition note, which is another thing.
    const columns = await query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'rating'"
    );

    expect(
      columns.map((column) => column.column_name).filter((name) => /volume/.test(name))
    ).toEqual([]);

    const storyId = await createStory({ title: "L'uomo che ride", typeId: "comic" });
    const attempt = query("insert into rating (story_id, volume_id, score) values ($1, $2, 9)", [
      storyId,
      "00000000-0000-0000-0000-000000000000",
    ]);

    // Not a Refusal: it is not a thing the owner can be told they got wrong, it is a
    // statement the schema has no room for.
    await expect(attempt).rejects.toThrow(/column "volume_id" of relation "rating" does not exist/);
  });
});
