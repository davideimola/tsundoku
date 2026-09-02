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
