import type { RecordedVolume } from "@/core/queries/collection";

// **Where the owner stands with one object, in words** — the Volume screen's own derivation,
// beside the page because it is the page's (`AGENTS.md`), and tested beside itself under the
// licence `vitest.config.ts` states: data in, data out, a function this application would
// still have if React were replaced.
//
// It is a file rather than a few helpers inside `page.tsx` because of what it decides. Since
// the catalogue and the Collection came apart there are **three** states and not two
// (ADR-0007) — in the house, catalogued and never acquired, acquired and let go — and the one
// that is easy to get wrong is the third: an object that left is *not* an object nobody ever
// recorded, and a screen that said so would be telling the owner they never had the thing
// they sold. Which state a Volume is in stays the core's answer (`inTheHouse`, `releasedOn`);
// what is here is only the sentence, which is the screen's.
//
// **The cover's three sentences joined it for the same reason** (#32). Where the image on the
// tile came from, and what a lookup just answered, are five-way distinctions the owner cannot
// re-derive from the tile: an absence the sources established is not a question nobody asked,
// and a source that could not be reached is neither. Which of them is true stays the core's
// answer — `cover`, `lookedUp`, `isbn` — and the words are here, where a test can read them.

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

/**
 * What a single lookup answered, in the owner's words.
 *
 * **Four answers and not two, and two of them are why this is a function.** A source that
 * could not be asked — a rate limit, a timeout, an error page — said nothing about the book
 * and nothing was written down; reading that as *there is no cover* is precisely the mistake
 * that produced a false 0% in the research this is built on. And *unchanged* is not
 * reassurance: it means the source was asked afresh and gave the same answer, so an owner
 * looking at the wrong book now knows the lookup is not what is wrong — the ISBN is.
 */
export function whatTheLookupSaid(outcome: string, because: string | undefined): string {
  switch (outcome) {
    case "found":
      return "A cover was found, and it is on the tile above.";
    case "none":
      return "No source has a cover for this ISBN. That is an answer, and it is recorded — an image of your own is the way to face this one.";
    case "unchanged":
      return "The sources were asked again and handed back the same cover. If it is the wrong book, the ISBN is what to look at — or take the cover off and give it an image of your own.";
    default:
      return `${because ?? "The source could not be reached."} Nothing was recorded, so try again.`;
  }
}

/**
 * What the tile is faced with right now — said once, for the summary and the paragraph under
 * it.
 *
 * **Five answers, and the two at the bottom are the ones worth telling apart.** *No source has
 * one* is a question that was asked and answered; *nobody has looked yet* is a question nobody
 * has asked; and *no ISBN* is a question that cannot be asked at all, which is the state every
 * Bonelli monthly is in for ever. A screen that collapsed them would leave the owner pressing
 * a button that can never do anything.
 */
export function facedWith(volume: RecordedVolume): string {
  if (volume.cover?.from === "own") return "Faced with an image of your own.";
  if (volume.cover?.from === "google-books") return "Faced with a cover from Google Books.";
  if (volume.cover?.from === "open-library") return "Faced with a cover from Open Library.";
  if (volume.lookedUp.at) return "No source has a cover for it, as of the last time one was asked.";
  if (!volume.isbn) return "No ISBN, so no source can be asked for one.";

  return "Nobody has looked for one yet.";
}
