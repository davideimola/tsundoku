import "server-only";

import { query } from "../db.ts";

// **What in this library is called that?** — the one question the finder asks, and the
// reason it is a file of its own rather than a question added to one of the areas.
//
// Every other file in here answers for an area: `collection.ts` for the objects,
// `story.ts` for the narratives, `series.ts` for the publishers' lines. This one answers
// across all of them at once, which is exactly why it could not live in any of them: a
// cross-entity search put in `story.ts` would be a Story query that reads five tables, and
// put in `library.ts` it would be a figure that is not a figure. The area it answers for is
// *being called something*, and the vocabulary has a word for the thing that asks —
// the finder (#25).
//
// **Both doors get it, and that is the point of it being here.** The owner's field in the
// shell, the `/find` screen behind it and the MCP door's `finder_search` are three thin
// callers of this one function (ADR-0002). If the owner's screen could reach a record the
// assistant cannot, then one of the two is lying about the library the moment they disagree
// — and the finder is the surface where the owner would notice.

/**
 * The kinds of record a name can belong to.
 *
 * Five, and they are the five things in this library that **have a name the owner would
 * type**. A Reading, a Rating, an acquisition and a Wish are not here and should not be:
 * none of them is called anything, and each is reached through the record that is.
 */
export type FoundKind = "story" | "volume" | "series" | "person" | "path";

/** One record the finder reached, and the little it takes to tell it apart and open it. */
export type Finding = {
  kind: FoundKind;
  /** The record's own id, so a caller lands on the record rather than on a search. */
  id: string;
  /** What it is called: a title, a name. */
  name: string;
  /**
   * What tells two records of one name apart, **in the library's own words** — a Story's
   * Type, an object's Binding, the edition line a Series is. `null` where the name is the
   * whole of it, which is every person and every Path.
   *
   * One column off the row, never a sentence composed here. What a screen prints is the
   * screen's, and a query that wrote *Manga · reading* would be writing it for the MCP
   * door too.
   */
  qualifier: string | null;
};

/** What the finder was asked. */
export type LibraryFinderFilter = {
  /** What the owner typed. Blank finds nothing, which is a real answer. */
  term: string;
  /**
   * How many of **each kind** to answer with. Per kind rather than over the whole answer,
   * because an owner with nine Stories called *Slam Dunk* must still be shown the Series.
   *
   * Anything that is not a count of rows — none, a negative, a fraction, the `NaN` an
   * assistant filling in a schema can send — falls back to the few below.
   */
  perKind?: number;
};

/** A suggestion list's worth, which is what the commonest caller wants. */
const A_FEW = 5;

/**
 * What a kind of record is, as the one statement below needs it: where the row is, what it
 * is called, and what qualifies it.
 *
 * A table rather than five hand-written branches, because the five have to be matched the
 * *same* way. The accent fold applied to four kinds and forgotten on the fifth is a bug
 * with no symptom except an owner who learns not to trust the field, and there is nowhere
 * here for it to hide.
 */
type Searchable = {
  kind: FoundKind;
  /** The table and whatever it must be joined to for its qualifier, aliased. */
  from: string;
  /** The record's id. */
  id: string;
  /** The column the owner is typing at. */
  name: string;
  /** The qualifier, or `null::text` where the name is the whole of it. */
  qualifier: string;
};

const SEARCHABLE: readonly Searchable[] = [
  {
    kind: "story",
    from: "story s join type t on t.id = s.type_id",
    id: "s.id",
    name: "s.title",
    qualifier: "t.name",
  },
  {
    // The **catalogue**, not the Collection (ADR-0007). A Volume the library knows and the
    // house does not hold — one of the wishlist's twenty-one, or something let go — has a
    // page of its own, and a finder that could not reach it would offer to find records it
    // cannot reach.
    kind: "volume",
    from: "volume v join binding b on b.id = v.binding_id",
    id: "v.id",
    name: "v.title",
    qualifier: "b.name",
  },
  {
    kind: "series",
    from: "series se",
    id: "se.id",
    name: "se.name",
    qualifier: "se.edition_line",
  },
  { kind: "person", from: "person p", id: "p.id", name: "p.name", qualifier: "null::text" },
  { kind: "path", from: "path pa", id: "pa.id", name: "pa.name", qualifier: "null::text" },
];

/**
 * The order the kinds come back in, and therefore the order a caller groups them in.
 *
 * **Read off `SEARCHABLE` rather than written out again**, which is not brevity: the
 * statement's own `kind_order` is a branch's index in that table, so a second hand-kept
 * list of the same five in the same order would be a list that can disagree with the order
 * the rows actually arrive in — and the symptom would be a screen whose headings are in one
 * order and whose rows are in another.
 *
 * The order itself is a judgement, and it is the table's: a Story first, because that is
 * where the reading and the opinion live (ADR-0001); then the object, then the publisher's
 * line it stands in; then the people, then the routes — the two that are about the owner's
 * own arrangement of the library rather than about the library.
 */
export const FOUND_KINDS: readonly FoundKind[] = SEARCHABLE.map((searchable) => searchable.kind);

/**
 * One branch of the union: one kind of record, matched on its name.
 *
 * Two things about the matching, and both are decisions this repo has already taken once:
 *
 *   - **`unaccent` on both sides**, so `perche` finds *Perché* and `perché` finds *Sapiens*
 *     spelt with a stray accent. The extension is `db/migrations/0003_the_finder_folds_accents.sql`,
 *     and the fold being symmetric is what makes neither spelling the special case;
 *   - **`strpos` rather than `ilike '%…%'`**, so what the owner typed is a word and not a
 *     pattern: `%` and `_` are ordinary characters in a title — *100% Doraemon* is one —
 *     and a field that read them as wildcards would answer a question nobody asked. It is
 *     the same choice `searchCollection` made, for the same reason.
 *
 * `prefix` is the one piece of ranking there is: a name that *starts* with what was typed
 * is the likelier one, and a suggestion list is five rows long.
 *
 * Nothing is interpolated but this module's own table. Every value the caller supplies —
 * the term, the count — reaches SQL as a parameter, which is the whole reason injection is
 * not something this repository has to think about (`src/core/README.md`).
 */
function branch(searchable: Searchable, order: number): string {
  const folded = `lower(unaccent(${searchable.name}))`;

  return `(select ${order} as kind_order,
                  '${searchable.kind}' as kind,
                  ${searchable.id}::text as id,
                  ${searchable.name} as name,
                  ${searchable.qualifier} as qualifier,
                  case when strpos(${folded}, typed.term) = 1 then 0 else 1 end as prefix,
                  ${alphabetically(searchable.name)} as alpha,
                  ${numerically(searchable.name)} as number,
                  lower(${searchable.name}) as sortable
             from ${searchable.from}
             cross join typed
            where strpos(${folded}, typed.term) > 0
            ${THE_ORDER_A_NAME_READS_IN}, ${searchable.id}
            limit $2)`;
}

// **How two records of one kind are ordered**, over the columns the branch carries out for
// it, so the branch and the statement around it order by one thing said once. A `union all`
// gives no order of its own, which is why both need it: ordering only inside the branches
// would be ordering nothing.
//
// Every level is there for a case. The likelier match first; then the name as a name and
// then its number, which is the whole of the paragraph above; then the name as text, for two
// names whose skeletons match. Every one of those is a **column the branch carried out**
// rather than an expression written here, and that is not tidiness: a bare `name` in a
// branch's `order by` resolves to an *input* column where one exists, so `lower(name)` would
// silently be the Type's name on the Story branch and the Binding's on the Volume one.
// `qualifier nulls first` is the order `queries/series.ts` reads
// two Series of one name in — the standard printing before an edition line — and the record's
// own id goes last, because two rows identical in every other respect would otherwise be
// ordered by whichever one Postgres reached first, and the finder would answer one question
// two ways.
const THE_ORDER_A_NAME_READS_IN = `order by prefix, alpha, number, sortable, qualifier nulls first`;

/**
 * A name with its numbers taken out, which is what one name is compared to another by.
 *
 * Half the names in this library end in a number, because half of it is a publisher's
 * ordered line. Compared as text, twenty Volumes of one Series read *1, 10, 11, … 2, 20* —
 * an answer the owner has to re-sort in their head, on the one question the finder is for.
 * So the comparison is in two parts: the name without its digits, and then the number.
 */
function alphabetically(name: string): string {
  return `regexp_replace(lower(unaccent(${name})), '[0-9]+', '', 'g')`;
}

/**
 * The **last** run of digits in a name, as a number, or `-1` where there is none.
 *
 * The last rather than the first, because that is where a position is written: *Batman 1966
 * Vol 2* is the second of something. `numeric` rather than `int`, because a title is text and
 * nothing stops one carrying twenty digits — an overflow here would be a 500 on a search.
 * `-1` puts the unnumbered name first, which is where *Slam Dunk* stands relative to *Slam
 * Dunk 1*.
 */
function numerically(name: string): string {
  return `coalesce((regexp_match(${name}, '([0-9]+)[^0-9]*$'))[1]::numeric, -1)`;
}

// The whole statement, built once at module load rather than per call: the five branches
// are fixed, and the two things that vary are parameters. `kind_order` is what bands the
// answer, and it is what lets a caller group the list without sorting it.
const THE_STATEMENT = `
  with typed as (select lower(unaccent($1::text)) as term)
  select kind, id, name, qualifier
    from (
      ${SEARCHABLE.map(branch).join("\n      union all\n      ")}
    ) found
   order by kind_order, ${THE_ORDER_A_NAME_READS_IN.replace("order by ", "")}, id`;

/**
 * Everything in the library that is called what the owner typed, grouped by what it is.
 *
 * **A blank term finds nothing**, and that is an answer rather than a shortcut: a field
 * nobody has typed into has asked no question, and a finder that read the whole library to
 * fill a suggestion list nobody opened would be doing it on every keystroke of every
 * screen. It is also why the count is per kind — this query never reads more than it
 * answers with.
 */
export async function findInTheLibrary(filter: LibraryFinderFilter): Promise<Finding[]> {
  const term = filter.term.trim();
  if (term === "") return [];

  const asked = filter.perKind;
  const perKind = Number.isInteger(asked) && (asked as number) > 0 ? (asked as number) : A_FEW;

  return query<Finding>(THE_STATEMENT, [term, perKind]);
}
