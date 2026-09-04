import type { RecordedVolume } from "@/core/queries/collection";
import type { EditionNote } from "@/core/queries/edition-note";

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
// **The catalogue's own account of the object joined it next, and it is the same argument a
// fourth time.** Writing an ISBN now asks SBN what is published under that number, and the
// three things it can answer are again a distinction the owner cannot re-derive from what is
// on screen: a catalogue with no record of a volume out this month is not a catalogue that was
// down. What it proposes is stood beside what this library kept, field by field — which of the
// two spellings of a title is wanted is the owner's call and is made while looking at both —
// and which fields *differ* is decided here, so a lookup that merely confirms the record reads
// as a confirmation rather than as two boxes asking for a press that changes nothing.
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
    return `Left the house on ${volume.releasedOn}. Its record is kept: the Passes made through it and the Edition note are still true.`;
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
 * this screen's URL (`@/components/drawer`).
 *
 * The names are a closed set because the page reads what was asked for **against** them, the
 * way every filter on every wall is read: `?panel=banana` opens nothing. And it reads it
 * against the **acts** rather than against this list — `theActsOnTheObject` and
 * `theEditionNoteAct` name every panel there is, and the page opens none they did not name —
 * so an `?panel=acquire` hand-typed onto an object already in the house opens nothing either,
 * and the two halves of ADR-0007 cannot be made to disagree by editing an address.
 */
export type Panel = "acquire" | "release" | "isbn" | "cover" | "note";

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
 *
 * **There were six, and two of them are gone** (#47). Recording a narrative the library has
 * never held was a panel of its own, and so was splitting an object into the several tales it
 * holds; both are now the one field under the contents, where a title is typed once and enter
 * decides which of the two it is (ADR-0019). An act that asks for a field is a panel of its
 * own — but a field the owner types into while reading the list it corrects was never a form
 * they opened.
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

/**
 * **What the catalogue of record answered when the ISBN was written**, in the owner's words.
 *
 * Four answers and not one, and it is read against this list rather than trusted: a
 * hand-typed `?from=banana` says nothing at all, exactly as `?panel=banana` opens nothing.
 *
 * The three that are answers are three different things for the owner to do, and they are the
 * one door's three sentences said from the other end (`../../add/door.ts`). *A record* means
 * read it against the object in your hand — it is below, and none of it is written yet. *No
 * record* means there is nothing to correct the object from, and is ordinary rather than
 * wrong: SBN holds legal deposit, and a volume out this month may simply not be in it. *Could
 * not be asked* means the number is recorded and the account of it is not, and that pressing
 * again may well work — which a sentence about an absent book would have quietly denied.
 */
export function whatTheCatalogueAnswered(
  said: string | undefined,
  because?: string
): string | null {
  switch (said) {
    case "a-record":
      return "The ISBN is recorded, and SBN has a record under it. What the catalogue says is below: read it against the object in your hand, because nothing of it is written until you press.";
    case "no-record":
      return "The ISBN is recorded. SBN has no record under it, so there is nothing here to correct the object from — ordinary rather than wrong: a volume out this month may not be in the national catalogue yet.";
    case "unanswered":
      return `The ISBN is recorded, and nothing else was: ${
        because ?? "SBN could not be reached."
      } Pressing again may well reach it — its backend goes down and comes back.`;
    default:
      return null;
  }
}

/** One field the catalogue named, as the panel stands it beside the record. */
export type Proposed = {
  /** The field of the Volume it is, which is what the form calls it. */
  readonly field: "title" | "publisher";
  /** What it is called where the owner reads it. */
  readonly label: string;
  /** What the catalogue says, which is what the box arrives filled in with. */
  readonly says: string;
  /** What stands on this library's record, in a clause under the box. */
  readonly against: string;
  /** Whether the two are different, which is what the panel leads with. */
  readonly differs: boolean;
};

/**
 * **What the catalogue offers to correct, field by field** — and this is the judgement the
 * chosen shape of that panel rests on, so it is a function rather than two comparisons in a
 * render.
 *
 * Two fields, because two are all a `BookRecord` has: a title and a publisher. Everything else
 * the object carries — the Binding, the language, the edition line, the position in its line —
 * is not in the answer at all and is therefore **not touched**, which is `amendVolume`'s own
 * rule rather than this screen's: an amendment names the fields it proposes and leaves the
 * rest standing.
 *
 * Three things it decides, in the order they matter:
 *
 * **A field the catalogue did not name is not offered.** A record with no readable imprint
 * line carries no publisher, and an empty box standing there would read as *SBN says this
 * object has no publisher* — which is a fact nobody stated and, written, would be a fact lost.
 *
 * **It says what stands on the record beside what is proposed**, because the owner is about to
 * overwrite their own catalogue with a librarian's field and the two are not always
 * improvements on each other: `One piece 100` is legal deposit's spelling of a title the spine
 * prints as *One Piece 100*, and which of those this library wants is the owner's call, made
 * while looking at both.
 *
 * **And it says which of them actually differ**, so a lookup that confirms the record reads as
 * a confirmation rather than as work to do. That is the ordinary case once an ISBN has been
 * scanned twice, and a panel that offered two boxes identical to the two facts behind it would
 * be asking for a press that changes nothing.
 */
export function whatTheCatalogueOffers(
  volume: Pick<RecordedVolume, "title" | "publisher">,
  said: { title?: string; publisher?: string }
): readonly Proposed[] {
  return [
    { field: "title", label: "Title", says: said.title, recorded: volume.title },
    { field: "publisher", label: "Publisher", says: said.publisher, recorded: volume.publisher },
  ].flatMap(({ field, label, says, recorded }) =>
    says
      ? [
          {
            field: field as Proposed["field"],
            label,
            says,
            against:
              says === recorded
                ? "The same as what the record already says."
                : `The record says ${recorded}.`,
            differs: says !== recorded,
          },
        ]
      : []
  );
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
