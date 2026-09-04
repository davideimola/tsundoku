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
        // **A count given here is the owner's word**, and that is what stops a line from
        // moving it afterwards (#34). Absent, the column stays empty and a Series naming this
        // work comes to answer for it — which is how the merge gesture leaves the length of a
        // line to the line.
        `insert into story (title, type_id, instalments, instalments_said_by)
         values (btrim($1), $2, $3, case when $3::integer is null then null else 'owner' end)
         returning id`,
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
 * (ADR-0001), so no Pass, no Rating and no Volume follows from it. What it *is* refused by
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
  instalments: number | null
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
      query<{ id: string }>(
        // **Saying it by hand is what stops the following, permanently** (#34, ADR-0017). A
        // count that came from the line is the library keeping a printing's number and the
        // narrative's in step; the moment the owner corrects it, the number is theirs and no
        // line moves it again — including where they take the numbering back off with `null`,
        // which is a correction like any other.
        `update story set instalments = $2, instalments_said_by = 'owner'
          where id = $1
          returning id`,
        [storyId, instalments]
      ),
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
  // constraint cannot read the Passes or the objects, and a work that has been read to
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

// The same sentence `story-to-volume.ts` refuses with, said again rather than imported: this
// is the prose of a different act, and the day one of the two changes it must not drag the
// other's wording along with it.
const NO_SUCH_VOLUME = "That Volume is not in the library.";

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
 * No Pass, no Rating and no Volume follow from it: what a Story is and what was done
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
        // `btrim` on the title for the reason `createStory` has it: the constraint is
        // `title = btrim(title)`, so a name pasted with a trailing space is *refused* rather
        // than tidied, and the sentence it comes back with is "A Story needs a title" — which
        // is true of nothing the owner typed. Trimming here is what makes the two verbs agree
        // about what a title is.
        `update story
            set title       = coalesce(btrim($2), title),
                type_id     = coalesce($3, type_id),
                instalments = coalesce($4, instalments),
                -- An approved Amendment is the owner's decision reached through the Inbox
                -- (ADR-0005, ADR-0011), so a count arriving this way is their word and stops
                -- the count following the line, exactly as saying it by hand does (#34). An
                -- amendment naming no count leaves whose word it is alone, as it leaves the
                -- number.
                instalments_said_by = case
                  when $4::integer is null then instalments_said_by
                  else 'owner'
                end
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
//   a Pass                 an event in the owner's life names it. No duplicate has one
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

// **The two branches that are the owner's own life**, and they are a fragment rather than
// two copies of the same prose because two readers ask about them: striking a Story, and
// splitting the object that stands for one. The two spend it in different company — striking
// asks four things and a split asks these two alone — and neither may come to answer *may
// this record be unmade* differently from the other.
//
// It names the Story `s`, so a `case` spending it joins `story s`.
const WHAT_THE_OWNER_HAS_LIVED_WITH = `
    when exists (select 1 from pass r where r.story_id = s.id)
      then 'a Pass went through it. That is an event in your life, and it names this narrative.'
    when exists (select 1 from rating g where g.story_id = s.id)
      then 'you judged it. A score is the one record that is only ever about the narrative itself.'`;

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
    ${WHAT_THE_OWNER_HAS_LIVED_WITH}
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
 * of which Volumes carried it. A Pass, a Rating and a Path stop cannot go with it, because
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

// STRIKING THE NARRATIVE AN OBJECT CARRIES, which is the bin on a row of the object's own
// contents (#47, ADR-0019).
//
// **It is the other half of the cross beside it.** Taking a row off says *this object does
// not hold that narrative*, and where the narrative was minted from the object's own jacket
// — *Batman: Il lungo Halloween*, which holds several tales named nothing like it — taking
// it off leaves a wrong narrative standing in the library with nothing carrying it. So the
// row offers both acts, and this is the one that unmakes the record.
//
// **Three of striking's four questions, and the fourth deliberately not asked.** *An object
// in the house carries it* is true by construction here: the object doing the striking is
// one, which is exactly the posture the split below already takes and for the same reason.
// What stands in its place is the question worth asking from a row — *does anything **else**
// carry it* — because a work running across twenty tankōbon is not one volume's to unmake.
// The other three are `strikeStories`' own, spent from its own fragment so that the two acts
// cannot come to answer *may this record be unmade* differently.
//
// **Not a tool, and it cannot become one**, for `strikeStories`' reason: the party that files
// a hallucinated Story is exactly the party that must not be able to delete rows to tidy up
// after itself (ADR-0005).

/**
 * **Why a narrative one object carries stands**, as SQL — the three of striking's four
 * branches that can be asked from a row, and the one that replaces the fourth.
 *
 * Exported for `WHY_A_STORY_STANDS`' reason: the row that draws the bin and the verb that
 * presses it are two readers, and a second copy of these branches would be a second answer.
 * `listStoriesInVolume` reads it to decide whether the bin is drawn at all, so the screen
 * cannot come to offer a press this verb would refuse.
 *
 * It names the Story `s` and the carrying link `vs`, so a statement spending it joins both,
 * and it answers `null` for a narrative this object alone holds and nothing has touched.
 */
export const WHY_A_CARRIED_STORY_STANDS = `
  case
    when exists (select 1 from volume_story elsewhere
                  where elsewhere.story_id = s.id
                    and elsewhere.volume_id <> vs.volume_id)
      then 'other objects carry it too, and a work running across a line is not one volume''s to unmake. Say this object no longer carries it instead.'
    ${WHAT_THE_OWNER_HAS_LIVED_WITH}
    when exists (select 1 from path_item i where i.story_id = s.id)
      then 'a Path names it as a stop. Take it off the Path first.'
  end`;

/** The one sentence both halves of a missing link are said in. */
const THIS_OBJECT_DOES_NOT_CARRY_IT = "That Volume does not carry that Story.";

/**
 * Strike the narrative this object carries: the library stops knowing it, and the link goes
 * with it.
 *
 * The case is the default that was wrong about an object. *Batman: Il lungo Halloween* was
 * minted from a jacket for a book holding three tales named nothing like it; the owner names
 * the three in the field under the list and unmakes the one that was never a narrative.
 *
 * **One gesture, one transaction**: the link and the Story go together, and nothing can be
 * read, judged or placed on a route between the check and the act.
 *
 * Refused where anything else carries it, where a Pass went through it, where the owner
 * judged it, and where a Path names it as a stop — each in the words that say which. Nothing
 * about the object changes either way: it keeps its acquisitions, its place in a line and
 * everything else it holds.
 */
export async function strikeStoryCarriedBy(volumeId: string, storyId: string): Promise<void> {
  // An unreadable id is the same event as an unknown one, and saying so here is what keeps a
  // `where id = 'banana'` on a uuid column from reaching an adapter as a 500.
  if (!UUID.test(volumeId) || !UUID.test(storyId)) {
    throw new Refusal("not-found", THIS_OBJECT_DOES_NOT_CARRY_IT);
  }

  return transaction(async (run) => {
    const [carried] = await run<WhyItStands>(
      `select s.title, ${WHY_A_CARRIED_STORY_STANDS} as because
         from volume_story vs
         join story s on s.id = vs.story_id
        where vs.volume_id = $1 and vs.story_id = $2`,
      [volumeId, storyId]
    );

    if (!carried) throw new Refusal("not-found", THIS_OBJECT_DOES_NOT_CARRY_IT);
    if (carried.because) {
      throw new Refusal(
        "not-allowed",
        `${carried.title} stays: ${carried.because} Nothing was struck.`
      );
    }

    // The link, the Credits and everything else pointing at the narrative cascade out with
    // it; the two references that would matter refused the gesture above. Wrapped like every
    // other statement that can be refused, so a reference the schema stops cascading one day
    // reaches the owner as a sentence rather than as a 500.
    await refusing(
      () => run("delete from story where id = $1", [storyId]),
      () => `${carried.title} could not be struck from the library.`
    );
  });
}

// SPLITTING AN OBJECT INTO THE STORIES IT HOLDS, which is the second of the two gestures that
// carry the exceptions to *one Volume, one Story* — and the one this library has exactly one
// case of: *Batman: L'uomo che ride* holds three tales the owner scores apart.
//
// **It is a gesture and not a question asked at cataloguing time.** The rule for what a Story
// is has one sentence — *a Story is what you would give a score to* — and the whole point of
// having a rule is that nobody is asked to apply it while entering things. So an object stands
// for one narrative by default, and the day the owner opens it and finds three, they say the
// three titles once. The Type is not asked either: three tales inside one comic are comics,
// and the narrative being replaced already says which Type that is. A tale that turns out to
// be something else is `amendStory` afterwards, which is one Story's own correction rather
// than a field on a gesture about an object.
//
// **What makes it safe is Striking's posture asked about a narrative** (ADR-0015): the Story
// the object stood for is dropped only while nothing the owner has *lived with* has attached
// to it — no Pass, no Rating — and it refuses otherwise, naming which of the two it is. The
// four questions striking asks are not all askable here: *an object in the house carries it*
// is true by construction, since the object doing the splitting is one.
//
// Two things go with the dropped narrative, and they are said out loud rather than discovered:
// the **Credits** go and the people they named stay, which is striking's own clause and its
// reason (ADR-0012, a Person is not owned by the Credit that first named them); and a **Path**
// stop naming it goes too.
//
// **That second one is a conflict with ADR-0015 and it is left standing deliberately.**
// Striking refuses a Story a Path names as a stop — it is the fourth of its four — and this
// gesture does not, because the decision behind it says the auto-made Story is dropped while
// nothing has attached to it, *no Pass, no Rating*, and names no third thing. Refusing on a
// route would be a rule nobody wrote, and cascading it away quietly would be one too. So it
// cascades, it is tested by name below, the panel says so before the press, and the ADR is
// where the answer belongs the day the owner gives one.
//
// **Not a tool, and it cannot become one**: it creates Stories, so an assistant may only
// propose them and the door for that is the Inbox (ADR-0005).
//
// **It has had no door since #47, and it is left standing deliberately.** The panel that
// called it — a box with one title per line — is gone, because the field under an object's
// contents does the same work in the same place: the three titles are typed one at a time and
// the narrative the object stood for is unmade with the bin beside it, which asks this verb's
// own two questions plus two more. ADR-0019 says what replaces the panel and does not say to
// unmake the verb, so unmaking it is the owner's call and not this slice's, and the tests
// below keep it honest until they give one.

/** What has attached to the narrative an object stands for, in the owner's words. */
const WHAT_HAS_ATTACHED_TO_A_STORY = `case ${WHAT_THE_OWNER_HAS_LIVED_WITH} end`;

/** One narrative this object carries, and what stands in the way of unmaking it. */
type CarriedNarrative = {
  id: string;
  title: string;
  typeId: string;
  /** Whether another object carries it too, which makes it not this one's to unmake. */
  elsewhere: boolean;
  /** Why the owner has lived with it, or `null` where nothing has attached. */
  because: string | null;
};

/**
 * Split an object into the several Stories it holds: *L'uomo che ride* becomes *Gotham Noir*,
 * *L'uomo che ride* and *Uomo di legno*, each carried by this same object and each judged on
 * its own. Returns the new Stories' ids, in the order they were named.
 *
 * **One gesture, and therefore one transaction** (`./README.md`): the narratives are created,
 * this object is recorded as carrying each of them, and the one it stood for is dropped —
 * together or not at all. Half of it landing would be an object holding four narratives, three
 * of them new and one of them the thing they replace.
 *
 * Each new Story takes the Type of the narrative being replaced, so a split asks for titles
 * and nothing else. They are ordinary Stories from the moment they exist: a Rating, a Pass,
 * a Credit and a Path stop all attach to each one separately, which is the whole reason the
 * owner split the object.
 *
 * **Nothing about the object changes.** The Volume, its acquisitions and its place in a Series
 * are untouched — a split changes what the owner judges and never what they own.
 *
 * Refused where the narrative being replaced is one the owner has lived with — a Pass went
 * through it, or they judged it — and where it is not this object's to unmake, because other
 * objects carry it too. Refused on fewer than two titles, since an object standing for one
 * narrative is not split.
 */
export async function splitVolumeIntoStories(
  volumeId: string,
  titles: readonly string[]
): Promise<string[]> {
  if (!UUID.test(volumeId)) throw new Refusal("not-found", NO_SUCH_VOLUME);

  // A form with more boxes than the owner needed is the ordinary case, so an empty one is
  // not a title they left blank — it is a title they did not have.
  const named = titles.map((title) => title.trim()).filter((title) => title !== "");
  if (named.length < 2) {
    throw new Refusal(
      "invalid",
      "A split names at least two Stories: an object standing for one narrative is not split."
    );
  }

  return transaction(async (run) => {
    const [object] = await run<{ id: string }>("select id from volume where id = $1", [volumeId]);
    if (!object) throw new Refusal("not-found", NO_SUCH_VOLUME);

    // Read in the same transaction that is about to write, so nothing can be read, judged or
    // recorded into this object between the check and the act.
    const carried = await run<CarriedNarrative>(
      `select s.id,
              s.title,
              s.type_id as "typeId",
              exists (select 1
                        from volume_story elsewhere
                       where elsewhere.story_id = s.id
                         and elsewhere.volume_id <> vs.volume_id) as elsewhere,
              ${WHAT_HAS_ATTACHED_TO_A_STORY} as because
         from volume_story vs
         join story s on s.id = vs.story_id
        where vs.volume_id = $1
        order by lower(s.title), s.id`,
      [volumeId]
    );

    const standing = whatThisObjectStandsFor(carried);
    if (standing.because) {
      throw new Refusal(
        "not-allowed",
        `${standing.title} stays: ${standing.because} Nothing was split.`
      );
    }

    const created: string[] = [];
    for (const title of named) {
      const storyId = await createStory({ title, typeId: standing.typeId }, run);
      await recordVolumeCarriesStory(volumeId, storyId, run);
      created.push(storyId);
    }

    // Last, and it takes the Credits, the carrying link and any Path stop with it: every
    // reference to a Story cascades, and the two that would matter refused the gesture above.
    // Wrapped like every other statement that can be refused, so a reference the schema stops
    // cascading one day reaches the owner as a sentence rather than as a 500 (`./README.md`).
    await refusing(
      () => run("delete from story where id = $1", [standing.id]),
      () => `${standing.title} could not be replaced by what this object holds.`
    );

    return created;
  });
}

/**
 * The one narrative this object stands for, or the refusal that says why there is not one.
 *
 * Three ways there is no such thing, and each is a different sentence: an object nobody has
 * said anything about yet, an object standing for a work that runs across others — twenty
 * tankōbon of one *Slam Dunk*, which is not this volume's to unmake — and an object that has
 * already been split.
 */
function whatThisObjectStandsFor(carried: readonly CarriedNarrative[]): CarriedNarrative {
  const own = carried.filter((narrative) => !narrative.elsewhere);
  const [first] = own;
  if (first && own.length === 1) return first;

  const [any] = carried;
  if (!any) {
    throw new Refusal(
      "not-allowed",
      "This object stands for no narrative yet, so there is nothing to split. Record what is inside it first."
    );
  }

  if (own.length === 0) {
    throw new Refusal(
      "not-allowed",
      `${any.title} is not this object's alone — other objects carry it too, and a work running across a line is not one volume's to unmake. Say this object no longer carries it, then record what is inside it.`
    );
  }

  throw new Refusal(
    "not-allowed",
    `This object already holds ${own.length} narratives of its own. A split replaces the one narrative an object stands for, and there is more than one here.`
  );
}
