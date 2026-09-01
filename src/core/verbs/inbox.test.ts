import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { searchCollection } from "../queries/collection.ts";
import {
  countWaitingInboxEntries,
  listDecidedInboxEntries,
  listWaitingInboxEntries,
  type ProposedEntity,
} from "../queries/inbox.ts";
import { listSeries } from "../queries/series.ts";
import { findStory, listStories } from "../queries/story.ts";
import { isRefusal } from "../refusal.ts";
import {
  approveInboxEntries,
  approveInboxEntry,
  proposeAmendment,
  proposeSeries,
  proposeStory,
  proposeVolume,
  rejectInboxEntry,
} from "./inbox.ts";
import { declareSeries } from "./series.ts";
import { createStory } from "./story.ts";

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
        // A creation is about no record, so there is nothing standing anywhere to read
        // beside it (ADR-0011).
        act: "create",
        subjectId: null,
        standing: null,
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

// The other half of the boundary (ADR-0011): a proposal about a record that **already
// exists**. The claim under test is the mirror of the one above — an amendment writes
// nothing until it is approved, approving it changes the record and creates nothing, and
// rejecting it leaves the record exactly as it stood.
//
// The realistic case is the one that forced the ADR: this library imported 96 Volumes from
// spreadsheets with no ISBN column, so the ISBN is what an assistant is asked to fill in,
// by the hundred.

/** A catalogued Volume with the field an assistant is asked to fill in left empty. */
async function aVolumeWithoutAnIsbn(): Promise<string> {
  const [volume] = await query<{ id: string }>(
    `insert into volume (title, publisher, binding_id, language)
     values ('Slam Dunk 1', 'Planet Manga', 'tankobon', 'it')
     returning id`
  );
  return volume.id;
}

/** The whole of a Volume row, as the amendment's effect is judged against it. */
async function volumeRow(volumeId: string): Promise<Record<string, unknown>> {
  const [row] = await query<Record<string, unknown>>(
    "select title, publisher, edition_line, binding_id, language, isbn from volume where id = $1",
    [volumeId]
  );
  return row;
}

describe("proposing an amendment to a record that exists", () => {
  it("lands as a waiting entry naming the record, with what stands in it today", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();

    await proposeAmendment({
      reported: "Slam Dunk 1 di Planet Manga è 9788891234567",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567" },
    });

    expect(await listWaitingInboxEntries()).toEqual([
      {
        id: expect.any(String),
        reported: "Slam Dunk 1 di Planet Manga è 9788891234567",
        act: "amend",
        proposes: "volume",
        // Read off the record rather than supplied: an entry says what it is about, and
        // the assistant does not get to name the record something else.
        reference: "Slam Dunk 1",
        subjectId: volumeId,
        details: { isbn: "9788891234567" },
        // The diff the owner judges by: what is proposed above, what stands here.
        standing: {
          title: "Slam Dunk 1",
          publisher: "Planet Manga",
          editionLine: null,
          binding: "tankobon",
          language: "it",
          isbn: null,
        },
        proposedAt: expect.any(String),
        state: "waiting",
        decidedAt: null,
        createdId: null,
      },
    ]);
  });

  it("changes nothing: the entry is the only trace the proposal has", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const before = await volumeRow(volumeId);

    await proposeAmendment({
      reported: "the ISBN is this one",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567" },
    });

    expect(await volumeRow(volumeId)).toEqual(before);
  });

  it("is proposed against a Story and against a Series too", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "ongoing",
    });

    await proposeAmendment({
      reported: "Slam Dunk is a manga, not a comic",
      amends: "story",
      subjectId: storyId,
      proposed: { typeId: "manga" },
    });
    await proposeAmendment({
      reported: "Planet Manga has put out all 31",
      amends: "series",
      subjectId: seriesId,
      proposed: { publishedCount: 31, status: "concluded" },
    });

    expect(await listWaitingInboxEntries()).toMatchObject([
      { proposes: "story", subjectId: storyId, standing: { title: "Slam Dunk", typeId: "manga" } },
      {
        proposes: "series",
        subjectId: seriesId,
        standing: { name: "Slam Dunk", publishedCount: 20, status: "ongoing" },
      },
    ]);
  });

  it("is refused where no such record exists, because there is nothing to amend", async () => {
    const unknown = await refusalFrom(
      proposeAmendment({
        reported: "the ISBN is this one",
        amends: "volume",
        subjectId: "6f5f4e3d-2c1b-4a09-8877-665544332211",
        proposed: { isbn: "9788891234567" },
      })
    );
    expect(unknown.code).toBe("not-found");

    // A malformed id is the same event as an unknown one: there is nothing to amend.
    const nonsense = await refusalFrom(
      proposeAmendment({
        reported: "the ISBN is this one",
        amends: "volume",
        subjectId: "banana",
        proposed: { isbn: "9788891234567" },
      })
    );
    expect(nonsense.code).toBe("not-found");

    expect(await listWaitingInboxEntries()).toEqual([]);
  });

  it("is refused where the record is of another kind, so proposes always names the table", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    const refused = await refusalFrom(
      proposeAmendment({
        reported: "the ISBN is this one",
        amends: "volume",
        subjectId: storyId,
        proposed: { isbn: "9788891234567" },
      })
    );

    expect(refused.code).toBe("not-found");
    expect(await listWaitingInboxEntries()).toEqual([]);
  });

  it("is refused where it proposes nothing, which is a rejection with extra steps", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();

    const refused = await refusalFrom(
      proposeAmendment({
        reported: "something about this volume",
        amends: "volume",
        subjectId: volumeId,
        proposed: { isbn: "  " },
      })
    );

    expect(refused.code).toBe("invalid");
    expect(refused.message).toMatch(/at least one field/i);
    expect(await listWaitingInboxEntries()).toEqual([]);
  });

  it("is refused where it names a field the record does not have", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();

    const refused = await refusalFrom(
      proposeAmendment({
        reported: "Slam Dunk is a manga",
        amends: "volume",
        // A Type is an attribute of a Story. Silently dropping it would leave the owner
        // approving an amendment that does nothing.
        proposed: { typeId: "manga" },
        subjectId: volumeId,
      })
    );

    expect(refused.code).toBe("invalid");
    expect(refused.message).toMatch(/Volume/);
    expect(await listWaitingInboxEntries()).toEqual([]);
  });

  it("is refused where it amends a kind of record the Inbox does not carry", async () => {
    const storyId = await createStory({ title: "One-Punch Man", typeId: "manga" });

    // The other door is untyped: an assistant fills in a schema, so `amends` arrives as
    // whatever it sent. A Credit is a record of its own rather than a field of a Story
    // (#26), and the answer to an assistant reaching for it has to be prose it can act
    // on rather than an internal error with nothing in it.
    const refused = await refusalFrom(
      proposeAmendment({
        reported: "One-Punch Man is drawn by Yusuke Murata",
        amends: "credit" as ProposedEntity,
        subjectId: storyId,
        proposed: { title: "One-Punch Man" },
      })
    );

    expect(refused.code).toBe("invalid");
    expect(refused.message).toMatch(/Story, a Volume or a Series/);
    expect(await listWaitingInboxEntries()).toEqual([]);
  });
});

describe("approving an amendment", () => {
  it("changes the record it names, and creates nothing", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const { id } = await proposeAmendment({
      reported: "Slam Dunk 1 is 9788891234567",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567" },
    });

    const approval = await approveInboxEntry(id);

    expect(approval).toEqual({
      entryId: id,
      act: "amend",
      proposes: "volume",
      createdId: null,
      subjectId: volumeId,
    });
    // The one field it named changed; everything else stands where it stood.
    expect(await volumeRow(volumeId)).toEqual({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      edition_line: null,
      binding_id: "tankobon",
      language: "it",
      isbn: "9788891234567",
    });
    expect(await domain()).toEqual({ stories: 0, volumes: 1, series: 0 });
    expect(await listDecidedInboxEntries()).toMatchObject([
      { act: "amend", state: "approved", createdId: null, subjectId: volumeId },
    ]);
  });

  it("changes a Story's Type and a Series' ledger, from the same door", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "comic" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "ongoing",
    });

    const story = await proposeAmendment({
      reported: "Slam Dunk is a manga",
      amends: "story",
      subjectId: storyId,
      proposed: { typeId: "manga" },
    });
    const series = await proposeAmendment({
      reported: "all 31 are out and it is finished",
      amends: "series",
      subjectId: seriesId,
      proposed: { publishedCount: 31, status: "concluded" },
    });
    await approveInboxEntry(story.id);
    await approveInboxEntry(series.id);

    expect(await listStories()).toMatchObject([{ id: storyId, type: { id: "manga" } }]);
    expect(await listSeries()).toMatchObject([
      { id: seriesId, publishedCount: 31, status: "concluded" },
    ]);
  });

  it("is refused with the record's own prose, and the entry stays waiting", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const { id } = await proposeAmendment({
      reported: "it is a hardback",
      amends: "volume",
      subjectId: volumeId,
      proposed: { binding: "hardback" },
    });

    const refused = await refusalFrom(approveInboxEntry(id));

    expect(refused.message).toMatch(/not a Binding/);
    expect(await volumeRow(volumeId)).toMatchObject({ binding_id: "tankobon" });
    expect(await listWaitingInboxEntries()).toMatchObject([{ state: "waiting" }]);
  });

  it("is refused where the record was deleted while the entry waited", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const { id } = await proposeAmendment({
      reported: "the ISBN is this one",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567" },
    });
    await query("delete from volume where id = $1", [volumeId]);

    const refused = await refusalFrom(approveInboxEntry(id));

    expect(refused.code).toBe("not-found");
    expect(await listWaitingInboxEntries()).toHaveLength(1);
  });

  it("takes the field back where the owner emptied it, leaving what stands", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const { id } = await proposeAmendment({
      reported: "the ISBN is this one and it is a deluxe",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567", binding: "deluxe" },
    });

    // Emptying a proposed field is how the owner says *not that one*: an amendment writes
    // what it names, so a field with nothing in it leaves the record standing.
    await approveInboxEntry(id, { binding: null });

    expect(await volumeRow(volumeId)).toMatchObject({
      isbn: "9788891234567",
      binding_id: "tankobon",
    });
  });

  it("is refused where the owner emptied every field, because it now proposes nothing", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const { id } = await proposeAmendment({
      reported: "the ISBN is this one",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567" },
    });

    const refused = await refusalFrom(approveInboxEntry(id, { isbn: null }));

    expect(refused.code).toBe("invalid");
    expect(await volumeRow(volumeId)).toMatchObject({ isbn: null });
    expect(await listWaitingInboxEntries()).toHaveLength(1);
  });

  it("happens once: a decided amendment cannot be approved again", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const { id } = await proposeAmendment({
      reported: "the ISBN is this one",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567" },
    });
    await approveInboxEntry(id);

    const refused = await refusalFrom(approveInboxEntry(id));

    expect(refused.code).toBe("not-allowed");
  });
});

describe("rejecting an amendment", () => {
  it("leaves the record untouched, and the entry is its only trace", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const before = await volumeRow(volumeId);
    const { id } = await proposeAmendment({
      reported: "the ISBN is 9788891234567, I think",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567" },
    });

    await rejectInboxEntry(id);

    expect(await volumeRow(volumeId)).toEqual(before);
    expect(await listWaitingInboxEntries()).toEqual([]);
    expect(await listDecidedInboxEntries()).toMatchObject([
      { act: "amend", state: "rejected", createdId: null, subjectId: volumeId },
    ]);
  });
});

// A backfill arrives by the hundred (ADR-0011), so the gesture that decides it is one
// gesture over a selection — and one transaction, because half an applied backfill is a
// library nobody can tell the state of.
describe("approving a selection", () => {
  /** Three Volumes with no ISBN, and an amendment waiting on each. */
  async function threeWaitingIsbns(): Promise<{ volumeIds: string[]; entryIds: string[] }> {
    const volumeIds: string[] = [];
    const entryIds: string[] = [];
    for (const isbn of ["9788891234561", "9788891234562", "9788891234563"]) {
      const volumeId = await aVolumeWithoutAnIsbn();
      const { id } = await proposeAmendment({
        reported: `the ISBN is ${isbn}`,
        amends: "volume",
        subjectId: volumeId,
        proposed: { isbn },
      });
      volumeIds.push(volumeId);
      entryIds.push(id);
    }
    return { volumeIds, entryIds };
  }

  it("applies every entry it was given", async () => {
    const { volumeIds, entryIds } = await threeWaitingIsbns();

    const approvals = await approveInboxEntries(entryIds);

    expect(approvals.map((approval) => approval.subjectId)).toEqual(volumeIds);
    expect(await listWaitingInboxEntries()).toEqual([]);
    expect(await query("select isbn from volume order by isbn")).toEqual([
      { isbn: "9788891234561" },
      { isbn: "9788891234562" },
      { isbn: "9788891234563" },
    ]);
  });

  it("applies creations and amendments in the same gesture", async () => {
    const volumeId = await aVolumeWithoutAnIsbn();
    const amendment = await proposeAmendment({
      reported: "the ISBN is this one",
      amends: "volume",
      subjectId: volumeId,
      proposed: { isbn: "9788891234567" },
    });
    const creation = await proposeStory({
      reported: "I read Slam Dunk",
      title: "Slam Dunk",
      typeId: "manga",
    });

    const approvals = await approveInboxEntries([amendment.id, creation.id]);

    expect(approvals).toEqual([
      {
        entryId: amendment.id,
        act: "amend",
        proposes: "volume",
        createdId: null,
        subjectId: volumeId,
      },
      {
        entryId: creation.id,
        act: "create",
        proposes: "story",
        createdId: expect.any(String),
        subjectId: null,
      },
    ]);
    expect(await domain()).toMatchObject({ stories: 1 });
  });

  it("leaves none applied when one of them is refused", async () => {
    const { volumeIds, entryIds } = await threeWaitingIsbns();
    const doomed = await aVolumeWithoutAnIsbn();
    const bad = await proposeAmendment({
      reported: "it is a hardback",
      amends: "volume",
      subjectId: doomed,
      proposed: { binding: "hardback" },
    });

    const refused = await refusalFrom(approveInboxEntries([...entryIds, bad.id]));

    expect(refused.message).toMatch(/not a Binding/);
    // The whole selection rolled back: three good amendments and a bad one land together
    // or not at all, which is the reason the verb takes a selection rather than the caller
    // looping.
    expect(await query("select count(*)::int as n from volume where isbn is not null")).toEqual([
      { n: 0 },
    ]);
    expect(await volumeRow(volumeIds[0])).toMatchObject({ isbn: null });
    expect(await listWaitingInboxEntries()).toHaveLength(4);
  });

  // With three hundred amendments in one gesture, *hardback is not a Binding* is prose the
  // owner cannot act on: it says what is wrong and not which of three hundred records it is
  // wrong on. So the entry names itself, and the verb behind it keeps its own words.
  it("names the entry that stopped it", async () => {
    const { entryIds } = await threeWaitingIsbns();
    const [doomed] = await query<{ id: string }>(
      `insert into volume (title, publisher, binding_id, language)
       values ('Berserk Deluxe 3', 'Panini Comics', 'tankobon', 'it')
       returning id`
    );
    const bad = await proposeAmendment({
      reported: "it is a hardback",
      amends: "volume",
      subjectId: doomed.id,
      proposed: { binding: "hardback" },
    });

    const refused = await refusalFrom(approveInboxEntries([...entryIds, bad.id]));

    expect(refused.message).toMatch(/^Berserk Deluxe 3 — /);
    expect(refused.message).toMatch(/not a Binding/);
  });

  it("is refused whole where one id is not an entry", async () => {
    const { entryIds } = await threeWaitingIsbns();

    const refused = await refusalFrom(
      approveInboxEntries([...entryIds, "6f5f4e3d-2c1b-4a09-8877-665544332211"])
    );

    expect(refused.code).toBe("not-found");
    expect(await listWaitingInboxEntries()).toHaveLength(3);
  });

  it("is refused whole where one of them has already been decided", async () => {
    const { entryIds } = await threeWaitingIsbns();
    await rejectInboxEntry(entryIds[0]);

    const refused = await refusalFrom(approveInboxEntries(entryIds));

    expect(refused.code).toBe("not-allowed");
    expect(await listWaitingInboxEntries()).toHaveLength(2);
  });

  it("is refused where nothing was selected, because that decides nothing", async () => {
    const refused = await refusalFrom(approveInboxEntries([]));
    expect(refused.code).toBe("invalid");
  });

  it("decides an entry named twice once", async () => {
    const { entryIds } = await threeWaitingIsbns();

    const approvals = await approveInboxEntries([entryIds[0], entryIds[0]]);

    expect(approvals).toHaveLength(1);
    expect(await listWaitingInboxEntries()).toHaveLength(2);
  });
});

// The two branches of the approval check, asserted against the table rather than through a
// verb (ADR-0011). The verbs cannot produce any of these four states, which is the point:
// the invariant is the database's, so an entry marked approved that created nothing, an
// amendment that created something, and an entry whose act and subject disagree are all
// refused by Postgres and not by anybody remembering to check.
describe("what the schema will not hold", () => {
  /** Whether the table refused the row, on the constraint rather than on anything else. */
  async function refusedByCheck(columns: string, values: readonly unknown[]): Promise<boolean> {
    try {
      await query(
        `insert into inbox_entry (reported, reference, ${columns})
         values ('said', 'named', ${values.map((_, at) => `$${at + 1}`).join(", ")})`,
        values
      );
      return false;
    } catch (error) {
      return (error as { code?: string }).code === "23514";
    }
  }

  const A_RECORD = "6f5f4e3d-2c1b-4a09-8877-665544332211";

  it("refuses an approved creation that named nothing it created", async () => {
    expect(
      await refusedByCheck("act, proposes, decided_at, outcome", [
        "create",
        "story",
        "now",
        "approved",
      ])
    ).toBe(true);
  });

  it("refuses an approved amendment that created something", async () => {
    expect(
      await refusedByCheck("act, proposes, subject_id, decided_at, outcome, created_id", [
        "amend",
        "volume",
        A_RECORD,
        "now",
        "approved",
        A_RECORD,
      ])
    ).toBe(true);
  });

  it("refuses an amendment that names no record, because there is nothing to amend", async () => {
    expect(await refusedByCheck("act, proposes", ["amend", "volume"])).toBe(true);
  });

  it("refuses a creation that names one, because it has no record yet", async () => {
    expect(await refusedByCheck("act, proposes, subject_id", ["create", "volume", A_RECORD])).toBe(
      true
    );
  });
});

// AN INSTALMENT COUNT IS PROPOSED AND NEVER WRITTEN (#37, ADR-0005 and ADR-0011).
//
// It is the Inbox's risk rather than the verbs': an invented count is permanent, silent, and
// wrong in a way the owner never reads back — *seven of twenty* is looked at far more often
// than the twenty is typed. So an assistant proposes it and the owner's approval is what
// writes it.
describe("proposing how many Instalments a Story has", () => {
  it("waits in the Inbox beside what stands on the record today", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await proposeAmendment({
      reported: "Slam Dunk is 276 chapters",
      amends: "story",
      subjectId: storyId,
      proposed: { instalments: 276 },
    });

    // Nothing has been written: the Story still declares no Instalments.
    expect(await findStory(storyId)).toMatchObject({ instalments: null });
    expect(await listWaitingInboxEntries()).toMatchObject([
      {
        proposes: "story",
        subjectId: storyId,
        details: { instalments: 276 },
        // What stands there today, so the owner judges 276 against *nothing* rather than
        // against a number they have to go and look up.
        standing: { title: "Slam Dunk", instalments: null },
      },
    ]);
  });

  it("is written by the owner's approval and by nothing else", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const { id } = await proposeAmendment({
      reported: "Slam Dunk is twenty volumes",
      amends: "story",
      subjectId: storyId,
      proposed: { instalments: 20 },
    });

    await approveInboxEntry(id);

    // The count, and no fraction: nobody has opened it, so there is no pass to be anywhere in.
    expect(await findStory(storyId)).toMatchObject({ instalments: 20, howFarItGot: null });
  });

  it("corrects the count on approval, in the words the owner confirmed", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga", instalments: 20 });
    const { id } = await proposeAmendment({
      reported: "it is 276 chapters, not 20 volumes",
      amends: "story",
      subjectId: storyId,
      proposed: { instalments: 276 },
    });

    // The owner read *276* and knows the number they want is the twenty tankōbon.
    await approveInboxEntry(id, { instalments: 20 });

    expect(await findStory(storyId)).toMatchObject({ instalments: 20 });
  });

  it("is refused with the Story's own prose when the count is not a number of parts", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const { id } = await proposeAmendment({
      reported: "it has a couple of dozen",
      amends: "story",
      subjectId: storyId,
      proposed: { instalments: "a couple of dozen" },
    });

    const refused = await refusalFrom(approveInboxEntry(id));

    expect(refused).toMatchObject({ code: "invalid" });
    expect(await findStory(storyId)).toMatchObject({ instalments: null });
  });

  it("is not a field of a Volume or of a Series, because the count belongs to the narrative", async () => {
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });

    const refused = await refusalFrom(
      proposeAmendment({
        reported: "Slam Dunk is 276 chapters",
        amends: "series",
        subjectId: seriesId,
        proposed: { instalments: 276 },
      })
    );

    expect(refused).toMatchObject({ code: "invalid" });
    expect(refused?.message).toContain("no instalments");
  });
});
