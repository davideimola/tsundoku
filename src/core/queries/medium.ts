import "server-only";

import { asc } from "drizzle-orm";

import { medium } from "../../../db/schema.ts";
import { db, query } from "../db.ts";

// The medium: what a **Pass** went through the Story by — paper, digital, or the console it
// was played on.
//
// It is a **vocabulary and therefore data** (ADR-0022), read here rather than enumerated for
// the same reason Type, Binding and Provenance are: the list grows when a console is
// released, and that is an insert rather than a release. It used to be two values written
// into a check constraint, which looked like the model's own shape only because, in a library
// of printed things, paper and digital are an exhaustive pair.

/** One medium, and whether a pass by it can have gone through an object. */
export type Medium = {
  /** The slug a Pass carries: `paper`, `digital`. */
  id: string;
  /** What the owner reads on screen. */
  name: string;
  /**
   * **Whether a pass by this medium goes through an object**, which today is paper alone.
   *
   * One column carrying what used to be two hand-written rules (ADR-0022). The database
   * refuses a Pass that names a Volume by a medium that does not go through one — the
   * sentence `pass_digital_went_through_no_volume` used to say by naming a value — and the
   * **Pile** reads the same flag to answer *can I start this tonight*: a medium that needs no
   * object needs nothing, and one that does needs the object in the house. Neither rule
   * mentions a value any more, which is what makes them survive a fourth console.
   */
  goesThroughAnObject: boolean;
};

/**
 * Every medium, in the order they are offered in.
 *
 * Written against the schema rather than as SQL for `listBindings`' reason: there is nothing
 * here to derive, only three columns off one table in a stated order.
 */
export async function listMedia(): Promise<Medium[]> {
  return db()
    .select({
      id: medium.id,
      name: medium.name,
      goesThroughAnObject: medium.goesThroughAnObject,
    })
    .from(medium)
    .orderBy(asc(medium.displayOrder));
}

// **WHICH MEDIA A TYPE OFFERS**, which is the one thing `CONTEXT.md` says a Type decides:
// paper and digital for what is printed, the consoles for what is played (#63, ADR-0021,
// ADR-0022). It is why the Type is chosen **before** the medium wherever both are asked for.
//
// **Offered is not allowed.** Nothing here refuses anything and nothing downstream of it
// does either — no foreign key from `pass`, no trigger, no filtering in either door's action.
// A manga passed through on a PS5 is recorded exactly as it always was, because a vocabulary
// is not a taxonomy and the owner is the one holding the record. What this answers is only
// what stands in front of them.
//
// **The mapping is a table** (`type_medium`, 0016), where the neighbouring shape
// `theTypeEachBindingOffers` keeps its two pairs in code. The difference is not taste: that
// map decides for two Bindings out of seven and a row per Binding would misread as *every
// Binding decides*, where here every Type has an answer and every medium stands under some
// Type — and a map in code naming `playstation-5` would make ADR-0022's promise false at the
// one screen it is about, since a console released next year would then be an insert *and* a
// release. Two inserts and no deployment is the point of the vocabulary being data.

/**
 * The media of whatever `m` the surrounding clause has selected, as a picker reads them and in
 * the order they are offered in.
 *
 * A fragment because the statement below says it twice — once for the mapping and once for the
 * fallback beside it — and two aggregates that came to shape a medium differently would be one
 * picker answering in two shapes.
 */
const OFFERED = `jsonb_agg(
  jsonb_build_object('id', m.id, 'name', m.name, 'goesThroughAnObject', m.goes_through_an_object)
  order by m.display_order
)`;

/**
 * The media to offer for one Type, in the order the vocabulary is offered in.
 *
 * **A Type the library has no rule for is answered for anyway, with the whole vocabulary.**
 * That is the stated fallback and it is deliberately not an empty picker: offered is not
 * allowed, so the worst an over-long list costs is a scroll, where a picker with nothing in
 * it costs the write. `null` — no Type chosen yet — takes the same answer for the same
 * reason, and it is what the door stands on with no script running (ADR-0010).
 */
export async function theMediaToOffer(typeId: string | null): Promise<Medium[]> {
  // The batch below answers for every id it is asked about, so there is exactly one key to
  // read and no second fallback to write here: whichever Type this is, offered or unheard of,
  // the answer came back under its own name.
  const offers = await theMediaEachTypeOffers(typeId === null ? [] : [typeId]);
  return offers[typeId ?? ""];
}

/**
 * The same answer for **every Type at once**, keyed by Type id, with the empty string for no
 * Type at all.
 *
 * It exists because of the one place the question is asked *before* it can be answered, which
 * is `theTypeEachBindingOffers`' reason word for word: the Type is a picker standing in the
 * very form the medium is being asked in, so the screen cannot ask the server which Type the
 * owner is about to choose — it is handed the whole table and reads off it as they turn the
 * picker. One statement rather than one per Type.
 *
 * A Type this library does not know is answered for anyway, with the fallback above. Nothing
 * here validates one — what a Type is is `queries/type.ts`, and what refuses a Story naming
 * one that is not is Postgres.
 */
export async function theMediaEachTypeOffers(
  typeIds: readonly string[]
): Promise<Record<string, Medium[]>> {
  // One statement, and the fallback is inside it: the second sub-select is the whole
  // vocabulary, reached by `coalesce` exactly where the first found no mapping row. `''` is
  // unioned in rather than passed by the caller so that the answer always carries the
  // no-Type-yet case, which is the one every picker opens on.
  const rows = await query<{ typeId: string; media: Medium[] }>(
    `select asked.id as "typeId",
            coalesce(
              (select ${OFFERED}
                 from type_medium tm
                 join medium m on m.id = tm.medium_id
                where tm.type_id = asked.id),
              (select ${OFFERED} from medium m)
            ) as media
       from (select distinct unnest($1::text[] || array['']) as id) as asked`,
    [typeIds]
  );

  return Object.fromEntries(rows.map((row) => [row.typeId, row.media]));
}
