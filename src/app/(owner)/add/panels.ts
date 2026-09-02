// THE ADDRESSES THIS SCREEN HAS — the three panels, the two things the door carries between
// its halves, and the one field a camera writes into. **Named here because more than one file
// spells each of them**, which is the Collection's own argument for the same file
// (`../collection/panels.ts`), and because every one of these strings fails silently when two
// files disagree about it.
//
// A panel name typed one way in `page.tsx` and another in `actions.ts` is a refused write
// coming back to a screen with no drawer on it and the owner's typing gone, with no error
// anywhere. A field id composed by hand in the scanner and by the page is a camera that reads
// a barcode and writes it nowhere. Neither is caught by a type, because all of them are
// strings that are correct on their own and wrong only in relation to each other.

import type { WhatWasSaid } from "@/core/verbs/what-happened";

/**
 * The three panels, and they are the model's own three words rather than a second vocabulary
 * invented here.
 *
 * That is worth stating: `?panel=bought` is `WhatWasSaid`, so the address the owner is standing
 * at and the sentence the verb is about are one value, switched on once. A screen that
 * translated them into `buy`/`have-read`/`to-read` would be the same three cases spelled twice
 * and drifting once.
 */
export const PANELS = ["bought", "read", "wanted"] as const satisfies readonly WhatWasSaid[];

/** What the owner typed or scanned, on its way back into the one field. */
export const ASKED = "asked";

/**
 * The field the scanner writes into: the prefix the page composes an id from, and the id that
 * composition produces.
 *
 * Both halves are named here because the scanner is handed the *id* while the form is handed
 * the *prefix*, and `${idPrefix}-${name}` is what joins them — two files composing one string,
 * in opposite directions. `./door.test.ts` asserts they still meet.
 */
export const THE_FIELD = { prefix: "door", name: ASKED, id: `door-${ASKED}` } as const;
