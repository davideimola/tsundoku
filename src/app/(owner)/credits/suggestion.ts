// What a suggested name is once it has crossed the wire, and the reason it is a module of
// its own: the client component that draws the list and the Server Function that fills it
// have to agree on one shape, and neither of them may import the other's.
//
// `./picker.tsx` is `"use client"`; `./actions.ts` reaches `@/core/queries/credit`, which is
// `server-only` and a build error inside a client bundle. So the shape lives here, in a file
// that is neither — plain types, no directive, nothing imported. `../find/suggestion.ts` is
// the same file for the same reason, and the two are deliberately not one: the finder answers
// with records to open, and this answers with **a spelling to type**.
//
// It is **already drawn**. A row arrives as the name and the one line under it, so the list
// on the other side holds no derivation of its own — which is what makes it a component with
// nothing to test (#28) rather than one that has been left untested.

/** One person the library already credits, as a row under the field. */
export type SuggestedName = {
  /**
   * The spelling that is already in the library, and what choosing the row types into the
   * field.
   *
   * **The name is the identity here, and that is the whole mechanism.** A Credit is written
   * with a name and never with a Person's id (ADR-0012), and the name is unique on
   * `lower(name)` — so a row that puts the existing spelling into the field credits the
   * person who is already there, by the same path a name typed in full takes. There is no id
   * on this shape because sending one would be a second way to the same verb, and only the
   * scripted half would have it.
   */
  name: string;
  /**
   * The roles they already hold, said the way the Credits screen says them — *Writer ·
   * Artist*. It is what tells two people of similar names apart, and it is a person's roles
   * anywhere rather than on this Story: they are about to be given one here.
   */
  qualifier: string;
};
