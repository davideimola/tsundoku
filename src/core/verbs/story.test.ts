import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { findVolume, listAcquisitions } from "../queries/collection.ts";
import { findStory, listStories, listStoriesNothingHasHappenedTo } from "../queries/story.ts";
import { listStoriesInVolume } from "../queries/story-to-volume.ts";
import { isRefusal } from "../refusal.ts";
import { catalogueVolume } from "./collection.ts";
import { creditStory } from "./credit.ts";
import { definePath, placeStoriesOnPath } from "./path.ts";
import { setRating } from "./rating.ts";
import { recordInstalmentReached, recordReading } from "./reading.ts";
import {
  declareSeries,
  placeVolumeInSeries,
  recordSeriesNoLongerPublishesStory,
  recordSeriesPublishesStory,
  recordVolumesPublished,
} from "./series.ts";
import {
  amendStory,
  createStory,
  createStoryCarriedBy,
  declareInstalments,
  splitVolumeIntoStories,
  strikeStories,
} from "./story.ts";
import { recordVolumeCarriesStory } from "./story-to-volume.ts";

// `path` joins the truncate for the Stories that are struck: a route is the fourth thing
// that can stand in the way of one, and a Path left behind by one test is a stop nobody
// placed in the next. `series` joins it for the split, which asserts that an object's place
// in a line is untouched — and a line is unique per edition, so one left behind would refuse
// the next test's own.
beforeEach(async () => {
  await query("truncate story, volume, path, series cascade");
});

describe("creating a Story", () => {
  it("takes a title and a Type, and nothing about an object", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    expect(await findStory(storyId)).toMatchObject({
      title: "Slam Dunk",
      type: { id: "manga", name: "Manga" },
      state: "to-read",
      readings: [],
      standaloneRatings: [],
    });
  });

  it("holds a story of any granularity, because the granularity is the owner's choice", async () => {
    // One volume holding three stories, and one story across twenty volumes, are the
    // same shape here (ADR-0001). Nothing records which, and no Volume is involved.
    await createStory({ title: "L'uomo che ride", typeId: "comic" });
    await createStory({ title: "Gotham Noir", typeId: "comic" });
    await createStory({ title: "Slam Dunk", typeId: "manga" });

    expect((await listStories()).map((story) => story.title)).toEqual([
      "Gotham Noir",
      "L'uomo che ride",
      "Slam Dunk",
    ]);
  });

  it("refuses a blank title", async () => {
    await expect(createStory({ title: "   ", typeId: "novel" })).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "A Story needs a title.",
    });
  });

  it("refuses a Type that is not one of the library's", async () => {
    await expect(createStory({ title: "Neuromancer", typeId: "cyberpunk" })).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That is not a Type this library knows.",
    });
  });
});

// **Creating a Story inside the object that carries it**, which is the owner standing with a
// volume in their hand reading its contents page. Two facts said in one breath — the
// narrative exists, and this object holds it — and the tests that matter are the ones about
// the *half*: neither side may be left standing on its own.
describe("creating a Story a Volume carries", () => {
  const NO_SUCH_ID = "00000000-0000-0000-0000-000000000000";

  async function hulkRosso(): Promise<string> {
    return volumeInTheHouse({
      title: "Hulk Rosso",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });
  }

  it("writes both facts, and the Story is an ordinary one", async () => {
    const volumeId = await hulkRosso();

    const storyId = await createStoryCarriedBy({ title: "Hulk Rosso", typeId: "comic" }, volumeId);

    expect(await findStory(storyId)).toMatchObject({
      title: "Hulk Rosso",
      type: { id: "comic" },
      state: "to-read",
    });
    expect((await listStoriesInVolume(volumeId)).map((story) => story.id)).toEqual([storyId]);
  });

  // The case the whole volume is: one object holding an arc and a back-up story from
  // somewhere else. Two Stories, one Volume, and the second one is the one that used to go
  // unrecorded because saying it meant a trip back to the wall.
  it("says it twice for an object holding two narratives", async () => {
    const volumeId = await hulkRosso();

    await createStoryCarriedBy({ title: "Hulk Rosso", typeId: "comic" }, volumeId);
    await createStoryCarriedBy({ title: "Wolverine 50, the back-up", typeId: "comic" }, volumeId);

    expect((await listStoriesInVolume(volumeId)).map((story) => story.title)).toEqual([
      "Hulk Rosso",
      "Wolverine 50, the back-up",
    ]);
  });

  it("creates no Story where the Volume is not in the library", async () => {
    await expect(
      createStoryCarriedBy({ title: "Hulk Rosso", typeId: "comic" }, NO_SUCH_ID)
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Volume is not in the library.",
    });

    // The half that would otherwise be left standing: a Story nothing carries, which reads
    // as something read digitally rather than as a write that failed.
    expect(await listStories()).toEqual([]);
  });

  it("records nothing on the Volume where the Type is not one of the library's", async () => {
    const volumeId = await hulkRosso();

    await expect(
      createStoryCarriedBy({ title: "Hulk Rosso", typeId: "cyberpunk" }, volumeId)
    ).rejects.toMatchObject({ name: "Refusal", message: "That is not a Type this library knows." });

    expect(await listStoriesInVolume(volumeId)).toEqual([]);
    expect(await listStories()).toEqual([]);
  });

  it("refuses a blank title in the verb's own words", async () => {
    const volumeId = await hulkRosso();

    await expect(
      createStoryCarriedBy({ title: "   ", typeId: "comic" }, volumeId)
    ).rejects.toMatchObject({ name: "Refusal", message: "A Story needs a title." });
  });
});

// What an approved Amendment does to a Story (ADR-0011). The Inbox is the door an assistant
// reaches this through, and `verbs/inbox.test.ts` is where that boundary is held; here is
// the act itself.
describe("amending a Story", () => {
  it("changes the field it names and leaves the other standing", async () => {
    const storyId = await createStory({ title: "Slamdunk", typeId: "comic" });

    await amendStory(storyId, { title: "Slam Dunk" });

    expect(await findStory(storyId)).toMatchObject({
      title: "Slam Dunk",
      type: { id: "comic" },
    });
  });

  it("refuses an amendment that names nothing, because nothing is not a change", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await expect(amendStory(storyId, {})).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
    });
  });

  it("refuses a Story that is not there, and a malformed id is the same event", async () => {
    await expect(
      amendStory("6f5f4e3d-2c1b-4a09-8877-665544332211", { title: "Slam Dunk" })
    ).rejects.toMatchObject({ name: "Refusal", code: "not-found" });

    await expect(amendStory("banana", { title: "Slam Dunk" })).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
    });
  });

  it("refuses a Type that is not one of the library's", async () => {
    const storyId = await createStory({ title: "Neuromancer", typeId: "novel" });

    await expect(amendStory(storyId, { typeId: "cyberpunk" })).rejects.toMatchObject({
      name: "Refusal",
      message: "That is not a Type this library knows.",
    });
  });

  // The owner's own door onto the title, which until now only an assistant's Amendment could
  // reach. The case it exists for is the arrow: one Volume mints one Story, so a line
  // collapsing onto a work lands on the name that work had as a single object, and the gesture
  // leaves it standing rather than renaming something the owner has lived with.
  it("says the work's real name where a line left it the name of one object", async () => {
    const work = await createStory({ title: "Slam Dunk 1", typeId: "manga" });

    await amendStory(work, { title: "Slam Dunk" });

    expect(await findStory(work)).toMatchObject({ title: "Slam Dunk" });
  });

  // Everything the record is *about* is about this same row, so renaming reaches all of it and
  // moves none of it. Asserted because the alternative — a rename that minted a second Story
  // and left the Readings on the first — is exactly the drift the one door was built to end.
  it("leaves the Readings, the Rating and the objects on the record it renamed", async () => {
    const work = await createStory({ title: "Slam Dunk 1", typeId: "manga" });
    const { id: volumeId } = await catalogueVolume({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, work);
    const readingId = await recordReading({
      storyId: work,
      medium: "paper",
      provenanceId: "remembered",
    });
    await setRating({ storyId: work, readingId, score: 9, provenanceId: "remembered" });

    await amendStory(work, { title: "Slam Dunk" });

    expect(await findStory(work)).toMatchObject({
      title: "Slam Dunk",
      latestScore: 9,
      readings: [{ id: readingId }],
    });
    expect(await query("select count(*)::int as n from story")).toEqual([{ n: 1 }]);
  });

  // A name is trimmed rather than refused, which is `createStory`'s own behaviour: the
  // constraint is `title = btrim(title)`, so a title pasted with a trailing space used to come
  // back as *A Story needs a title* — a sentence about nothing the owner typed.
  it("trims a name pasted with space around it rather than refusing it", async () => {
    const storyId = await createStory({ title: "Slamdunk", typeId: "manga" });

    await amendStory(storyId, { title: "  Slam Dunk  " });

    expect(await findStory(storyId)).toMatchObject({ title: "Slam Dunk" });
  });

  // What an emptied box has to come back with. The screen sends the empty string rather than
  // `null`, because `null` means *leave it standing* to this verb and would answer someone who
  // has just deleted a name with *an amendment changes at least one field*.
  it("refuses a title emptied to nothing, in the words the owner needs to read", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await expect(amendStory(storyId, { title: "   " })).rejects.toMatchObject({
      name: "Refusal",
      message: "A Story needs a title.",
    });

    expect(await findStory(storyId)).toMatchObject({ title: "Slam Dunk" });
  });
});

// **Striking a Story from the library**, and what makes it not a delete of the owner's past:
// the four refusals below. A hallucinated narrative approved in a bulk of forty has none of
// them on it; a Story the owner has lived with has one, and one is enough to refuse the whole
// gesture (ADR-0015, extending ADR-0014).
describe("striking a Story from the library", () => {
  async function aRecorded(title = "Slam Dunk 5"): Promise<string> {
    return createStory({ title, typeId: "manga" });
  }

  it("takes a mistaken record out of the library entirely", async () => {
    const duplicate = await aRecorded();

    expect(await strikeStories([duplicate])).toBe(1);
    expect(await findStory(duplicate)).toBeNull();
    expect(await listStoriesNothingHasHappenedTo()).toEqual([]);
  });

  it("strikes the whole selection in one gesture, because a mess arrives by the dozen", async () => {
    const five = await aRecorded("Slam Dunk 5");
    const six = await aRecorded("Slam Dunk 6");
    const keep = await aRecorded("Slam Dunk 7");

    expect(await strikeStories([five, six])).toBe(2);
    expect(await listStoriesNothingHasHappenedTo()).toMatchObject([{ id: keep }]);
  });

  // The Credits go and the people stay, which is the half that differs from a Volume's
  // strike: a Person is not owned by the Credit that first named them (ADR-0012).
  it("takes the Credits with it and leaves the people standing", async () => {
    const duplicate = await aRecorded();
    const kept = await aRecorded("Slam Dunk 6");
    await creditStory({ storyId: duplicate, person: "Takehiko Inoue", roleId: "writer" });
    await creditStory({ storyId: kept, person: "Takehiko Inoue", roleId: "writer" });

    expect(await strikeStories([duplicate])).toBe(1);
    expect(await query("select 1 from credit where story_id = $1", [duplicate])).toEqual([]);
    expect(await findStory(kept)).toMatchObject({
      credits: [{ person: { name: "Takehiko Inoue" } }],
    });
  });

  it("takes the record of which objects carried it, where the house holds none of them", async () => {
    const duplicate = await aRecorded();
    const { id: catalogued } = await catalogueVolume({
      title: "Slam Dunk 5",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(catalogued, duplicate);

    expect(await strikeStories([duplicate])).toBe(1);
    expect(await listStoriesInVolume(catalogued)).toEqual([]);
  });

  // The rail that makes a bulk control over the wall safe at all: a narrative an object on a
  // shelf carries is as real as the object.
  it("refuses one an object in the house carries, and says to unsay that first", async () => {
    const real = await aRecorded("Slam Dunk 1");
    const owned = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(owned, real);

    await expect(strikeStories([real])).rejects.toSatisfy(
      (error: unknown) =>
        isRefusal(error) &&
        error.code === "not-allowed" &&
        error.message.includes("an object in the house carries it")
    );
  });

  it("refuses one a Reading went through, because that is an event in the owner's life", async () => {
    const read = await aRecorded("Slam Dunk");
    await recordReading({ storyId: read, medium: "paper", provenanceId: "remembered" });

    await expect(strikeStories([read])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.includes("Reading")
    );
  });

  // The judgement is the one record that is only ever about the narrative (ADR-0001), so a
  // score with no Reading behind it — a sheet's column, imported — still refuses.
  it("refuses one the owner judged, even with no Reading to point at", async () => {
    const judged = await aRecorded("Vinland Saga");
    await setRating({ storyId: judged, score: 9, provenanceId: "remembered" });

    await expect(strikeStories([judged])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.includes("judged")
    );
  });

  it("refuses one a Path names as a stop, and says to take it off the Path first", async () => {
    const planned = await aRecorded("Batman: Anno Uno");
    const path = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(path, [planned]);

    await expect(strikeStories([planned])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.includes("Path")
    );
  });

  // Half a clean-up is worse than none: the owner would have to work out which half.
  it("strikes nothing at all when one of the selection stands", async () => {
    const duplicate = await aRecorded("Slam Dunk 5");
    const read = await aRecorded("Slam Dunk 6");
    await recordReading({ storyId: read, medium: "paper", provenanceId: "remembered" });

    await expect(strikeStories([duplicate, read])).rejects.toSatisfy(isRefusal);
    expect(await listStoriesNothingHasHappenedTo()).toMatchObject([{ id: duplicate }]);
  });

  it("names the one that stands, so the owner knows which to untick", async () => {
    const judged = await aRecorded("Berserk");
    await setRating({ storyId: judged, score: 10, provenanceId: "remembered" });

    await expect(strikeStories([judged])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.startsWith("Berserk stays:")
    );
  });

  it("refuses an empty selection rather than reporting nothing done", async () => {
    await expect(strikeStories([])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "invalid"
    );
    await expect(strikeStories(["banana"])).rejects.toSatisfy(isRefusal);
  });

  it("refuses an id no Story has, rather than striking the rest of the selection", async () => {
    const duplicate = await aRecorded();

    await expect(
      strikeStories([duplicate, "00000000-0000-4000-8000-000000000000"])
    ).rejects.toSatisfy((error: unknown) => isRefusal(error) && error.code === "not-found");
    expect(await listStoriesNothingHasHappenedTo()).toMatchObject([{ id: duplicate }]);
  });
});

// The list the owner ticks from, and **its membership is the whole safety of the control over
// it**: it is `WHY_A_STORY_STANDS` read the other way round, so nothing striking would refuse
// can appear in it (ADR-0015).
describe("the Stories nothing has happened to", () => {
  it("holds a Story the owner has not touched, with what a strike would take", async () => {
    const duplicate = await createStory({ title: "Slam Dunk 5", typeId: "manga" });
    await creditStory({ storyId: duplicate, person: "Takehiko Inoue", roleId: "writer" });
    const { id: catalogued } = await catalogueVolume({
      title: "Slam Dunk 5",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(catalogued, duplicate);

    expect(await listStoriesNothingHasHappenedTo()).toMatchObject([
      {
        id: duplicate,
        title: "Slam Dunk 5",
        type: { id: "manga", name: "Manga" },
        carriedBy: 1,
        credits: 1,
      },
    ]);
  });

  it("holds none of the four the verb refuses, so no tick can reach one", async () => {
    const read = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await recordReading({ storyId: read, medium: "paper", provenanceId: "remembered" });

    const judged = await createStory({ title: "Vinland Saga", typeId: "manga" });
    await setRating({ storyId: judged, score: 9, provenanceId: "remembered" });

    const planned = await createStory({ title: "Batman: Anno Uno", typeId: "comic" });
    const path = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(path, [planned]);

    const owned = await createStory({ title: "Slam Dunk 1", typeId: "manga" });
    const inTheHouse = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(inTheHouse, owned);

    expect(await listStoriesNothingHasHappenedTo()).toEqual([]);
  });

  // By title and case-insensitively, so *Slam Dunk 5* and *slam dunk 5* are one pair the eye
  // can read as one — then oldest first, so of two rows that say the same thing it is the one
  // that arrived last that looks new.
  it("stands a duplicate next to what it duplicates, which is what makes it visible", async () => {
    const original = await createStory({ title: "Slam Dunk 5", typeId: "manga" });
    const elsewhere = await createStory({ title: "Akira 1", typeId: "manga" });
    const duplicate = await createStory({ title: "slam dunk 5", typeId: "manga" });

    expect((await listStoriesNothingHasHappenedTo()).map((story) => story.id)).toEqual([
      elsewhere,
      original,
      duplicate,
    ]);
  });
});

// **Splitting an object into the Stories it holds** — the *Batman: L'uomo che ride* case, and
// the one this gesture was invented for. The default is one Volume, one Story; an object that
// turns out to hold three tales the owner would score apart says so here, once, and the
// narrative it stood for is dropped in the same act.
//
// The refusals are the whole of it, and they are Striking's own posture asked about a
// narrative the object stands for: a Reading or a Rating is something the owner has lived
// with, and a split that took either with it would be a delete of their past wearing a
// tidier name (ADR-0015).
describe("splitting an object into the Stories it holds", () => {
  const NO_SUCH_ID = "00000000-0000-4000-8000-000000000000";

  /** The object, standing for the one narrative the default made of it. */
  async function lUomoCheRide(): Promise<{ volumeId: string; storyId: string }> {
    const volumeId = await volumeInTheHouse({
      title: "Batman: L'uomo che ride",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });
    const storyId = await createStoryCarriedBy(
      { title: "Batman: L'uomo che ride", typeId: "comic" },
      volumeId
    );
    return { volumeId, storyId };
  }

  const THE_THREE = ["Gotham Noir", "L'uomo che ride", "Uomo di legno"];

  it("splits the object into the several narratives in one gesture", async () => {
    const { volumeId } = await lUomoCheRide();

    const created = await splitVolumeIntoStories(volumeId, THE_THREE);

    expect(created).toHaveLength(3);
    expect((await listStoriesInVolume(volumeId)).map((story) => story.title)).toEqual([
      "Gotham Noir",
      "L'uomo che ride",
      "Uomo di legno",
    ]);
  });

  it("gives each of them the Type the object's narrative had, so nothing is asked", async () => {
    const { volumeId } = await lUomoCheRide();

    await splitVolumeIntoStories(volumeId, THE_THREE);

    expect((await listStoriesInVolume(volumeId)).map((story) => story.type.id)).toEqual([
      "comic",
      "comic",
      "comic",
    ]);
  });

  it("drops the narrative the object stood for, because nothing had attached to it", async () => {
    const { volumeId, storyId } = await lUomoCheRide();

    await splitVolumeIntoStories(volumeId, THE_THREE);

    expect(await findStory(storyId)).toBeNull();
  });

  // What a split changes is what the owner judges, and never what they own.
  it("leaves the Volume, its acquisition and its place in a Series exactly as they were", async () => {
    const seriesId = await declareSeries({
      name: "Batman",
      publisher: "Panini Comics",
      publishedCount: 12,
      status: "ongoing",
    });
    const { volumeId } = await lUomoCheRide();
    await placeVolumeInSeries({ volumeId, seriesId, number: 3 });

    const before = await findVolume(volumeId);
    const history = await listAcquisitions(volumeId);

    await splitVolumeIntoStories(volumeId, THE_THREE);

    expect(await findVolume(volumeId)).toEqual(before);
    expect(await listAcquisitions(volumeId)).toEqual(history);
  });

  it("leaves three narratives each of which carries its own judgement", async () => {
    const { volumeId } = await lUomoCheRide();

    const [noir, ride, legno] = await splitVolumeIntoStories(volumeId, THE_THREE);
    await setRating({ storyId: noir ?? "", score: 8, provenanceId: "remembered" });
    await setRating({ storyId: ride ?? "", score: 9.5, provenanceId: "remembered" });

    expect((await listStoriesInVolume(volumeId)).map((story) => story.latestScore)).toEqual([
      8,
      9.5,
      null,
    ]);
    expect(await findStory(legno ?? "")).toMatchObject({ title: "Uomo di legno" });
  });

  it("refuses once a Reading has gone through the narrative, and splits nothing", async () => {
    const { volumeId, storyId } = await lUomoCheRide();
    await recordReading({ storyId, medium: "paper", provenanceId: "remembered" });

    await expect(splitVolumeIntoStories(volumeId, THE_THREE)).rejects.toSatisfy(
      (error: unknown) =>
        isRefusal(error) && error.code === "not-allowed" && error.message.includes("a Reading")
    );

    expect((await listStoriesInVolume(volumeId)).map((story) => story.id)).toEqual([storyId]);
  });

  it("refuses once the owner has judged it, and splits nothing", async () => {
    const { volumeId, storyId } = await lUomoCheRide();
    await setRating({ storyId, score: 9, provenanceId: "remembered" });

    await expect(splitVolumeIntoStories(volumeId, THE_THREE)).rejects.toSatisfy(
      (error: unknown) =>
        isRefusal(error) && error.code === "not-allowed" && error.message.includes("judged")
    );

    expect((await listStoriesInVolume(volumeId)).map((story) => story.id)).toEqual([storyId]);
    expect(await findStory(storyId)).toMatchObject({ title: "Batman: L'uomo che ride" });
  });

  // A narrative running across twenty objects is not this one's to unmake, and the refusal
  // says what to do instead rather than only saying no.
  it("refuses a narrative other objects carry too", async () => {
    const { volumeId, storyId } = await lUomoCheRide();
    const second = await volumeInTheHouse({
      title: "Batman: L'uomo che ride, ristampa",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });
    await recordVolumeCarriesStory(second, storyId);

    await expect(splitVolumeIntoStories(volumeId, THE_THREE)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.message.includes("other objects carry it too")
    );
  });

  it("refuses an object that stands for no narrative yet", async () => {
    const { id: volumeId } = await catalogueVolume({
      title: "Hulk Rosso",
      publisher: "Panini Comics",
      binding: "must-have",
      language: "it",
    });

    await expect(splitVolumeIntoStories(volumeId, THE_THREE)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "not-allowed"
    );
  });

  it("refuses an object that already holds several of its own", async () => {
    const { volumeId } = await lUomoCheRide();
    await createStoryCarriedBy({ title: "Uomo di legno", typeId: "comic" }, volumeId);

    await expect(splitVolumeIntoStories(volumeId, THE_THREE)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "not-allowed"
    );
  });

  it("refuses a split into one, because an object standing for one narrative is not split", async () => {
    const { volumeId } = await lUomoCheRide();

    await expect(splitVolumeIntoStories(volumeId, ["Gotham Noir", "   "])).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "invalid"
    );
  });

  it("refuses an object that is not in the library, and a malformed id is the same event", async () => {
    await expect(splitVolumeIntoStories(NO_SUCH_ID, THE_THREE)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "not-found"
    );
    await expect(splitVolumeIntoStories("banana", THE_THREE)).rejects.toSatisfy(
      (error: unknown) => isRefusal(error) && error.code === "not-found"
    );
    expect(await listStories()).toEqual([]);
  });

  // **The edge this gesture leaves open, pinned rather than left silent.** Striking refuses a
  // Story a Path names as a stop (ADR-0015); a split does not, because the decision behind it
  // names a Reading and a Rating and nothing else. So the stop goes with the narrative it
  // named, the route keeps its other stops, and this test is where that is written down until
  // the owner says which of the two acts is right.
  it("takes a Path stop naming the dropped narrative with it, and leaves the route standing", async () => {
    const { volumeId, storyId } = await lUomoCheRide();
    const elsewhere = await createStory({ title: "Batman: Anno Uno", typeId: "comic" });
    const path = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(path, [storyId, elsewhere]);

    await splitVolumeIntoStories(volumeId, THE_THREE);

    expect(await query("select story_id from path_item where path_id = $1", [path])).toEqual([
      { story_id: elsewhere },
    ]);
  });

  // Striking's own clause, and it holds here for its reason: a Person is not owned by the
  // Credit that first named them (ADR-0012).
  it("takes the Credits on the dropped narrative and leaves the people standing", async () => {
    const { volumeId, storyId } = await lUomoCheRide();
    await creditStory({ storyId, person: "Ed Brubaker", roleId: "writer" });

    const [noir] = await splitVolumeIntoStories(volumeId, THE_THREE);
    await creditStory({ storyId: noir ?? "", person: "Ed Brubaker", roleId: "writer" });

    expect(await query("select 1 from credit where story_id = $1", [storyId])).toEqual([]);
    expect(await findStory(noir ?? "")).toMatchObject({
      credits: [{ person: { name: "Ed Brubaker" } }],
    });
  });
});

// SAYING A STORY IS SERIALIZED, which is the one fact about a narrative that is a number.
//
// Everything here is about a work that has parts — *Slam Dunk*'s twenty, *Ultimate
// Spider-Man*'s hundred and sixty. The count belongs to the narrative and never to a
// printing, and it is optional: the Stories in every other test in this file declare none
// and are asked nothing.
describe("declaring how many Instalments a Story has", () => {
  it("says the work has twenty parts, and reads back as twenty", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await declareInstalments(storyId, 20);

    expect(await findStory(storyId)).toMatchObject({ title: "Slam Dunk", instalments: 20 });
  });

  it("declares none, which is the ordinary Story and asks nothing", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });

    expect(await findStory(storyId)).toMatchObject({ instalments: null, howFarItGot: null });
  });

  it("takes the numbering back off a Story that never had parts", async () => {
    const storyId = await createStory({ title: "Gotham Noir", typeId: "comic" });
    await declareInstalments(storyId, 3);

    await declareInstalments(storyId, null);

    expect(await findStory(storyId)).toMatchObject({ instalments: null });
  });

  it("refuses a work of no parts at all, because that is what declaring none says", async () => {
    const storyId = await createStory({ title: "Akira", typeId: "manga" });

    await expect(declareInstalments(storyId, 0)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "A serialized Story has one Instalment or more. Say none at all where it has parts nobody numbers.",
    });
  });

  it("refuses a count that is not a whole number of parts", async () => {
    const storyId = await createStory({ title: "Akira", typeId: "manga" });

    await expect(declareInstalments(storyId, 6.5)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
    });
  });

  it("refuses a Story the library does not have", async () => {
    await expect(
      declareInstalments("00000000-0000-0000-0000-000000000000", 20)
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "No Story has that id.",
    });
  });

  // Postgres refuses it, not an `if`: shortening the work under a pass that has already got
  // further would make *seven of five* reachable by editing the five.
  it("refuses to shorten a work past a pass that has already got further", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await declareInstalments(storyId, 20);
    const readingId = await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
    });
    await recordInstalmentReached(readingId, 7);

    await expect(declareInstalments(storyId, 5)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message:
        "A pass through this Story has got further than that. It cannot be shorter than what you have read of it.",
    });

    expect(await findStory(storyId)).toMatchObject({ instalments: 20 });
  });

  it("refuses to take the numbering away while a pass stands at one of its Instalments", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await declareInstalments(storyId, 20);
    const readingId = await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
    });
    await recordInstalmentReached(readingId, 7);

    await expect(declareInstalments(storyId, null)).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
    });
  });
});

// THE COUNT FOLLOWS THE LINE (#34, ADR-0017).
//
// Setting a Series' published count and then being asked *again* how many Instalments the work
// has is two questions about one number. They are not the same fact — one is a printing's and
// one is the narrative's — but on these shelves the two coincide for almost every record, so
// the second question reads as a re-ask.
//
// So the count follows the line, and `instalments_said_by` is the one fact that makes the rule
// tellable: the line's word moves as the line grows, and the owner's word moves for nobody. It
// is a column kept by a trigger rather than a derivation, because the two invariants over
// `story.instalments` — a pass cannot stand past the end of the work, an object cannot cover
// past it — are triggers themselves, and they must bite on a count nobody typed.
describe("the count of Instalments following the line", () => {
  /** A line of `published` Volumes, and the work it publishes. Nothing is typed on the work. */
  async function aLinePublishing(
    title: string,
    published: number
  ): Promise<{ storyId: string; seriesId: string }> {
    const storyId = await createStory({ title, typeId: "manga" });
    const seriesId = await declareSeries({
      name: title,
      publisher: "Planet Manga",
      publishedCount: published,
      status: "ongoing",
    });
    await recordSeriesPublishesStory(seriesId, storyId);
    return { storyId, seriesId };
  }

  it("takes the count from the one line that publishes the work, so nobody types it", async () => {
    const { storyId } = await aLinePublishing("La via del grembiule", 6);

    expect(await findStory(storyId)).toMatchObject({
      instalments: 6,
      instalmentsSaidBy: "line",
    });
  });

  it("moves as the line grows: an ongoing line gains volumes, and the work gains parts", async () => {
    const { storyId, seriesId } = await aLinePublishing("Berserk", 42);

    await recordVolumesPublished(seriesId, 43);

    expect(await findStory(storyId)).toMatchObject({ instalments: 43, instalmentsSaidBy: "line" });
  });

  it("leaves the work declaring nothing where the count published is nought", async () => {
    const { storyId, seriesId } = await aLinePublishing("One-Punch Man", 0);

    // Nought is *the owner never filled it in*, not *zero parts*, so there is nothing to
    // follow and the work is an ordinary unnumbered Story.
    expect(await findStory(storyId)).toMatchObject({
      instalments: null,
      instalmentsSaidBy: null,
      howFarItGot: null,
    });

    // And it begins following the day the number is filled in.
    await recordVolumesPublished(seriesId, 22);
    expect(await findStory(storyId)).toMatchObject({ instalments: 22, instalmentsSaidBy: "line" });
  });

  it("declares nothing again where the one line naming it is corrected back down to nought", async () => {
    const { storyId, seriesId } = await aLinePublishing("Kagurabachi", 4);

    await recordVolumesPublished(seriesId, 0);

    // A ledger at nought is one state with one answer however it got there: the line says
    // nothing, so the work says nothing, exactly as if the number had never been filled in.
    expect(await findStory(storyId)).toMatchObject({
      instalments: null,
      instalmentsSaidBy: null,
    });
  });

  it("stops following for good once the owner has corrected the count by hand", async () => {
    const { storyId, seriesId } = await aLinePublishing("Ultimate Spider-Man", 20);

    // The line prints twenty volumes and the work is a hundred and sixty issues. From here the
    // number is the owner's word.
    await declareInstalments(storyId, 160);
    expect(await findStory(storyId)).toMatchObject({
      instalments: 160,
      instalmentsSaidBy: "owner",
    });

    await recordVolumesPublished(seriesId, 21);

    expect(await findStory(storyId)).toMatchObject({ instalments: 160 });
  });

  it("stops following where the owner takes the numbering off, and the line growing does not put it back", async () => {
    const { storyId, seriesId } = await aLinePublishing("Batman: L'uomo che ride", 3);

    // Taking the numbering off is a correction like any other: this line collects tales that
    // are judged apart and nobody numbers.
    await declareInstalments(storyId, null);
    await recordVolumesPublished(seriesId, 4);

    expect(await findStory(storyId)).toMatchObject({
      instalments: null,
      instalmentsSaidBy: "owner",
    });
  });

  it("stops following where two lines publish one work, and hands the standing number to the owner", async () => {
    const { storyId, seriesId } = await aLinePublishing("Fullmetal Alchemist", 27);
    const deluxe = await declareSeries({
      name: "Fullmetal Alchemist",
      publisher: "Planet Manga",
      editionLine: "Ultimate Deluxe Edition",
      publishedCount: 18,
      status: "ongoing",
    });

    await recordSeriesPublishesStory(deluxe, storyId);

    // Two ledgers over one narrative is exactly what the arrow is for, and which of them says
    // how long the work is, is not this library's to decide. The number stands where it stood.
    expect(await findStory(storyId)).toMatchObject({
      instalments: 27,
      instalmentsSaidBy: "owner",
    });

    await recordVolumesPublished(seriesId, 28);
    expect(await findStory(storyId)).toMatchObject({ instalments: 27 });
  });

  it("freezes the number rather than taking it away when the line stops naming the work", async () => {
    const { storyId, seriesId } = await aLinePublishing("Death Note", 12);

    await recordSeriesNoLongerPublishesStory(seriesId);

    // A fraction the owner has been reading against must not vanish because an arrow was taken
    // back, so what was the line's word becomes theirs.
    expect(await findStory(storyId)).toMatchObject({
      instalments: 12,
      instalmentsSaidBy: "owner",
    });
  });

  // The reason the count is a column and not a read-time derivation: 0007's triggers over
  // `story.instalments` have to bite on a number nobody typed, and here they do — the refusal
  // arrives on the ledger's own verb, because that is the write the owner made.
  it("refuses lowering the count published under a pass that has read further", async () => {
    const { storyId, seriesId } = await aLinePublishing("Slam Dunk", 20);
    const readingId = await recordReading({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
    });
    await recordInstalmentReached(readingId, 7);

    await expect(recordVolumesPublished(seriesId, 5)).rejects.toMatchObject({
      name: "Refusal",
      message:
        "The Story this line publishes takes its Instalments from it, and a pass through that work has got further than that. Correct the count on the Story first, which is also what takes it off the line.",
    });

    // And the same refusal stands for taking the ledger to nought, which would unnumber the
    // work under that pass.
    await expect(recordVolumesPublished(seriesId, 0)).rejects.toMatchObject({ name: "Refusal" });

    expect(await findStory(storyId)).toMatchObject({ instalments: 20 });
    const [ledger] = await query<{ published_count: number }>(
      "select published_count from series where id = $1",
      [seriesId]
    );
    expect(ledger.published_count).toBe(20);
  });

  // The Inbox's door, once a count can be following (ADR-0005): an assistant proposes the
  // count and the owner's approval writes it — and an approval is the owner's word, so it
  // stops the following exactly as saying it by hand does.
  it("takes the count off the line when an approved Amendment gives one", async () => {
    const { storyId, seriesId } = await aLinePublishing("Vagabond", 37);

    await amendStory(storyId, { instalments: 327 });
    await recordVolumesPublished(seriesId, 38);

    expect(await findStory(storyId)).toMatchObject({
      instalments: 327,
      instalmentsSaidBy: "owner",
    });
  });

  it("leaves whose word the count is alone where an Amendment names no count", async () => {
    const { storyId } = await aLinePublishing("Pluto", 8);

    await amendStory(storyId, { title: "Pluto: Urasawa x Tezuka" });

    expect(await findStory(storyId)).toMatchObject({
      title: "Pluto: Urasawa x Tezuka",
      instalments: 8,
      instalmentsSaidBy: "line",
    });
  });
});
