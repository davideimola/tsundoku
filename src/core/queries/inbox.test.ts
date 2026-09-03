import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { catalogueVolume } from "../verbs/collection.ts";
import { proposeAmendment, proposeSeries, proposeStory, proposeVolume } from "../verbs/inbox.ts";
import { declareSeries } from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { listWaitingInboxEntries } from "./inbox.ts";

// Seam 1: what an Inbox entry is read against, against a real Postgres.
//
// An amendment has always carried the record it is about (ADR-0011), and a **creation**
// carried nothing at all — which is the half this file is about (#53). A proposal for a
// Story the library already holds is the mistake the boundary exists to catch, and it is
// invisible on a screen that shows only what was proposed: the owner has to remember
// seventy-seven titles, or go and look. So the namesakes are read here, in the same
// statement, and the whole of what a screen has to do is print them.
beforeEach(async () => {
  await query("truncate inbox_entry, volume, story, series cascade");
});

describe("a creation is read against what the library already holds", () => {
  it("names the Story standing under the title being proposed", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await proposeStory({ reported: "I read Slam Dunk", title: "Slam Dunk" });

    expect(await listWaitingInboxEntries()).toMatchObject([
      {
        proposes: "story",
        reference: "Slam Dunk",
        // The Type is the qualifier, which is what tells two records of one name apart —
        // the same word the finder answers with.
        namesakes: [{ id: storyId, name: "Slam Dunk", qualifier: "Manga" }],
      },
    ]);
  });

  it("folds case and accents, and reaches a title the proposal is only part of", async () => {
    await createStory({ title: "Perché non sono già morto?", typeId: "manga" });
    await createStory({ title: "Slam Dunk 1", typeId: "manga" });

    await proposeStory({ reported: "…", title: "PERCHE non sono gia morto?" });
    await proposeStory({ reported: "…", title: "Slam Dunk" });

    expect(await listWaitingInboxEntries()).toMatchObject([
      { namesakes: [{ name: "Perché non sono già morto?" }] },
      // *Slam Dunk 1* is not called *Slam Dunk*, and it is exactly what the owner needs to
      // see before approving a twenty-first narrative named after a volume.
      { namesakes: [{ name: "Slam Dunk 1" }] },
    ]);
  });

  it("says nothing where the library holds nothing called that", async () => {
    await createStory({ title: "Slam Dunk", typeId: "manga" });

    await proposeStory({ reported: "…", title: "Vinland Saga" });

    expect(await listWaitingInboxEntries()).toMatchObject([{ namesakes: [] }]);
  });

  it("reads a Volume against the catalogue rather than against the Collection", async () => {
    // Catalogued and never in the house (ADR-0007): an object the Collection does not
    // answer with is still an object a second proposal would duplicate.
    const { id: volumeId } = await catalogueVolume({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });

    await proposeVolume({ reported: "…", title: "Slam Dunk 1" });

    expect(await listWaitingInboxEntries()).toMatchObject([
      { namesakes: [{ id: volumeId, name: "Slam Dunk 1", qualifier: "Tankōbon" }] },
    ]);
  });

  it("reads a Series against the edition line, which is what makes two of them different", async () => {
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Planet Manga",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });

    await proposeSeries({ reported: "…", name: "Death Note" });

    expect(await listWaitingInboxEntries()).toMatchObject([
      { namesakes: [{ id: seriesId, name: "Death Note", qualifier: "Black Edition" }] },
    ]);
  });

  it("looks only at the kind of record it proposes", async () => {
    await createStory({ title: "Slam Dunk", typeId: "manga" });
    await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });

    await proposeVolume({ reported: "…", title: "Slam Dunk" });

    // A Story and a Series called *Slam Dunk* are not duplicates of an object called that:
    // this library is meant to hold all three (ADR-0001), and a screen that warned about
    // them would be a screen crying wolf on the ordinary case.
    expect(await listWaitingInboxEntries()).toMatchObject([{ proposes: "volume", namesakes: [] }]);
  });

  it("carries none on an amendment, which is read against its own record", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await proposeAmendment({
      reported: "it is 276 chapters",
      amends: "story",
      subjectId: storyId,
      proposed: { instalments: 276 },
    });

    expect(await listWaitingInboxEntries()).toMatchObject([
      { act: "amend", standing: { title: "Slam Dunk" }, namesakes: [] },
    ]);
  });
});
