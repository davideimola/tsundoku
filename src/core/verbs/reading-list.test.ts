import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { isRefusal } from "../refusal.ts";
import { pinToReadingList, unpinFromReadingList } from "./reading-list.ts";
import { declareSeries } from "./series.ts";
import { createStory } from "./story.ts";

// Seam 1, the write side — and there is only one thing to write here. The Reading list
// composes itself; a pin is the owner's own order over it, and the only row this area has.
//
// What this file is mostly about is **what a pin names**, because that is what #40 changed:
// it named the source of an entry — a Path or a Series — and it names the thing to read now,
// a Story or a position of a line. The assertions are against what is actually stored, since
// the subject is the whole of the record.

beforeEach(async () => {
  await query("truncate path, series, story cascade");
});

async function vagabond(): Promise<string> {
  return createStory({ title: "Vagabond", typeId: "manga" });
}

async function deathNote(): Promise<string> {
  return declareSeries({
    name: "Death Note",
    publisher: "Panini",
    editionLine: "Black Edition",
    publishedCount: 6,
    status: "concluded",
  });
}

/** What is actually stored, which is the point of most of this file. */
async function pins(): Promise<
  { story_id: string | null; series_id: string | null; series_position: number | null }[]
> {
  return query(
    "select story_id, series_id, series_position from reading_list_pin order by pinned_at"
  );
}

describe("pinning", () => {
  it("stores one row naming the Story, and nothing about the route that offered it", async () => {
    const storyId = await vagabond();

    await pinToReadingList({ kind: "story", id: storyId });

    expect(await pins()).toEqual([{ story_id: storyId, series_id: null, series_position: null }]);
  });

  it("said twice moves the pin rather than adding a second one", async () => {
    const storyId = await vagabond();

    await pinToReadingList({ kind: "story", id: storyId });
    await pinToReadingList({ kind: "story", id: storyId });

    expect(await pins()).toHaveLength(1);
  });

  it("names a position of a Series, because the shopping half is an object and not a line", async () => {
    const seriesId = await deathNote();

    await pinToReadingList({ kind: "series", id: seriesId, position: 2 });

    expect(await pins()).toEqual([{ story_id: null, series_id: seriesId, series_position: 2 }]);
  });

  it("keeps two positions of one Series apart: they are two things to buy", async () => {
    const seriesId = await deathNote();

    await pinToReadingList({ kind: "series", id: seriesId, position: 2 });
    await pinToReadingList({ kind: "series", id: seriesId, position: 3 });

    expect((await pins()).map((pin) => pin.series_position)).toEqual([2, 3]);
  });

  it("is refused where there is no such Story or Series", async () => {
    await expect(
      pinToReadingList({ kind: "story", id: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toMatchObject({ code: "not-found" });

    // A URL and an assistant can both carry anything. Prose, not a 500.
    await expect(pinToReadingList({ kind: "series", id: "banana", position: 1 })).rejects.toSatisfy(
      isRefusal
    );
  });

  it("is refused where the position is not a place in a line", async () => {
    const seriesId = await deathNote();

    await expect(
      pinToReadingList({ kind: "series", id: seriesId, position: 0 })
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      pinToReadingList({ kind: "series", id: seriesId, position: Number.NaN })
    ).rejects.toSatisfy(isRefusal);
  });

  it("is refused by Postgres, not by an `if`, when a row would name two subjects at once", async () => {
    const storyId = await vagabond();
    const seriesId = await deathNote();

    // Reaching past the verb on purpose: the invariant is the schema's, and a verb that was
    // the only thing holding it would be one refactor away from not holding it.
    await expect(
      query(
        "insert into reading_list_pin (story_id, series_id, series_position) values ($1, $2, 1)",
        [storyId, seriesId]
      )
    ).rejects.toMatchObject({ constraint: "reading_list_pin_has_one_subject" });

    await expect(
      query("insert into reading_list_pin (series_id) values ($1)", [seriesId])
    ).rejects.toMatchObject({ constraint: "reading_list_pin_a_series_pin_names_a_position" });
  });
});

describe("unpinning", () => {
  it("takes the row away and leaves the Story alone", async () => {
    const storyId = await vagabond();

    await pinToReadingList({ kind: "story", id: storyId });
    await unpinFromReadingList({ kind: "story", id: storyId });

    expect(await pins()).toEqual([]);
    const [{ stories }] = await query<{ stories: string }>("select count(*) as stories from story");
    expect(stories).toBe("1");
  });

  it("lifts one position of a Series and leaves the other pinned", async () => {
    const seriesId = await deathNote();

    await pinToReadingList({ kind: "series", id: seriesId, position: 2 });
    await pinToReadingList({ kind: "series", id: seriesId, position: 3 });
    await unpinFromReadingList({ kind: "series", id: seriesId, position: 2 });

    expect((await pins()).map((pin) => pin.series_position)).toEqual([3]);
  });

  it("is refused on something that was not pinned, rather than passing silently", async () => {
    const storyId = await vagabond();

    await expect(unpinFromReadingList({ kind: "story", id: storyId })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
