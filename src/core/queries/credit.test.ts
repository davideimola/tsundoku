import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { creditStory } from "../verbs/credit.ts";
import { abandonPass, finishPass, recordPass } from "../verbs/pass.ts";
import { setRating } from "../verbs/rating.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import {
  findCreditedPerson,
  listCreditedPeople,
  listCreditRoles,
  suggestCreditedPeople,
} from "./credit.ts";

beforeEach(async () => {
  await query("truncate story, person, volume, series cascade");
});

describe("the roles a Credit can be held in", () => {
  // Read off `CONTEXT.md`'s Credit entry rather than off the migration: if this test and the
  // schema disagree, the glossary is the one that is right. The two a videogame is credited
  // in stand at the end, because the order is what a picker offers and not a ranking.
  it("are data rows, offered in the order a comic is credited in", async () => {
    expect(await listCreditRoles()).toEqual([
      { id: "writer", name: "Writer" },
      { id: "artist", name: "Artist" },
      { id: "director", name: "Director" },
      { id: "composer", name: "Composer" },
    ]);
  });

  // **A studio and a publisher are not people**, and a Credit is indexed by person because
  // the question it answers is *what else did this one do* (`CONTEXT.md`, ADR-0021). The
  // absence is named here because it is a decision rather than an oversight: a vocabulary
  // grows by an insert, so the row nobody wrote is the whole of what keeps them out.
  it("holds no studio and no publisher, because neither is a person", async () => {
    const roles = (await listCreditRoles()).map((role) => role.id);

    expect(roles).not.toContain("studio");
    expect(roles).not.toContain("publisher");
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
    const pass = await recordPass({
      storyId: punch,
      medium: "paper",
      provenanceId: "remembered",
    });
    await finishPass(pass, "2024-05-05");

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
// by Jeph Loeb?* — and "read" means it went through the Passes, not merely that the
// Story is in the library.
describe("everything read by one Credit", () => {
  it("puts the Stories that went through a Pass on one side and the rest on the other", async () => {
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
    const read = await recordPass({
      storyId: hush,
      medium: "paper",
      startedOn: "2023-02-01",
      provenanceId: "remembered",
    });
    await finishPass(read, "2023-02-20");
    await setRating({ storyId: hush, passId: read, score: 8, provenanceId: "remembered" });

    // Abandoned, which is still a Pass and therefore still something read *by* him.
    const gaveUp = await recordPass({
      storyId: noir,
      medium: "digital",
      provenanceId: "remembered",
    });
    await abandonPass(gaveUp, "2022-01-01");

    // The Long Halloween has no Pass at all: it is in the library and it is not read.

    expect(await findCreditedPerson(personId)).toEqual({
      id: personId,
      name: "Jeph Loeb",
      // Every role they hold anywhere, which is what the body of work is split by (#31):
      // a band per role, in the order a comic is credited in, and it cannot be read off
      // the Stories — somebody who drew one thing and wrote another would be banded in
      // whichever order the titles happened to fall.
      roles: [{ id: "writer", name: "Writer" }],
      // By title, for the reason `listStories` is by title: the list answers *what have
      // I read by him* by being readable, and any other order is an opinion the screen
      // did not ask for.
      read: [
        {
          id: hush,
          title: "Batman: Hush",
          type: { id: "comic", name: "Comic" },
          roles: [{ id: "writer", name: "Writer" }],
          passCount: 1,
          latestScore: 8,
          state: "read",
          series: null,
          cover: null,
          carriedBy: 0,
          wornBy: 0,
        },
        {
          id: noir,
          title: "Gotham Noir",
          type: { id: "comic", name: "Comic" },
          roles: [{ id: "writer", name: "Writer" }],
          passCount: 1,
          latestScore: null,
          // Opened and given up on, which is still something read *by* him — and the
          // state is what says which of the two it was, on the tile the body of work is
          // laid out as (#31).
          state: "abandoned",
          series: null,
          cover: null,
          carriedBy: 0,
          wornBy: 0,
        },
      ],
      notRead: [
        {
          id: longHalloween,
          title: "The Long Halloween",
          type: { id: "comic", name: "Comic" },
          roles: [{ id: "writer", name: "Writer" }],
          passCount: 0,
          latestScore: null,
          state: "to-read",
          series: null,
          cover: null,
          carriedBy: 0,
          wornBy: 0,
        },
      ],
    });
  });

  // **A person's body of work is a wall now** (#31), so what each Story carries is what a
  // tile is drawn from: the line it stands in, for the colour, and the jacket, where an
  // object carrying it has one. Both are borrowed off the Volumes, because a Story is a
  // narrative and has neither of its own (ADR-0001) — and both are resolved by the same
  // fragments the Story wall reads, so one Story is the same tile on either screen.
  it("carries the line and the jacket, borrowed off the object carrying it", async () => {
    const akira = await createStory({ title: "Akira", typeId: "manga" });
    const { personId } = await creditStory({
      storyId: akira,
      person: "Katsuhiro Ōtomo",
      roleId: "writer",
    });

    const volumeId = await volumeInTheHouse({
      title: "Akira 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    const seriesId = await declareSeries({
      name: "Akira",
      publisher: "Planet Manga",
      publishedCount: 6,
      status: "concluded",
    });
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });
    await recordVolumeCarriesStory(volumeId, akira);
    await query(
      `update volume set cover_source = 'google-books', cover_url = $2, cover_looked_up_at = now()
        where id = $1`,
      [volumeId, "https://books.google.com/books/content?id=njT&img=1&zoom=5"]
    );

    const person = await findCreditedPerson(personId);

    expect(person?.notRead[0]?.series).toMatchObject({ id: seriesId, name: "Akira" });
    expect(person?.notRead[0]?.cover).toMatchObject({
      url: "https://books.google.com/books/content?id=njT&img=1&zoom=5",
    });
    // And how many objects that jacket was borrowed from, which is the fourth fact the tile
    // is drawn from (#34): one object here, so the tile is the plain one. It is read off the
    // same fragment the Story wall reads, so a run cannot be a stack there and a single
    // object on this wall.
    expect(person?.notRead[0]?.carriedBy).toBe(1);
    // And how many works wear that jacket, which is the fifth: one, so the picture is this
    // narrative's own and the tile keeps the jacket whole. Off the same fragment again — an
    // omnibus that banded its tales on `/stories` and drew them bare under the name of the
    // person who wrote them would be one wall contradicting the other.
    expect(person?.notRead[0]?.wornBy).toBe(1);
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

// The query behind the Credit picker (#28). The list of suggestions under the field has no
// test of its own — it holds no derivation, and what it draws is decided here (ADR-0010,
// `vitest.config.ts`). This is what it draws.
describe("the people a half-typed name suggests", () => {
  async function credited(title: string, person: string, roleId = "writer") {
    const storyId = await createStory({ title, typeId: "manga" });
    return creditStory({ storyId, person, roleId });
  }

  it("answers with the people already credited whose name holds what has been typed", async () => {
    await credited("One-Punch Man", "Yusuke Murata", "artist");
    await credited("Mob Psycho 100", "ONE");
    await credited("Vagabond", "Takehiko Inoue");

    expect(await suggestCreditedPeople({ term: "mura" })).toEqual([
      { id: expect.any(String), name: "Yusuke Murata", roles: [{ id: "artist", name: "Artist" }] },
    ]);
  });

  it("carries every role they hold anywhere, so the owner can tell two people apart", async () => {
    await credited("Mob Psycho 100", "ONE", "artist");
    const mob = await createStory({ title: "Mob Psycho 100 II", typeId: "manga" });
    await creditStory({ storyId: mob, person: "ONE", roleId: "writer" });

    expect(await suggestCreditedPeople({ term: "one" })).toEqual([
      {
        id: expect.any(String),
        name: "ONE",
        roles: [
          { id: "writer", name: "Writer" },
          { id: "artist", name: "Artist" },
        ],
      },
    ]);
  });

  it("folds case and accents, so `otomo` reaches Ōtomo", async () => {
    await credited("Akira", "Katsuhiro Ōtomo");

    expect((await suggestCreditedPeople({ term: "otomo" })).map((who) => who.name)).toEqual([
      "Katsuhiro Ōtomo",
    ]);
    expect((await suggestCreditedPeople({ term: "KATSUHIRO" })).map((who) => who.name)).toEqual([
      "Katsuhiro Ōtomo",
    ]);
  });

  it("puts the name that starts with what was typed above the one that merely holds it", async () => {
    await credited("Vagabond", "Inoue Takehiko");
    await credited("Slam Dunk", "Takehiko Inoue");

    expect((await suggestCreditedPeople({ term: "inoue" })).map((who) => who.name)).toEqual([
      "Inoue Takehiko",
      "Takehiko Inoue",
    ]);
  });

  // A duplicate is what the picker exists to prevent, so a person the library has met has
  // to be reachable from any part of their name — but somebody nothing points at is not a
  // person the library has met. The import writes rows the `Autore` column never filled.
  it("leaves out a person nothing credits", async () => {
    await query("insert into person (name) values ($1)", ["Osamu Tezuka"]);

    expect(await suggestCreditedPeople({ term: "tezuka" })).toEqual([]);
  });

  it("suggests nobody for a blank field, which is a field that has asked nothing", async () => {
    await credited("Akira", "Katsuhiro Ōtomo");

    expect(await suggestCreditedPeople({ term: "" })).toEqual([]);
    expect(await suggestCreditedPeople({ term: "   " })).toEqual([]);
  });

  it("answers with at most what was asked for, and with a few when nothing was", async () => {
    await credited("Akira", "Katsuhiro Ōtomo");
    await credited("Domu", "Katsuhiro Otomo Jr");

    expect(await suggestCreditedPeople({ term: "katsuhiro", atMost: 1 })).toHaveLength(1);
    expect(await suggestCreditedPeople({ term: "katsuhiro" })).toHaveLength(2);
  });
});
