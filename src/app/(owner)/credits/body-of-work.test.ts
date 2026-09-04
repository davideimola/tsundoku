import { describe, expect, it } from "vitest";

import type { CreditedStory, PersonCredits } from "@/core/queries/credit";

import { bodyOfWork } from "./body-of-work";

// A screen's own derivation, tested beside itself under the licence `vitest.config.ts`
// states: data in, data out, and a function this application would still have if React were
// replaced. What it decides is the shape of one screen — **a person's work, split by the
// role they held** (#31) — over an answer the core hands over split by something else.

const WRITER = { id: "writer", name: "Writer" };
const ARTIST = { id: "artist", name: "Artist" };

function story(title: string, roles: { id: string; name: string }[], readings = 0): CreditedStory {
  return {
    id: title,
    title,
    type: { id: "manga", name: "Manga" },
    roles,
    readingCount: readings,
    latestScore: null,
    state: readings === 0 ? "to-read" : "read",
    series: null,
    cover: null,
    carriedBy: 1,
    wornBy: 1,
  };
}

function person(credits: Partial<PersonCredits>): PersonCredits {
  return {
    id: "one",
    name: "ONE",
    roles: [WRITER, ARTIST],
    read: [],
    notRead: [],
    ...credits,
  };
}

describe("a person's body of work", () => {
  // The whole of it, which is the acceptance criterion: the core hands the work over split
  // by whether it was opened, and the screen is about the roles — so nothing may fall
  // between the two lists on the way.
  it("is everything they are credited on, whichever list the core put it in", () => {
    const bands = bodyOfWork(
      person({
        read: [story("Mob Psycho 100", [WRITER], 1)],
        notRead: [story("One-Punch Man", [WRITER])],
      })
    );

    expect(bands.map((band) => band.stories.map((one) => one.title))).toEqual([
      ["Mob Psycho 100", "One-Punch Man"],
    ]);
  });

  it("bands them in the order a comic is credited in, and names no role they do not hold", () => {
    const bands = bodyOfWork(
      person({
        roles: [WRITER, ARTIST],
        notRead: [story("Mob Psycho 100", [ARTIST, WRITER])],
      })
    );

    expect(bands.map((band) => band.title)).toEqual(["As Writer", "As Artist"]);
  });

  // The case the word *Credit* exists for: ONE wrote One-Punch Man and both wrote and drew
  // Mob Psycho 100. Split by role, that Story is in both bands — which is not a duplicate,
  // it is two facts about one narrative, and a screen that showed it once would have to
  // pick a role to drop.
  it("puts a Story the person held two roles on into both bands", () => {
    const bands = bodyOfWork(
      person({
        notRead: [story("Mob Psycho 100", [WRITER, ARTIST]), story("One-Punch Man", [WRITER])],
      })
    );

    expect(bands.map((band) => band.stories.map((one) => one.title))).toEqual([
      ["Mob Psycho 100", "One-Punch Man"],
      ["Mob Psycho 100"],
    ]);
  });

  // Read means it went through a Pass, abandoned included — the same reading of the word
  // the Credits list is counted by, and the reason it is `readingCount` and never the state.
  it("counts what of a band went through a Pass", () => {
    const [band] = bodyOfWork(
      person({
        roles: [WRITER],
        read: [story("Berserk", [WRITER], 2)],
        notRead: [story("Akira", [WRITER]), story("Blame!", [WRITER])],
      })
    );

    expect({ works: band.stories.length, read: band.read }).toEqual({ works: 3, read: 1 });
  });

  // By title, the way both of the core's lists are and the way the walls are: the band
  // answers *what of theirs is there* by being readable, and any other order is an opinion
  // the screen was not asked for.
  it("orders a band by title, folding the two lists into one sequence", () => {
    const [band] = bodyOfWork(
      person({
        roles: [WRITER],
        read: [story("Vagabond", [WRITER], 1)],
        notRead: [story("Akira", [WRITER])],
      })
    );

    expect(band.stories.map((one) => one.title)).toEqual(["Akira", "Vagabond"]);
  });

  // A role with nothing under it is dropped rather than drawn as a heading over nothing —
  // the posture the Story wall takes to an empty band. It cannot happen through the core,
  // which reads a person's roles off their Credits; it can happen the moment anything else
  // hands this a role.
  it("draws no heading over an empty band", () => {
    const bands = bodyOfWork(
      person({ roles: [WRITER, ARTIST], notRead: [story("Akira", [WRITER])] })
    );

    expect(bands.map((band) => band.title)).toEqual(["As Writer"]);
  });

  it("is empty for somebody credited on nothing at all", () => {
    expect(bodyOfWork(person({ roles: [] }))).toEqual([]);
  });
});
