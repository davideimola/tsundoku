import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { isRefusal } from "../refusal.ts";
import { definePath } from "./path.ts";
import { pinToReadingList, unpinFromReadingList } from "./reading-list.ts";
import { declareSeries } from "./series.ts";

// Seam 1, the write side — and there is only one thing to write here. The Reading list
// composes itself; a pin is the owner's disagreement with the order it composed in, and
// the only row this slice has.

beforeEach(async () => {
  await query("truncate path, series cascade");
});

async function angoloGiappone(): Promise<string> {
  return definePath({ name: "Angolo Giappone" });
}

async function deathNote(): Promise<string> {
  return declareSeries({
    name: "Death Note",
    publisher: "Panini",
    editionLine: "Black Edition",
    publishedCount: 6,
    status: "concluded",
  });
}

/** What is actually stored, which is the point of most of this file. */
async function pins(): Promise<{ path_id: string | null; series_id: string | null }[]> {
  return query("select path_id, series_id from reading_list_pin order by pinned_at");
}

describe("pinning", () => {
  it("stores one row naming the route, and nothing about what to read", async () => {
    const pathId = await angoloGiappone();

    await pinToReadingList({ kind: "path", id: pathId });

    expect(await pins()).toEqual([{ path_id: pathId, series_id: null }]);
  });

  it("said twice moves the pin rather than adding a second one", async () => {
    const pathId = await angoloGiappone();

    await pinToReadingList({ kind: "path", id: pathId });
    await pinToReadingList({ kind: "path", id: pathId });

    expect(await pins()).toHaveLength(1);
  });

  it("pins a Series as readily as a Path: both are sources of one entry each", async () => {
    const seriesId = await deathNote();

    await pinToReadingList({ kind: "series", id: seriesId });

    expect(await pins()).toEqual([{ path_id: null, series_id: seriesId }]);
  });

  it("is refused where there is no such Path or Series", async () => {
    await expect(
      pinToReadingList({ kind: "path", id: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toMatchObject({ code: "not-found" });

    // A URL and an assistant can both carry anything. Prose, not a 500.
    await expect(pinToReadingList({ kind: "series", id: "banana" })).rejects.toSatisfy(isRefusal);
  });
});

describe("unpinning", () => {
  it("takes the row away and leaves the route alone", async () => {
    const pathId = await angoloGiappone();

    await pinToReadingList({ kind: "path", id: pathId });
    await unpinFromReadingList({ kind: "path", id: pathId });

    expect(await pins()).toEqual([]);
    const [{ paths }] = await query<{ paths: string }>("select count(*) as paths from path");
    expect(paths).toBe("1");
  });

  it("is refused on something that was not pinned, rather than passing silently", async () => {
    const pathId = await angoloGiappone();

    await expect(unpinFromReadingList({ kind: "path", id: pathId })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
