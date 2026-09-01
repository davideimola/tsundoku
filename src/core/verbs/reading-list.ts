import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// Writing the Reading list, which is **one verb and its undoing**.
//
// There is nothing else to write here, and that is the design rather than a stage it has
// not reached: the Reading list composes itself from the Wants, the unread stops of the
// active Paths and the missing Volumes of the Series being collected, so an entry has no row
// and nothing to set on it. What the owner keeps by hand is the **head** — the short,
// ordered half of the list — and a pin is the whole of what puts a row in it.
//
// **What a pin names changed here** (#40). It named a *source*, a Path or a Series, back
// when a route contributed exactly one stop; so *three Marvel stories and then a DC one* was
// unsayable, because pinning Marvel pinned whatever Marvel was offering and the second stop
// of that route could not be reached at all. It names the **thing to read** now, which is
// also the only subject that survives the dedup beside it: one Story is one row however many
// reasons put it there, so a row that is wanted *and* on two routes has three sources and
// could not be addressed by any one of them.
//
// **No verb here opens a Wish.** An entry needing a Volume the owner does not own carries a
// proposal built by `queries/reading-list.ts` and nothing more; opening it is
// `openWish` in `verbs/wish.ts`, called by the owner or by an assistant on their word
// (user story 28). A verb in this file that bought things would be the one thing this
// slice must not do.

/**
 * What a pin is on: a **Story**, or a **position of a Series**, which are the two things a
 * Reading list entry can be.
 *
 * The two halves of the list, and they are addressed differently because they are different
 * kinds of thing. What the owner reads is a narrative, and one Story is one entry however
 * many reasons put it there — wanted, and on two routes, is one row — so the Story is the
 * whole of the subject. What the owner *buys* is an object the library may not have
 * catalogued at all (ADR-0001), so the shopping half is named by the line and the place in
 * it: the entry is *Death Note Black Edition 2* and never *Death Note Black Edition*.
 *
 * `db/migrations/0010_a_pin_names_the_thing_to_read.sql` is where exactly-one-of-the-two is
 * held, and it is a check constraint rather than an `if` below.
 */
export type PinnedSubject =
  | { kind: "story"; id: string }
  | { kind: "series"; id: string; position: number };

// An id is generated and never typed, so a malformed one is the same event as one naming
// nothing: there is nothing to pin. Said here because `where story_id = 'banana'` on a uuid
// column raises a *syntax* error, which is a 500 rather than an answer.
const NOT_PINNED = "That is not pinned.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_STORY = "No Story has that id.";
const NO_SUCH_SERIES = "No Series has that id.";

/**
 * What is wrong with the subject before any statement is run, or nothing.
 *
 * Two things the database cannot answer for and one it will not be asked to. A malformed
 * uuid raises a syntax error rather than refusing, and a position that is not a whole number
 * from one is not a place in a line — the check constraint says the same thing, and saying
 * it here as well is what keeps `NaN` from arriving at Postgres as the text `NaN`.
 */
function whyTheSubjectIsWrong(subject: PinnedSubject): Refusal | null {
  if (!UUID.test(subject.id)) {
    return new Refusal("not-found", subject.kind === "story" ? NO_SUCH_STORY : NO_SUCH_SERIES);
  }
  if (subject.kind === "series" && !(Number.isInteger(subject.position) && subject.position >= 1)) {
    return new Refusal("invalid", "A Series is pinned at a position of it, counted from one.");
  }
  return null;
}

/**
 * Pin an entry: the owner wants to read this next, and it joins the **head** of the list.
 *
 * **It is the act of saying *this next*, so it goes to the front** — the most recently
 * pinned entry leads. Said again on something already pinned it therefore *moves* the pin it
 * finds rather than adding a second one, which is also what makes it the way to re-order the
 * head: pin the rows in the order you mean to read them.
 *
 * Nothing else follows from it. No route is re-ordered, no Wish is opened, and the entry
 * itself is still composed rather than stored — **a pin cannot introduce something to
 * read**, so a pin on a Story no source names any more, or on a position of a line the owner
 * has stopped collecting, contributes no entry at all and simply waits.
 *
 * There is no cap on the head, and there will not be one: a head of twenty is the owner
 * having pinned twenty things, which looks wrong on the screen and is theirs to prune. A
 * limit here would be the library refusing a decision it was not asked to have an opinion
 * about.
 */
export async function pinToReadingList(subject: PinnedSubject): Promise<void> {
  const wrong = whyTheSubjectIsWrong(subject);
  if (wrong) throw wrong;

  await refusing(
    () =>
      // One statement, so moving a pin and making one are the same act rather than a
      // delete racing an insert. The conflict target is the partial unique index over the
      // subject, and there is one per kind — hence the `where` clause naming it.
      subject.kind === "story"
        ? query(
            `insert into reading_list_pin (story_id) values ($1)
             on conflict (story_id) where story_id is not null
             do update set pinned_at = now()`,
            [subject.id]
          )
        : query(
            `insert into reading_list_pin (series_id, series_position) values ($1, $2)
             on conflict (series_id, series_position) where series_id is not null
             do update set pinned_at = now()`,
            [subject.id, subject.position]
          ),
    (constraint) => {
      switch (constraint) {
        case "reading_list_pin_story_exists":
          return NO_SUCH_STORY;
        case "reading_list_pin_series_exists":
          return NO_SUCH_SERIES;
        default:
          return "That could not be pinned to the Reading list.";
      }
    }
  );
}

/**
 * Unpin: the entry leaves the head and goes back to where the list composed it.
 *
 * Nothing is lost by it, because a pin holds nothing — the entry is derived either way,
 * and what ends is the owner's own order over it.
 *
 * Refused where there was no pin, rather than passing silently: it is in the reserve
 * already, so a second unpin is the owner looking at something else than they think.
 */
export async function unpinFromReadingList(subject: PinnedSubject): Promise<void> {
  if (whyTheSubjectIsWrong(subject)) throw new Refusal("not-found", NOT_PINNED);

  // `returning` because the delete's own row count is the diagnosis: no row means there was
  // no pin, and a second read to find that out could disagree with the write.
  const unpinned =
    subject.kind === "story"
      ? await query<{ gone: boolean }>(
          "delete from reading_list_pin where story_id = $1 returning true as gone",
          [subject.id]
        )
      : await query<{ gone: boolean }>(
          `delete from reading_list_pin
            where series_id = $1 and series_position = $2
           returning true as gone`,
          [subject.id, subject.position]
        );

  if (unpinned.length === 0) throw new Refusal("not-found", NOT_PINNED);
}
