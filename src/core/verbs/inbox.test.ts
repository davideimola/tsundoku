import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { searchCollection } from "../queries/collection.ts";
import {
  countWaitingInboxEntries,
  listDecidedInboxEntries,
  listWaitingInboxEntries,
} from "../queries/inbox.ts";
import { listSeries } from "../queries/series.ts";
import { listStories } from "../queries/story.ts";
import { isRefusal } from "../refusal.ts";
import {
  approveInboxEntry,
  proposeSeries,
  proposeStory,
  proposeVolume,
  rejectInboxEntry,
} from "./inbox.ts";

// Seam 1: the Inbox and the boundary it exists to hold, against a real Postgres.
//
// The claim under test is ADR-0005's, and it is a claim about **what is not in the
// database**: creating a Story, a Volume or a Series is impossible from outside, the
// attempt lands here, approval is the act that creates the entity, and a rejected entry
// leaves no trace in the domain. So half of these tests count rows in tables the verb did
// not touch — that absence is the product, and a test that only read the Inbox back would
// have proven nothing about it.
beforeEach(async () => {
  await query("truncate inbox_entry, volume, story, series cascade");
});

/** What the domain holds, in the three tables an approval is the only door into. */
async function domain(): Promise<{ stories: number; volumes: number; series: number }> {
  const [counts] = await query<{ stories: number; volumes: number; series: number }>(
    `select (select count(*)::int from story)  as stories,
            (select count(*)::int from volume) as volumes,
            (select count(*)::int from series) as series`
  );
  return counts;
}

/** The refusal a call was refused with, or a failure saying it was not refused at all. */
async function refusalFrom(work: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await work;
  } catch (error) {
    if (!isRefusal(error)) throw error;
    return { code: error.code, message: error.message };
  }
  throw new Error("that call was expected to be refused, and it was not");
}

describe("proposing an entity that does not exist", () => {
  it("lands as a waiting entry carrying what was said and the raw details", async () => {
    await proposeVolume({
      reported: "Ho comprato Ultimate Spider-Man Omnibus 1",
      title: "Ultimate Spider-Man Omnibus 1",
      publisher: "Panini Comics",
      binding: "omnibus",
      language: "it",
    });

    expect(await listWaitingInboxEntries()).toEqual([
      {
        id: expect.any(String),
        reported: "Ho comprato Ultimate Spider-Man Omnibus 1",
        proposes: "volume",
        reference: "Ultimate Spider-Man Omnibus 1",
        details: {
          title: "Ultimate Spider-Man Omnibus 1",
          publisher: "Panini Comics",
          binding: "omnibus",
          language: "it",
        },
        proposedAt: expect.any(String),
        state: "waiting",
        decidedAt: null,
        createdId: null,
      },
    ]);
  });

  it("writes nothing into the domain: the proposal is the only trace it has", async () => {
    await proposeStory({ reported: "I read Slam Dunk", title: "Slam Dunk", typeId: "manga" });
    await proposeVolume({ reported: "I bought it", title: "Slam Dunk 1", binding: "tankobon" });
    await proposeSeries({ reported: "There are 31 of them", name: "Slam Dunk" });

    expect(await domain()).toEqual({ stories: 0, volumes: 0, series: 0 });
    expect(await listWaitingInboxEntries()).toHaveLength(3);
  });

  it("is refused with prose where nothing was actually reported", async () => {
    const refused = await refusalFrom(proposeStory({ reported: "  ", title: "Slam Dunk" }));

    expect(refused.code).toBe("invalid");
    expect(refused.message).toMatch(/what was said/i);
    expect(await listWaitingInboxEntries()).toEqual([]);
  });

  it("is refused where the proposal names nothing", async () => {
    const refused = await refusalFrom(proposeVolume({ reported: "buy me something", title: "" }));

    expect(refused.code).toBe("invalid");
    expect(await listWaitingInboxEntries()).toEqual([]);
  });
});

describe("approving an entry", () => {
  it("is the act that creates the Story", async () => {
    const { id } = await proposeStory({
      reported: "I finished Slam Dunk, it is a story across 31 volumes",
      title: "Slam Dunk",
      typeId: "manga",
    });

    const { createdId } = await approveInboxEntry(id);

    expect(await listStories()).toEqual([
      {
        id: createdId,
        title: "Slam Dunk",
        type: { id: "manga", name: "Manga" },
        state: "to-read",
        readingCount: 0,
        latestScore: null,
      },
    ]);
    expect(await listWaitingInboxEntries()).toEqual([]);
    expect(await listDecidedInboxEntries()).toMatchObject([
      { proposes: "story", state: "approved", createdId, decidedAt: expect.any(String) },
    ]);
  });

  it("catalogues the Volume without claiming it is in the house", async () => {
    const { id } = await proposeVolume({
      reported: "Ho comprato Ultimate Spider-Man Omnibus 1",
      title: "Ultimate Spider-Man Omnibus 1",
      publisher: "Panini Comics",
      binding: "omnibus",
      language: "it",
    });

    const { createdId } = await approveInboxEntry(id);

    // Catalogued, and that is all: being recorded and being in the house are two acts
    // (ADR-0007), and approving a proposal is the first one.
    expect(await domain()).toMatchObject({ volumes: 1 });
    expect(await searchCollection({})).toEqual([]);
    expect(await listDecidedInboxEntries()).toMatchObject([{ state: "approved", createdId }]);
  });

  it("declares the Series with what the publisher has done to it", async () => {
    const { id } = await proposeSeries({
      reported: "Death Note Black Edition is six volumes and it is finished",
      name: "Death Note",
      publisher: "Planet Manga",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });

    const { createdId } = await approveInboxEntry(id);

    expect(await listSeries()).toMatchObject([
      {
        id: createdId,
        name: "Death Note",
        publisher: "Planet Manga",
        editionLine: "Black Edition",
        publishedCount: 6,
        status: "concluded",
        collectingSince: null,
      },
    ]);
  });

  it("uses what the owner corrected rather than what was proposed", async () => {
    const { id } = await proposeVolume({
      reported: "I bought the deluxe of Batman Anno Uno",
      title: "Batman: Anno Uno",
      publisher: "Panini",
      // The guess an assistant makes and the owner has to fix: not a Binding this library
      // knows, and the wrong publisher name.
      binding: "hardback",
      language: "it",
    });

    const { createdId } = await approveInboxEntry(id, {
      publisher: "Panini Comics",
      binding: "deluxe",
    });

    const [volume] = await query<{ id: string; publisher: string; binding_id: string }>(
      "select id, publisher, binding_id from volume where id = $1",
      [createdId]
    );
    expect(volume).toMatchObject({ publisher: "Panini Comics", binding_id: "deluxe" });
  });

  it("lets the owner take back a detail the assistant invented", async () => {
    const { id } = await proposeVolume({
      reported: "I bought Batman Anno Uno",
      title: "Batman: Anno Uno",
      publisher: "Panini Comics",
      // An edition line the object does not have. Correcting it means removing it, so a
      // correction has to be able to say *nothing* and not only *something else*.
      editionLine: "Must Have",
      binding: "deluxe",
      language: "it",
    });

    const { createdId } = await approveInboxEntry(id, { editionLine: null });

    const [volume] = await query<{ edition_line: string | null }>(
      "select edition_line from volume where id = $1",
      [createdId]
    );
    expect(volume.edition_line).toBeNull();
  });

  it("refuses a correction that empties something the entity needs", async () => {
    const { id } = await proposeStory({
      reported: "add Slam Dunk",
      title: "Slam Dunk",
      typeId: "manga",
    });

    const refused = await refusalFrom(approveInboxEntry(id, { typeId: null }));

    expect(refused.code).toBe("invalid");
    expect(await domain()).toEqual({ stories: 0, volumes: 0, series: 0 });
    expect(await listWaitingInboxEntries()).toHaveLength(1);
  });

  it("is refused with the creating verb's own prose, and the entry stays waiting", async () => {
    const { id } = await proposeVolume({
      reported: "I bought the hardback",
      title: "Batman: Anno Uno",
      publisher: "Panini Comics",
      binding: "hardback",
      language: "it",
    });

    const refused = await refusalFrom(approveInboxEntry(id));

    expect(refused.message).toMatch(/not a Binding/);
    // The whole approval rolled back: neither half of it happened, which is why the two
    // writes are one transaction.
    expect(await domain()).toEqual({ stories: 0, volumes: 0, series: 0 });
    expect(await listWaitingInboxEntries()).toMatchObject([{ state: "waiting" }]);
  });

  it("is refused where the proposal never said something the entity needs", async () => {
    const { id } = await proposeStory({ reported: "add Slam Dunk", title: "Slam Dunk" });

    const refused = await refusalFrom(approveInboxEntry(id));

    expect(refused.code).toBe("invalid");
    expect(refused.message).toMatch(/Type/);
    expect(await domain()).toEqual({ stories: 0, volumes: 0, series: 0 });
    expect(await listWaitingInboxEntries()).toHaveLength(1);
  });

  it("happens once: a decided entry cannot be approved again", async () => {
    const { id } = await proposeStory({ reported: "add it", title: "Slam Dunk", typeId: "manga" });
    await approveInboxEntry(id);

    const refused = await refusalFrom(approveInboxEntry(id));

    expect(refused.code).toBe("not-allowed");
    expect(refused.message).toMatch(/already approved/i);
    expect(await domain()).toMatchObject({ stories: 1 });
  });

  it("is refused on an entry nobody proposed", async () => {
    const unknown = await refusalFrom(approveInboxEntry("6f5f4e3d-2c1b-4a09-8877-665544332211"));
    expect(unknown.code).toBe("not-found");

    // A malformed id is the same event as an unknown one: there is nothing to decide.
    const nonsense = await refusalFrom(approveInboxEntry("banana"));
    expect(nonsense.code).toBe("not-found");
  });
});

describe("rejecting an entry", () => {
  it("leaves no trace in the domain", async () => {
    const story = await proposeStory({
      reported: "I read a thing called The Invented Manga",
      title: "The Invented Manga",
      typeId: "manga",
    });
    const volume = await proposeVolume({
      reported: "and its omnibus",
      title: "The Invented Manga Omnibus",
      publisher: "Nobody",
      binding: "omnibus",
      language: "it",
    });
    const series = await proposeSeries({ reported: "in twelve volumes", name: "The Invented" });

    await rejectInboxEntry(story.id);
    await rejectInboxEntry(volume.id);
    await rejectInboxEntry(series.id);

    expect(await domain()).toEqual({ stories: 0, volumes: 0, series: 0 });
    expect(await listStories()).toEqual([]);
    expect(await searchCollection({})).toEqual([]);
    expect(await listSeries()).toEqual([]);
    expect(await listWaitingInboxEntries()).toEqual([]);
    expect(await listDecidedInboxEntries()).toMatchObject([
      { state: "rejected", createdId: null },
      { state: "rejected", createdId: null },
      { state: "rejected", createdId: null },
    ]);
  });

  it("cannot be undone by approving afterwards", async () => {
    const { id } = await proposeStory({ reported: "add it", title: "Slam Dunk", typeId: "manga" });
    await rejectInboxEntry(id);

    const refused = await refusalFrom(approveInboxEntry(id));

    expect(refused.code).toBe("not-allowed");
    expect(refused.message).toMatch(/already rejected/i);
    expect(await domain()).toEqual({ stories: 0, volumes: 0, series: 0 });
  });

  it("happens once, and says so", async () => {
    const { id } = await proposeStory({ reported: "add it", title: "Slam Dunk", typeId: "manga" });
    await rejectInboxEntry(id);

    const refused = await refusalFrom(rejectInboxEntry(id));
    expect(refused.code).toBe("not-allowed");
  });

  it("is refused on an entry nobody proposed", async () => {
    const refused = await refusalFrom(rejectInboxEntry("6f5f4e3d-2c1b-4a09-8877-665544332211"));
    expect(refused.code).toBe("not-found");
  });
});

describe("what the owner reads", () => {
  it("is oldest first, because an Inbox is worked through rather than browsed", async () => {
    const first = await proposeStory({ reported: "first", title: "First", typeId: "manga" });
    const second = await proposeStory({ reported: "second", title: "Second", typeId: "manga" });

    expect((await listWaitingInboxEntries()).map((entry) => entry.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("counts what is waiting, so the home page can say there is something to look at", async () => {
    const first = await proposeStory({ reported: "first", title: "First", typeId: "manga" });
    await proposeStory({ reported: "second", title: "Second", typeId: "manga" });
    expect(await countWaitingInboxEntries()).toBe(2);

    await rejectInboxEntry(first.id);
    expect(await countWaitingInboxEntries()).toBe(1);
  });

  it("shows what was decided most recently first, so the last act is visible", async () => {
    const first = await proposeStory({ reported: "first", title: "First", typeId: "manga" });
    const second = await proposeStory({ reported: "second", title: "Second", typeId: "manga" });
    await rejectInboxEntry(first.id);
    await rejectInboxEntry(second.id);

    expect((await listDecidedInboxEntries()).map((entry) => entry.reported)).toEqual([
      "second",
      "first",
    ]);
  });
});
