import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { SRC, sourceFiles } from "@/test/source-files";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { releaseVolume } from "../verbs/collection.ts";
import { eraseEditionNote, writeEditionNote } from "../verbs/edition-note.ts";
import { findEditionNote } from "./edition-note.ts";

// Seam 1. The Edition note is the one judgement in this model that must **not** reach the
// recommender: it is what the owner thinks of the paper, and ADR-0001 keeps it away from
// the score on purpose. So this file tests two different kinds of claim — that the note
// works, and that it is nowhere near anything an assistant reads.
beforeEach(async () => {
  await query("truncate volume cascade");
});

async function aVolume(): Promise<string> {
  const id = await volumeInTheHouse({
    title: "Batman: Il lungo Halloween",
    publisher: "Panini Comics",
    editionLine: "DC Must Have",
    binding: "must-have",
    language: "it",
  });
  return id;
}

describe("writing an Edition note", () => {
  it("records what the owner thinks of the object, in prose", async () => {
    const volumeId = await aVolume();

    await writeEditionNote(
      volumeId,
      "The Must Have was the right way to try the saga before committing to the omnibus. Paper is thin, translation is fine."
    );

    expect(await findEditionNote(volumeId)).toMatchObject({
      note: "The Must Have was the right way to try the saga before committing to the omnibus. Paper is thin, translation is fine.",
    });
  });

  // Unlike a Rating, which stands beside the next one because rereading is a second act,
  // an opinion of an object is a standing verdict. Print quality does not happen twice.
  it("replaces what the owner said before about the same object", async () => {
    const volumeId = await aVolume();

    await writeEditionNote(volumeId, "Good value for money.");
    await writeEditionNote(volumeId, "The spine cracked after one read. Not good value.");

    expect(await findEditionNote(volumeId)).toMatchObject({
      note: "The spine cracked after one read. Not good value.",
    });
    const [row] = await query<{ notes: number }>("select count(*)::int as notes from edition_note");
    expect(row.notes).toBe(1);
  });

  it("is written or absent, never blank", async () => {
    const volumeId = await aVolume();

    await expect(writeEditionNote(volumeId, "   ")).rejects.toMatchObject({
      name: "Refusal",
      code: "invalid",
      message: "An Edition note is written or absent, never blank.",
    });
    expect(await findEditionNote(volumeId)).toBeNull();
  });

  it("refuses a Volume that is not in the library", async () => {
    await expect(
      writeEditionNote("00000000-0000-0000-0000-000000000000", "Lovely paper.")
    ).rejects.toMatchObject({
      name: "Refusal",
      code: "not-found",
      message: "That Volume is not in the library.",
    });
  });

  it("is taken back where the owner no longer means it", async () => {
    const volumeId = await aVolume();
    await writeEditionNote(volumeId, "Overpriced.");

    await eraseEditionNote(volumeId);

    expect(await findEditionNote(volumeId)).toBeNull();
  });

  it("survives the object leaving the house, because it is what the owner learned", async () => {
    const volumeId = await aVolume();
    await writeEditionNote(volumeId, "Sold it: the omnibus is the better object.");

    await releaseVolume(volumeId);

    expect(await findEditionNote(volumeId)).toMatchObject({
      note: "Sold it: the omnibus is the better object.",
    });
  });
});

// **It is not a score, and it cannot become one.** Asserted against the schema rather
// than through a verb, the same way `rating` is asserted to have no volume column: a
// validation could be relaxed by an `if`, a column that does not exist cannot be set.
describe("an Edition note is not a Rating", () => {
  it("has nowhere to put a score", async () => {
    const columns = await query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'edition_note'"
    );

    expect(
      columns
        .map((column) => column.column_name)
        .filter((name) => /score|rating|vote|stars|value/.test(name))
    ).toEqual([]);
  });
});

// **It appears in no recommendation query**, and that is a claim about every query in the
// core rather than about any one of them — the MCP door exposes what is in `queries/`, so
// a join written into any of them would put the paper's verdict in an assistant's context
// as if it were an opinion of the narrative.
//
// A grep, for the reason the owner gate's placement is a grep (`src/app/gated.test.ts`):
// the failure is silent, and the slice that writes the join will not have read this file.
// The note is reachable through exactly one function, and a screen calls it by name.
describe("an Edition note in the queries an assistant reads", () => {
  const queries = sourceFiles(path.join(SRC, "core", "queries")).filter(
    (read) => !read.file.startsWith("edition-note.")
  );

  it("finds the queries it is about to check", () => {
    expect(queries.length).toBeGreaterThan(0);
  });

  it("is in none of them", () => {
    const leaking = queries
      .filter((read) => /edition_note|editionNote|EditionNote/.test(read.source))
      .map((read) => read.file);

    expect(leaking).toEqual([]);
  });
});
