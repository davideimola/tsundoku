import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import type { Executor } from "../transaction.ts";

// **The Want**: an open intention to read a Story, standing on its own and belonging to no
// Path (#35).
//
// Two verbs, and the shape of the pair is the whole design. Opening one is the fact; there is
// no verb here that *closes* one, and there must not be. A Want ends by itself — it falls
// quiet when a Reading began after it was opened, derived in `queries/want.ts` — which is
// exactly where it parts from the Wish beside it, and what keeps the owner from maintaining a
// second list of what is done.
//
// The one thing that removes a row is **striking**, and it means what it means everywhere else
// in this repository (ADR-0014, ADR-0015): *this record was a mistake*. Nothing else about a
// Want is refused, because a Want claims nothing about the world — it is a sentence the owner
// said about themselves, and a sentence they did not mean to say leaves no trace.

// An id is generated and never typed, so a malformed one is the same event as one naming
// nothing: there is nothing to want, and nothing to strike. Said here because `where story_id
// = 'banana'` on a uuid column raises a *syntax* error, which is a 500 rather than an answer.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_STORY =
  "That Story is not in the library yet. A title nobody recorded is a proposal, not a Want.";

/**
 * Open a Want: the owner means to read this Story, and it joins the Reading list.
 *
 * It names a Story that already exists and never creates one — a title nobody recorded is an
 * Inbox proposal the owner approves, not a row this verb writes (ADR-0005).
 *
 * **Nothing else follows from it, and that is the point of it existing.** No Path is minted,
 * no order is decided, no Volume is implied and no Wish is opened: wanting to read something
 * and meaning to own an object are unrelated facts, and the whole reason this verb exists is
 * that saying the first used to cost a named, ordered route.
 *
 * **Nothing closes it either.** It falls quiet on its own once a Reading begins after it — a
 * comparison of dates rather than a state — which is what makes a planned reread ordinary: a
 * Want opened today on a Story read in 2019 stands until the owner actually rereads it.
 *
 * Refused where a Want on that Story already stands, so the list cannot say *read this* twice
 * for one narrative.
 *
 * **One consequence is worth knowing before it is met.** The constraint is one Want per Story
 * and a Want that has fallen quiet is still a row, so a Story wanted once and read since
 * cannot be wanted again while that row stands: the second press is refused by a Want the
 * owner cannot see on the list, and striking the spent one is the way back. That follows from
 * the schema #34 wrote — quietness is a comparison and there is nothing for a partial index to
 * be partial on — and the alternative, reopening the quiet row on a second press, is a
 * decision nobody has written down. It is left alone here rather than invented.
 *
 * `run` is how the one door calls this inside its own transaction (`what-happened.ts`): the
 * owner says *I bought it* once, and the object, the acquisition and the narrative land
 * together or not at all (see `../transaction.ts`).
 */
export async function openWant(storyId: string, run: Executor = query): Promise<{ id: string }> {
  if (!UUID.test(storyId)) throw new Refusal("not-found", NO_SUCH_STORY);

  const rows = await refusing(
    () =>
      run<{ id: string }>("insert into want (story_id) values ($1) returning id::text as id", [
        storyId,
      ]),
    (constraint) => {
      switch (constraint) {
        case "want_story_exists":
          return NO_SUCH_STORY;
        case "want_one_open_per_story":
          return "There is already a Want on that Story.";
        default:
          return "That Want could not be opened.";
      }
    }
  );

  const [opened] = rows;
  if (!opened) throw new Error("insert into want returned no row");
  return opened;
}

/**
 * Strike a Want: the owner did not mean to say it, and the row goes.
 *
 * **This is not closing one, and the difference is the whole of why it is called striking.** A
 * Want the owner has simply not acted on is still true, and there is no verb in this file that
 * retires it — the Reading is what answers a Want, and it does so by comparison rather than by
 * writing anything. What this removes is a sentence that was a slip: the wrong Story picked
 * from a list, an assistant's misheard title. So a slip leaves no trace, exactly as a struck
 * Volume or a struck Story does (ADR-0014, ADR-0015).
 *
 * Nothing refuses it. A Want holds no history — no Reading went through it, no judgement rests
 * on it, and the Story it named is untouched — so there is nothing here the owner could have
 * lived with, and none of the four questions a Story's strike asks has anything to say about
 * one.
 *
 * Refused only where there is no such Want, rather than passing silently: it is off the list
 * already, so a second strike is the owner looking at something else than they think.
 */
export async function strikeWant(wantId: string): Promise<void> {
  if (!UUID.test(wantId)) throw new Refusal("not-found", "No Want has that id.");

  // `returning` because the delete's own row count is the diagnosis: no row means there was
  // no Want, and a second read to find that out could disagree with the write.
  const struck = await query<{ gone: boolean }>(
    "delete from want where id = $1 returning true as gone",
    [wantId]
  );

  if (struck.length === 0) throw new Refusal("not-found", "No Want has that id.");
}
