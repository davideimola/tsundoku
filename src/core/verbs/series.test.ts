import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { isRefusal } from "../refusal.ts";
import { acquireVolume, releaseVolume } from "./collection.ts";
import {
  concludeSeries,
  declareSeries,
  declareSeriesCollected,
  placeVolumeInSeries,
  recordVolumesPublished,
  stopCollectingSeries,
} from "./series.ts";

// Seam 1. What is asserted here is the ledger's write side: that a Series can be declared,
// that **collecting it is a separate act nothing else performs**, and that every way of
// getting it wrong comes back as prose rather than as a SQLSTATE.
beforeEach(async () => {
  await query("truncate table series, volume");
});

/** The refusal a call produced, or a failure saying it produced none. */
async function refusalFrom(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    if (isRefusal(error)) return error;
    throw error;
  }
  throw new Error("expected a Refusal, and the call succeeded");
}

async function blackEdition(): Promise<string> {
  return declareSeries({
    name: "Death Note",
    publisher: "Panini Comics",
    editionLine: "Black Edition",
    publishedCount: 6,
    status: "concluded",
  });
}

describe("declaring a Series", () => {
  it("records the publisher, the edition line, the count published and whether it is over", async () => {
    const id = await blackEdition();

    const [row] = await query<{
      name: string;
      publisher: string;
      edition_line: string | null;
      published_count: number;
      status: string;
      collecting_since: Date | null;
    }>("select * from series where id = $1", [id]);

    expect(row).toMatchObject({
      name: "Death Note",
      publisher: "Panini Comics",
      edition_line: "Black Edition",
      published_count: 6,
      status: "concluded",
    });
  });

  it("opens no collecting project by itself", async () => {
    const id = await blackEdition();
    const [row] = await query<{ collecting_since: Date | null }>(
      "select collecting_since from series where id = $1",
      [id]
    );
    expect(row.collecting_since).toBeNull();
  });

  it("takes the same name twice when the edition line differs, with its own count", async () => {
    await blackEdition();
    const standard = await declareSeries({
      name: "Death Note",
      publisher: "Panini Comics",
      publishedCount: 12,
      status: "concluded",
    });

    const [row] = await query<{ published_count: number }>(
      "select published_count from series where id = $1",
      [standard]
    );
    expect(row.published_count).toBe(12);
  });

  it("refuses the same Series twice, standard printing included", async () => {
    const standard = {
      name: "Death Note",
      publisher: "Panini Comics",
      publishedCount: 12,
      status: "concluded" as const,
    };
    await declareSeries(standard);

    const refusal = await refusalFrom(() => declareSeries(standard));
    expect(refusal.code).toBe("already-exists");
    expect(refusal.message).toMatch(/already declared/i);
  });

  it("refuses a Series with no name", async () => {
    const refusal = await refusalFrom(() =>
      declareSeries({
        name: "   ",
        publisher: "Panini Comics",
        publishedCount: 1,
        status: "ongoing",
      })
    );
    expect(refusal.code).toBe("invalid");
  });

  it("refuses a negative count of published Volumes", async () => {
    const refusal = await refusalFrom(() =>
      declareSeries({
        name: "Naruto",
        publisher: "Planet Manga",
        publishedCount: -1,
        status: "concluded",
      })
    );
    expect(refusal.code).toBe("invalid");
  });
});

describe("deciding to collect a Series", () => {
  it("is what opens the project, and it says which day", async () => {
    const id = await blackEdition();
    await declareSeriesCollected(id);

    const [row] = await query<{ collecting: boolean }>(
      "select collecting_since = current_date as collecting from series where id = $1",
      [id]
    );
    expect(row.collecting).toBe(true);
  });

  it("is not performed by owning Volumes of the Series", async () => {
    const id = await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });
    const volume = await acquireVolume({
      title: "Naruto 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume.id, seriesId: id, number: 1 });

    const [row] = await query<{ collecting_since: Date | null }>(
      "select collecting_since from series where id = $1",
      [id]
    );
    expect(row.collecting_since).toBeNull();
  });

  it("is refused twice over, because the project is already open", async () => {
    const id = await blackEdition();
    await declareSeriesCollected(id);

    const refusal = await refusalFrom(() => declareSeriesCollected(id));
    expect(refusal.code).toBe("not-allowed");
  });

  it("is refused on a Series nobody declared", async () => {
    const refusal = await refusalFrom(() =>
      declareSeriesCollected("11111111-1111-1111-1111-111111111111")
    );
    expect(refusal.code).toBe("not-found");
  });

  it("is refused on something that is not an id at all, rather than breaking", async () => {
    const refusal = await refusalFrom(() => declareSeriesCollected("banana"));
    expect(refusal.code).toBe("not-found");
  });

  it("ends by the same kind of deliberate act", async () => {
    const id = await blackEdition();
    await declareSeriesCollected(id);
    await stopCollectingSeries(id);

    const [row] = await query<{ collecting_since: Date | null }>(
      "select collecting_since from series where id = $1",
      [id]
    );
    expect(row.collecting_since).toBeNull();

    const refusal = await refusalFrom(() => stopCollectingSeries(id));
    expect(refusal.code).toBe("not-allowed");
  });
});

describe("keeping the ledger true as the publisher moves", () => {
  it("records that more Volumes are out", async () => {
    const id = await declareSeries({
      name: "Chainsaw Man",
      publisher: "Planet Manga",
      publishedCount: 11,
      status: "ongoing",
    });
    await recordVolumesPublished(id, 12);

    const [row] = await query<{ published_count: number }>(
      "select published_count from series where id = $1",
      [id]
    );
    expect(row.published_count).toBe(12);
  });

  it("records that the Series is over, once", async () => {
    const id = await declareSeries({
      name: "Chainsaw Man",
      publisher: "Planet Manga",
      publishedCount: 11,
      status: "ongoing",
    });
    await concludeSeries(id);

    const [row] = await query<{ status: string }>("select status from series where id = $1", [id]);
    expect(row.status).toBe("concluded");

    const refusal = await refusalFrom(() => concludeSeries(id));
    expect(refusal.code).toBe("not-allowed");
  });

  it("refuses a count that is not a whole number of Volumes", async () => {
    const id = await blackEdition();
    const refusal = await refusalFrom(() => recordVolumesPublished(id, 6.5));
    expect(refusal.code).toBe("invalid");
  });
});

describe("placing a Volume in a Series", () => {
  it("records which position of the Series the object is", async () => {
    const series = await blackEdition();
    const volume = await acquireVolume({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      editionLine: "Black Edition",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume.id, seriesId: series, number: 1 });

    const [row] = await query<{ series_id: string; series_number: number }>(
      "select series_id, series_number from volume where id = $1",
      [volume.id]
    );
    expect(row).toEqual({ series_id: series, series_number: 1 });
  });

  it("said again, moves the object rather than refusing the correction", async () => {
    const series = await blackEdition();
    const volume = await acquireVolume({
      title: "Death Note Black Edition 2",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume.id, seriesId: series, number: 1 });
    await placeVolumeInSeries({ volumeId: volume.id, seriesId: series, number: 2 });

    const [row] = await query<{ series_number: number }>(
      "select series_number from volume where id = $1",
      [volume.id]
    );
    expect(row.series_number).toBe(2);
  });

  it("refuses a second object at a position the house already holds", async () => {
    const series = await blackEdition();
    const first = await acquireVolume({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    const twice = await acquireVolume({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: first.id, seriesId: series, number: 1 });

    const refusal = await refusalFrom(() =>
      placeVolumeInSeries({ volumeId: twice.id, seriesId: series, number: 1 })
    );
    expect(refusal.code).toBe("already-exists");
  });

  it("refuses an object that has left the house, which fills no position", async () => {
    const series = await blackEdition();
    const volume = await acquireVolume({
      title: "Death Note Black Edition 3",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });
    await releaseVolume(volume.id);

    const refusal = await refusalFrom(() =>
      placeVolumeInSeries({ volumeId: volume.id, seriesId: series, number: 3 })
    );
    expect(refusal.code).toBe("not-allowed");
  });

  it("refuses a position before the first", async () => {
    const series = await blackEdition();
    const volume = await acquireVolume({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });

    const refusal = await refusalFrom(() =>
      placeVolumeInSeries({ volumeId: volume.id, seriesId: series, number: 0 })
    );
    expect(refusal.code).toBe("invalid");
  });

  it("refuses an object nobody owns and a Series nobody declared", async () => {
    const series = await blackEdition();
    const volume = await acquireVolume({
      title: "Death Note Black Edition 1",
      publisher: "Panini Comics",
      binding: "deluxe",
      language: "it",
    });

    expect(
      (
        await refusalFrom(() =>
          placeVolumeInSeries({
            volumeId: "11111111-1111-1111-1111-111111111111",
            seriesId: series,
            number: 3,
          })
        )
      ).code
    ).toBe("not-found");

    expect(
      (
        await refusalFrom(() =>
          placeVolumeInSeries({
            volumeId: volume.id,
            seriesId: "11111111-1111-1111-1111-111111111111",
            number: 3,
          })
        )
      ).code
    ).toBe("not-found");
  });
});
