import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { query } from "@/core/db";
import { finishPass, recordPass } from "@/core/verbs/pass";
import { setRating } from "@/core/verbs/rating";
import { declareSeries, placeVolumeInSeries } from "@/core/verbs/series";
import { createStory, declareInstalments } from "@/core/verbs/story";
import {
  recordVolumeCarriesStory,
  recordVolumeCoversInstalments,
} from "@/core/verbs/story-to-volume";
import { PER_CLIENT } from "@/lib/mcp/rate-limit";
import { volumeInTheHouse } from "@/test/volumes";

import { GET } from "./route";

// Seam 2, the third door. The same posture as `src/app/mcp/route.test.ts`: a real `Request`,
// the real route handler, and no mock of the thing under test.
//
// It parts from that file in one way, deliberately. The MCP door's cases are about a token
// compared against configuration and reach no database; **these reach one**, because two of
// the things this door has to be held to are only visible in a composed document: that a
// valid token and no session is enough, and that what comes back carries nothing the door was
// built to keep in. The alternative is a mock of `theShowcase`, which would assert that this
// file passes a fixture through itself.

const TOKEN = "an-api-bearer-for-this-test-and-nowhere-else";

let saved: NodeJS.ProcessEnv;

beforeEach(async () => {
  saved = process.env;
  process.env = { ...saved, API_BEARER_TOKEN: TOKEN, SHOWCASE_WISHLIST: "" };
  await query("truncate path, series, story, volume cascade");
  await createStory({ title: "Slam Dunk", typeId: "manga" });
});

afterEach(() => {
  process.env = saved;
});

/**
 * A distinct caller for every request in this file.
 *
 * The limiter in front of the gate counts per client and remembers between requests
 * (`@/lib/mcp/rate-limit`), so a file that let every case share one address would be a file
 * whose last cases fail once somebody adds a few more. These are cases about the token and
 * the document, and none of them is about a flood.
 */
let callers = 0;

function fromSomewhereNew(): string {
  callers += 1;
  return `203.0.113.${callers % 250}`;
}

/** A request to the door, carrying whatever `authorization` is given and **no cookie**. */
function get(
  authorization?: string,
  url: string | undefined = "https://tsundoku.example.com/api/showcase",
  client: string = fromSomewhereNew()
) {
  const headers = new Headers({ "x-forwarded-for": client });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request(url, { headers });
}

describe("the bearer gate on the third door", () => {
  // **A valid token and no session.** This is the whole point of the door existing: the
  // consumer is a build running in somebody else's environment, and it has no Google account
  // and no cookie to present.
  it("answers a caller carrying the token and nothing else", async () => {
    const response = await GET(get(`Bearer ${TOKEN}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ generatedAt: expect.any(String) });
  });

  it.each([
    ["no authorization header at all", undefined],
    ["a blank one", "   "],
    ["the wrong token", "Bearer not-the-owners-token"],
    ["the right token under the wrong scheme", `Basic ${TOKEN}`],
  ])("refuses %s", async (_case, authorization) => {
    const response = await GET(get(authorization));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="tsundoku"');
  });

  // **Fails closed.** A deployment that forgot the secret refuses every caller rather than
  // publishing the library to whoever finds the URL.
  it.each([
    ["unset", undefined],
    ["blank", "   "],
  ])("refuses everybody when the variable is %s", async (_case, configured) => {
    process.env = { ...saved };
    if (configured !== undefined) process.env.API_BEARER_TOKEN = configured;

    expect((await GET(get(`Bearer ${TOKEN}`))).status).toBe(401);
  });

  // The body of a refusal says nothing about the library, and nothing about which of the
  // three mistakes it was: that is information the caller has not earned.
  it("says nothing about the library when it refuses", async () => {
    const body = await (await GET(get())).text();

    expect(body).not.toMatch(/Slam Dunk/);
    expect(body).not.toMatch(/not-configured|wrong|absent/);
  });
});

describe("the limit in front of the gate", () => {
  // **Before the gate and not after it.** An endpoint that answers a token check to anyone
  // who asks is an endpoint that can be asked for ever, and an allowed request here composes
  // a dozen queries over the whole library. What is being bought is that trying costs this
  // door nothing, not that trying fails: a 256-bit bearer is not brute-forced at thirty
  // guesses a minute.
  it("refuses a flood from one address, token or no token", async () => {
    const flooder = "203.0.113.254";

    for (let at = 0; at < PER_CLIENT; at += 1) {
      expect((await GET(get(`Bearer ${TOKEN}`, undefined, flooder))).status).toBe(200);
    }

    const response = await GET(get(`Bearer ${TOKEN}`, undefined, flooder));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("what the door answers with", () => {
  it("caches privately for five minutes", async () => {
    const response = await GET(get(`Bearer ${TOKEN}`));

    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  });

  // **The ETag is over the document without its stamp.** Hashing the body would mint a new
  // one on every request, because `generatedAt` is the moment it was composed, and a
  // validator that never validates is worse than none: it costs the round trip and saves
  // nothing.
  it("gives the same ETag twice for a library that has not changed", async () => {
    const first = await GET(get(`Bearer ${TOKEN}`));
    const second = await GET(get(`Bearer ${TOKEN}`));

    expect(first.headers.get("etag")).toBeTruthy();
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
  });

  it("answers 304 and no body when the caller already holds it", async () => {
    const etag = (await GET(get(`Bearer ${TOKEN}`))).headers.get("etag") ?? "";

    const request = get(`Bearer ${TOKEN}`);
    request.headers.set("if-none-match", etag);
    const response = await GET(request);

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    // The stored headers are replaced by a validated response's, so dropping this here would
    // silently shorten the window to nothing.
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("mints a new ETag once the library has changed", async () => {
    const before = (await GET(get(`Bearer ${TOKEN}`))).headers.get("etag");
    await createStory({ title: "Vagabond", typeId: "manga" });

    expect((await GET(get(`Bearer ${TOKEN}`))).headers.get("etag")).not.toBe(before);
  });

  // **The block the door sends is the verdicts and a figure**, the shape `pile` and `shelf`
  // already have. A page reading the sample's length as the history would print *12 verdicts*
  // about a reader who has passed forty, which is the mistake `count` exists to stop.
  it("sends what concluded as a capped sample with the real number beside it", async () => {
    const judged = await createStory({ title: "Berserk", typeId: "manga" });
    const passId = await recordPass({
      storyId: judged,
      medium: "paper",
      provenanceId: "remembered",
    });
    await finishPass(passId, "2026-01-01");
    await setRating({ storyId: judged, passId, score: 9, provenanceId: "remembered" });

    // A pass that ended with nothing said about it is not a verdict, and the door does not
    // send it: the rule is the query's, and this is the door standing by the same answer.
    const silent = await createStory({ title: "Vagabond", typeId: "manga" });
    await finishPass(
      await recordPass({ storyId: silent, medium: "paper", provenanceId: "remembered" }),
      "2026-02-02"
    );

    const document = await (await GET(get(`Bearer ${TOKEN}`))).json();

    expect(document.finished.count).toBe(1);
    expect(document.finished.recent).toHaveLength(1);
    expect(document.finished.recent[0]).toMatchObject({ title: "Berserk", rating: { score: 9 } });
  });

  // **Which one of the run a row is**, as the door sends it. Ten objects of a line carry the
  // same title and nothing else tells them apart, so this is the field that makes a wall of
  // them readable, and it is a range, because an object can be three parts of a work.
  it("sends which one of the run each object on the shelf is", async () => {
    const run = await createStory({ title: "Slam Dunk", typeId: "manga" });
    await declareInstalments(run, 20);
    const seriesId = await declareSeries({
      name: "Slam Dunk",
      publisher: "Panini Comics",
      publishedCount: 20,
      status: "concluded",
    });
    const tankobon = await volumeInTheHouse(
      { title: "Slam Dunk", publisher: "Panini Comics", binding: "tankobon", language: "it" },
      { acquiredOn: "2026-01-03" }
    );
    await placeVolumeInSeries({ volumeId: tankobon, seriesId, number: 7 });
    await recordVolumeCarriesStory(tankobon, run);

    const omnibus = await volumeInTheHouse(
      { title: "Slam Dunk", publisher: "Panini Comics", binding: "hardcover", language: "it" },
      { acquiredOn: "2026-01-02" }
    );
    await recordVolumeCarriesStory(omnibus, run);
    await recordVolumeCoversInstalments(omnibus, run, { from: 1, to: 3 });

    const alone = await createStory({ title: "Hyperversum", typeId: "novel" });
    const novel = await volumeInTheHouse(
      { title: "Hyperversum", publisher: "Giunti", binding: "paperback", language: "it" },
      { acquiredOn: "2026-01-01" }
    );
    await recordVolumeCarriesStory(novel, alone);

    const document = await (await GET(get(`Bearer ${TOKEN}`))).json();
    const standing = Object.fromEntries(
      document.shelf.volumes.map((volume: { id: string; standsAt: unknown }) => [
        volume.id,
        volume.standsAt,
      ])
    );

    expect(standing[tankobon]).toEqual({ from: 7, to: 7, unit: "instalments" });
    expect(standing[omnibus]).toEqual({ from: 1, to: 3, unit: "instalments" });
    // A standalone stands in no run, and a decorative 1 beside its title would be a fact this
    // library does not have.
    expect(standing[novel]).toBeNull();
  });

  it("narrows by Type", async () => {
    const url = "https://tsundoku.example.com/api/showcase?types=videogame";
    const document = await (await GET(get(`Bearer ${TOKEN}`, url))).json();

    expect(document.pile.count).toBe(0);
    expect(document.pile.byType.map((counted: { type: { slug: string } }) => counted.type.slug)) //
      .toEqual(["videogame"]);
  });

  // **An unknown slug is a 400 and not a silent empty.** A consumer fetching on a schedule
  // would otherwise publish an empty shelf for a week without learning a Type had been
  // renamed.
  it("refuses a Type it does not have, and names it", async () => {
    const url = "https://tsundoku.example.com/api/showcase?types=manga,banana";
    const response = await GET(get(`Bearer ${TOKEN}`, url));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unknown_type", unknown: ["banana"] });
  });

  // The refusal is a 400 and therefore not gated behind the token: it is still gated, and
  // that order is what this asserts. A caller with no token learns nothing about the Types.
  it("checks the token before it checks the Type", async () => {
    const url = "https://tsundoku.example.com/api/showcase?types=banana";

    expect((await GET(get(undefined, url))).status).toBe(401);
  });
});

describe("what never leaves the door, as the door sends it", () => {
  // Asserted over the **serialized** document rather than over the object, because what
  // leaves is text: a field renamed into something innocuous and a price stringified into a
  // value would both survive a key check and neither survives this.
  it("sends no price, no acquisition, no ISBN and none of a Rating but its score", async () => {
    const body = await (await GET(get(`Bearer ${TOKEN}`))).text();

    for (const forbidden of [
      "price",
      "acquir",
      "isbn",
      "inbox",
      "proposal",
      "provenance",
      "prose",
      "grain",
      "scale",
    ]) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("publishes no wishlist unless the deployment asks for one", async () => {
    expect(await (await GET(get(`Bearer ${TOKEN}`))).json()).not.toHaveProperty("wish");

    process.env.SHOWCASE_WISHLIST = "true";
    expect(await (await GET(get(`Bearer ${TOKEN}`))).json()).toHaveProperty("wish");
  });
});
