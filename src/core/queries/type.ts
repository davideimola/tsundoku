import "server-only";

import { asc } from "drizzle-orm";

import { type as typeTable } from "../../../db/schema.ts";
import { db, query } from "../db.ts";

/**
 * A Type: Manga, Comic, Graphic Novel, Novel, Non-fiction, Play, Videogame.
 *
 * There is no union of string literals here on purpose. Type is a data row, never an
 * enum in code (ADR-0006) — a sixth Type is an insert, and a type that enumerated the
 * five would quietly make it a deployment instead.
 */
export type Type = {
  id: string;
  name: string;
  /**
   * **What going through one of these is called** (0019, #65): `read`, `played`.
   *
   * It is the word alone and never the sentence around it — what the door says is the door's
   * own copy — and it is two words rather than one because *read* is its own past and *play*
   * is not. `verbPast` finishes a pass that happened, `verbBase` an intention to have one.
   *
   * It is on the Type for the reason the media a Type offers are: a videogame is a Story by
   * the same test a manga is (ADR-0021), so what separates them is vocabulary, and vocabulary
   * is data.
   */
  verbPast: string;
  verbBase: string;
};

/** Every Type, in the order they are offered in. */
export async function listTypes(): Promise<Type[]> {
  return db()
    .select({
      id: typeTable.id,
      name: typeTable.name,
      verbPast: typeTable.verbPast,
      verbBase: typeTable.verbBase,
    })
    .from(typeTable)
    .orderBy(asc(typeTable.displayOrder));
}

// **WHICH TYPE A NEW NARRATIVE IS OFFERED**, which is the one thing the field under an
// object's contents asks that is not a title (#47, ADR-0019).
//
// It is asked **once for the whole object** and it stays a property of the narrative: a
// Volume gains no Type column, because *Manga* is what a work is and not how it was bound.
// What this answers is only which of the five stands in the box before the owner touches it.
//
// Two sources, and the order is the judgement. **The Binding wins**, because it is a fact
// about the object in the owner's hands rather than a habit; **the last one used** is the
// fallback, because a library is entered in runs — six Marvel Must Haves in an evening — and
// the sixth guess is right five times.

/**
 * The two pairs a Binding decides, and there are deliberately only two.
 *
 * A tankōbon is the Japanese collected edition and holds a manga; a *spillato* is a
 * saddle-stitched single issue and holds a comic. The other five Bindings decide nothing —
 * a Must Have holds a comic and a hardcover holds a novel as easily as either — and a guess
 * there would be a wrong Type written silently, which is the failure this whole slice is
 * about.
 *
 * By id and never by name, so a Binding renamed in the vocabulary does not quietly stop
 * deciding. It is not a table for the same reason the two pairs are short: a mapping row per
 * Binding would read as *every Binding decides a Type*, and five of the seven do not.
 */
const WHAT_A_BINDING_DECIDES: Readonly<Record<string, string>> = {
  tankobon: "manga",
  stapled: "comic",
};

/**
 * The Type to stand in the box for a narrative about to be recorded inside this object, or
 * `null` where the library has nothing to go on and the owner is asked outright.
 *
 * It takes the **Binding** rather than the Volume, so the same answer is available at the
 * moment an object is catalogued and there is no Volume yet to ask about.
 */
export async function theTypeToOffer(bindingId: string | null): Promise<string | null> {
  return whatABindingDecides(bindingId) ?? (await theLastTypeUsed());
}

/**
 * The same answer for **every Binding at once**, keyed by Binding id, with the empty string
 * for no Binding at all.
 *
 * It exists because of the one place the question is asked *before* it can be answered: at
 * cataloguing time the Binding is a picker standing in the very form the narrative is being
 * named in (#48), so the screen cannot ask about the Binding the owner chose — it has to be
 * handed the whole table and read off it as they turn the picker. One statement rather than
 * one per Binding, and the rule stays where it is: this is the same two sources in the same
 * order as the question above, which is why they are tested against each other.
 *
 * A Binding this library does not know is answered for anyway, with the fallback. Nothing
 * here validates one — what a Binding is is `queries/binding.ts`, and what refuses one that
 * is not is `catalogueVolume`.
 */
export async function theTypeEachBindingOffers(
  bindingIds: readonly string[]
): Promise<Record<string, string | null>> {
  const otherwise = await theLastTypeUsed();
  const offers: Record<string, string | null> = { "": otherwise };

  for (const bindingId of bindingIds) {
    offers[bindingId] = whatABindingDecides(bindingId) ?? otherwise;
  }

  return offers;
}

/** What the object in the owner's hands decides, where it decides anything. */
function whatABindingDecides(bindingId: string | null): string | null {
  return (bindingId === null ? undefined : WHAT_A_BINDING_DECIDES[bindingId]) ?? null;
}

/**
 * The last Type the owner reached for, which is what makes an evening of six Must Haves one
 * choice instead of six. Newest first, and the id breaks a tie between two Stories written in
 * the same instant so that the answer is the same on every read.
 */
async function theLastTypeUsed(): Promise<string | null> {
  const [last] = await query<{ typeId: string }>(
    `select type_id as "typeId" from story order by created_at desc, id desc limit 1`
  );

  return last?.typeId ?? null;
}
