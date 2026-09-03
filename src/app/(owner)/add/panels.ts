// THE ADDRESSES THIS SCREEN HAS — what the door carries between its two halves, and the one
// field a camera writes into. **Named here because more than one file spells each of them**,
// which is the Collection's own argument for the same file (`../collection/panels.ts`), and
// because both fail silently when two files disagree about them.
//
// A field id composed by hand in the scanner and by the page is a camera that reads a barcode
// and writes it nowhere. A parameter spelled one way in `page.tsx` and another in `actions.ts`
// is a title the owner typed arriving as nothing. Neither is caught by a type, because both are
// strings that are correct on their own and wrong only in relation to each other.
//
// **The three panels are not here**, and that is deliberate: `?panel=bought` is `WhatWasSaid`,
// the model's own word, and `THE_SENTENCES` in `./door.ts` is the list the page reads a panel
// against. A second copy of those three strings here would be the same vocabulary spelled twice
// and drifting once.

/** What the owner typed or scanned, on its way back into the one field. */
export const ASKED = "asked";

/**
 * The field the scanner writes into, as **one string rather than two halves to compose**.
 *
 * The Collection's version of this was a prefix and a name that the page joined into an id, and
 * the joining was the thing that could drift. Here the page spends `id` and the scanner is
 * handed `id`, so there is one value and nothing to keep in step — which is the stronger fix and
 * the reason there is no assertion about it.
 */
export const THE_FIELD = { name: ASKED, id: "door-asked" } as const;

/**
 * **The two fields the narratives inside an object arrive in**, and they are repeated rather
 * than one: the object half of this door names as many as the owner said, and a name spelled
 * one way by the form and another by the action is a narrative quietly dropped from an object
 * that was catalogued anyway (which is the whole failure this file exists against).
 *
 * Two fields and not one encoded field, because there are two kinds of answer and only one of
 * them creates a record: a Story the library holds arrives as an id, and a title it has never
 * heard of arrives as prose. A single field with a prefix to parse would put a parsing rule
 * between the owner's press and the transaction, on a value that can contain anything a title
 * can contain.
 */
export const THE_NARRATIVES_INSIDE = {
  /** A Story the library already holds, by id — the row the field found, or the line's work. */
  story: "holdsStory",
  /**
   * What that Story is called, beside the id and in the same order.
   *
   * It is carried so that a **refused** press can put the rows back as the owner read them: a
   * refusal is a sentence about one field and every other answer was right, and a list of
   * three narratives that came back as three uuids would be worse than a list that came back
   * empty. Nothing is ever written from it — the id is the fact, and this is the word.
   */
  storyTitle: "holdsStoryTitle",
  /** A title the library does not hold, to be minted inside the object at submit. */
  newStory: "holdsNewStory",
} as const;
