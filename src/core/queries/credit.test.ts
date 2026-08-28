import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { creditStory } from "../verbs/credit.ts";
import { setRating } from "../verbs/rating.ts";
import { abandonReading, finishReading, recordReading } from "../verbs/reading.ts";
import { createStory } from "../verbs/story.ts";
import { findCreditedPerson, listCreditedPeople, listCreditRoles } from "./credit.ts";

beforeEach(async () => {
  await query("truncate story, person cascade");
});

describe("the roles a Credit can be held in", () => {
  it("are data rows, offered in the order a comic is credited in", async () => {
    expect(await listCreditRoles()).toEqual([
      { id: "writer", name: "Writer" },
      { id: "artist", name: "Artist" },
    ]);
  });
});

describe("the people the library credits", () => {
  it("names each once, with the roles they hold and how much of them was read", async () => {
    const punch = await createStory({ title: "One-Punch Man", typeId: "manga" });
    const mob = await createStory({ title: "Mob Psycho 100", typeId: "manga" });

    await creditStory({ storyId: punch, person: "ONE", roleId: "writer" });
    await creditStory({ storyId: punch, person: "Yusuke Murata", roleId: "artist" });
    await creditStory({ storyId: mob, person: "ONE", roleId: "writer" });
    await creditStory({ storyId: mob, person: "ONE", roleId: "artist" });

    // Only One-Punch Man was ever opened, so only it counts as read.
    const reading = await recordReading({
      storyId: punch,
      medium: "paper",
      provenanceId: "remembered",
    });
    await finishReading(reading, "2024-05-05");

    expect(await listCreditedPeople()).toEqual([
      {
        id: expect.any(String),
        name: "ONE",
        roles: [
          { id: "writer", name: "Writer" },
          { id: "artist", name: "Artist" },
        ],
        storyCount: 2,
        readCount: 1,
      },
      {
        id: expect.any(String),
        name: "Yusuke Murata",
        roles: [{ id: "artist", name: "Artist" }],
        storyCount: 1,
        readCount: 1,
      },
    ]);
  });

  it("is empty while nobody is credited", async () => {
    await createStory({ title: "Vagabond", typeId: "manga" });

    expect(await listCreditedPeople()).toEqual([]);
  });
});

// The question the owner asks in front of the Batman shelf: *what have I actually read
// by Jeph Loeb?* — and "read" means it went through the Readings, not merely that the
// Story is in the library.
describe("everything read by one Credit", () => {
  it("puts the Stories that went through a Reading on one side and the rest on the other", async () => {
    const hush = await createStory({ title: "Batman: Hush", typeId: "comic" });
    const noir = await createStory({ title: "Gotham Noir", typeId: "comic" });
    const longHalloween = await createStory({ title: "The Long Halloween", typeId: "comic" });

    const { personId } = await creditStory({
      storyId: hush,
      person: "Jeph Loeb",
      roleId: "writer",
    });
    await creditStory({ storyId: noir, person: "Jeph Loeb", roleId: "writer" });
    await creditStory({ storyId: longHalloween, person: "Jeph Loeb", roleId: "writer" });

    // Read, and rated.
    const read = await recordReading({
      storyId: hush,
      medium: "paper",
      startedOn: "2023-02-01",
      provenanceId: "remembered",
    });
    await finishReading(read, "2023-02-20");
    await setRating({ storyId: hush, readingId: read, score: 8, provenanceId: "remembered" });

    // Abandoned, which is still a Reading and therefore still something read *by* him.
    const gaveUp = await recordReading({
      storyId: noir,
      medium: "digital",
      provenanceId: "remembered",
    });
    await abandonReading(gaveUp, "2022-01-01");

    // The Long Halloween has no Reading at all: it is in the library and it is not read.

    expect(await findCreditedPerson(personId)).toEqual({
      id: personId,
      name: "Jeph Loeb",
      // By title, for the reason `listStories` is by title: the list answers *what have
      // I read by him* by being readable, and any other order is an opinion the screen
      // did not ask for.
      read: [
        {
          id: hush,
          title: "Batman: Hush",
          type: { id: "comic", name: "Comic" },
          roles: [{ id: "writer", name: "Writer" }],
          readingCount: 1,
          latestScore: 8,
        },
        {
          id: noir,
          title: "Gotham Noir",
          type: { id: "comic", name: "Comic" },
          roles: [{ id: "writer", name: "Writer" }],
          readingCount: 1,
          latestScore: null,
        },
      ],
      notRead: [
        {
          id: longHalloween,
          title: "The Long Halloween",
          type: { id: "comic", name: "Comic" },
          roles: [{ id: "writer", name: "Writer" }],
          readingCount: 0,
          latestScore: null,
        },
      ],
    });
  });

  it("carries both roles where the same person held both", async () => {
    const mob = await createStory({ title: "Mob Psycho 100", typeId: "manga" });
    const { personId } = await creditStory({ storyId: mob, person: "ONE", roleId: "artist" });
    await creditStory({ storyId: mob, person: "ONE", roleId: "writer" });

    const credited = await findCreditedPerson(personId);

    expect(credited?.notRead[0]?.roles).toEqual([
      { id: "writer", name: "Writer" },
      { id: "artist", name: "Artist" },
    ]);
  });

  it("is null for a person the library does not know, malformed id or not", async () => {
    expect(await findCreditedPerson("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await findCreditedPerson("banana")).toBeNull();
  });
});
