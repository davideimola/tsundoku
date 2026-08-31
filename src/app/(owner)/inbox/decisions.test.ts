import { describe, expect, it } from "vitest";

import type { InboxAct, InboxEntry, ProposedEntity } from "@/core/queries/inbox";

import {
  approvingWord,
  groupWaiting,
  proposedFields,
  receiptFor,
  whatItIsAbout,
} from "./decisions";

// The one thing #27 decided, tested beside itself rather than through a render.
//
// A backfill arrives by the hundred (ADR-0011), and an Inbox sized for one entry at a time
// makes it cost more than typing the fields by hand — which is the same as refusing it. So
// the screen groups: *43 ISBNs on Star Comics Volumes* is one decision rather than 43, and
// what makes it one decision is that every entry in the group proposes **the same fields on
// the same kind of record from the same publisher's line**. Get that wrong in either
// direction and the screen is either lying about what a group holds or fragmented back into
// 43 decisions.
//
// It is a pure function over what the query answered — no DOM, no renderer, no database —
// so it is the same kind of test as `src/lib/tint.test.ts` and the gate's predicate rather
// than a third seam: a function this application would still have if React were replaced.
// What it is *not* is a test of the screen. There is none, deliberately.

/** An entry as the query answers it, with only the parts a grouping is decided by. */
function waiting(entry: Partial<InboxEntry> & Pick<InboxEntry, "id">): InboxEntry {
  return {
    reported: "read off the back cover",
    act: "amend",
    proposes: "volume",
    reference: "Slam Dunk 1",
    subjectId: "0af26b4e-1111-4111-8111-111111111111",
    details: { isbn: "9788891234567" },
    standing: { title: "Slam Dunk 1", publisher: "Planet Manga", isbn: null },
    proposedAt: "2026-08-31 12:00",
    state: "waiting",
    decidedAt: null,
    createdId: null,
    ...entry,
  };
}

/** What an approval answered with, which is all the receipt is written from. */
function approval(act: InboxAct, proposes: ProposedEntity) {
  return {
    entryId: "0af26b4e-1111-4111-8111-111111111111",
    act,
    proposes,
    createdId: act === "create" ? "0af26b4e-2222-4222-8222-222222222222" : null,
    subjectId: act === "amend" ? "0af26b4e-1111-4111-8111-111111111111" : null,
  };
}

/** An ISBN amendment on a Volume standing under one publisher. */
function anIsbn(id: string, publisher: string): InboxEntry {
  return waiting({ id, standing: { title: `Volume ${id}`, publisher, isbn: null } });
}

describe("what a group is about", () => {
  it("folds the same field on the same publisher's Volumes into one decision", () => {
    const groups = groupWaiting([
      anIsbn("1", "Star Comics"),
      anIsbn("2", "Star Comics"),
      anIsbn("3", "Star Comics"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(["1", "2", "3"]);
    expect(whatItIsAbout(groups[0])).toBe("3 ISBNs on Star Comics Volumes");
  });

  // The publisher is in the key rather than only in the heading, because it is the axis the
  // owner's trust actually runs along: a line read off one publisher's site is one piece of
  // work, and approving it says nothing about the next.
  it("keeps two publishers' lines apart", () => {
    const groups = groupWaiting([
      anIsbn("1", "Star Comics"),
      anIsbn("2", "Panini Comics"),
      anIsbn("3", "Star Comics"),
    ]);

    expect(groups.map(whatItIsAbout)).toEqual([
      "2 ISBNs on Star Comics Volumes",
      "1 ISBN on a Panini Comics Volume",
    ]);
  });

  it("keeps an amendment naming other fields apart from the ISBNs", () => {
    const groups = groupWaiting([
      anIsbn("1", "Star Comics"),
      waiting({
        id: "2",
        details: { publisher: "Star Comics", editionLine: "Must Have" },
        standing: { title: "Volume 2", publisher: null, editionLine: null },
      }),
    ]);

    expect(groups.map(whatItIsAbout)).toEqual([
      "1 ISBN on a Star Comics Volume",
      "1 publisher and edition line on a Volume",
    ]);
  });

  // Two acts and three entities, and no group ever holds more than one of either: approving
  // a group is one sentence about the library, and *creates a Story* and *amends a Volume*
  // are not the same sentence.
  it("never folds a creation in with an amendment", () => {
    const groups = groupWaiting([
      anIsbn("1", "Star Comics"),
      waiting({
        id: "2",
        act: "create",
        proposes: "story",
        reference: "Slam Dunk",
        subjectId: null,
        details: { title: "Slam Dunk", typeId: "manga" },
        standing: null,
      }),
    ]);

    expect(groups.map(whatItIsAbout)).toEqual([
      "1 ISBN on a Star Comics Volume",
      "1 proposed Story",
    ]);
  });

  // Creations group by what they would make and by nothing else. The fields an assistant
  // happened to fill in are not the axis: two proposed Volumes are one decision whether or
  // not one of them arrived without a language.
  it("folds creations by what approving them would make", () => {
    const proposed = (id: string, details: Record<string, unknown>): InboxEntry =>
      waiting({
        id,
        act: "create",
        proposes: "volume",
        subjectId: null,
        details,
        standing: null,
      });

    const groups = groupWaiting([
      proposed("1", { title: "Naruto 42", publisher: "Panini Comics", binding: "tankobon" }),
      proposed("2", { title: "Naruto 43" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(whatItIsAbout(groups[0])).toBe("2 proposed Volumes");
  });

  // The Inbox is worked through rather than browsed, so the query answers oldest first and
  // the grouping keeps that: the group holding the oldest thing waiting is the first one
  // read, and a group that jumped the list because it grew biggest would leave the oldest
  // entry at the bottom forever.
  it("reads in the order the entries arrived", () => {
    const groups = groupWaiting([
      anIsbn("1", "Panini Comics"),
      anIsbn("2", "Star Comics"),
      anIsbn("3", "Star Comics"),
      anIsbn("4", "Panini Comics"),
    ]);

    expect(groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([
      ["1", "4"],
      ["2", "3"],
    ]);
  });

  // A folded group is approved on its heading alone, so the evidence has to reach the
  // heading: where 43 entries came out of one sentence — *read off the back cover* — that
  // sentence is the group's own, and it is how the owner tells a careful backfill from a
  // guess without opening anything.
  it("carries the sentence every entry came out of, where they share one", () => {
    const groups = groupWaiting([anIsbn("1", "Star Comics"), anIsbn("2", "Star Comics")]);

    expect(groups[0].reported).toBe("read off the back cover");
  });

  it("carries no sentence where the entries came out of different ones", () => {
    const groups = groupWaiting([
      anIsbn("1", "Star Comics"),
      waiting({
        id: "2",
        reported: "the publisher's site lists it",
        standing: { title: "Volume 2", publisher: "Star Comics", isbn: null },
      }),
    ]);

    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].reported).toBeNull();
  });

  it("has nothing to say about an empty Inbox", () => {
    expect(groupWaiting([])).toEqual([]);
  });

  // A record deleted while its amendment waited answers with no standing at all, so there
  // is no publisher to group it under and none to name. It is still one decision — and
  // approving it is refused in the amending verb's own prose, which is where that belongs.
  it("groups an amendment whose record has gone under no publisher", () => {
    const groups = groupWaiting([waiting({ id: "1", standing: null })]);

    expect(groups[0].publisher).toBeNull();
    expect(whatItIsAbout(groups[0])).toBe("1 ISBN on a Volume");
  });
});

describe("the fields an entry names", () => {
  // In the order the record is read in rather than the order the assistant sent, which is
  // JSON key order and therefore nobody's decision.
  it("reads them in the record's own order", () => {
    const entry = waiting({
      id: "1",
      details: { isbn: "9788891234567", publisher: "Star Comics", title: "Volume 1" },
    });

    expect(proposedFields(entry)).toEqual(["title", "publisher", "isbn"]);
  });

  // The keys are the creating verbs' arguments (`AMENDABLE_FIELDS`), and the other door is
  // untyped: an assistant that sent a key no record has proposed nothing, and the screen
  // has nothing to draw for it.
  it("drops a key no record of that kind has", () => {
    const entry = waiting({ id: "1", details: { isbn: "9788891234567", vibe: "good" } });

    expect(proposedFields(entry)).toEqual(["isbn"]);
  });

  // A creation is offered the whole record to fill in, because approving one is choosing
  // its fields: the Binding an assistant could not know is the ordinary case, and a form
  // showing only what it guessed would have no box to put one in.
  it("offers a creation every field its record has", () => {
    const entry = waiting({
      id: "1",
      act: "create",
      proposes: "story",
      subjectId: null,
      details: { title: "Slam Dunk" },
      standing: null,
    });

    expect(proposedFields(entry)).toEqual(["title", "typeId"]);
  });
});

// The words on the two sides of the act: the button says what it is about to do to the
// library, and the receipt says what it did. They are one vocabulary rather than two,
// because a screen whose button said *Catalogue* and whose answer said *added* would be
// two applications talking about one row.
describe("the words the act is read in", () => {
  it("names what approving does, per kind of record", () => {
    expect(approvingWord("create", "volume").does).toBe("Catalogue");
    expect(approvingWord("create", "series").does).toBe("Declare");
    expect(approvingWord("create", "story").does).toBe("Create");
    // An amendment is the same act whatever kind of record it is about: it changes one.
    expect(approvingWord("amend", "volume").does).toBe("Amend");
    expect(approvingWord("amend", "story").does).toBe("Amend");
  });

  it("says what an approval did, in the library's terms rather than the workflow's", () => {
    expect(receiptFor([approval("amend", "volume")])).toBe("1 Volume amended.");
    expect(receiptFor([approval("amend", "volume"), approval("amend", "volume")])).toBe(
      "2 Volumes amended."
    );
    expect(receiptFor([approval("create", "series")])).toBe("1 Series declared.");
  });

  // One gesture can carry both acts across all three records — the selection is the unit,
  // not the group — so the receipt counts each kind and says all of them.
  it("counts each kind of act in a mixed selection", () => {
    expect(
      receiptFor([
        approval("amend", "volume"),
        approval("create", "story"),
        approval("amend", "volume"),
        approval("create", "volume"),
      ])
    ).toBe("2 Volumes amended, 1 Story created and 1 Volume catalogued.");
  });

  it("has nothing to say about nothing", () => {
    expect(receiptFor([])).toBe("");
  });
});
