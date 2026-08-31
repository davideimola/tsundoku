import type { SeriesVolume } from "@/core/queries/series";

// **What the spines are drawn from** — the Series screens' own derivation, beside them
// because it is theirs (`AGENTS.md`), and tested beside itself under the licence
// `vitest.config.ts` states: data in, data out, a function this application would still have
// if React were replaced.
//
// A Series is a publisher's ordered sequence, so the ledger is drawn as one: a row of spines,
// filled where the object is on the shelf and hollow where it is not. Turning a ledger into
// that picture is two judgements, and both of them are here rather than in the markup because
// they are the ones the screen must not get wrong:
//
//   1. **A hollow position is only *missing* where the owner decided to complete the
//      Series.** `missing` is `null` for one they have not, and that is not the same as
//      nothing being missing — holding 42 of Naruto's 72 volumes opens no collecting
//      project, so the other thirty are empty positions and never a shopping list. Both are
//      drawn as gaps and they are *said* in two different words, which is the whole of it.
//   2. **The positions run to whichever is longer**, the count of published Volumes or the
//      furthest object standing in the Series. Nothing here reads a catalogue — the count is
//      the owner's to keep true — so an object can stand at position 7 of a Series recorded
//      as six, and a picture cut to the count would take a real object off the screen.
//
// What is *not* here is which positions are missing: that is `queries/series.ts`, computed
// against the shelf on the way out, and a second answer to it invented on a screen is
// exactly the stale hand-written row this application replaced.

/** What the house has at one position of a Series. */
export type Standing =
  /** An object of it is on the shelf. */
  | "held"
  /** The house has none, and the owner is collecting the Series: it is one to buy. */
  | "missing"
  /** The house has none, and there is no project it is missing from. */
  | "empty";

/** One position of a Series, and what stands in it. */
export type Position = {
  /** Its place in the publisher's sequence: 1, 2, 3. */
  number: number;
  standing: Standing;
  /** The object standing there, where the house holds one and the caller read them. */
  volume: SeriesVolume | null;
};

/** The ledger, as much of it as the line is drawn from. */
type Ledger = {
  /** How many Volumes are out, as the owner last recorded it. */
  publishedCount: number;
  /** The positions the house has none of, or `null` for a Series nobody is collecting. */
  missing: number[] | null;
};

/**
 * The positions of a Series, in order, each with what the house has in it.
 *
 * `volumes` is what the house holds of the Series — **all of it, or none of it, and never
 * some of it.** The list of Series reads ledgers without their objects, so the picture it
 * draws is the same picture with nothing to lead to: which positions are *held* is the
 * ledger's own answer either way (see `standingAt`), and the objects only say where a spine
 * leads. A caller handing over half of them would get filled spines that lead nowhere for the
 * half it left out — which is why there is no third argument that means *some*.
 */
export function positionsOf(ledger: Ledger, volumes: readonly SeriesVolume[]): readonly Position[] {
  const standing = new Map(volumes.map((volume) => [volume.number, volume]));
  const missing = ledger.missing === null ? null : new Set(ledger.missing);

  const furthest = volumes.reduce((far, volume) => Math.max(far, volume.number), 0);
  const length = Math.max(ledger.publishedCount, furthest);

  return Array.from({ length }, (_, index) => {
    const number = index + 1;
    const volume = standing.get(number) ?? null;

    return { number, standing: standingAt(number, volume, missing), volume };
  });
}

/**
 * What the house has at one position.
 *
 * The object on the shelf decides it where there is one, and the ledger's own missing list
 * decides it where there is not — read rather than recomputed, so the picture and the *what
 * am I missing* the core answered cannot disagree about a position. A Series nobody is
 * collecting has no such list, and every hollow position of it is merely empty.
 */
function standingAt(
  number: number,
  volume: SeriesVolume | null,
  missing: ReadonlySet<number> | null
): Standing {
  if (volume) return "held";
  if (missing === null) return "empty";
  return missing.has(number) ? "missing" : "held";
}

/**
 * **What the fill means, in one sentence** — the legend under the spines, and the numbers the
 * owner types into a shop's search.
 *
 * It is here beside the standings rather than in the markup for the reason the standings are:
 * *missing* and *not mine yet* are the same gap drawn, and which of the two a screen is
 * looking at is decided **once**. Three cases, and the first is the one that matters — a
 * Series nobody decided to complete has nothing missing from it, so its legend says what the
 * fill means and stops. Why nothing is missing from it is the screen's own paragraph, said
 * there and not twice.
 */
export function whatTheFillMeans(
  ledger: Ledger,
  positions: readonly Position[]
): { said: string; missing: readonly number[] } {
  if (ledger.missing === null) {
    return { said: "Filled is in the house, hollow is not.", missing: [] };
  }

  const missing = positions
    .filter((position) => position.standing === "missing")
    .map((position) => position.number);

  if (missing.length === 0) {
    return { said: "Every published Volume of this Series is in the house.", missing };
  }

  // The word, and the numbers apart from it: what is drawn is a label in the page's quiet ink
  // followed by figures in the mono face, because the figures are the part that gets typed
  // into a shop's search.
  return { said: "Missing", missing };
}

/**
 * What a standing is called, in the owner's words.
 *
 * Here rather than in the markup because two screens draw these spines, and a position called
 * *missing* on one and *not in the house* on the other would be two claims about one fact —
 * and one of them would be the claim this application is careful never to make.
 */
export function standingSaid(standing: Standing): string {
  switch (standing) {
    case "held":
      return "in the house";
    case "missing":
      return "missing";
    case "empty":
      return "not in the house";
  }
}
