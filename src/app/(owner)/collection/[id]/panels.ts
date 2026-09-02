// THE ADDRESSES THIS SCREEN HAS — the one field a camera writes into, and what the catalogue's
// answer is carried back in. **Named here because more than one file spells each of them**,
// which is `../panels.ts`'s argument for itself and `../../add/panels.ts`'s, and because every
// one of these strings fails silently when two files disagree about it.
//
// The two failures, both of them quiet:
//
//   A field id composed by hand in the scanner and by the page is a camera that reads a
//   barcode perfectly and writes it nowhere. The scanner says so out loud when it cannot find
//   the field (`@/components/scan`), which is the only reason that one is merely bad rather
//   than invisible.
//
//   A parameter spelled one way in `actions.ts` and another in `page.tsx` is a catalogue
//   record that was fetched, redirected with, and then read as absent — a panel that comes
//   back with nothing in it and no error anywhere.
//
// Neither is caught by a type, because both are strings that are correct on their own and
// wrong only in relation to each other.
//
// **The panels themselves are not here**, deliberately: they are the *acts* an object has, and
// `./standing.ts` names them beside the labels of the presses that open them. A second copy of
// those seven strings here would be one vocabulary spelled twice and drifting once.

/**
 * The ISBN field, as **one string rather than two halves to compose** — the page spends `id`
 * and hands the scanner `id`, so there is one value and nothing to keep in step.
 *
 * `name` is what the Server Function reads off the form and, on the way back from a refusal,
 * what the typed digits ride in: a misread digit is then one keystroke from right rather than
 * a field to fill in again standing in a shop.
 */
export const THE_ISBN_FIELD = { name: "isbn", id: "volume-isbn" } as const;

/**
 * **What the catalogue of record answered, on its way back into the panel that asked it.**
 *
 * The write and the lookup are one press: the ISBN is recorded, SBN is asked what is published
 * under it, and what it said comes back in the address so the panel can stand the catalogue's
 * account of the object beside the one this library kept. Nothing of it is written by that
 * press — these four parameters *are* the proposal, and the second form in the panel is where
 * the owner accepts as much of it as they want.
 *
 * `title` and `publishedBy` are spelled as the one door spells them (`../../add/door.ts`), and
 * `publishedBy` is deliberately not `publisher`: the form in the panel has a field of that
 * name, and a prefill sharing a name with a field is a value whose provenance the page has to
 * guess at.
 *
 * `because` is the same parameter the cover run answers in. That is safe rather than sloppy —
 * each is read only beside its own key, and no redirect on this screen sets both — and it is
 * one word for one thing: why a source could not be asked.
 */
export const WHAT_THE_CATALOGUE_SAID = {
  /** Which of the three answers it was: `a-record`, `no-record`, `unanswered`. */
  said: "from",
  /** The title on the record, where there is a record. */
  title: "title",
  /** The publisher out of its imprint line, where the record names one. */
  publishedBy: "publishedBy",
  /** Why the catalogue could not be asked, on `unanswered` alone. */
  because: "because",
} as const;
