import type { RecordedVolume } from "@/core/queries/collection";
import type { EditionNote } from "@/core/queries/edition-note";
import type { CarriedStory } from "@/core/queries/story-to-volume";

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
//
// **And the acts the hero carries joined it for the third time over the same fact** (#30): the
// forms on this screen went into panels whose open state is the URL, so *which* acts an object
// offers became an answer rather than a shape of markup — and it is the same three states
// deciding it. `theActsOnTheObject` is that, and it is load-bearing rather than a list of
// labels: the page opens no panel these acts did not name, which is what stops a hand-typed
// `?panel=release` from standing a release form over an object the house does not hold. Each
// act's label is also its panel's title, so a press and the panel it opens cannot come to
// call one act two things.

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

/**
 * A panel on the object's page: a form the owner opened deliberately, and its open state is
 * this screen's URL (`@/components/drawer`, ADR-0010).
 *
 * The names are a closed set because the page reads what was asked for **against** them, the
 * way every filter on every wall is read: `?panel=banana` opens nothing. And it reads it
 * against the **acts** rather than against this list — `theActsOnTheObject`,
 * `theEditionNoteAct` and `THE_STORY_ACT` name every panel there is, and the page opens none
 * they did not name — so an `?panel=acquire` hand-typed onto an object already in the house
 * opens nothing either, and the two halves of ADR-0007 cannot be made to disagree by editing
 * an address.
 */
export type Panel = "acquire" | "release" | "isbn" | "cover" | "note" | "story" | "split";

/** One act on the object, and the panel a press on it opens. */
export type Act = {
  panel: Panel;
  /** What the press is called. A verb, because it is a thing the owner is about to do. */
  label: string;
};

/**
 * **The acts an object's page offers, in the order the hero stands them in** — which is the
 * one judgement on this screen that a wrong answer would turn into a lie about the world.
 *
 * Three of them, and the first is the one the owner came to perform, drawn loud: whether the
 * house holds the thing. **That act has two forms and never both at once** (ADR-0007), and the
 * case worth the file is the third state rather than the second: an object that left the house
 * is offered *acquiring it again*, because saying it again is a **second acquisition of one
 * object** and not a correction of the first. An object nobody ever had and an object let go
 * are two different sentences (`whatTheHouseSays`) and one act.
 *
 * The other two are repairs, and each is worded by what stands in the record: an ISBN is
 * *recorded* where there is none and *corrected* where there is one, and a cover is *found*
 * where the tile is drawn and *changed* where an image is on it — because a wrong cover loads
 * perfectly and is the failure ADR-0013 was written after. The cover is offered even where
 * there is no ISBN to ask a source by: that is the state every Bonelli monthly is in for ever,
 * and the panel is where it is said out loud and where the owner's own image is given.
 *
 * The Edition note is the fourth and it is `theEditionNoteAct`, apart from these because of
 * where it is opened from rather than because it is a lesser act: it is written from beside
 * the prose it replaces, so it does not stand in a row of presses at the top of the screen.
 * `THE_STORY_ACT` is the fifth and `theSplitAct` the sixth, and both are apart for the same
 * reason.
 */
export function theActsOnTheObject(volume: RecordedVolume): readonly Act[] {
  return [theHouseAct(volume), theIsbnAct(volume), theCoverAct(volume)];
}

/**
 * The Edition note's own act, which is not in the hero.
 *
 * It takes the note rather than the Volume because what it is called is decided by whether
 * there is one — and the note is a record of its own, on a Volume that may have none. The
 * label is the whole name of the thing (*Write an Edition note*) rather than *Write it*: it
 * titles the panel as well as the press under the prose, and one string for both is what
 * keeps the two from drifting apart.
 */
export function theEditionNoteAct(note: EditionNote | null): Act {
  return {
    panel: "note",
    label: note ? "Rewrite the Edition note" : "Write an Edition note",
  };
}

/**
 * Recording a narrative the library has never held, **inside the object the owner is holding**
 * (#33).
 *
 * It is not in the hero and it is not in `theActsOnTheObject`, for the Edition note's reason
 * rather than a lesser one: it is opened from beside the list it changes, where the sentence
 * *record the Story first if it is not in the list* used to send the owner to another screen
 * and back. Half the contents page of a volume never got recorded because of that trip.
 *
 * **It takes nothing**, which is what tells it apart from the other five: the other labels are
 * decided by where the owner stands with this object — in the house, or let go; an ISBN
 * recorded, or corrected — and this one is not a fact about the Volume at all. Either the
 * library has the narrative or it has not, and the picker under the list is the door for the
 * first case. So it is a constant, and there is nothing for a test to vary.
 *
 * The wording says *not in the library* rather than *new*, because the press beside it also
 * says *record* and the two acts differ by exactly that: one names a Story, the other makes
 * one exist (ADR-0005 is why the second is the owner's alone).
 */
export const THE_STORY_ACT: Act = {
  panel: "story",
  label: "Record a Story that is not in the library",
};

/**
 * **What writing an ISBN does to what the object is faced with** — said where the correction
 * is made, and not discovered afterwards.
 *
 * ADR-0012 predicted the failure and production produced it: *One-Punch Man 9* wearing *Slam
 * Dunk 9*'s jacket, because the ISBN behind it was wrong. A looked-up cover is an answer to
 * the ISBN that stood on the record when it was asked for, so `amendVolume` drops it when it
 * writes a different one — and the owner should read that before they press, not after the
 * tile has changed under them.
 *
 * **Three cases, and the middle one is why this is a function.** Where an image of the owner's
 * own is standing on top, the looked-up record still goes and the tile does *not* change: a
 * sentence warning about a jacket the owner will still be looking at afterwards would be a
 * screen describing something that did not happen. And where no source has ever answered
 * there is nothing to warn about at all, so what is said instead is the thing the field
 * cannot do — an empty box records nothing rather than emptying the record.
 */
export function whatWritingAnIsbnDoes(volume: RecordedVolume): string {
  if (!volume.lookedUp.source) {
    return "An empty box records nothing rather than emptying the field: taking a fact out of the record is a different act from putting one in, and there is no verb for it here.";
  }

  if (volume.cover?.from === "own") {
    return "Writing a different one takes the looked-up cover off the record with it — it was an answer to the number that stood here. The image of your own is what this object is faced with, and it stays.";
  }

  return "Writing a different one takes the looked-up cover off with it: a jacket found against the old number still loads perfectly and is the wrong book.";
}

/** Whether the house holds it: the act this page is opened to perform. */
function theHouseAct(volume: RecordedVolume): Act {
  if (volume.inTheHouse) return { panel: "release", label: "It left the house" };

  return {
    panel: "acquire",
    // *Again* is the word that makes the history read as one object rather than as a record
    // being fixed. It is only said where there is something to say it about.
    label: volume.releasedOn ? "It is in the house again" : "It is in the house",
  };
}

/** The ISBN, which this screen is the only place a human can put one on. */
function theIsbnAct(volume: RecordedVolume): Act {
  return { panel: "isbn", label: volume.isbn ? "Correct its ISBN" : "Record its ISBN" };
}

/** The cover: found where the tile is drawn, changed where an image is standing on it. */
function theCoverAct(volume: RecordedVolume): Act {
  return { panel: "cover", label: volume.cover ? "Change its cover" : "Find it a cover" };
}

/**
 * Splitting the object into the several Stories it holds — the sixth act, and **the only one
 * this screen decides whether to offer at all** (#38).
 *
 * It is offered on an object standing for exactly one narrative, which is what the default
 * makes of every object: one Volume, one Story. That is the state a split is *from*. An object
 * nobody has said anything about has nothing to split — the act it wants is
 * `THE_STORY_ACT`, beside this one — and an object already holding several has been split
 * once and would leave the gesture with no single narrative to replace. Both are `null` here,
 * which is what stops a hand-typed `?panel=split` standing this form over an object it cannot
 * act on, exactly as `theActsOnTheObject` stops `?panel=release` over something the house does
 * not hold.
 *
 * **It is not a second guess at the verb's rule.** `splitVolumeIntoStories` refuses more than
 * this hides — a narrative other objects carry, one a Reading went through, one the owner
 * judged — and each of those refusals is prose the owner should *read*, in the panel, beside
 * the titles they just typed. What is decided here is only whether the gesture has a subject:
 * an object with none, or with two, is a press that could never mean anything.
 *
 * The label names what comes out rather than the act's mechanics — three tales, judged apart —
 * because *split* alone is a word about the object and the point is the narratives.
 */
export function theSplitAct(carried: readonly CarriedStory[]): Act | null {
  if (carried.length !== 1) return null;

  return { panel: "split", label: "Split it into the Stories it holds" };
}
