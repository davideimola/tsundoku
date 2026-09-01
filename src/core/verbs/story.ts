import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { recordVolumeCarriesStory } from "./story-to-volume.ts";

// Writing a Story. **Creating one needs no Volume**, and that is the rule the file is built
// on: being read and being owned are two unrelated facts, and a Story read digitally,
// borrowed or known only from Goodreads history is a first-class one (ADR-0001). Which
// Volumes carry a Story is a different fact, and it is written in `story-to-volume.ts`.
//
// One verb here names a Volume, and it is the exception that proves the rule rather than a
// crack in it: `createStoryCarriedBy` is *both* facts said in one breath, because the owner
// reading a contents page off the back of an object is stating both at once. It takes the
// Volume as a second argument and writes nothing about it — `NewStory` has no Volume in it,
// and never will.

/** What creating a Story needs, and the whole of it. */
export type NewStory = {
  title: string;
  /** A Type's slug — `manga`, `novel`. A data row, never an enum in code (ADR-0006). */
  typeId: string;
  /**
   * How many **Instalments** the work has, where it was serialized. Absent is the ordinary
   * case and asks nothing: the owner is never asked *is this serialized* while cataloguing,
   * and `declareInstalments` is where the answer is given later (#37).
   */
  instalments?: number | null;
};

/**
 * Add a Story to the library, at whatever granularity the owner chose for this one:
 * *Gotham Noir* is a story inside one volume, *Slam Dunk* is a story across twenty, and
 * nothing here records which. Returns its id.
 *
 * The owner's verb, not MCP's: an external assistant may only *propose* a Story, as an
 * Inbox entry the owner approves (ADR-0005). `run` is how the Inbox's approval calls it
 * inside its own transaction: approving is one act, so the Story and the entry that became
 * it land together or not at all (see `../transaction.ts`).
 */
export async function createStory(story: NewStory, run: Executor = query): Promise<string> {
  const rows = await refusing(
    () =>
      run<{ id: string }>(
        "insert into story (title, type_id, instalments) values (btrim($1), $2, $3) returning id",
        [story.title, story.typeId, story.instalments ?? null]
      ),
    (constraint) => whyStoryRefused(constraint, "That Story could not be added.")
  );

  // The insert returns a row or it throws. Reading it out of the array rather than
  // asserting on it keeps the non-null assertion out of the file.
  const [created] = rows;
  if (!created) throw new Error("insert into story returned no row");
  return created.id;
}

/**
 * Add a Story **and record that this Volume carries it**, in one act.
 *
 * The owner is holding the object and reading the contents page off the back of it: *Hulk
 * Rosso* holds the six issues of one arc and a back-up story from somewhere else, and neither
 * narrative is in the library yet. Saying so used to be two screens — record the Story on the
 * wall, come back, choose it in the picker — and the trip back is where the second story of a
 * volume stops being recorded at all.
 *
 * **It is one verb because it is one fact with two halves, and half of it is worse than
 * neither** (`../transaction.ts`): a Story nothing carries reads as something read digitally,
 * and an object recorded as carrying nothing reads as an object nobody has opened. So they
 * land together or not at all, and the refusal that rolls it back is the verb's own prose —
 * a Type this library does not know, or a Volume that is not in it.
 *
 * It composes the two verbs rather than writing their SQL again, which is what keeps the
 * constraint names and the prose in one place each.
 *
 * **Not a tool, and it is the plainest case of ADR-0005 in the repository**: it creates a
 * Story, so an assistant may only propose it, and the door for that is the Inbox. The Volume
 * side of it is safe on its own and is `recordVolumeCarriesStory`.
 *
 * Returns the new Story's id.
 */
export async function createStoryCarriedBy(story: NewStory, volumeId: string): Promise<string> {
  return transaction(async (run) => {
    const storyId = await createStory(story, run);
    await recordVolumeCarriesStory(volumeId, storyId, run);
    return storyId;
  });
}

// SAYING A STORY IS SERIALIZED, and it is the only number a narrative carries.
//
// An **Instalment** is one numbered part of a Story that was serialized — *Slam Dunk*'s
// twenty, *Ultimate Spider-Man*'s hundred and sixty — and it belongs to the narrative and
// never to a printing. That is the whole of its usefulness: *thirty-five of a hundred and
// sixty* stays true however the owner read them, where *one of three omnibus* is a fact
// about a shelf and says nothing about the work.
//
// **It is optional and it costs nothing where it is not wanted.** A Story that declares none
// is an ordinary Story, nothing asks for one at cataloguing time, and where a line prints one
// part per Volume the numbering follows the volumes — so the count is typed once per work, or
// never (`CONTEXT.md`).

/** The prose for a count that is not a number of parts. */
const NOT_A_COUNT_OF_PARTS =
  "A serialized Story has one Instalment or more. Say none at all where it has parts nobody numbers.";

/**
 * Say how many Instalments this Story has, or take the numbering back off it with `null`.
 *
 * It changes nothing else: what a work is and what was done with it are unrelated facts
 * (ADR-0001), so no Reading, no Rating and no Volume follows from it. What it *is* refused by
 * is the other end of the same rule — a work cannot be made shorter than what a pass has
 * already read of it, or than what an object already covers of it, and Postgres says so
 * rather than this file (see the migration's `the_work_still_holds_what_was_read`).
 *
 * **The owner's act, and the Inbox is the door an assistant reaches it through**: an invented
 * count is permanent, silent and wrong in a way nobody reads back, which is ADR-0011's risk
 * exactly. So it is proposed as an Amendment and `amendStory` is what an approval calls.
 */
export async function declareInstalments(
  storyId: string,
  instalments: number | null,
  run: Executor = query
): Promise<void> {
  if (!UUID.test(storyId)) throw new Refusal("not-found", NO_SUCH_STORY);
  // The same guard the id gets, for the same reason: six and a half parts is a *syntax*
  // error on an integer column rather than an integrity violation, and it would reach a door
  // as a 500 instead of as a sentence. A count of parts is a whole number or it is nothing.
  if (instalments !== null && !Number.isInteger(instalments)) {
    throw new Refusal("invalid", NOT_A_COUNT_OF_PARTS);
  }

  const changed = await refusing(
    () =>
      run<{ id: string }>("update story set instalments = $2 where id = $1 returning id", [
        storyId,
        instalments,
      ]),
    (constraint) => whyStoryRefused(constraint, "That Story could not be serialized.")
  );

  if (changed.length === 0) throw new Refusal("not-found", NO_SUCH_STORY);
}

/** The prose for every constraint the `story` table can refuse a write with. */
function whyStoryRefused(constraint: string | undefined, otherwise: string): string {
  if (constraint === "story_title_is_not_blank") return "A Story needs a title.";
  if (constraint === "story_type_exists") return "That is not a Type this library knows.";
  if (constraint === "story_instalments_are_positive") return NOT_A_COUNT_OF_PARTS;
  // The two the migration's trigger raises, and the reason it is a trigger: a check
  // constraint cannot read the Readings or the objects, and a work that has been read to
  // instalment seven is not a work of five.
  if (constraint === "story_instalments_still_hold_what_was_read") {
    return "A pass through this Story has got further than that. It cannot be shorter than what you have read of it.";
  }
  if (constraint === "story_instalments_still_hold_what_is_covered") {
    return "An object carrying this Story covers further than that. Correct what it covers first.";
  }
  return otherwise;
}

// A Story's id is generated, so nothing types one: a malformed id is the same event as an
// unknown one, and saying so here keeps it from reaching the driver as a syntax error on a
// uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_STORY = "No Story has that id.";

/**
 * What an approved Amendment writes onto a Story: the fields it names, and nothing else.
 *
 * `null` or absent means **leave what stands there today**, so an amendment completes and
 * corrects but never empties — a Story with no title and no Type is not something an
 * assistant may propose its way to.
 */
export type StoryAmendment = {
  title?: string | null;
  /** A Type's slug — `manga`, `novel`. A data row, never an enum in code (ADR-0006). */
  typeId?: string | null;
  /**
   * How many Instalments the work has, where it was serialized.
   *
   * **This is the door an assistant proposes a count through** (ADR-0005): an invented
   * number is permanent, silent and wrong in a way nobody notices, so it waits in the Inbox
   * rather than being written. `null` leaves what stands there, like every other field here
   * — taking the numbering off a Story is the owner's own verb, `declareInstalments`.
   */
  instalments?: number | null;
};

/**
 * Complete or correct a Story the library already holds: a title typed wrong on the way in,
 * a Type nobody chose carefully.
 *
 * **The owner's act, and the Inbox is the door an assistant reaches it through** — a
 * silently changed title is the permanent, unnoticed wrong fact ADR-0011 is about, so it is
 * proposed as an Amendment and waits for a decision. `run` is how that approval calls this
 * inside its own transaction (see `../transaction.ts`).
 *
 * No Reading, no Rating and no Volume follow from it: what a Story is and what was done
 * with it are unrelated facts (ADR-0001).
 */
export async function amendStory(
  storyId: string,
  amendment: StoryAmendment,
  run: Executor = query
): Promise<void> {
  if (!UUID.test(storyId)) throw new Refusal("not-found", NO_SUCH_STORY);
  if (!Object.values(amendment).some((value) => value !== null && value !== undefined)) {
    throw new Refusal("invalid", "An amendment changes at least one field of the Story.");
  }
  // A count of parts is a whole number or it is nothing — the same guard `declareInstalments`
  // makes, because an assistant's *twenty and a half* would reach the driver as a syntax
  // error on an integer column rather than as a sentence the owner can read.
  if (
    amendment.instalments !== null &&
    amendment.instalments !== undefined &&
    !Number.isInteger(amendment.instalments)
  ) {
    throw new Refusal("invalid", NOT_A_COUNT_OF_PARTS);
  }

  // `coalesce` rather than a `set` clause assembled from whichever fields arrived: the
  // fields are a closed list written here, and *leave it standing* is the same sentence in
  // SQL as it is in the type above.
  const changed = await refusing(
    () =>
      run<{ id: string }>(
        `update story
            set title       = coalesce($2, title),
                type_id     = coalesce($3, type_id),
                instalments = coalesce($4, instalments)
          where id = $1
          returning id`,
        [storyId, amendment.title ?? null, amendment.typeId ?? null, amendment.instalments ?? null]
      ),
    (constraint) => whyStoryRefused(constraint, "That Story could not be amended.")
  );

  if (changed.length === 0) throw new Refusal("not-found", NO_SUCH_STORY);
}

// STRIKING A STORY FROM THE LIBRARY, and it is `strikeVolumes` with a different boundary
// rather than a second idea (ADR-0015, which extends ADR-0014).
//
// The gap is the one ADR-0014 was written about, at the other end of the model. An assistant
// may not create a Story and may propose one, the owner approves proposals forty at a time
// (ADR-0005, ADR-0011), and a hallucinated narrative that got through was **permanent** — the
// Inbox's rejection only leaves a proposal unapproved, and `amendStory` corrects a Story that
// should exist rather than unmaking one that should not. A wall of seventy-seven tiles with
// *Slam Dunk* on two of them is a wall that is wrong, and there was nothing to say so with.
//
// **What makes it safe is what it refuses**, and the four are the Volume's four asked about a
// narrative instead of an object:
//
//   an object in the house    something on a shelf carries it. The narrative is as real as
//                             the thing holding it — this is the rail, and it is the reason a
//                             bulk control over the wall is safe at all
//   a Reading                 an event in the owner's life names it. No duplicate has one
//   a Rating                  the judgement, which is the one record that is only ever about
//                             a narrative and never about an object (ADR-0001)
//   a Path                    a stop on a route the owner planned. Their own ordering
//
// What goes with it is said out loud before it is done, and it is where this differs from the
// Volume: **the Credits go, and the people they minted stay** (ADR-0012). A duplicate carrying
// *ONE, story* is carrying an attribution of a narrative that does not exist, and a Person is
// not owned by the Credit that first named them — they keep every other Credit they hold. The
// links to Volumes the house does not hold go too, and there is no foreign key to clear first:
// every reference to a Story cascades, and the two that would matter cannot exist, because
// either of them refuses the gesture.
//
// **The owner's act, never the assistant's.** There is no MCP tool and there must not be one:
// the party that files a hallucinated Story is exactly the party that must not be able to
// delete rows to tidy up after itself (ADR-0005, and ADR-0014 said it first).

/**
 * **Why one Story stands, as SQL** — the whole safety of striking, in four branches, and the
 * prose the owner reads when one of them is true.
 *
 * Exported for the reason `STORY_STATE` in `../queries/story.ts` is: **two readers ask it, and
 * a second copy of these branches would be a second answer** to *may this record be unmade*.
 * `strikeStories` spends it to find the one that stands and name it; the list the owner ticks
 * from is defined as *the Stories this expression has nothing to say about*
 * (`listStoriesNothingHasHappenedTo`), so the screen cannot come to offer a row the verb would
 * refuse — the list is not a second guess at the rule, it is the rule read the other way
 * round.
 *
 * It is here rather than beside that query because the rule is the verb's and so is the prose
 * (`./README.md`): a refusal is written where the act is.
 *
 * It names the Story `s`, so a statement spending it joins `story s`, and it answers `null`
 * for a Story nothing has happened to.
 */
export const WHY_A_STORY_STANDS = `
  case
    when exists (select 1 from volume_story vs
                   join acquisition a on a.volume_id = vs.volume_id and a.released_on is null
                  where vs.story_id = s.id)
      then 'an object in the house carries it. Say that object no longer carries it first — the library is not where a narrative on a shelf is unmade.'
    when exists (select 1 from reading r where r.story_id = s.id)
      then 'a Reading went through it. That is an event in your life, and it names this narrative.'
    when exists (select 1 from rating g where g.story_id = s.id)
      then 'you judged it. A score is the one record that is only ever about the narrative itself.'
    when exists (select 1 from path_item i where i.story_id = s.id)
      then 'a Path names it as a stop. Take it off the Path first.'
  end`;

/** Why one Story in a selection could not be struck, in the owner's words. */
type WhyItStands = { title: string; because: string | null };

/**
 * Strike Stories from the library: it stops knowing these narratives.
 *
 * **The selection lands whole or not at all**, like the Inbox's approval and the catalogue's
 * strike, and for their reason: a mess arrives by the dozen, and half a clean-up is worse than
 * none — the owner would have to work out which half. So one refused Story refuses the gesture
 * and names itself, and nothing has moved when the screen comes back.
 *
 * It takes the Credits on each with it and leaves the people standing, and it takes the record
 * of which Volumes carried it. A Reading, a Rating and a Path stop cannot go with it, because
 * any of them refuses instead.
 *
 * Returns how many were struck. An empty selection is refused rather than passing quietly: a
 * button reporting *0 struck* is a button the owner cannot tell from a broken one.
 *
 * **One selection of one is the same act**, which is what the Story's own page presses — see
 * ADR-0015 on why that door exists here and not on a Volume's page: the list this is bulk over
 * holds only Stories nothing has happened to, so it is the *only* place the four refusals can
 * be read.
 */
export async function strikeStories(storyIds: readonly string[]): Promise<number> {
  const asked = storyIds.filter((id) => UUID.test(id));
  if (asked.length === 0) {
    throw new Refusal("invalid", "Tick the Stories to strike from the library first.");
  }

  return transaction(async (run) => {
    // One statement for the whole selection, read in the same transaction that is about to
    // delete them — so nothing can be read, judged or placed on a Path between the check and
    // the act.
    const standing = await run<WhyItStands & { id: string }>(
      `select s.id, s.title, ${WHY_A_STORY_STANDS} as because
         from story s
        where s.id = any($1::uuid[])`,
      [asked]
    );

    if (standing.length !== asked.length) {
      throw new Refusal("not-found", "One of those is not a Story the library knows.");
    }

    const held = standing.find((one) => one.because !== null);
    if (held) {
      throw new Refusal("not-allowed", `${held.title} stays: ${held.because} Nothing was struck.`);
    }

    // Nothing to clear first, unlike a Volume's ended acquisitions: every reference to a
    // Story is `on delete cascade`, so the Credits and the carrying links follow it out, and
    // the schema has no say about the rest because the rest cannot be there.
    const struck = await refusing(
      () =>
        run<{ id: string }>(`delete from story where id = any($1::uuid[]) returning id`, [asked]),
      () => "Those Stories could not be struck from the library."
    );

    return struck.length;
  });
}
