import { beforeEach, describe, expect, it } from "vitest";
import { volumeInTheHouse } from "@/test/volumes";
import { query } from "../db.ts";
import { catalogueVolume, releaseVolume } from "../verbs/collection.ts";
import { setOwnStoryImage } from "../verbs/cover.ts";
import { abandonPass, finishPass, recordInstalmentReached, recordPass } from "../verbs/pass.ts";
import { deactivatePath, definePath, placeStoriesOnPath } from "../verbs/path.ts";
import { pinToPile, unpinFromPile } from "../verbs/pile.ts";
import {
  declareSeries,
  declareSeriesCollected,
  placeVolumeInSeries,
  recordSeriesPublishesStory,
} from "../verbs/series.ts";
import { createStory } from "../verbs/story.ts";
import { recordVolumeCarriesStory } from "../verbs/story-to-volume.ts";
import { openWant } from "../verbs/want.ts";
import { openWish } from "../verbs/wish.ts";
import { composePile, type PileEntry, theKeyOf } from "./pile.ts";

// Seam 1, and **the product** (#1). Everything asserted in this file is a derivation with
// no row behind it: the two halves of the list, their order, the reasons each row carries,
// the medium each entry is intended in, and the Wish an entry needing an object proposes
// without opening.

beforeEach(async () => {
  await query("truncate path, series, story, volume cascade");
});

/** The reserve, which is where everything composes before the owner has decided anything. */
async function reserve(): Promise<PileEntry[]> {
  return (await composePile()).reserve;
}

/** What a row is called, which for a Story is its title and for a line its position. */
function called(entry: PileEntry): string {
  return (
    entry.story?.title ?? `${entry.reasons[0]?.series?.name} ${entry.reasons[0]?.series?.position}`
  );
}

/** Which sources put a row on the list, in the order they were composed. */
function why(entry: PileEntry): string[] {
  return entry.reasons.map((reason) => reason.because);
}

/** *Angolo Giappone*, in the order the owner put it in. */
async function angoloGiappone(): Promise<{ pathId: string; stories: string[] }> {
  const pathId = await definePath({
    name: "Angolo Giappone",
    intent: "privilegiare titoli davvero coerenti con samurai e cultura giapponese",
  });

  const stories = [
    await createStory({ title: "Vagabond", typeId: "manga" }),
    await createStory({ title: "Lone Wolf and Cub", typeId: "manga" }),
  ];
  await placeStoriesOnPath(pathId, stories);

  return { pathId, stories };
}

describe("what the Pile composes itself from", () => {
  it("offers every unread stop of an active Path, in the owner's order", async () => {
    await angoloGiappone();

    // Not one stop but everything behind it: what stands second cannot be pinned before
    // the owner can see it, and *three Marvel stories and then a DC one* is exactly that
    // (#40).
    expect((await reserve()).map(called)).toEqual(["Vagabond", "Lone Wolf and Cub"]);
  });

  it("drops a stop the owner has read, and the rest of the route closes up", async () => {
    const { stories } = await angoloGiappone();

    await finishPass(
      await recordPass({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect((await reserve()).map(called)).toEqual(["Lone Wolf and Cub"]);
  });

  it("says which route an entry stands on, what that route is for, and where on it", async () => {
    await angoloGiappone();

    const [first, second] = await reserve();

    expect(why(first)).toEqual(["path"]);
    expect(first.reasons[0].path?.name).toBe("Angolo Giappone");
    expect(first.reasons[0].path?.intent).toBe(
      "privilegiare titoli davvero coerenti con samurai e cultura giapponese"
    );
    // Where on the route, counted over what is still to read: one is what comes next.
    expect(first.reasons[0].path?.place).toBe(1);
    expect(second.reasons[0].path?.place).toBe(2);
    expect(first.reasons[0].series).toBeNull();
  });

  it("drops a route the owner put aside, and one they have walked to the end", async () => {
    const { pathId, stories } = await angoloGiappone();

    await deactivatePath(pathId);
    expect(await reserve()).toEqual([]);

    // Walked out rather than put aside: every stop read, and the route contributes
    // nothing for a different reason and with the same answer.
    const walked = await definePath({ name: "Recupero Batman" });
    await placeStoriesOnPath(walked, [stories[0]]);
    await finishPass(
      await recordPass({ storyId: stories[0], medium: "paper", provenanceId: "remembered" }),
      "2024-02-02"
    );

    expect(await reserve()).toEqual([]);
  });

  it("skips a Story the owner is in the middle of rather than telling them to start it", async () => {
    const { stories } = await angoloGiappone();

    await recordPass({ storyId: stories[0], medium: "paper", provenanceId: "remembered" });

    expect((await reserve()).map(called)).toEqual(["Lone Wolf and Cub"]);
  });
});

describe("one Story is one row, however many reasons put it there", () => {
  it("names all three where it is wanted and stands on two routes", async () => {
    const storyId = await createStory({ title: "Batman: Anno Uno", typeId: "comic" });
    const marvel = await definePath({ name: "Marvel" });
    const dc = await definePath({ name: "DC" });
    await placeStoriesOnPath(marvel, [storyId]);
    await placeStoriesOnPath(dc, [storyId]);
    await openWant(storyId);

    const rows = await reserve();

    // One row and not three: the same answer written three times is not three answers.
    expect(rows).toHaveLength(1);
    expect(why(rows[0])).toEqual(["want", "path", "path"]);
    expect(rows[0].reasons.map((reason) => reason.path?.name ?? null)).toEqual([
      null,
      "DC",
      "Marvel",
    ]);
    expect(rows[0].reasons[0].want?.id).toBeTruthy();
  });

  it("enters the list where its first reason put it: the Want, ahead of the routes", async () => {
    const { stories } = await angoloGiappone();
    // The route's *second* stop, wanted as well. It leads, because a Want is the last thing
    // the owner said.
    await openWant(stories[1]);

    expect((await reserve()).map(called)).toEqual(["Lone Wolf and Cub", "Vagabond"]);
    expect(why((await reserve())[0])).toEqual(["want", "path"]);
  });

  it("is one row per Series position, which merges with no narrative", async () => {
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);
    const storyId = await createStory({ title: "Death Note", typeId: "manga" });
    await openWant(storyId);

    // A Series names an object and a Want names a narrative (ADR-0001), so these are two
    // rows even where the owner would say one word for both.
    const rows = await reserve();
    expect(rows).toHaveLength(2);
    expect(rows.map(why)).toEqual([["want"], ["series"]]);
  });
});

describe("what a Want puts on the list", () => {
  it("puts the Story there with no Path and no Series involved", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });

    await openWant(storyId);

    const [entry] = await reserve();
    expect(why(entry)).toEqual(["want"]);
    expect(entry.story?.title).toBe("Slam Dunk");
    expect(entry.subject).toEqual({ kind: "story", id: storyId });
    expect(entry.reasons[0].path).toBeNull();
    expect(entry.reasons[0].series).toBeNull();
    expect(entry.reasons[0].want?.id).toBeTruthy();

    // Said again as the criterion it is: wanting to read something cost a named, ordered
    // route before this, and now it costs neither a route nor a line.
    const [{ routes }] = await query<{ routes: string }>("select count(*) as routes from path");
    expect(routes).toBe("0");
  });

  it("stays on the list when the Story was read years ago, and calls it nothing special", async () => {
    const storyId = await createStory({ title: "Berserk", typeId: "manga" });
    await recordPass({
      storyId,
      medium: "paper",
      provenanceId: "goodreads-history",
      startedOn: "2019-03-01",
      endedOn: "2019-04-01",
      outcome: "finished",
    });

    await openWant(storyId);

    const [entry] = await reserve();
    expect(why(entry)).toEqual(["want"]);
    expect(entry.story?.title).toBe("Berserk");
    // A planned reread is an ordinary entry: there is no field anywhere saying it is one,
    // and the entry carries the same facts every other entry does.
    expect(Object.keys(entry).sort()).toEqual(
      [
        "atHand",
        "cover",
        "medium",
        "object",
        "proposedWish",
        "reasons",
        "story",
        "subject",
        "wishAlreadyOpen",
      ].sort()
    );
  });

  it("falls quiet once a Pass begins after it, and the ordinary case behaves identically", async () => {
    const storyId = await createStory({ title: "Vagabond", typeId: "manga" });
    await openWant(storyId);

    expect(await reserve()).toHaveLength(1);

    await recordPass({ storyId, medium: "digital", provenanceId: "remembered" });

    expect(await reserve()).toEqual([]);
  });

  it("leads the reserve, newest Want first, ahead of the routes and the ledger", async () => {
    const { pathId } = await angoloGiappone();
    expect(pathId).toBeTruthy();
    const first = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const second = await createStory({ title: "One-Punch Man", typeId: "manga" });

    await openWant(first);
    await openWant(second);

    expect((await reserve()).map(called)).toEqual([
      "One-Punch Man",
      "Slam Dunk",
      "Vagabond",
      "Lone Wolf and Cub",
    ]);
  });

  it("follows the object the same way a route's stop does", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const volumeId = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, storyId);

    await openWant(storyId);

    const [entry] = await reserve();
    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(true);
    expect(entry.object?.title).toBe("Slam Dunk 1");
  });

  it("writes nothing by being read: the row is exactly the one the verb wrote", async () => {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await openWant(storyId);

    await composePile();
    await composePile();

    expect(await query("select story_id from want")).toEqual([{ story_id: storyId }]);
  });
});

// **A run with somewhere left to go**, which is the fourth source (#43, user stories 14, 30 and
// 31) and the case that started the tracker. *Slam Dunk* is collected, twenty published and
// twenty on the shelf, so the Series source — which names what is **missing** — has nothing to
// say about it, and without the hand-made Path the run was invisible. The run itself is the
// signal: no route minted for it, no flag on the line, and no Want required.
describe("what a run puts on the list", () => {
  /**
   * *Slam Dunk*: a concluded line of twenty, all twenty on the shelf, and the count of
   * Instalments following the line rather than typed (#34).
   *
   * Wholly held is what puts it here at all since that amendment: a run reaches the list when
   * it is all on the shelf, or when the owner has begun it (ADR-0017). Nothing is *missing*, so
   * the Series source still has nothing to say about it — which is the case the tracker exists
   * for — and the line is marked as nothing, because there is nothing to mark.
   */
  async function slamDunk(): Promise<string> {
    const storyId = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    await recordSeriesPublishesStory(seriesId, storyId);

    for (let number = 1; number <= 20; number += 1) {
      const volumeId = await volumeInTheHouse({
        title: `Slam Dunk ${number}`,
        publisher: "Planet Manga",
        binding: "tankobon",
        language: "it",
      });
      await placeVolumeInSeries({ volumeId, seriesId, number });
    }

    return storyId;
  }

  it("puts the run there, naming how far it got and what comes next", async () => {
    const storyId = await slamDunk();
    await recordPass({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
      startedOn: "2026-01-02",
      atInstalment: 7,
    });

    const [entry] = await reserve();

    expect(why(entry)).toEqual(["run"]);
    expect(entry.story?.title).toBe("Slam Dunk");
    expect(entry.subject).toEqual({ kind: "story", id: storyId });
    // *Carry on with Slam Dunk, you are at seven of twenty, read eight next.* The fraction
    // is the Story's own `howFarItGot`, so the screen says it with the words the Story's
    // page already says it in.
    expect(entry.reasons[0].run).toEqual({
      howFarItGot: { atInstalment: 7, instalments: 20 },
      nextInstalment: 8,
    });
    expect(entry.reasons[0].want).toBeNull();
    expect(entry.reasons[0].path).toBeNull();
    expect(entry.reasons[0].series).toBeNull();
  });

  it("needs no Path minted for it, and no Series marked as anything", async () => {
    const storyId = await slamDunk();
    await recordPass({ storyId, medium: "paper", provenanceId: "remembered", atInstalment: 3 });
    expect(storyId).toBeTruthy();

    expect((await reserve()).map(called)).toEqual(["Slam Dunk"]);

    // The criterion, as a query. Wanting to carry on used to cost a named, ordered route
    // that could not be undefined; starting the run is now the only signal.
    const [{ routes }] = await query<{ routes: string }>("select count(*) as routes from path");
    expect(routes).toBe("0");
    const [{ collected }] = await query<{ collected: string }>(
      "select count(*) as collected from series where collecting_since is not null"
    );
    expect(collected).toBe("0");
  });

  it("shows a run owned whole and wholly unread, which nothing else names", async () => {
    // The case the whole tracker exists for (user story 14). Nothing is missing, so the
    // ledger is silent; nobody has opened it, so there is no pass; and no route was ever
    // minted for it. The run is the only signal there is, and it is enough.
    const storyId = await slamDunk();

    const [entry] = await reserve();

    expect(why(entry)).toEqual(["run"]);
    expect(entry.story?.title).toBe("Slam Dunk");
    expect(entry.subject).toEqual({ kind: "story", id: storyId });
    expect(entry.reasons[0].run).toEqual({
      howFarItGot: { atInstalment: 0, instalments: 20 },
      nextInstalment: 1,
    });
  });

  it("stays one row when the owner wants it too, and then when they start it", async () => {
    const storyId = await slamDunk();

    await openWant(storyId);
    const wanted = await reserve();
    expect(wanted).toHaveLength(1);
    expect(why(wanted[0])).toEqual(["want", "run"]);

    // And the moment the owner opens it the Want falls quiet by itself, with the run left
    // saying where they are: one row throughout, and nothing was maintained to make it so.
    await recordPass({ storyId, medium: "paper", provenanceId: "remembered", atInstalment: 1 });

    const started = await reserve();
    expect(started).toHaveLength(1);
    expect(why(started[0])).toEqual(["run"]);
    expect(started[0].reasons[0].run?.nextInstalment).toBe(2);
  });

  it("merges into the row a Want already stands on rather than opening a second", async () => {
    const storyId = await slamDunk();
    await recordPass({
      storyId,
      medium: "paper",
      provenanceId: "remembered",
      startedOn: "2026-01-02",
      atInstalment: 7,
    });
    // Said while already in the middle of it — *I really do mean to get through this* — so
    // the Want stands: no Pass began after it.
    await openWant(storyId);

    const rows = await reserve();

    expect(rows).toHaveLength(1);
    expect(why(rows[0])).toEqual(["want", "run"]);
    expect(rows[0].reasons[1].run?.howFarItGot).toEqual({ atInstalment: 7, instalments: 20 });
  });

  it("stops contributing when the pass finishes, and when it was abandoned", async () => {
    const finished = await createStory({ title: "Pluto", typeId: "manga", instalments: 8 });
    await finishPass(
      await recordPass({
        storyId: finished,
        medium: "paper",
        provenanceId: "remembered",
        atInstalment: 8,
      }),
      "2024-02-02"
    );

    const abandoned = await createStory({ title: "Ulysses", typeId: "novel", instalments: 18 });
    await abandonPass(
      await recordPass({
        storyId: abandoned,
        medium: "digital",
        provenanceId: "remembered",
        atInstalment: 2,
      }),
      "2019-04-04"
    );

    // Either way the owner closed the pass, and being told to carry on with a book they
    // gave up on is the recommendation this list exists not to make.
    expect(await reserve()).toEqual([]);
  });

  it("stops contributing when the pass has reached the end of the work", async () => {
    const storyId = await createStory({ title: "Death Note", typeId: "manga", instalments: 12 });
    const pass = await recordPass({ storyId, medium: "paper", provenanceId: "remembered" });
    await recordInstalmentReached(pass, 11);

    expect((await reserve()).map(called)).toEqual(["Death Note"]);

    await recordInstalmentReached(pass, 12);

    // The pass is still open — finishing is a separate act — and there is nowhere left to
    // go, so there is nothing left to say about it here.
    expect(await reserve()).toEqual([]);
  });

  it("follows the object the way every other narrative row does", async () => {
    const storyId = await slamDunk();
    await recordPass({ storyId, medium: "paper", provenanceId: "remembered", atInstalment: 7 });

    const [entry] = await reserve();

    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(true);
    expect(entry.object?.title).toBe("Slam Dunk 1");
  });

  it("comes after the routes and before the ledger, which is the shopping half", async () => {
    await angoloGiappone();
    const storyId = await slamDunk();
    await recordPass({ storyId, medium: "paper", provenanceId: "remembered", atInstalment: 7 });
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);

    expect((await reserve()).map(why)).toEqual([["path"], ["path"], ["run"], ["series"]]);
  });

  it("carries its reason into the head when the owner pins it", async () => {
    const storyId = await slamDunk();
    await recordPass({ storyId, medium: "paper", provenanceId: "remembered", atInstalment: 7 });

    await pinToPile({ kind: "story", id: storyId });

    const { head } = await composePile();
    expect(why(head[0])).toEqual(["run"]);
    expect(head[0].reasons[0].run?.howFarItGot).toEqual({ atInstalment: 7, instalments: 20 });
  });
});

describe("the intended medium each entry carries", () => {
  it("is none at all where no object carries the Story: nothing to buy, start it tonight", async () => {
    await angoloGiappone();

    const [entry] = await reserve();

    // It read `digital` until a videogame could stand here (#64). A medium is a fact about a
    // **Pass** and there is no pass, so an entry no object carries has nothing to go on and
    // names nothing — which costs the answer nothing, because the question the medium exists
    // for is the line under it and it is the same either way.
    expect(entry.medium).toBeNull();
    expect(entry.atHand).toBe(true);
    expect(entry.object).toBeNull();
  });

  it("is paper and at hand where the object is on the shelf", async () => {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);

    const [entry] = await reserve();

    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(true);
    expect(entry.object?.title).toBe("Vagabond 1");
    expect(entry.object?.inTheHouse).toBe(true);
    expect(entry.object?.binding).toEqual({ id: "tankobon", name: "Tankōbon" });
  });

  it("is paper and not at hand where the library knows the object and the house does not hold it", async () => {
    const { stories } = await angoloGiappone();
    const { id } = await catalogueVolume({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(id, stories[0]);

    const [entry] = await reserve();

    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(false);
    expect(entry.object?.inTheHouse).toBe(false);
  });

  it("prefers the object the house holds over one it does not, when both carry the Story", async () => {
    const { stories } = await angoloGiappone();
    const wanted = await catalogueVolume({
      title: "Vagabond Deluxe 1",
      publisher: "Planet Manga",
      binding: "deluxe",
      language: "it",
    });
    const held = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(wanted.id, stories[0]);
    await recordVolumeCarriesStory(held, stories[0]);

    const [entry] = await reserve();

    // The owner can start it tonight, and an entry that offered to buy the deluxe while
    // the tankōbon sat on the shelf would be the shopping list talking over the Pile.
    expect(entry.object?.title).toBe("Vagabond 1");
    expect(entry.atHand).toBe(true);
  });

  it("is not at hand again once the object has left the house", async () => {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);
    await releaseVolume(volumeId);

    const [entry] = await reserve();

    expect(entry.atHand).toBe(false);
    expect(entry.object?.inTheHouse).toBe(false);
  });
});

describe("an entry that needs a Volume the owner does not own", () => {
  /** *Vagabond*, catalogued and never acquired: the entry has to be bought first. */
  async function toBuy(): Promise<{ storyId: string; volumeId: string }> {
    const { stories } = await angoloGiappone();
    const { id } = await catalogueVolume({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(id, stories[0]);
    return { storyId: stories[0], volumeId: id };
  }

  it("proposes a Wish naming that Volume", async () => {
    const { volumeId } = await toBuy();

    const [entry] = await reserve();

    expect(entry.proposedWish).toEqual({ volumeId });
  });

  it("proposes it and does not open it: reading the whole list leaves no Wish behind", async () => {
    await toBuy();

    const { head, reserve: rest } = await composePile();
    // Walked, entry by entry, the way a screen renders it and an assistant reads it.
    for (const entry of [...head, ...rest]) expect(entry.reasons.length).toBeGreaterThan(0);

    const [{ wishes }] = await query<{ wishes: string }>("select count(*) as wishes from wish");
    expect(wishes).toBe("0");
  });

  it("stops proposing once the owner has opened the Wish themselves", async () => {
    const { volumeId } = await toBuy();

    await openWish({ volumeId, period: "2026-09" });

    const [entry] = await reserve();
    expect(entry.wishAlreadyOpen).toBe(true);
    expect(entry.proposedWish).toBeNull();
    // Still to be bought. Meaning to buy it is not having it.
    expect(entry.atHand).toBe(false);
  });

  it("proposes nothing for an entry already on the shelf", async () => {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);

    const [entry] = await reserve();
    expect(entry.proposedWish).toBeNull();
  });
});

describe("what the Series being collected contribute", () => {
  /** *Death Note Black Edition*: six out, one on the shelf, being collected. */
  async function blackEdition(): Promise<{ seriesId: string; volumeId: string }> {
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      editionLine: "Black Edition",
      publishedCount: 6,
      status: "concluded",
    });
    const volumeId = await volumeInTheHouse({
      title: "Death Note Black Edition I",
      publisher: "Panini",
      editionLine: "Black Edition",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });
    await declareSeriesCollected(seriesId);

    return { seriesId, volumeId };
  }

  it("offers the first position the house has none of", async () => {
    const { seriesId } = await blackEdition();

    const [entry] = await reserve();

    expect(why(entry)).toEqual(["series"]);
    expect(entry.reasons[0].series).toEqual({
      id: seriesId,
      name: "Death Note",
      publisher: "Panini",
      editionLine: "Black Edition",
      position: 2,
      publishedCount: 6,
    });
    // The subject is the position and not the line: what is pinned is one object to buy.
    expect(entry.subject).toEqual({ kind: "series", id: seriesId, position: 2 });
    // A Series is a line of objects and says nothing about the narrative (ADR-0001).
    expect(entry.story).toBeNull();
    expect(entry.reasons[0].path).toBeNull();
  });

  it("is paper and has to be bought, whatever the library knows of the object", async () => {
    await blackEdition();

    const [entry] = await reserve();

    expect(entry.medium).toBe("paper");
    expect(entry.atHand).toBe(false);
    // Nobody has catalogued volume 2, so there is nothing to wish for: recording the
    // object is the owner's act or an Inbox proposal, never this list's (ADR-0005).
    expect(entry.object).toBeNull();
    expect(entry.proposedWish).toBeNull();
  });

  it("proposes a Wish on the position the owner had and let go", async () => {
    const { seriesId } = await blackEdition();
    const second = await volumeInTheHouse({
      title: "Death Note Black Edition II",
      publisher: "Panini",
      editionLine: "Black Edition",
      binding: "deluxe",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: second, seriesId, number: 2 });
    await releaseVolume(second);

    const [entry] = await reserve();

    expect(entry.reasons[0].series?.position).toBe(2);
    expect(entry.object?.title).toBe("Death Note Black Edition II");
    expect(entry.proposedWish).toEqual({ volumeId: second });
  });

  it("says nothing about a Series the owner never decided to collect", async () => {
    const seriesId = await declareSeries({
      name: "Naruto",
      publisher: "Planet Manga",
      publishedCount: 72,
      status: "concluded",
    });
    const volumeId = await volumeInTheHouse({
      title: "Naruto 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });

    // Holding 1 of 72 opens no project, so nothing is missing from it (CONTEXT.md).
    expect(await reserve()).toEqual([]);
  });

  it("says nothing about a Series being collected with nothing missing", async () => {
    const seriesId = await declareSeries({
      name: "Gotham Central",
      publisher: "Panini",
      publishedCount: 1,
      status: "concluded",
    });
    const volumeId = await volumeInTheHouse({
      title: "Gotham Central 1",
      publisher: "Panini",
      binding: "omnibus",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });
    await declareSeriesCollected(seriesId);

    expect(await reserve()).toEqual([]);
  });

  it("comes after the routes, which are what the owner chose to read", async () => {
    await angoloGiappone();
    await blackEdition();

    expect((await reserve()).map(why)).toEqual([["path"], ["path"], ["series"]]);
  });
});

// **The head and the reserve** (#40). The list stops being one flat answer: a short head the
// owner pinned, in the order they pinned it, and a reserve that composes itself and is
// deliberately unordered. The pin is the whole of what separates them.
describe("the head the owner pinned", () => {
  it("holds the pinned rows and the reserve holds the rest, with nothing in both", async () => {
    const { stories } = await angoloGiappone();

    await pinToPile({ kind: "story", id: stories[1] });

    const { head, reserve: rest } = await composePile();
    expect(head.map(called)).toEqual(["Lone Wolf and Cub"]);
    expect(rest.map(called)).toEqual(["Vagabond"]);
  });

  it("reads newest pin first, because a pin is the most recent decision", async () => {
    const first = await createStory({ title: "Slam Dunk", typeId: "manga" });
    const second = await createStory({ title: "Berserk", typeId: "manga" });
    await openWant(first);
    await openWant(second);

    await pinToPile({ kind: "story", id: first });
    await pinToPile({ kind: "story", id: second });

    expect((await composePile()).head.map(called)).toEqual(["Berserk", "Slam Dunk"]);
  });

  it("takes the second and third stop of one route, in pin order", async () => {
    // The sentence this whole slice exists for: three Marvel stories, and then a DC one.
    const marvel = await definePath({ name: "Marvel" });
    const stops = [
      await createStory({ title: "Daredevil: Born Again", typeId: "comic" }),
      await createStory({ title: "Ultimate Spider-Man", typeId: "comic" }),
      await createStory({ title: "Civil War", typeId: "comic" }),
    ];
    await placeStoriesOnPath(marvel, stops);
    const dc = await definePath({ name: "DC" });
    const batman = await createStory({ title: "Batman: Anno Uno", typeId: "comic" });
    await placeStoriesOnPath(dc, [batman]);

    await pinToPile({ kind: "story", id: stops[0] });
    await pinToPile({ kind: "story", id: stops[1] });
    await pinToPile({ kind: "story", id: stops[2] });
    await pinToPile({ kind: "story", id: batman });

    // Pinned in reading order, so the head reads back newest first. What matters is that
    // three stops of one route stand in it at once, which a pin on the *route* could never
    // have said.
    const { head, reserve: rest } = await composePile();
    expect(head.map(called)).toEqual([
      "Batman: Anno Uno",
      "Civil War",
      "Ultimate Spider-Man",
      "Daredevil: Born Again",
    ]);
    expect(rest).toEqual([]);
  });

  it("has no cap: a head of twenty is the owner's to prune", async () => {
    const path = await definePath({ name: "Everything" });
    const stops = [];
    for (let n = 1; n <= 20; n++) {
      stops.push(
        await createStory({ title: `Story ${String(n).padStart(2, "0")}`, typeId: "comic" })
      );
    }
    await placeStoriesOnPath(path, stops);
    for (const storyId of stops) await pinToPile({ kind: "story", id: storyId });

    // Twenty decisions look wrong on a screen, and the library refuses none of them: a cap
    // here would be an opinion nobody asked it for.
    const { head, reserve: rest } = await composePile();
    expect(head).toHaveLength(20);
    expect(rest).toEqual([]);
  });

  it("takes a Series position, which is the shopping half of the same list", async () => {
    await angoloGiappone();
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);

    await pinToPile({ kind: "series", id: seriesId, position: 1 });

    const { head } = await composePile();
    expect(head.map(why)).toEqual([["series"]]);
    expect(head[0].subject).toEqual({ kind: "series", id: seriesId, position: 1 });
  });

  it("gives the entry back its composed place when the pin is lifted", async () => {
    const { stories } = await angoloGiappone();

    await pinToPile({ kind: "story", id: stories[1] });
    await unpinFromPile({ kind: "story", id: stories[1] });

    const { head, reserve: rest } = await composePile();
    expect(head).toEqual([]);
    expect(rest.map(called)).toEqual(["Vagabond", "Lone Wolf and Cub"]);
  });

  it("introduces nothing: a pin on a Story no source names contributes no entry at all", async () => {
    const { pathId, stories } = await angoloGiappone();

    await pinToPile({ kind: "story", id: stories[0] });
    await deactivatePath(pathId);

    // The pin is still stored, and the list is still composed. A pin is an order and
    // never an entry, so there is nothing here for it to bring to the front.
    expect(await composePile()).toEqual({ head: [], reserve: [], types: [] });
    const [{ stored }] = await query<{ stored: string }>("select count(*) as stored from pile_pin");
    expect(stored).toBe("1");
  });

  it("carries every reason the pinned row has, exactly as the reserve would", async () => {
    const storyId = await createStory({ title: "Batman: Anno Uno", typeId: "comic" });
    const dc = await definePath({ name: "DC" });
    await placeStoriesOnPath(dc, [storyId]);
    await openWant(storyId);

    await pinToPile({ kind: "story", id: storyId });

    const { head } = await composePile();
    expect(why(head[0])).toEqual(["want", "path"]);
  });
});

// One encoding of a subject, in the core, because both doors key their rows by it and the
// pin they post names the same thing. A screen with a second encoding is how a press comes
// to pin the row above.
describe("what identifies an entry", () => {
  it("is the Story, or the line and the position, and it is the pin's own subject", async () => {
    const { stories } = await angoloGiappone();
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);

    const rows = await reserve();

    expect(rows.map((entry) => theKeyOf(entry.subject))).toEqual([
      `story:${stories[0]}`,
      `story:${stories[1]}`,
      `series:${seriesId}#1`,
    ]);
  });
});

describe("where the Pile is stored", () => {
  it("is nowhere: the only table this area added holds pins, and holds nothing else", async () => {
    // The criterion, as a query. A `pile` table of entries is the failure mode
    // this whole slice is shaped to avoid, and its absence is worth asserting rather than
    // trusting: the `Prossimo` column of the spreadsheet is exactly such a table, kept by
    // hand and wrong the moment the owner finishes something (#1).
    const tables = await query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name like '%pile%'
        order by table_name`
    );
    expect(tables.map((table) => table.table_name)).toEqual(["pile_pin"]);

    const columns = await query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'pile_pin'
        order by column_name`
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      "pinned_at",
      "series_id",
      "series_position",
      "story_id",
    ]);
  });
});

// **The list gained the shelf's vocabulary** (#29). An entry is drawn as the tile the walls
// are laid out as, so it carries the two facts a tile is made of: the line the object stands
// in, which is what tints it and which number it wears at the foot, and the jacket it is
// faced with. All three are the **object's**, because a Story has no Series and no ISBN of
// its own (ADR-0001) — and they come off the object the entry already named rather than from
// a second pick nobody can see, which is what stops the tile from showing one edition while
// the row names another.
describe("what an entry's tile is drawn from", () => {
  /** *Vagabond*, on a route, carried by an object of a Series the owner is collecting. */
  async function carriedByAVolumeInALine(): Promise<{ seriesId: string; volumeId: string }> {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    const seriesId = await declareSeries({
      name: "Vagabond",
      publisher: "Planet Manga",
      publishedCount: 37,
      status: "concluded",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);
    await placeVolumeInSeries({ volumeId, seriesId, number: 1 });

    return { seriesId, volumeId };
  }

  it("carries the line the object stands in and the position it stands at", async () => {
    const { seriesId } = await carriedByAVolumeInALine();

    const [entry] = await reserve();

    expect(entry.object?.seriesId).toBe(seriesId);
    expect(entry.object?.seriesNumber).toBe(1);
  });

  it("carries the jacket the object is faced with", async () => {
    const { volumeId } = await carriedByAVolumeInALine();
    await query(
      `update volume set cover_source = 'google-books', cover_url = $2, cover_looked_up_at = now()
        where id = $1`,
      [volumeId, "https://books.google.com/books/content?id=njT&img=1&zoom=5"]
    );

    const [entry] = await reserve();

    expect(entry.object?.cover).toMatchObject({
      url: "https://books.google.com/books/content?id=njT&img=1&zoom=5",
    });
  });

  // The ordinary answer and not a gap, the same one the walls get: an object nobody has
  // placed in a line has no colour to wear and no number to print, and the tile drawn for it
  // falls back to the palette's own paper.
  it("stands in no line and is faced with nothing where the object is in neither", async () => {
    const { stories } = await angoloGiappone();
    const volumeId = await volumeInTheHouse({
      title: "Vagabond 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await recordVolumeCarriesStory(volumeId, stories[0]);

    const [entry] = await reserve();

    expect(entry.object).toMatchObject({ seriesId: null, seriesNumber: null, cover: null });
  });
});

// **A GAME STANDS ON THE PILE**, and the whole of what makes it possible is that it needs
// nothing new (#64, ADR-0021). A videogame is a Story of Type `Videogame` carrying no object
// at all, which is the ordinary shape of a Story this model has held since ADR-0001 — so the
// two sources that name an object are silent for it, the two that name a narrative speak, and
// the row says it can be started tonight because nothing has to be bought first.
describe("what a videogame puts on the list", () => {
  /** *Hades*, wanted and never played, which is the plainest game there is. */
  async function hades(): Promise<string> {
    const storyId = await createStory({ title: "Hades", typeId: "videogame" });
    await openWant(storyId);
    return storyId;
  }

  it("stands on the list through the Want, and the row says it can be started tonight", async () => {
    await hades();

    const [entry] = await reserve();

    expect(entry.story?.title).toBe("Hades");
    expect(entry.story?.type).toEqual({ id: "videogame", name: "Videogame" });
    expect(why(entry)).toEqual(["want"]);
    // Tonight, and it is the flag on the vocabulary that answers it rather than a value
    // named in the query (ADR-0022): nothing carries this Story, so nothing has to be bought.
    expect(entry.atHand).toBe(true);
    expect(entry.object).toBeNull();
    expect(entry.proposedWish).toBeNull();
    // And it claims no medium. *Hades · digital* was the row saying something false about a
    // game while getting the useful half right.
    expect(entry.medium).toBeNull();
  });

  it("stands on an active Path, and everything still ahead on that route stands with it", async () => {
    const pathId = await definePath({ name: "I tre Dark Souls" });
    const saga = [
      await createStory({ title: "Dark Souls", typeId: "videogame" }),
      await createStory({ title: "Dark Souls II", typeId: "videogame" }),
      await createStory({ title: "Dark Souls III", typeId: "videogame" }),
    ];
    await placeStoriesOnPath(pathId, saga);

    const rows = await reserve();

    // Not the next stop alone: what stands behind it has to be visible before it can be
    // pinned, which is as true of a saga as it is of a run of Batman.
    expect(rows.map(called)).toEqual(["Dark Souls", "Dark Souls II", "Dark Souls III"]);
    expect(rows.map((entry) => entry.reasons[0].path?.place)).toEqual([1, 2, 3]);
    expect(rows.every((entry) => entry.atHand)).toBe(true);
  });

  it("is put here by neither object source: no run, no line, and no row for either", async () => {
    await hades();

    const [entry] = await reserve();

    // The run source names Instalments and the Series source names missing Volumes. A game
    // declares no Instalments and stands in no line, so both have nothing to say — and say
    // it by contributing nothing rather than by contributing an empty row.
    expect(why(entry)).toEqual(["want"]);
    expect(entry.reasons[0].run).toBeNull();
    expect(entry.reasons[0].series).toBeNull();
    expect(await reserve()).toHaveLength(1);
  });

  it("is one row however many reasons it has to be there", async () => {
    const storyId = await hades();
    const first = await definePath({ name: "Roguelike" });
    const second = await definePath({ name: "Da finire" });
    await placeStoriesOnPath(first, [storyId]);
    await placeStoriesOnPath(second, [storyId]);

    const rows = await reserve();

    expect(rows).toHaveLength(1);
    expect(why(rows[0])).toEqual(["want", "path", "path"]);
  });

  it("is pinned to the head exactly as any other Story is", async () => {
    const storyId = await hades();

    await pinToPile({ kind: "story", id: storyId });

    const { head, reserve: rest } = await composePile();
    expect(head.map(called)).toEqual(["Hades"]);
    expect(head[0].subject).toEqual({ kind: "story", id: storyId });
    expect(why(head[0])).toEqual(["want"]);
    expect(rest).toEqual([]);

    await unpinFromPile({ kind: "story", id: storyId });
    expect((await reserve()).map(called)).toEqual(["Hades"]);
  });
});

// **THE PILE, NARROWED BY TYPE** (#64). *Tonight I play* is a decision the owner has often
// already taken by the time they open the screen, and the list is deliberately unordered for
// exactly that reason — so the one thing worth doing to it is showing less of it. It changes
// **what is shown and never the order**: one pile, filtered, because one arrears is what lets
// a reader weigh three unread manga against twelve unplayed games in a single answer.
describe("narrowing the Pile by Type", () => {
  /** Two games and two manga, wanted in that order, so the composed order is known. */
  async function bothHalves(): Promise<string[]> {
    const wanted = [
      await createStory({ title: "Vagabond", typeId: "manga" }),
      await createStory({ title: "Hades", typeId: "videogame" }),
      await createStory({ title: "Slam Dunk", typeId: "manga" }),
      await createStory({ title: "Expedition 33", typeId: "videogame" }),
    ];
    for (const storyId of wanted) await openWant(storyId);

    return wanted;
  }

  it("shows the whole list when nothing is asked for", async () => {
    await bothHalves();

    expect((await reserve()).map(called)).toEqual([
      "Expedition 33",
      "Slam Dunk",
      "Hades",
      "Vagabond",
    ]);
  });

  it("changes what is shown and never the order", async () => {
    await bothHalves();

    const { reserve: games } = await composePile({ typeId: "videogame" });
    expect(games.map(called)).toEqual(["Expedition 33", "Hades"]);

    // The same two rows in the same places they stood in on the whole list: the filter takes
    // rows out and moves none.
    const { reserve: whole } = await composePile();
    expect(whole.map(called).filter((title) => games.map(called).includes(title))).toEqual(
      games.map(called)
    );

    const { reserve: manga } = await composePile({ typeId: "manga" });
    expect(manga.map(called)).toEqual(["Slam Dunk", "Vagabond"]);
  });

  it("narrows the head the owner pinned, in pin order, without reordering it", async () => {
    const [vagabond, hades] = await bothHalves();
    await pinToPile({ kind: "story", id: vagabond });
    await pinToPile({ kind: "story", id: hades });

    const whole = await composePile();
    expect(whole.head.map(called)).toEqual(["Hades", "Vagabond"]);

    const games = await composePile({ typeId: "videogame" });
    expect(games.head.map(called)).toEqual(["Hades"]);
    expect(games.reserve.map(called)).toEqual(["Expedition 33"]);
  });

  it("drops a Series position, which names an object and therefore no Type", async () => {
    await bothHalves();
    const seriesId = await declareSeries({
      name: "Death Note",
      publisher: "Panini",
      publishedCount: 2,
      status: "concluded",
    });
    await declareSeriesCollected(seriesId);

    expect((await reserve()).map(why)).toContainEqual(["series"]);
    // A ledger does not claim to know what narrative a Volume carries (ADR-0001), so it has
    // no Type to be narrowed by and a narrowed list does not offer it.
    expect((await composePile({ typeId: "manga" })).reserve.map(why)).toEqual([["want"], ["want"]]);
  });

  it("narrows to nothing on a Type the library does not have, rather than refusing it", async () => {
    await bothHalves();

    const { head, reserve: rest } = await composePile({ typeId: "banana" });
    expect(head).toEqual([]);
    expect(rest).toEqual([]);
  });

  it("says which Types stand on it, in the Types' own order and whatever the narrowing", async () => {
    await bothHalves();

    // In the vocabulary's order and not in the order they composed, because the picker that
    // reads this is offered beside the Story wall's own Type chips.
    expect((await composePile()).types.map((one) => one.id)).toEqual(["manga", "videogame"]);

    // Read off the whole list, so choosing one Type does not take the others off the picker
    // on the way in and leave no way back.
    expect((await composePile({ typeId: "videogame" })).types.map((one) => one.id)).toEqual([
      "manga",
      "videogame",
    ]);
  });

  it("offers no Type at all where nothing stands on the list", async () => {
    expect((await composePile()).types).toEqual([]);
  });
});

// **What the tile beside a row is faced with** (#65). The list is read as a shelf rather than
// as rows, so an entry wears the same picture the walls lay the Story out as — and the order
// is the core's, resolved here rather than by the screen, exactly as `THE_COVER_IT_IS_FACED_OUT_WITH`
// resolves it for the walls.
describe("the image an entry is faced with", () => {
  const A_SCREENSHOT = "https://tsundoku.davideimola.dev/images/hades.jpg";
  const A_COVER = "https://books.google.com/books/content?id=njT-zgEACAAJ&img=1&zoom=5";

  it("is the Story's own where nothing carries it, which is every videogame", async () => {
    const game = await createStory({ title: "Hades", typeId: "videogame" });
    await setOwnStoryImage(game, A_SCREENSHOT);
    await openWant(game);

    const [entry] = await reserve();

    expect(entry.cover).toEqual({ url: A_SCREENSHOT, from: "own" });
  });

  // The ordinary case and the one that was already right: a row goes on wearing the jacket of
  // the object it goes through.
  it("is what the object carrying it is faced with, where the Story has no image of its own", async () => {
    const story = await createStory({ title: "One Piece", typeId: "manga" });
    const volume = await volumeInTheHouse({
      title: "One Piece 100",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await query(
      `update volume set cover_source = 'google-books', cover_url = $2, cover_looked_up_at = now()
        where id = $1`,
      [volume, A_COVER]
    );
    await recordVolumeCarriesStory(volume, story);
    await openWant(story);

    const [entry] = await reserve();

    expect(entry.cover).toMatchObject({ url: A_COVER, from: "google-books" });
  });

  // The same order the walls read, and it is the core's rather than the screen's: a list
  // showing volume one's jacket over an image the owner gave the work would be the Pile
  // disagreeing with `/stories` about the same Story.
  it("is the Story's own over what an object carrying it lends", async () => {
    const story = await createStory({ title: "One Piece", typeId: "manga" });
    const volume = await volumeInTheHouse({
      title: "One Piece 100",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await query(
      `update volume set cover_source = 'google-books', cover_url = $2, cover_looked_up_at = now()
        where id = $1`,
      [volume, A_COVER]
    );
    await recordVolumeCarriesStory(volume, story);
    await setOwnStoryImage(story, A_SCREENSHOT);
    await openWant(story);

    const [entry] = await reserve();

    expect(entry.cover).toMatchObject({ url: A_SCREENSHOT, from: "own" });
  });

  it("is nothing at all where neither has one, which is the drawn tile", async () => {
    const game = await createStory({ title: "Hollow Knight: Silksong", typeId: "videogame" });
    await openWant(game);

    const [entry] = await reserve();

    expect(entry.cover).toBeNull();
  });

  // A Series entry names an object and not a narrative, so there is no Story to take an image
  // off — it wears the jacket of the object at that position, or the drawn tile.
  it("is the object's alone on a Series entry, which names no narrative", async () => {
    const series = await declareSeries({
      name: "Slam Dunk",
      publisher: "Planet Manga",
      publishedCount: 20,
      status: "concluded",
    });
    await declareSeriesCollected(series);
    const volume = await volumeInTheHouse({
      title: "Slam Dunk 1",
      publisher: "Planet Manga",
      binding: "tankobon",
      language: "it",
    });
    await placeVolumeInSeries({ volumeId: volume, seriesId: series, number: 1 });

    const rows = await reserve();
    const position = rows.find((entry) => entry.story === null);

    expect(position?.cover).toBeNull();
  });
});
