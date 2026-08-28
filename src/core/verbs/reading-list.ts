import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// Writing the Reading list, which is **one verb and its undoing**.
//
// There is nothing else to write here, and that is the design rather than a stage it has
// not reached: the queue composes itself from the next unread Story of every active Path
// and the next missing Volume of every Series being collected, so an entry has no row and
// nothing to set on it. What the owner keeps by hand is the order, and only where they
// disagree with it — see
// `db/migrations/0011_01_a_pin_is_the_only_stored_thing_in_the_reading_list.sql` for why a
// pin points at the source of an entry rather than at the thing to read.
//
// **No verb here opens a Wish.** An entry needing a Volume the owner does not own carries a
// proposal built by `queries/reading-list.ts` and nothing more; opening it is
// `openWish` in `verbs/wish.ts`, called by the owner or by an assistant on their word
// (user story 28). A verb in this file that bought things would be the one thing this
// slice must not do.

/**
 * What a pin is on: a **Path** or a **Series**, which are the two sources an entry can
 * come from.
 *
 * Not a Story and not a Volume, because an entry is a *position* in a derivation and the
 * thing standing in it changes the moment the owner finishes something. Each active Path
 * contributes exactly one entry and each Series being collected exactly one, so a
 * permutation of the sources is a permutation of the queue.
 */
export type PinnedSource = {
  kind: "path" | "series";
  /** The Path's or the Series' id. */
  id: string;
};

// An id is generated and never typed, so a malformed one is the same event as one naming
// nothing: there is nothing to pin. Said here because `where path_id = 'banana'` on a uuid
// column raises a *syntax* error, which is a 500 rather than an answer.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noSuchSource(kind: PinnedSource["kind"]): string {
  return kind === "path" ? "No Path has that id." : "No Series has that id.";
}

// Which column the subject goes in. A literal chosen in this file from a closed set of two
// — nothing a caller supplies reaches SQL other than as a parameter, here as everywhere.
function column(kind: PinnedSource["kind"]): "path_id" | "series_id" {
  return kind === "path" ? "path_id" : "series_id";
}

/**
 * Pin an entry: whatever this Path or this Series is offering, the owner wants it first.
 *
 * **It is the act of saying *this next*, so it goes to the front** — the most recently
 * pinned entry leads the queue. Said again on something already pinned it therefore
 * *moves* the pin it finds rather than adding a second one, which is also what makes it
 * the way to re-order pins: pin them in the order you mean to read them.
 *
 * Nothing else follows from it. The route is not re-ordered, no Wish is opened, and the
 * entry itself is still composed rather than stored — a pin on a Path the owner has put
 * aside, or on a Series they are not collecting, contributes no entry at all and simply
 * waits. A pin cannot introduce something to read.
 */
export async function pinToReadingList(source: PinnedSource): Promise<void> {
  if (!UUID.test(source.id)) throw new Refusal("not-found", noSuchSource(source.kind));

  const subject = column(source.kind);

  await refusing(
    () =>
      // One statement, so moving a pin and making one are the same act rather than a
      // delete racing an insert. The unique index over the subject is what the conflict
      // target is, and there is one per column — hence the `where` clause naming it.
      query(
        `insert into reading_list_pin (${subject}) values ($1)
         on conflict (${subject}) where ${subject} is not null
         do update set pinned_at = now()`,
        [source.id]
      ),
    (constraint) =>
      constraint === "reading_list_pin_path_exists" ||
      constraint === "reading_list_pin_series_exists"
        ? noSuchSource(source.kind)
        : "That could not be pinned to the Reading list."
  );
}

/**
 * Unpin: the entry goes back to where the Reading list composed it.
 *
 * Nothing is lost by it, because a pin holds nothing — the entry is derived either way,
 * and what ends is the owner's disagreement with its place.
 *
 * Refused where there was no pin, rather than passing silently: it is already unpinned, so
 * a second unpin is the owner looking at something else than they think.
 */
export async function unpinFromReadingList(source: PinnedSource): Promise<void> {
  if (!UUID.test(source.id)) throw new Refusal("not-found", "That is not pinned.");

  const subject = column(source.kind);

  const unpinned = await query<{ pinnedAt: string }>(
    `delete from reading_list_pin where ${subject} = $1 returning pinned_at::text as "pinnedAt"`,
    [source.id]
  );

  if (unpinned.length === 0) throw new Refusal("not-found", "That is not pinned.");
}
