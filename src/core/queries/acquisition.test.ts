import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { declareSeries, placeVolumeInSeries } from "../verbs/series.ts";
import { theMonthsThingsCameHome, whatThisMonthHasCost } from "./acquisition.ts";
import { unrecorded, whole } from "./library.ts";

// Seam 1, and this file is about **the banding and the coverage** rather than about
// addition.
//
// Three things are worth holding, and each of them is a way a ledger lies:
//
//   1. **Nothing falls out of it.** An acquisition with no day recorded belongs to no month
//      and still has to be in the ledger, in a band of its own — the shopping list's rule
//      applied to what already happened. An object in the house and on no band of what came
//      home is the failure this screen exists to make impossible.
//   2. **A month that ended is still a month that was spent.** Releasing a Volume does not
//      unspend the money, so the acquisition stays in the band it was made in and carries the
//      day it ended.
//   3. **The two answers cannot disagree.** The dashboard's figure for this month and the
//      ledger's band for this month are one fragment over one table, and the test says so by
//      asking both about the same acquisitions.
beforeEach(async () => {
  await query("truncate table volume, story, series cascade");
});

/** The month the database is standing in, which is what both answers are read against. */
async function thisMonth(): Promise<string> {
  const [row] = await query<{ month: string }>("select to_char(current_date, 'YYYY-MM') as month");
  return row.month;
}

/** A day inside the month the database is standing in. */
async function aDayThisMonth(): Promise<string> {
  const [row] = await query<{ day: string }>(
    "select to_char(date_trunc('month', current_date), 'YYYY-MM-DD') as day"
  );
  return row.day;
}

const SLAM_DUNK = {
  publisher: "Planet Manga",
  binding: "tankobon",
  language: "it",
} as const;

describe("the months things came home", () => {
  it("bands the acquisitions into the months they were made in, the most recent first", async () => {
    await volumeInTheHouse(
      { title: "Slam Dunk 1", ...SLAM_DUNK },
      { acquiredOn: "2026-01-14", pricePaid: "6.50" }
    );
    await volumeInTheHouse(
      { title: "Slam Dunk 2", ...SLAM_DUNK },
      { acquiredOn: "2026-03-02", pricePaid: "6.50" }
    );
    await volumeInTheHouse(
      { title: "Slam Dunk 3", ...SLAM_DUNK },
      { acquiredOn: "2026-03-21", pricePaid: "24.90" }
    );

    const months = await theMonthsThingsCameHome();

    expect(months.map((month) => month.month)).toEqual(["2026-03", "2026-01"]);
    // March: the two of them, and the later day leads.
    expect(months[0].acquisitions.map((made) => made.volume.title)).toEqual([
      "Slam Dunk 3",
      "Slam Dunk 2",
    ]);
    expect(months[0].comesTo).toEqual({ figure: "31.40", from: 2, of: 2 });
    expect(whole(months[0].comesTo)).toBe(true);
  });

  it("says what a month comes to over the acquisitions in it that carry a price", async () => {
    await volumeInTheHouse(
      { title: "Berserk 1", publisher: "Planet Manga", binding: "tankobon", language: "it" },
      { acquiredOn: "2026-02-04", pricePaid: "9.90" }
    );
    // A gift, or a receipt nobody kept: an acquisition with no price is the ordinary case in
    // this library, and it is still one of the things that came home in February.
    await volumeInTheHouse(
      { title: "Berserk 2", publisher: "Planet Manga", binding: "tankobon", language: "it" },
      { acquiredOn: "2026-02-19" }
    );

    const [february] = await theMonthsThingsCameHome();

    expect(february.acquisitions).toHaveLength(2);
    // The denominator is the acquisitions and never the euro: this is a floor, and the band
    // says so because the figure arrived with what it was counted over.
    expect(february.comesTo).toEqual({ figure: "9.90", from: 1, of: 2 });
    expect(whole(february.comesTo)).toBe(false);
  });

  it("gives the acquisitions with no day recorded a band of their own, at the foot", async () => {
    await volumeInTheHouse(
      { title: "Akira 1", publisher: "Panini Comics", binding: "tankobon", language: "it" },
      { acquiredOn: "2026-05-06", pricePaid: "15.00" }
    );
    // Owned since before any of this was written down. It is in the house, so it has to be
    // in the ledger, and it belongs to no month.
    await volumeInTheHouse({
      title: "Akira 2",
      publisher: "Panini Comics",
      binding: "tankobon",
      language: "it",
    });

    const months = await theMonthsThingsCameHome();

    expect(months.map((month) => month.month)).toEqual(["2026-05", null]);

    const [, noDay] = months;
    expect(noDay.acquisitions.map((made) => made.volume.title)).toEqual(["Akira 2"]);
    // Records that exist and carry nothing: the band has an acquisition and no price, which
    // is the one case a figure must not be printed for.
    expect(noDay.comesTo).toEqual({ figure: "0.00", from: 0, of: 1 });
    expect(unrecorded(noDay.comesTo)).toBe(true);
  });

  it("keeps an acquisition that ended in the month it was made in", async () => {
    const id = await volumeInTheHouse(
      { title: "One Piece 1", publisher: "Star Comics", binding: "tankobon", language: "it" },
      { acquiredOn: "2026-04-11", pricePaid: "4.50" }
    );
    await releaseVolume(id);

    const [april] = await theMonthsThingsCameHome();

    // The money was spent in April. Selling the object in September does not unspend it, and
    // the ledger says both facts at once.
    expect(april.month).toBe("2026-04");
    expect(april.comesTo).toEqual({ figure: "4.50", from: 1, of: 1 });
    expect(april.acquisitions[0].releasedOn).not.toBeNull();
  });

  it("carries the object as a wall draws it, Series and all", async () => {
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 31,
      status: "concluded",
    });
    const id = await volumeInTheHouse(
      { title: "Slam Dunk 1", ...SLAM_DUNK },
      { acquiredOn: "2026-06-01", pricePaid: "6.50" }
    );
    await placeVolumeInSeries({ volumeId: id, seriesId: series, number: 1 });

    const [june] = await theMonthsThingsCameHome();
    const [made] = june.acquisitions;

    expect(made.volume.title).toBe("Slam Dunk 1");
    expect(made.volume.series?.name).toBe("Slam Dunk");
    expect(made.volume.seriesNumber).toBe(1);
    expect(made.volume.binding.name).toBeTruthy();
    // A column and never a lookup: nothing on this path calls a third party.
    expect(made.volume.cover).toBeNull();
  });

  it("answers a library that has bought nothing with no months at all", async () => {
    // Catalogued and never acquired: the library knows the object, nothing came home.
    await catalogueVolume({ title: "Vagabond 1", ...SLAM_DUNK });

    expect(await theMonthsThingsCameHome()).toEqual([]);
  });
});

describe("what this month has cost", () => {
  it("adds up what came home this month, and names the month it added up", async () => {
    const day = await aDayThisMonth();
    await volumeInTheHouse(
      { title: "Vinland Saga 1", ...SLAM_DUNK },
      { acquiredOn: day, pricePaid: "7.90" }
    );
    await volumeInTheHouse({ title: "Vinland Saga 2", ...SLAM_DUNK }, { acquiredOn: day });
    // Last year, and none of this month's business.
    await volumeInTheHouse(
      { title: "Vinland Saga 3", ...SLAM_DUNK },
      { acquiredOn: "2020-01-01", pricePaid: "100.00" }
    );

    const month = await whatThisMonthHasCost();

    expect(month.month).toBe(await thisMonth());
    expect(month.comesTo).toEqual({ figure: "7.90", from: 1, of: 2 });
  });

  it("agrees with the band the ledger prints for the same month", async () => {
    const day = await aDayThisMonth();
    await volumeInTheHouse(
      { title: "Pluto 1", ...SLAM_DUNK },
      { acquiredOn: day, pricePaid: "6.50" }
    );
    await volumeInTheHouse(
      { title: "Pluto 2", ...SLAM_DUNK },
      { acquiredOn: day, pricePaid: "6.50" }
    );

    const month = await whatThisMonthHasCost();
    const band = (await theMonthsThingsCameHome()).find((one) => one.month === month.month);

    // One fragment over one table, which is the whole reason these are two exports and not
    // two statements: a dashboard and a ledger disagreeing about September would be
    // unfindable from either screen.
    expect(band?.comesTo).toEqual(month.comesTo);
  });

  it("is a zero rather than an absence where nothing came home this month", async () => {
    await volumeInTheHouse(
      { title: "Monster 1", ...SLAM_DUNK },
      { acquiredOn: "2019-07-02", pricePaid: "8.00" }
    );

    const month = await whatThisMonthHasCost();

    // No records at all is a measurement: nothing has come home this month, so nothing has
    // been spent. It is `unrecorded`'s other half, and the dashboard prints the zero.
    expect(month.comesTo).toEqual({ figure: "0.00", from: 0, of: 0 });
    expect(whole(month.comesTo)).toBe(true);
    expect(unrecorded(month.comesTo)).toBe(false);
  });

  it("does not count an acquisition with no day recorded", async () => {
    await volumeInTheHouse({ title: "Monster 2", ...SLAM_DUNK }, { pricePaid: "8.00" });

    const month = await whatThisMonthHasCost();

    // It belongs to no month, so it is in no month's figure — and it is on the ledger's own
    // band instead, which is where the owner meets it.
    expect(month.comesTo).toEqual({ figure: "0.00", from: 0, of: 0 });
  });
});
