import "server-only";

import { FIRST_HAND } from "../queries/provenance.ts";
import { Refusal } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { acquireVolume, type CataloguedVolume, catalogueVolume } from "./collection.ts";
import { recordReading } from "./reading.ts";
import { placeVolumeInSeries } from "./series.ts";
import { createStory } from "./story.ts";
import { recordVolumeCarriesStory } from "./story-to-volume.ts";
import { openWant } from "./want.ts";

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
// a score to*, and it is **never asked at cataloguing time** — the default is one Volume, one
// Story. So the owner is never asked whether they are creating a Story or a Volume, because
// the answer is always *both*, and the two gestures that carry the exceptions (split, merge)
// are said later about records that already exist.
//
// **The one thing that overrides the default is the owner's own arrow** (#39): where the Series
// says which Story it publishes, an object joining that line joins the work already there
// rather than minting a twenty-first narrative. That is not this verb deciding — it is
// `placeVolumeInSeries` reading a fact the owner stated once, and this verb noticing that a
// Story is already carried and not making a second one.
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
// MCP's, and it is `want.ts`.

/** The three sentences the door takes, and there is no fourth. */
export type WhatWasSaid = "bought" | "read" | "wanted";

/**
 * The object in the owner's hands: what it is, that it came home, and where it stands in a
 * line.
 *
 * It is `CataloguedVolume` **without its title** plus the two facts an acquisition carries.
 * Without, because the title is the one thing the door already heard — it is what the owner
 * typed or what the barcode came back with — and a shape that asked for it twice would be a
 * shape two callers could disagree with themselves in. And plus, because *I bought it* is one
 * sentence about an object and a day: the two acts ADR-0007 separated coincide precisely here,
 * which is what the drawer that asked for both in one breath already knew.
 */
export type TheObjectInHand = Omit<CataloguedVolume, "title"> & {
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
 * What the owner said about a title, and the whole of it.
 *
 * **The object belongs to one of the three sentences and the type says so.** *I bought it* is
 * about an object by definition; *I read it* and *I want to read it* are about a narrative and
 * need no object at all — which is not a limitation but the case that made this door worth
 * building, since a digital read and a borrowed one had nowhere to be said without inventing a
 * Volume nobody owns (ADR-0001, `CONTEXT.md`).
 */
export type WhatHappened = { title: string; typeId: string } & (
  | { said: "bought"; object: TheObjectInHand }
  | { said: "read" | "wanted" }
);

/** What the library recorded, so the door knows where to land the owner. */
export type WhatWasRecorded = {
  /** The narrative the sentence was about, minted here or already the line's. */
  storyId: string;
  /** The object, where the sentence had one. */
  volumeId: string | null;
  /**
   * Whether the Story appeared here, or the object joined the work its line already publishes.
   *
   * The screen says which, because they are two different things to have happened: *Slam Dunk
   * 21 is on the shelf and is Slam Dunk* is not the same sentence as *there is a new narrative
   * in the library*.
   */
  storyAppeared: boolean;
};

/** The prose for a sentence with nothing in it. Every other refusal is a verb's own. */
const NOTHING_WAS_SAID = "Say what it is called first — a title, or the barcode on the back.";

/**
 * Say what happened to a title, and let the library work out what to record.
 *
 * *I bought it* records the object, says it is in the house, places it in its line where the
 * owner named one, and the narrative appears by itself. *I read it* records a Reading and no
 * object. *I want to read it* opens a Want. All three end with a Story, because a Story is the
 * spine and nobody creates one on purpose.
 *
 * Returns what was recorded. Refused by the verbs it composes, in their own words.
 */
export async function sayWhatHappened(happened: WhatHappened): Promise<WhatWasRecorded> {
  const title = happened.title.trim();
  if (title === "") throw new Refusal("invalid", NOTHING_WAS_SAID);

  return transaction(async (run) => {
    let volumeId: string | null = null;
    let storyId: string | null = null;

    if (happened.said === "bought") {
      const object = happened.object;

      const catalogued = await catalogueVolume({ ...object, title }, run);
      volumeId = catalogued.id;

      // Two acts in one breath, and this is the one place they genuinely coincide (ADR-0007):
      // the object is in the house because the owner has just paid for it.
      await acquireVolume(
        { volumeId, acquiredOn: object.acquiredOn, pricePaid: object.pricePaid },
        run
      );

      if (object.inSeries) {
        await placeVolumeInSeries(
          { volumeId, seriesId: object.inSeries.seriesId, number: object.inSeries.number },
          run
        );

        // **The arrow, read back rather than reasoned about.** The placement attaches the
        // line's Story where the line names one, and asking the row is how this verb finds out
        // — a second copy of the condition here would be a rule in two files, and the one that
        // matters is `series.story_id`, which the placement already read inside this
        // transaction.
        storyId = await theStoryTheObjectAlreadyCarries(volumeId, run);
      }
    }

    // **The default, and the only place it is written down**: one Volume, one Story. It
    // applies unless the line has already answered, which is the single exception and the
    // owner's own (#39).
    const appeared = storyId === null;
    if (storyId === null) {
      storyId = await createStory({ title, typeId: happened.typeId }, run);
      if (volumeId) await recordVolumeCarriesStory(volumeId, storyId, run);
    }

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

    return { storyId, volumeId, storyAppeared: appeared };
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
