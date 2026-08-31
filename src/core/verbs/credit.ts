import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// Writing a Credit: who wrote a Story and who drew it.
//
// A Credit hangs off a **Story** and never off a Volume — the narrative is what a writer
// wrote and an artist drew, and the object is a printing of it (ADR-0001). The word is
// Credit and never `author`, which presumes a single role and silently drops the artist.
//
// The role is a slug from the `credit_role` table rather than a union of string
// literals, for the reason Type and Binding are data rows (ADR-0006): a colourist, a
// letterer or a translator is a role the owner will meet, and nothing in TypeScript is
// allowed to enumerate today's two.
//
// **This verb is exposed over MCP** — `credit_attribute` — and the question ADR-0005 leaves
// open is the Person it mints on a name the library has not seen. That is entity creation,
// and the ADR names a Story, a Volume and a Series without naming a Person; ADR-0012 answers
// it, and the answer is that this side of the boundary is where a Credit belongs.
//
// Two things carry that decision, and the ADR has both at length. A **Credit is a record of its
// own**,
// visible on the Story and on the person the moment it is wrong, and `uncreditStory` below is
// a whole undo — where an amendment overwrites a column nobody ever reads back, which is why
// an ISBN waits in the Inbox and this does not (ADR-0011). And a **Person exists in order to
// be credited**: minting one is not a claim about the library, because a person nothing points
// at is absent from every screen that browses by Credit.
//
// What stays true is the *misspelling*: the name is unique on `lower(name)`, there is no
// rename verb and no merge verb, so a second spelling is a second person forever and the only
// repair is uncrediting. That is a risk carried by prose on the door — read the people who are
// already there first — and not by a boundary, because the alternative was 0 people and 0
// Credits, which is where the library stood.

/** What crediting a Story needs, and the whole of it. */
export type NewCredit = {
  storyId: string;
  /**
   * The name the person is credited with — `ONE`, `Yusuke Murata`, `Jeph Loeb`.
   *
   * A name rather than a Person's id, because that is what the owner has: they are
   * reading it off a cover, not choosing from a list they built first. A name the
   * library has not seen names a new Person; one it has, whatever case it is typed in,
   * names the Person it already knows — so that *everything read by Jeph Loeb* cannot be
   * split in two by a second spelling of him.
   */
  person: string;
  /** A role's slug — `writer`, `artist`. A data row, never an enum in code (ADR-0006). */
  roleId: string;
};

// A Story's and a Credit's ids are generated, so the owner never types one: what arrives
// here came from a screen or from an assistant reading over MCP. A malformed id is
// therefore the same event as an unknown one, and this keeps it that way — `where id =
// $1` on a uuid column raises a *syntax* error for `"banana"`, which is not an integrity
// violation and would reach an adapter as a 500 rather than as an answer.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Why a Credit has nowhere to go, and what to do about it.
 *
 * The second sentence is the whole reason this is prose rather than a code: crediting is direct
 * (ADR-0012) and creating the Story it hangs off is **not** (ADR-0005), so this refusal is where
 * an assistant meets that line — and a refusal that only says no leaves it guessing at a door
 * that does not exist. It reads for the owner too: the Inbox is where a Story arrives on both
 * surfaces.
 */
const NO_SUCH_STORY =
  "That Story is not in the library yet. Propose it, and credit it once it has been approved.";

/**
 * Credit a person on a Story in a named role. Returns the Credit and the Person it
 * points at.
 *
 * **Names the Person if the library has not met them yet**, which is the one thing this
 * verb does besides the Credit: the owner is typing a name off a cover, and requiring
 * them to create the person first would be a form in front of a form. A name already
 * known — in any capitalisation — is that person rather than a second row, because a
 * duplicate would split every answer the Person table exists to give.
 *
 * Refused when that person already holds that role on this Story. What it deliberately
 * allows is one person in **both** roles on one Story, and two people in the same role.
 */
export async function creditStory(credit: NewCredit): Promise<{ id: string; personId: string }> {
  if (!UUID.test(credit.storyId)) throw new Refusal("not-found", NO_SUCH_STORY);

  // One statement, so this is one transaction without a client of its own: the Person is
  // found or named and the Credit is written in the same snapshot, and there is no way
  // to end up with a Person nobody is credited by (`verbs/README.md`).
  const rows = await refusing(
    () =>
      query<{ id: string; personId: string }>(
        `with named as (
           select id from person where lower(name) = lower(btrim($2))
         ), created as (
           insert into person (name)
             select btrim($2)
              where not exists (select 1 from named)
           returning id
         ), who as (
           select id from named
           union all
           select id from created
         )
         insert into credit (story_id, person_id, role_id)
           select $1, who.id, $3 from who
         returning id, person_id as "personId"`,
        [credit.storyId, credit.person, credit.roleId]
      ),
    (constraint) => {
      switch (constraint) {
        case "credit_is_one_role_per_person_per_story":
          return "That person already holds that role on this Story.";
        case "credit_story_exists":
          return NO_SUCH_STORY;
        case "credit_role_exists":
          return "That is not a role this library credits.";
        case "person_name_is_not_blank":
          return "A Credit needs the name the person is credited with.";
        case "person_is_named_once":
          // Two names differing only in case, arriving at once. Single-owner, so this is
          // a race that essentially cannot happen; it is named rather than laundered.
          return "That person was named a moment ago. Try again.";
        default:
          return "That Credit could not be recorded.";
      }
    }
  );

  const [recorded] = rows;
  if (!recorded) throw new Error("insert into credit returned no row");
  return recorded;
}

/**
 * Remove a Credit: this person did not hold that role on this Story after all.
 *
 * **The Person stays**, credited wherever else they are: removing one contribution is
 * not forgetting who somebody is, and a person nobody is credited by is simply absent
 * from the screens that browse by Credit.
 *
 * Refused when there is no such Credit, rather than passing silently, because a remove
 * that removed nothing is a mistake worth naming.
 */
export async function uncreditStory(creditId: string): Promise<void> {
  if (!UUID.test(creditId)) throw new Refusal("not-found", "No Credit has that id.");

  const removed = await query<{ id: string }>("delete from credit where id = $1 returning id", [
    creditId,
  ]);

  if (removed.length === 0) throw new Refusal("not-found", "No Credit has that id.");
}
