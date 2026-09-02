import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { creditStory } from "../verbs/credit.ts";
import { setRating } from "../verbs/rating.ts";
import {
  abandonReading,
  finishReading,
  recordInstalmentReached,
  recordReading,
} from "../verbs/reading.ts";
import { declareSeries, placeVolumeInSeries, recordSeriesPublishesStory } from "../verbs/series.ts";
import { createStory, declareInstalments } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import {
  findStory,
  listReadStories,
  listRunsInProgress,
  listStories,
  listStoryWall,
} from "./story.ts";

beforeEach(async () => {
  await query("truncate story, person, volume, series cascade");
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

    // `instalments` is here and is not a crack in that: it says how long the work is, which
    // is a fact about the narrative and true whether anybody has read it or not. **How far a
    // pass got is on the pass**, which is what keeps the ban on a progress field honest.
    // `instalments_said_by` is the same kind of fact one step back — whose word that length is,
    // the line's or the owner's (#34) — and it says nothing about reading either.
    expect(columns.map((column) => column.column_name).sort()).toEqual([
      "created_at",
      "id",
      "instalments",
      "instalments_said_by",
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

// **What is open leads the stack**, and it is the same judgement `STORY_STATE` already makes
// one screen up: an open Reading wins over a finished one, because it is what is happening to
// the Story now. It matters because the day a Reading started is optional and routinely
// absent — the owner opens one from their own screen and leaves the date empty, since *that
// it is open* is the fact — and ordering by the date alone would drop the thing in their hands
// to the bottom of the stack, under a Reading from 2019.
describe("the order a Story's Readings are stacked in", () => {
  it("puts the Reading that is open first, whether or not it has a day", async () => {
    const storyId = await createStory({ title: "Vinland Saga", typeId: "manga" });

    await finishReading(
      await recordReading({
        storyId,
        medium: "paper",
        startedOn: "2019-01-01",
        provenanceId: "remembered",
      }),
      "2019-02-01"
    );
    const open = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    expect((await findStory(storyId))?.readings.map((reading) => reading.id)[0]).toBe(open);
  });

  // Below the open one, the settled Readings are newest first by the day they began, and a
  // Reading nobody recorded a day for stands after the ones with one: a Goodreads import full
  // of dateless acts must not crowd out the dated history.
  it("stacks what has ended newest first, and the dateless after the dated", async () => {
    const storyId = await createStory({ title: "Pluto", typeId: "manga" });

    const dateless = await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "goodreads-history",
    });
    await finishReading(dateless);
    const older = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2018-03-01",
      provenanceId: "remembered",
    });
    await finishReading(older, "2018-04-01");
    const newer = await recordReading({
      storyId,
      medium: "paper",
      startedOn: "2024-05-01",
      provenanceId: "remembered",
    });
    await finishReading(newer, "2024-06-01");

    expect((await findStory(storyId))?.readings.map((reading) => reading.id)).toEqual([
      newer,
      older,
      dateless,
    ]);
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
        // Not serialized, which is the ordinary Story: no count, and therefore no fraction
        // to be at (#37) and nobody whose word the count is (#34).
        instalments: null,
        instalmentsSaidBy: null,
        howFarItGot: null,
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
            atInstalment: null,
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

// THE WALL (#22). The same corpus as `listStories`, asked the way a shelf asks it: narrowed
// by the two axes the screen offers, and carrying the one fact a tile cannot derive for
// itself — which publisher's line it stands in, and therefore what colour it is.
//
// The filter is **an argument to the query** and never a `.filter()` over what came back.
// That is not a preference: a filtered wall is a URL the owner can bookmark (#18), the
// browser asks for it with nothing running, and the page that answers it must not have
// fetched seventy-seven Stories to show four.
describe("the Story wall", () => {
  // A Story does not know its Series. It knows the Volumes that carry it, and a Volume
  // knows its line — so this is a two-step derivation over the many-to-many, and it is the
  // only reason this query is not `listStories`.
  async function carriedBy(title: string, series: string, editionLine: string | null = null) {
    const storyId = await createStory({ title, typeId: "manga" });
    const volumeId = await volumeInTheHouse({
      title: `${title} 1`,
      publisher: "Star Comics",
      editionLine,
      binding: "tankobon",
      language: "it",
    });
    const seriesId = await declareSeries({
      name: series,
      publisher: "Star Comics",
      editionLine,
      publishedCount: 3,
      status: "ongoing",
    });

    await recordVolumeCarriesStory(volumeId, storyId);
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });

    return { storyId, seriesId };
  }

  it("carries the line a tile takes its colour from", async () => {
    const { storyId, seriesId } = await carriedBy("Vinland Saga", "Vinland Saga");

    expect(await listStoryWall()).toEqual([
      {
        id: storyId,
        title: "Vinland Saga",
        type: { id: "manga", name: "Manga" },
        state: "to-read",
        latestScore: null,
        series: { id: seriesId, name: "Vinland Saga", editionLine: null },
        // Nothing has looked one up, so the tile is the drawn one — which is the normal
        // case and not a gap (ADR-0013). What a jacket is borrowed from is asserted in
        // `queries/cover.test.ts`, beside the fragment that resolves it.
        cover: null,
        // One object, which is the ordinary case and the tile the wall has always drawn.
        carriedBy: 1,
        // And nothing faces it, so no jacket is shared and there is nothing to count the
        // works of. The sharing is asserted beside the borrowing, in `queries/cover.test.ts`.
        wornBy: 0,
      },
    ]);
  });

  // **What the borrowed jacket has to say out loud** (#34). A Story is a run across as many
  // objects as it spans, and the jacket the tile wears is volume one's — so a tile drawn
  // identically for a twenty-volume run and for a work carried by one Volume claims the object
  // *is* the work. The count is what lets the tile say it is faced with the first of several;
  // nothing
  // prints it, which is why the wall does not need a second question to get it.
  it("counts the objects carrying it, so a run can be faced as a run", async () => {
    const { storyId } = await carriedBy("Slam Dunk", "Slam Dunk");
    for (const number of [2, 3]) {
      const volumeId = await volumeInTheHouse({
        title: `Slam Dunk ${number}`,
        publisher: "Star Comics",
        binding: "tankobon",
        language: "it",
      });
      await recordVolumeCarriesStory(volumeId, storyId);
    }

    expect((await listStoryWall()).map((story) => story.carriedBy)).toEqual([3]);
  });

  // Nothing carries it, and that is an ordinary answer rather than a gap: read digitally,
  // borrowed, or known only from a history (ADR-0001). Nought and one are the same tile —
  // there is no run to say anything about — and they are two different facts, so the query
  // answers with the number rather than with a boolean the screen would have to trust.
  it("counts nought objects for a Story no Volume carries", async () => {
    await createStory({ title: "Sapiens", typeId: "non-fiction" });

    expect((await listStoryWall())[0].carriedBy).toBe(0);
  });

  // The ordinary case, not a gap: being read and being owned are unrelated facts
  // (ADR-0001), so a Story read digitally has no object and stands in no line. The tile
  // that draws it falls back to the palette rather than to a colour invented for the
  // occasion.
  it("has no line for a Story carried by no Volume", async () => {
    await createStory({ title: "Sapiens", typeId: "non-fiction" });

    expect((await listStoryWall())[0]).toMatchObject({ series: null });
  });

  // One Story running in two lines is the ordinary case too — *Fullmetal Alchemist* stands
  // in the standard printing and in the Ultimate Deluxe Edition — and a tile has one
  // colour. The standard printing wins, which is the order the ledger reads two Series of
  // one name in (`queries/series.ts`), and it wins **every time**: a tint that depended on
  // which row Postgres reached first would be a shelf that repainted itself.
  it("takes one line, the same one every time, when a Story runs in two", async () => {
    const { storyId, seriesId } = await carriedBy("Fullmetal Alchemist", "Fullmetal Alchemist");
    const deluxe = await declareSeries({
      name: "Fullmetal Alchemist",
      publisher: "Star Comics",
      editionLine: "Ultimate Deluxe Edition",
      publishedCount: 18,
      status: "concluded",
    });
    const volumeId = await volumeInTheHouse({
      title: "Fullmetal Alchemist Ultimate Deluxe 1",
      publisher: "Star Comics",
      editionLine: "Ultimate Deluxe Edition",
      binding: "deluxe",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, storyId);
    await placeVolumeInSeries({ volumeId, seriesId: deluxe, number: 1 });

    const twice = [await listStoryWall(), await listStoryWall()];

    expect(twice.map((wall) => wall[0].series?.id)).toEqual([seriesId, seriesId]);
  });

  it("narrows to one state, and the state is still derived", async () => {
    const reading = await createStory({ title: "Berserk", typeId: "manga" });
    await recordReading({ storyId: reading, medium: "paper", provenanceId: "remembered" });
    const finished = await createStory({ title: "Pluto", typeId: "manga" });
    const readingId = await recordReading({
      storyId: finished,
      medium: "paper",
      provenanceId: "remembered",
    });
    await finishReading(readingId, "2024-02-02");
    await createStory({ title: "Vagabond", typeId: "manga" });

    expect((await listStoryWall({ state: "reading" })).map((story) => story.title)).toEqual([
      "Berserk",
    ]);
    expect((await listStoryWall({ state: "to-read" })).map((story) => story.title)).toEqual([
      "Vagabond",
    ]);
    expect((await listStoryWall({ state: "read" })).map((story) => story.title)).toEqual(["Pluto"]);
  });

  it("narrows to one Type", async () => {
    await createStory({ title: "Akira", typeId: "manga" });
    await createStory({ title: "Sapiens", typeId: "non-fiction" });

    expect((await listStoryWall({ typeId: "manga" })).map((story) => story.title)).toEqual([
      "Akira",
    ]);
  });

  it("narrows by both at once, because the URL can carry both", async () => {
    const manga = await createStory({ title: "Akira", typeId: "manga" });
    await recordReading({ storyId: manga, medium: "paper", provenanceId: "remembered" });
    await createStory({ title: "Monster", typeId: "manga" });
    const novel = await createStory({ title: "Ulysses", typeId: "novel" });
    await recordReading({ storyId: novel, medium: "digital", provenanceId: "remembered" });

    expect(
      (await listStoryWall({ typeId: "manga", state: "reading" })).map((story) => story.title)
    ).toEqual(["Akira"]);
  });

  // A filter is a filter and not a suggestion. A Type that does not exist matches no Story,
  // which is what a hand-edited URL must get: the alternative — falling back to everything —
  // is a wall that quietly disagrees with the words above it.
  it("answers with nothing for a Type nothing has", async () => {
    await createStory({ title: "Akira", typeId: "manga" });

    expect(await listStoryWall({ typeId: "graphic-novel" })).toEqual([]);
  });

  it("is by title, like every other list here", async () => {
    for (const title of ["Zeru", "Akira", "Monster"]) {
      await createStory({ title, typeId: "manga" });
    }

    expect((await listStoryWall()).map((story) => story.title)).toEqual([
      "Akira",
      "Monster",
      "Zeru",
    ]);
  });
});

// The Story's own page draws the tile it was tapped as on the wall (#29), and that tile is
// two facts a Story does not itself carry: the line it stands in, and the jacket it is faced
// with. Both are borrowed across the many-to-many from the Volumes carrying it — a narrative
// is not an object and has no Series and no ISBN of its own (ADR-0001) — and both are the
// **same** derivation the wall reads. A tile that changed colour on the way in would be a
// different Story as far as the eye is concerned, which is the whole reason it is asserted
// here rather than left to look right.
describe("the Story, faced as its own page draws it", () => {
  it("carries the line it stands in, the same one the wall tints it with", async () => {
    const storyId = await createStory({ title: "Vinland Saga", typeId: "manga" });
    const volumeId = await volumeInTheHouse({
      title: "Vinland Saga 1",
      publisher: "Star Comics",
      binding: "tankobon",
      language: "it",
    });
    const seriesId = await declareSeries({
      name: "Vinland Saga",
      publisher: "Star Comics",
      publishedCount: 27,
      status: "ongoing",
    });
    await recordVolumeCarriesStory(volumeId, storyId);
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });

    const [found, onTheWall] = [await findStory(storyId), await listStoryWall()];

    expect(found?.series).toEqual({ id: seriesId, name: "Vinland Saga", editionLine: null });
    expect(found?.series).toEqual(onTheWall[0].series);
  });

  // The third thing the tile carries, and the same one: the tile the owner tapped on the wall
  // is the tile drawn at the head of the page it opens, so the number at its foot cannot be a
  // different reading of *what did I think of this*.
  it("carries the score at the tile's foot, the same one the wall prints", async () => {
    const storyId = await createStory({ title: "Pluto", typeId: "manga" });
    await setRating({ storyId, score: 6, provenanceId: "goodreads-history" });
    await setRating({ storyId, score: 9, provenanceId: "remembered" });

    expect((await findStory(storyId))?.latestScore).toBe((await listStoryWall())[0].latestScore);
    expect((await findStory(storyId))?.latestScore).toBe(9);
  });

  // The ordinary answer rather than a gap, exactly as it is on the wall: a Story read
  // digitally or borrowed is carried by no object at all, so there is no line to stand in and
  // nothing to be faced with. The tile that draws it falls back to the palette's own paper.
  it("stands in no line and is faced with nothing where no Volume carries it", async () => {
    const storyId = await createStory({ title: "Sapiens", typeId: "non-fiction" });

    expect(await findStory(storyId)).toMatchObject({ series: null, cover: null });
  });
});

// **A run with somewhere left to go**, which is the fourth source of the Reading list (#43,
// user stories 14, 30 and 31). The run itself is the signal: no Path minted for it, no flag on
// the Series, no Want required, nothing copied by hand. What this answers is *which runs is
// the owner not done with, and where next* — and it is derived from the same pick the Story's
// own page reads, so a page saying *7 of 20* and a list saying *read 9 next* cannot both be
// right.
describe("a run with somewhere left to go", () => {
  /** *Slam Dunk*: twenty Instalments, and a pass that has finished seven of them. */
  async function atSevenOfTwenty(): Promise<string> {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga", instalments: 20 });
    await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
      startedOn: "2026-01-02",
      atInstalment: 7,
    });
    return storyId;
  }

  it("names the work, how far the pass got, and what comes next", async () => {
    const storyId = await atSevenOfTwenty();

    expect(await listRunsInProgress()).toEqual([
      {
        story: { id: storyId, title: "Slam Dunk", type: { id: "manga", name: "Manga" } },
        howFarItGot: { atInstalment: 7, instalments: 20 },
        nextInstalment: 8,
      },
    ]);
  });

  it("stands at nought and points at the first where an open pass has finished none", async () => {
    const storyId = await createStory({ title: "Berserk", typeId: "manga", instalments: 42 });
    await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    expect(await listRunsInProgress()).toEqual([
      {
        story: { id: storyId, title: "Berserk", type: { id: "manga", name: "Manga" } },
        // Nothing read is a measurement where *nobody is reading it* is not one: the pass
        // exists, so the fraction does.
        howFarItGot: { atInstalment: 0, instalments: 42 },
        nextInstalment: 1,
      },
    ]);
  });

  it("says nothing about a run whose pass has reached the end of the work", async () => {
    const storyId = await createStory({ title: "Death Note", typeId: "manga", instalments: 12 });
    const pass = await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });
    await recordInstalmentReached(pass, 12);

    // Still open — finishing is a separate act — and there is nowhere left to go, so the
    // Reading list has nothing to say about it.
    expect(await listRunsInProgress()).toEqual([]);
  });

  it("says nothing about a run whose pass has finished, nor one that was abandoned", async () => {
    const finished = await createStory({ title: "Pluto", typeId: "manga", instalments: 8 });
    await finishReading(
      await recordReading({
        storyId: finished,
        medium: "paper",
        provenanceId: "remembered",
        atInstalment: 3,
      }),
      "2024-02-02"
    );

    const abandoned = await createStory({ title: "Ulysses", typeId: "novel", instalments: 18 });
    await abandonReading(
      await recordReading({
        storyId: abandoned,
        medium: "digital",
        provenanceId: "remembered",
        atInstalment: 2,
      }),
      "2019-04-04"
    );

    // A pass the owner closed is not a run in progress, whichever way they closed it, and
    // neither of these is something to be told to carry on with.
    expect(await listRunsInProgress()).toEqual([]);
  });

  /**
   * A line and the work it prints: `published` Volumes out, `owned` of them in the house, and
   * the count of Instalments following the line as #34 was amended to have it.
   *
   * The arrow is set, which is what makes the work a run at all — the count follows the line
   * from it — and what *all on the shelf* is read through.
   */
  async function aLine(title: string, published: number, owned: number): Promise<string> {
    const storyId = await createStory({ title, typeId: "manga" });
    const seriesId = await declareSeries({
      name: title,
      publisher: "Planet Manga",
      publishedCount: published,
      status: "ongoing",
    });
    await recordSeriesPublishesStory(seriesId, storyId);

    for (let number = 1; number <= owned; number += 1) {
      const volumeId = await volumeInTheHouse({
        title: `${title} ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      await placeVolumeInSeries({ volumeId, seriesId, number });
    }

    return storyId;
  }

  it("names a run owned whole and never opened, which is the Slam Dunk case", async () => {
    const storyId = await aLine("Slam Dunk", 20, 20);

    // The row the whole tracker exists for (user story 14). Owned whole and unread, it is
    // invisible to the Series source — which names what is *missing*, and nothing is — so
    // requiring a pass, or a Want, would leave it invisible. Nought of twenty, start at one.
    expect(await listRunsInProgress()).toEqual([
      {
        story: { id: storyId, title: "Slam Dunk", type: { id: "manga", name: "Manga" } },
        howFarItGot: { atInstalment: 0, instalments: 20 },
        nextInstalment: 1,
      },
    ]);
  });

  it("names a short run owned whole, which is Your Name.", async () => {
    await aLine("Your Name.", 3, 3);

    // Three of three, never opened: the same case as Slam Dunk at a size that fits on a
    // shelf beside it, and it is on the list for the same reason.
    expect((await listRunsInProgress()).map((run) => run.story.title)).toEqual(["Your Name."]);
  });

  it("says nothing about a line the owner holds two of and has not begun, which is Berserk", async () => {
    await aLine("Berserk", 43, 2);

    // Two of forty-three and never opened. This is the row that made the condition necessary
    // (ADR-0017): once the count follows the line, a work like this declares parts without the
    // owner having said anything at all about reading it, and the list would fill with lines
    // they own a corner of.
    expect(await listRunsInProgress()).toEqual([]);
  });

  it("says nothing about a part-owned line even where the line is short, which is Death Note Black Edition", async () => {
    await aLine("Death Note Black Edition", 6, 2);

    // Two of six. *Nearly* whole is not whole, and the proportion is not the question: what
    // reaches the list is what can be read through to the end tonight, or what the owner has
    // already started.
    expect(await listRunsInProgress()).toEqual([]);
  });

  it("waits for the owner to begin a line whose published count nobody filled in, which is One-Punch Man", async () => {
    const storyId = await aLine("One-Punch Man", 0, 2);
    // Nought published means nobody filled it in rather than nothing published (#34), so the
    // count does not follow the line and the owner's own is what stands there.
    await declareInstalments(storyId, 22);

    expect(await listRunsInProgress()).toEqual([]);

    await recordReading({ storyId, medium: "paper", provenanceId: "remembered", atInstalment: 3 });

    // Begun, and that is the only signal needed (user story 31): no flag on the line, no Want
    // opened, and the ledger still says nothing about how long the line is.
    expect(await listRunsInProgress()).toMatchObject([
      { story: { title: "One-Punch Man" }, howFarItGot: { atInstalment: 3, instalments: 22 } },
    ]);
  });

  it("counts the positions of the line and not the objects, so a gap is not a whole shelf", async () => {
    const storyId = await aLine("Death Note", 2, 0);
    const seriesId = (
      await query<{ id: string }>("select id from series where name = $1", ["Death Note"])
    )[0].id;

    // Two objects in the house, of a line of two — and the first position is empty, because
    // one of them stands past the end of the ledger. As many is not the same as whole.
    for (const number of [2, 3]) {
      const volumeId = await volumeInTheHouse({
        title: `Death Note ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      await placeVolumeInSeries({ volumeId, seriesId, number });
    }
    expect(storyId).toBeTruthy();

    expect(await listRunsInProgress()).toEqual([]);
  });

  it("says nothing about a run with no objects at all that nobody has opened", async () => {
    await createStory({ title: "Vagabond", typeId: "manga", instalments: 37 });

    // Deliberate: the owner reads digitally sometimes and says a Story is read without wanting
    // progress tracked, so a work the house holds none of asks for nothing until they open it.
    expect(await listRunsInProgress()).toEqual([]);
  });

  it("still says nothing about a whole shelf once the pass through it has finished", async () => {
    const storyId = await aLine("Slam Dunk", 20, 20);
    await finishReading(
      await recordReading({
        storyId,
        medium: "paper",
        provenanceId: "remembered",
        atInstalment: 12,
      }),
      "2026-03-03"
    );

    // Owned whole and closed. `STORY_STATE` is what decides that and it is unchanged (#34):
    // being told to carry on with something finished — or given up on — is the recommendation
    // this list exists not to make.
    expect(await listRunsInProgress()).toEqual([]);
  });

  it("says nothing about a Story that declares no Instalments, open pass or not", async () => {
    const storyId = await createStory({ title: "Sapiens", typeId: "non-fiction" });
    await recordReading({ storyId, medium: "digital", provenanceId: "remembered" });

    // There is no run to be in the middle of. The ordinary Story is this one, and it asks
    // nothing of anybody.
    expect(await listRunsInProgress()).toEqual([]);
  });

  it("reads the pass the owner is on, not the furthest any pass ever reached", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga", instalments: 20 });
    await abandonReading(
      await recordReading({
        storyId,
        medium: "paper",
        provenanceId: "remembered",
        startedOn: "2019-01-01",
        atInstalment: 19,
      }),
      "2019-06-01"
    );
    await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
      startedOn: "2026-08-01",
      atInstalment: 2,
    });

    // A run given up at nineteen in 2019 and started again last week is at two, because the
    // question is *where am I* — the same pick the Story's own page makes.
    expect(await listRunsInProgress()).toMatchObject([
      { howFarItGot: { atInstalment: 2, instalments: 20 }, nextInstalment: 3 },
    ]);
  });

  it("stands the runs by title, which is the only order that is not an opinion", async () => {
    await atSevenOfTwenty();
    const other = await createStory({ title: "Berserk", typeId: "manga", instalments: 42 });
    await recordReading({ storyId: other, medium: "paper", provenanceId: "remembered" });

    expect((await listRunsInProgress()).map((run) => run.story.title)).toEqual([
      "Berserk",
      "Slam Dunk",
    ]);
  });
});
