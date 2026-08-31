import { describe, expect, it } from "vitest";

import { SRC, sourceFiles } from "@/test/source-files";

// The third wall in this app, and it sits beside the other two (`./gated.test.ts`,
// `./palette.test.ts`) because it is one for the same reason: **the failure it catches is
// silent, and it is silent in the one place this application cannot afford it.**
//
// A page that resolved an ISBN against Google Books on the render still compiles, still
// renders, and is indistinguishable from a correct one at a desk on fibre. It fails in a
// shop, one-handed, on the shop's signal — which is the single situation the Collection wall
// exists for — and it fails by being slow rather than by being wrong, so nothing anywhere
// reports it. `next/image` is the same failure wearing a helpful face: it would quietly fetch
// every jacket onto our own server and cache it there, which is the permanent copy Google's
// terms forbid (ADR-0013), and the wall would look *better* for it.
//
// So the two rules ADR-0013 rests on are stated here as arithmetic over the source rather
// than as a paragraph nobody reads before adding a page:
//
//   1. **One file knows what a `fetch` is**, and it is not a screen's.
//   2. **The bytes are never ours.** Nothing routes an image through this server, and the
//      constraint that refuses a hosted `cover_url` is Postgres' — asserted where it lives,
//      in `src/core/verbs/cover.test.ts`.
//
// Arithmetic over text, so it needs no DOM, no renderer and no database: it is the same
// licence `gated.test.ts` takes, and the walk it needs is `src/test/source-files.ts`'s.

const SOURCE = sourceFiles(SRC).filter((file) => !/\.test\.tsx?$/.test(file.file));

/** The one file allowed to reach a third party, and the only one. */
const THE_ONE_THAT_ASKS = "core/covers.ts";

describe("nothing on a page render calls a third party", () => {
  it("finds the source it is about to check", () => {
    expect(SOURCE.length).toBeGreaterThan(40);
    expect(SOURCE.map((file) => file.file)).toContain(THE_ONE_THAT_ASKS);
  });

  it("calls fetch in exactly one file, and it is the sources module", () => {
    const asking = SOURCE.filter((file) => /\bfetch\s*\(/.test(file.source)).map((f) => f.file);

    // Not "no page fetches" but "one file does": a second one is how this becomes a habit,
    // and the second one is always in a hurry.
    expect(asking).toEqual([THE_ONE_THAT_ASKS]);
  });

  it("keeps that file out of every adapter, so a screen cannot reach a source at all", () => {
    const reaching = SOURCE.filter(
      (file) => file.file.startsWith("app/") && /from "@\/core\/covers"/.test(file.source)
    ).map((file) => file.file);

    // A page importing the sources is a page one edit away from asking them. What an adapter
    // may reach is the verb, which is the owner's act, and the column, which is a render's.
    expect(reaching).toEqual([]);
  });
});

describe("no third-party image byte is ours", () => {
  // `next/image` proxies and caches every remote image on our own server. That is the
  // permanent copy §5.e.1 forbids, arriving as an optimisation nobody would think to question.
  it("never reaches for the image optimizer", () => {
    const optimised = SOURCE.filter((file) => /["']next\/image["']/.test(file.source)).map(
      (file) => file.file
    );

    expect(optimised).toEqual([]);
  });

  it("declares the hotlink rule in the sources module and nowhere else in src/", () => {
    // The domains are named twice in this repository and both are deliberate: here, so a
    // source's oddity is an `unanswered` rather than a 500, and in the migration, where the
    // check constraint is the actual wall. A third copy in a screen would be a screen
    // deciding what may be pointed at.
    const naming = SOURCE.filter((file) => /covers\.openlibrary\.org/.test(file.source)).map(
      (file) => file.file
    );

    expect(naming).toEqual([THE_ONE_THAT_ASKS]);
  });
});
