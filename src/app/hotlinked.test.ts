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

/**
 * The files allowed to reach a third party, and **no third**.
 *
 * This was one file and is now a list of two, which is the wall doing its job rather than
 * being relaxed: the second entry could not be added without editing this line, and the
 * argument for it had to be written in the module (`core/records.ts`) before it would pass.
 *
 * The rule was never "one file"; it is **"a source is asked from the model, deliberately, and
 * never from a screen"**, and what makes a count of them enforceable is that each one is a
 * *subject*. `covers.ts` answers what an object looks like, and its whole design is about
 * bytes that are somebody else's — hotlinked, revocable, forbidden to keep (ADR-0013).
 * `records.ts` answers what an object *is*: a title and a publisher, asked by ISBN so that the
 * form the owner is about to fill in arrives filled in. Splitting one of these in half would
 * be the failure this list is watching for, and it would read as a third subject in a hurry.
 */
const THE_ONES_THAT_ASK = ["core/covers.ts", "core/records.ts"];

describe("nothing on a page render calls a third party", () => {
  it("finds the sources it is about to check", () => {
    expect(SOURCE.length).toBeGreaterThan(40);
    for (const asking of THE_ONES_THAT_ASK) {
      expect(SOURCE.map((file) => file.file)).toContain(asking);
    }
  });

  it("calls fetch in the sources modules and nowhere else", () => {
    const asking = SOURCE.filter((file) => /\bfetch\s*\(/.test(file.source)).map((f) => f.file);

    // Not "no page fetches" but "these files do": a further one is how this becomes a habit,
    // and the further one is always in a hurry.
    expect(asking).toEqual(THE_ONES_THAT_ASK);
  });

  it("keeps those files out of every adapter, so a screen cannot reach a source at all", () => {
    const modules = THE_ONES_THAT_ASK.map((file) => file.replace(/^core\/|\.ts$/g, ""));
    const reaching = SOURCE.filter(
      (file) =>
        file.file.startsWith("app/") &&
        modules.some((module) => new RegExp(`from "@/core/${module}"`).test(file.source))
    ).map((file) => file.file);

    // A page importing the sources is a page one edit away from asking them. What an adapter
    // may reach is the verb, which is the owner's act; the query, which asks the source *as*
    // the owner's act and hands the answer over as data (`core/queries/isbn.ts`); and the
    // column, which is a render's.
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

    // The *covers* module and not the list above it: this is a rule about whose bytes an
    // `<img>` may point at, and the module that asks what a book is called holds no image.
    expect(naming).toEqual(["core/covers.ts"]);
  });
});
