import type { RecordedVolume } from "@/core/queries/collection";

// **Where the owner stands with one object, in words** — the Volume screen's own derivation,
// beside the page because it is the page's (`AGENTS.md`), and tested beside itself under the
// licence `vitest.config.ts` states: data in, data out, a function this application would
// still have if React were replaced.
//
// It is a file rather than two helpers inside `page.tsx` because of what it decides. Since
// the catalogue and the Collection came apart there are **three** states and not two
// (ADR-0007) — in the house, catalogued and never acquired, acquired and let go — and the one
// that is easy to get wrong is the third: an object that left is *not* an object nobody ever
// recorded, and a screen that said so would be telling the owner they never had the thing
// they sold. Which state a Volume is in stays the core's answer (`inTheHouse`, `releasedOn`);
// what is here is only the sentence, which is the screen's.

/**
 * The sentence at the head of *In the house*, and the tile's own label.
 *
 * **It says *in the house* and never *on the shelf***: the shelf is the word `CONTEXT.md`
 * tells this application not to use for the Collection, and the spine a Series is drawn as
 * calls a held position the same thing (`series/positions.ts`). One fact, one wording,
 * wherever it is printed.
 *
 * A day the owner does not know is said out loud rather than left blank — a Volume owned
 * since before any of this was written down is an ordinary acquisition with no receipt, and
 * a blank would read as a screen that failed to load one.
 */
export function whatTheHouseSays(volume: RecordedVolume): string {
  if (volume.inTheHouse) {
    return volume.acquiredOn
      ? `In the house, since ${volume.acquiredOn}.`
      : "In the house, since a day nobody wrote down.";
  }

  if (volume.releasedOn) {
    return `Left the house on ${volume.releasedOn}. Its record is kept: the Readings made through it and the Edition note are still true.`;
  }

  return "Catalogued, and not in the house. The library knows this object; the Collection does not claim it.";
}

/**
 * How many times, in the word the owner would use.
 *
 * *Twice* rather than *2 times*, because the sentence this appears in is the ticket's own —
 * **one object acquired twice** — and a number where English has a word reads like a database
 * saying it. Past three it is a count again, which is honest: nobody has a word for the
 * seventh time they bought the same book.
 */
export function timesSaid(times: number): string {
  switch (times) {
    case 2:
      return "twice";
    case 3:
      return "three times";
    default:
      return `${times} times`;
  }
}
