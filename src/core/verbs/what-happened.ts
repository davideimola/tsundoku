import "server-only";

import { FIRST_HAND } from "../queries/provenance.ts";
import { Refusal } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { acquireVolume, type CataloguedVolume, catalogueVolume } from "./collection.ts";
import { recordReading } from "./reading.ts";
import { placeVolumeInSeries } from "./series.ts";
import { createStory } from "./story.ts";
import {
  recordVolumeCarriesStory,
  recordVolumeNoLongerCarriesStory,
} from "./story-to-volume.ts";
import { openWant } from "./want.ts";
import { openWish } from "./wish.ts";

// THE ONE DOOR: the owner says what happened, and the library works out what to record (#45).
//
// **A file named after the sentence rather than after an area**, which is the exception
// `../README.md` states for `queries/finder.ts` and `queries/isbn.ts` and the same exception
// exactly: what is written here is not the Collection's, not the Story's and not the Want's —
// it is one act that reaches all three, and putting it in any of those files would make that
// area's verb write two other areas' rows.
//
// **What it replaces.** Recording a Volume, recording its narrative and linking the two used
// to be three acts across two screens: `catalogueVolume` inserted into `volume` and nothing
// else, `createStory` was a second door on a second wall, and the picker that joined them was
// on a third. Nobody walks three doors reliably, and the drift is on the shelves — twenty-two
// Volumes against twenty-one Stories, hand-kept and already out of step (#34).
//
// **The rule that makes one door possible is `CONTEXT.md`'s**: *a Story is what you would give
// a score to*, and at the moment of cataloguing the owner is **not asked to decide it: they are
// shown the answer already written**. So they are still never asked whether they are creating a
// Story or a Volume, because the answer is always *both*.
//
// **The default is no longer written here, and that is the whole of #48** (ADR-0019). This file
// used to mint a Story from the volume's *title* whenever no line had named a work — the one
// place *one Volume, one Story* was written down — and it fired exactly where it was least
// likely to be true: with a line the object joined the work the line publishes, so the only
// objects the default ever reached were the omnibus, the graphic novel and the novel. On a
// novel it is right. On *Batman: Il lungo Halloween* it minted a narrative named after the
// jacket, for an object holding three tales named nothing like it.
//
// What replaces it is not its removal. **The two sentences about an object now name the
// narratives it holds**, and the screen is what arrives with the default standing in it — the
// Story the line publishes where there is a line, the volume's own title where there is not —
// so the ordinary case still costs nothing and the omnibus costs one gesture. What this verb
// gained is a list and one refusal: **an object the owner catalogues with their own hands
// carries at least one narrative**, because when their own hands are on it they have the object
// or its photograph in front of them. An object proposed from outside may carry none, and that
// door is the Inbox's rather than this one's.
//
// **The two sentences about a narrative are untouched**, and it is not the same default: *I read
// it* and *I want to read it* have no object at all, so the title the owner typed **is** the
// narrative rather than a guess about what an object holds.
//
// **The owner's own arrow is still read, and it can now be overruled** (#39). Where the Series
// says which Story it publishes, `placeVolumeInSeries` attaches that work to the object joining
// the line — a fact the owner stated once, written by that verb inside its own placement. The
// screen shows it as the row already standing, and where the owner takes that row off this verb
// takes the link back off with it: what an object carries is what was named in the submission,
// and a row shown and removed that came back anyway would make the shown default a lie.
//
// **It composes the verbs and writes no SQL of its own but one read.** Every refusal the owner
// can meet here — a Binding this library does not know, a blank publisher, a position of the
// line already in the house, a Type that is not one — is the prose the area's own verb wrote,
// and this file has no copy of it to keep true. The single statement it does own asks *what
// does this object already carry*, which is a question no existing verb answers.
//
// **One verb is one transaction** (`../transaction.ts`), and here that is the whole of the
// point: half of this is worse than none. A Volume with no narrative reads as an object nobody
// has opened, a Story nothing carries reads as something read digitally, and an acquisition
// without either is a row about nothing. So they land together or they do not land.
//
// **Not a tool, and it never will be.** It creates a Story, so an assistant may only propose
// one and the door for that is the Inbox (ADR-0005). Opening a Want on a Story that exists is
// MCP's, and it is `want.ts`; opening a Wish on a Volume that exists is `wish.ts` and the
// shopping list's own drawer. What is here is the case neither of those covers — the object
// nobody has recorded yet, held in a shop and not paid for.

/**
 * The four sentences the door takes, and there is no fifth.
 *
 * **They are two pairs.** *Bought* and *wished* are about an object — one paid for and one
 * not — and both catalogue a Volume, because the library's own rule is that being catalogued
 * is not being owned (ADR-0007): the Wish names a Volume the owner does not have, and that is
 * the whole reason a Volume can exist without an acquisition. *Read* and *wanted* are about a
 * narrative and need no object at all.
 */
export type WhatWasSaid = "bought" | "read" | "wanted" | "wished";

/**
 * What an object is, whatever the owner said about it: `CataloguedVolume` **without its
 * title**.
 *
 * Without, because the title is the one thing the door already heard — it is what the owner
 * typed or what the barcode came back with — and a shape that asked for it twice would be a
 * shape two callers could disagree with themselves in.
 */
type TheObjectItself = Omit<CataloguedVolume, "title"> & {
  /**
   * **The narratives inside it, as the owner named them**, and at least one of them.
   *
   * This is where the silent default went (ADR-0019). It is a list because *L'uomo che ride*
   * holds three tales judged apart, and it is required because the two sentences that reach
   * this shape are the owner's own hands on an object they are looking at — an object
   * carrying nothing is a gap the library shows, and the door it arrives through is the
   * Inbox's rather than this one's.
   *
   * Named in the order they were said, which is the order they are recorded in and no order
   * at all afterwards: what an object holds is read back by title.
   */
  holds: readonly ANarrativeItHolds[];
};

/**
 * One narrative inside an object: **one the library already holds, or a title it has never
 * heard of.**
 *
 * The two are one gesture on the screen — the same field searches and mints — and they are two
 * things here because only one of them creates a record. A Story named by id is linked; a title
 * is minted and then linked, in this same transaction.
 */
export type ANarrativeItHolds =
  /** A Story the library holds, by id: the row the field found, or the one the line publishes. */
  | { readonly storyId: string }
  /** A title the library does not hold, to be minted inside this object. */
  | { readonly title: string };

/**
 * The object in the owner's hands: what it is, that it came home, and where it stands in a
 * line.
 *
 * It is `TheObjectItself` plus the two facts an acquisition carries, because *I bought it* is
 * one sentence about an object and a day: the two acts ADR-0007 separated coincide precisely
 * here, which is what the drawer that asked for both in one breath already knew — and they
 * coincide **only** here, which is what the sentence beside it demonstrates.
 */
export type TheObjectInHand = TheObjectItself & {
  /** The day it came home, `YYYY-MM-DD`. Absent where the receipt is gone. */
  acquiredOn?: string | null;
  /** What was paid, as the owner typed it: `6,50` or `6.50`. */
  pricePaid?: string | null;
  /**
   * Which line it is a position of, where it is one.
   *
   * **This is where the arrow is read.** A line that names a Story hands the object that
   * narrative, and no Story is minted; a line that names none is the ordinary case and the
   * default applies.
   */
  inSeries?: { seriesId: string; number: number } | null;
};

/**
 * The object the owner means to buy: what it is, how soon, and what it costs where they found
 * it.
 *
 * **It is the same object as `TheObjectInHand` with the acquisition swapped for the
 * intention**, and the swap is the whole difference between the two sentences. Nothing here
 * says the object came home — a Wish names a Volume that is catalogued and not owned, which is
 * the pair of facts ADR-0007 separated and the reason this sentence needs no new column
 * anywhere.
 *
 * The prices are two and not one because a shop is two numbers: what it should cost, decided
 * at a desk, and what it costs on the shelf in front of the owner.
 *
 * **Neither the line nor the position is here, and that is #48's doing.** A *position* of a
 * Series is filled by an object on the shelf — the ledger is measured against what is in the
 * house, and the schema says the same thing in `volume_in_a_series_has_a_number` — so a volume
 * nobody owns yet holds neither half, and there was never a placement to make. What the line
 * *was* read for here was its arrow, so that a wished-for twenty-second tankōbon did not mint a
 * twenty-second narrative (#39); the owner now names that work themselves, in `holds`, off a
 * row the screen stood in front of them. So this sentence has nothing left to do with a Series:
 * the picker still decides what the row says, and what arrives here is the answer rather than
 * the question.
 */
export type TheObjectToBuy = TheObjectItself & {
  /** 1 next, 2 soon, 3 someday — the shopping list's own three, and the picker's. */
  priority: number;
  /** What it should cost, as the owner typed it: `15,00`. */
  targetPrice?: string | null;
  /** What it costs where they found it: `12,90`. */
  priceFound?: string | null;
  /** Where that price was — a name the owner reads, not a vocabulary. */
  shop?: string | null;
};

/**
 * What the owner said about a title, and the whole of it.
 *
 * **The object belongs to the two sentences that are about one, and the type says so.** *I
 * bought it* and *I want to buy it* are about an object by definition — the first has paid for
 * it and the second has not; *I read it* and *I want to read it* are about a narrative and need
 * no object at all — which is not a limitation but the case that made this door worth building,
 * since a digital read and a borrowed one had nowhere to be said without inventing a Volume
 * nobody owns (ADR-0001, `CONTEXT.md`).
 */
export type WhatHappened = { title: string; typeId: string } & (
  | { said: "bought"; object: TheObjectInHand }
  | { said: "wished"; object: TheObjectToBuy }
  | { said: "read" | "wanted" }
);

/** What the library recorded, so the door knows where to land the owner. */
export type WhatWasRecorded = {
  /**
   * The narratives the sentence ended with, in the order they were named.
   *
   * **A list rather than one**, since an object names what it holds: *L'uomo che ride* ends
   * with three. The two sentences about a narrative end with exactly one, which is the title
   * itself, and it is the first and only entry.
   */
  storyIds: string[];
  /** The object, where the sentence had one. */
  volumeId: string | null;
  /**
   * Which of them **appeared here** rather than already standing in the library.
   *
   * The screen says which, because they are two different things to have happened: *Slam Dunk
   * 21 is on the shelf and is Slam Dunk* is not the same sentence as *there is a new narrative
   * in the library*. It is a list for the reason above it — an omnibus may name one work the
   * library held and two it did not, in one submission.
   */
  appeared: string[];
};

/** The prose for a sentence with nothing in it. Every other refusal is a verb's own. */
const NOTHING_WAS_SAID = "Say what it is called first — a title, or the barcode on the back.";

/**
 * The prose for an object the owner catalogued and said nothing about the inside of.
 *
 * **The one refusal this file owns beside the blank title**, and it is ADR-0019's consequence
 * rather than a rule about a table: nothing in the schema refuses an object carrying nothing —
 * one proposed from outside arrives with none, and one catalogued from a photograph may wait
 * for its contents. What is refused is the *owner's own hands* doing it, because they are
 * looking at the object.
 */
const NOTHING_INSIDE_IT =
  "An object you catalogue by hand carries at least one narrative. Name what is inside it — the line's work, its own title, or whatever the library already holds.";

/**
 * Say what happened to a title, and let the library work out what to record.
 *
 * *I bought it* records the object, says it is in the house, places it in its line where the
 * owner named one, and records the narratives they said are inside it. *I want to buy it*
 * records the same object and opens a Wish on it instead of an acquisition: it is catalogued
 * and it is not owned, which is the pair of facts ADR-0007 exists to keep apart. *I read it*
 * records a Reading and no object. *I want to read it* opens a Want. All four end with a Story,
 * because a Story is the spine and nobody creates one on purpose.
 *
 * Returns what was recorded. Refused by the verbs it composes, in their own words, and by the
 * two sentences this file owns: a title with nothing in it, and an object the owner catalogued
 * without saying what is inside it.
 */
export async function sayWhatHappened(happened: WhatHappened): Promise<WhatWasRecorded> {
  const title = happened.title.trim();
  if (title === "") throw new Refusal("invalid", NOTHING_WAS_SAID);

  // Refused before anything is opened, because it is a sentence about what was said rather
  // than about what the database holds — and the transaction below has nothing to roll back.
  if (
    (happened.said === "bought" || happened.said === "wished") &&
    happened.object.holds.length === 0
  ) {
    throw new Refusal("invalid", NOTHING_INSIDE_IT);
  }

  return transaction(async (run) => {
    let volumeId: string | null = null;
    const storyIds: string[] = [];
    const appeared: string[] = [];

    // **The two sentences that are about an object catalogue one, and only one of them says it
    // came home.** What a thing is does not depend on having been paid for — the same six facts
    // either way — so the cataloguing is written once, and what parts the two sentences is the
    // single act that follows it: an acquisition, or a Wish.
    if (happened.said === "bought" || happened.said === "wished") {
      const object = happened.object;
      const catalogued = await catalogueVolume({ ...object, title }, run);
      volumeId = catalogued.id;

      if (happened.said === "wished") {
        // **The whole of what makes this sentence different, and it is one act.** The Wish names
        // the object just catalogued and nothing else follows: no acquisition, so the object is
        // known and not owned (ADR-0007), and no Want either — wanting the object and wanting to
        // read the work are the pair `CONTEXT.md` keeps apart, and saying one of them here would
        // be this door deciding the other on the owner's behalf.
        await openWish(
          {
            volumeId: catalogued.id,
            priority: happened.object.priority,
            targetPrice: happened.object.targetPrice,
            priceFound: happened.object.priceFound,
            shop: happened.object.shop,
          },
          run
        );
      }

      /**
       * What the placement's arrow attached, where there was a placement and the line names a
       * work. It is what the row already standing in the screen's list was, so it is usually
       * named again below and nothing comes of this; where the owner took that row off, this
       * is the link that has to go with it.
       */
      let theArrowAttached: string | null = null;

      if (happened.said === "bought") {
        // Two acts in one breath, and this is the one place they genuinely coincide (ADR-0007):
        // the object is in the house because the owner has just paid for it.
        await acquireVolume(
          {
            volumeId: catalogued.id,
            acquiredOn: happened.object.acquiredOn,
            pricePaid: happened.object.pricePaid,
          },
          run
        );

        // **The placement is read for its arrow**, which is the sentence above doing by hand
        // what this one gets for free — and the reason that sentence has to: a position of a
        // line is filled by an object on the shelf, so only what came home is placed.
        if (happened.object.inSeries) {
          const inSeries = happened.object.inSeries;
          await placeVolumeInSeries(
            { volumeId: catalogued.id, seriesId: inSeries.seriesId, number: inSeries.number },
            run
          );

          // **Read back rather than reasoned about.** The placement attaches the line's Story
          // where the line names one, and asking the row is how this verb finds out — a second
          // copy of the condition here would be a rule in two files, and the one that matters is
          // `series.story_id`, which the placement already read inside this transaction. Nothing
          // else has written a link yet, so what is in there is the arrow's and only the arrow's.
          theArrowAttached = await theStoryTheObjectAlreadyCarries(catalogued.id, run);
        }
      }

      // **The narratives, as the owner named them** (ADR-0019). A Story the library holds is
      // linked; a title it has never heard of is minted first and linked after, in this same
      // transaction — which is what `createStoryCarriedBy` does for one narrative on an object
      // that already exists, and what cannot be delegated to it here because the object is
      // being written in this same breath.
      for (const named of happened.object.holds) {
        if ("storyId" in named) {
          storyIds.push(named.storyId);
          await recordVolumeCarriesStory(volumeId, named.storyId, run);
          continue;
        }

        const minted = await createStory({ title: named.title, typeId: happened.typeId }, run);
        storyIds.push(minted);
        appeared.push(minted);
        await recordVolumeCarriesStory(volumeId, minted, run);
      }

      // **The row the owner took off, taken off.** The arrow is the owner's own fact and it is
      // read exactly as before; what is new is that the screen showed them the row it produces,
      // and a row shown and removed that came back anyway would make the shown default a lie.
      // It is not a set being reconciled — this is one link, written by one statement in this
      // same transaction, on an object nobody has seen yet.
      if (theArrowAttached && !storyIds.includes(theArrowAttached)) {
        await recordVolumeNoLongerCarriesStory(volumeId, theArrowAttached, run);
      }
    }

    // **The two sentences about a narrative, where the title *is* the work.** No object, so
    // nothing was shown and nothing is guessed: the owner typed the name of the thing they read
    // or mean to read, and this is it.
    if (happened.said === "read" || happened.said === "wanted") {
      const minted = await createStory({ title, typeId: happened.typeId }, run);
      storyIds.push(minted);
      appeared.push(minted);
    }

    const [storyId] = storyIds;
    if (!storyId) throw new Error("sayWhatHappened ended with no narrative");

    if (happened.said === "read") {
      // **A pass through no object, which is what *I read it* means at this door.** There is no
      // Volume to name — the owner did not say they bought it — and the model's own reading of
      // a Reading with no object is the digital one (`CONTEXT.md`: an ebook is a Reading with a
      // digital medium and no Volume). A borrowed paperback is the same three facts with a
      // different medium, and correcting that is one press on the Story's own page; inventing a
      // fourth question at this door to tell the two apart is what the door exists not to do.
      await recordReading(
        { storyId, medium: "digital", provenanceId: FIRST_HAND, outcome: "finished" },
        run
      );
    }

    if (happened.said === "wanted") {
      // Nothing else follows from it, which is the whole point of a Want: no Path, no order,
      // no Volume, no Wish (#35).
      await openWant(storyId, run);
    }

    return { storyIds, volumeId, appeared };
  });
}

/** The narrative this object is already recorded as carrying, where a line handed it one. */
async function theStoryTheObjectAlreadyCarries(
  volumeId: string,
  run: Executor
): Promise<string | null> {
  const [carried] = await run<{ storyId: string }>(
    `select story_id as "storyId" from volume_story where volume_id = $1 limit 1`,
    [volumeId]
  );

  return carried?.storyId ?? null;
}
