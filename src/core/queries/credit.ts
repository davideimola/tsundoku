import "server-only";

import { query } from "../db.ts";
import type { FacedWith } from "./cover.ts";
import {
  HOW_MANY_NARRATIVES_WEAR_THAT_JACKET,
  HOW_MANY_OBJECTS_CARRY_IT,
  STORY_STATE,
  type StoryState,
  THE_COVER_IT_IS_FACED_OUT_WITH,
  THE_LINE_IT_STANDS_IN,
  type WallSeries,
} from "./story.ts";

// What the owner and an external reader ask about the people the library credits.
//
// A Credit is a person's contribution to a **Story** in a named role. The Credits *of a
// Story* are read with the Story itself, in `queries/story.ts`, because they are part of
// the answer to *"what is this?"*; this file answers the other direction — *"what have I
// read by them?"* — which is a screen of its own (user story 15).
//
// And one question asked from the Story's own page rather than from a screen of its own:
// *"who do I already credit called that?"*, which is what the picker under the name field
// reads while it is being typed into (#28). It is here because it is a question about the
// people, and it is the same list `listCreditedPeople` answers with, narrowed to a name.

/** A role a Credit is held in: Writer, Artist. */
export type CreditRole = {
  id: string;
  name: string;
};

/**
 * Every role a Credit can be held in, in the order a comic is credited in.
 *
 * No union of string literals here, for the reason `Type` and `Binding` have none
 * (ADR-0006): a role is a data row, and comic credits are the clearest vocabulary there
 * is of one that grows — a colourist, a letterer, an inker. A type enumerating today's
 * two would make the third a deployment.
 */
export async function listCreditRoles(): Promise<CreditRole[]> {
  return query<CreditRole>("select id, name from credit_role order by display_order");
}

// Every role a person holds **anywhere** in the library, in the order a comic is credited
// in — a person's own vocabulary rather than their roles on any one Story. Written once
// because two of the answers below carry it, and two copies of it are two lists that can
// come to disagree about what a person is.
//
// It reads `p.id`, so the statement spending it has to be the one that aliases `person` as
// `p`. Said here because nothing else can say it: a third caller aliasing it otherwise gets a
// SQL error about a column nobody wrote.
const ROLES_HELD = `
  (select coalesce(jsonb_agg(jsonb_build_object('id', cr.id, 'name', cr.name)
                             order by cr.display_order), '[]'::jsonb)
     from (select distinct c.role_id from credit c where c.person_id = p.id) held
     join credit_role cr on cr.id = held.role_id)`;

/** Someone the library credits, as the list of them shows it. */
export type CreditedPerson = {
  id: string;
  name: string;
  /** Every role they hold anywhere, in the order roles are credited in. */
  roles: CreditRole[];
  /** Stories they are credited on. */
  storyCount: number;
  /**
   * How many of those went through a Reading — which is what makes the difference
   * between having heard of someone and having read them.
   */
  readCount: number;
};

/**
 * Everyone the library credits, by name.
 *
 * Only people who hold a Credit: a Person exists in order to be pointed at, so one that
 * nothing points at is not an answer to any question this screen asks. Removing a Credit
 * therefore takes its person off this list when it was their last, without deleting
 * anybody.
 */
export async function listCreditedPeople(): Promise<CreditedPerson[]> {
  return query<CreditedPerson>(
    `select
       p.id,
       p.name,
       ${ROLES_HELD} as roles,
       (select count(distinct c.story_id)::int
          from credit c
         where c.person_id = p.id) as "storyCount",
       -- "Read" goes through the Readings and never through the Stories that merely
       -- exist. An abandoned Reading counts: giving up on it is still an act of reading,
       -- and the Story's state says which it was.
       (select count(distinct c.story_id)::int
          from credit c
         where c.person_id = p.id
           and exists (select 1 from reading r where r.story_id = c.story_id)) as "readCount"
     from person p
    where exists (select 1 from credit c where c.person_id = p.id)
    order by lower(p.name), p.id`
  );
}

/**
 * A Story as a person's body of work shows it — **which is a tile on a wall now** (#31),
 * so what it carries is what the tile is drawn from.
 *
 * The three facts beyond the title are the Story wall's own, read here through the same
 * fragments (`queries/story.ts`): the state, derived from the Readings and stored nowhere;
 * the line it stands in, for the colour; and the jacket, where an object carrying it has
 * one. A Story is the same tile wherever it is drawn, and that is what makes a wall of
 * somebody's work recognisable to an owner who has learnt their shelf.
 */
export type CreditedStory = {
  id: string;
  title: string;
  type: { id: string; name: string };
  /** The roles this person held on this Story. Both, where they held both. */
  roles: CreditRole[];
  readingCount: number;
  /** The score the owner set most recently, or `null` if they set none. */
  latestScore: number | null;
  /**
   * Where the owner is with it — `to-read`, `reading`, `read`, `abandoned` — derived from
   * the Readings on this request like everywhere else.
   *
   * It is **finer than the split below and does not replace it**: `read` and `notRead`
   * answer *what have I read by them*, and this says which of the four a Story in either
   * list actually is, which is what the tile prints under itself.
   */
  state: StoryState;
  /** The line an object carrying it stands in, or `null` where none does. */
  series: WallSeries | null;
  /** The jacket an object carrying it is faced with, or `null` — the drawn tile. */
  cover: FacedWith | null;
  /**
   * How many objects carry it, which is what tells the tile whether that borrowed jacket
   * stands for one object or for a run (#34).
   *
   * The fourth of the Story wall's own facts, here for the reason the other three are: a wall
   * of somebody's work is the same tile, and a run drawn as a stack on `/stories` and as a
   * single object here would be one narrative claiming two things.
   */
  carriedBy: number;
  /**
   * How many narratives wear that jacket, which is what tells the tile whether the picture is
   * its own — the fifth of the wall's facts, and here for the reason the other four are.
   *
   * A person's body of work is where an omnibus shows up hardest: four of the tales Jeph Loeb
   * wrote are in one book, so without this the band under his name is the same picture four
   * times.
   */
  wornBy: number;
};

/** One person, split by whether the owner has actually read the thing. */
export type PersonCredits = {
  id: string;
  name: string;
  /**
   * Every role they hold **anywhere in the library**, in the order a comic is credited in.
   *
   * It is here because a person's body of work is read split by role (#31), and the bands
   * cannot be read off the Stories: somebody who drew one book and wrote another would be
   * banded in whichever order the titles fell. This is their own vocabulary, and it is the
   * same list `listCreditedPeople` puts under a name.
   */
  roles: CreditRole[];
  /**
   * The Stories credited to them that went through at least one Reading — *everything
   * read by this Credit*, which is the question the screen exists for.
   */
  read: CreditedStory[];
  /** The rest: credited, in the library, and never opened. */
  notRead: CreditedStory[];
};

// The Story shape, as the aggregate below builds it. `roles` is the person's roles on
// that Story rather than all of theirs, which is why it is a correlated subquery and not
// a join.
const CREDITED_STORY = `
  jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'type', jsonb_build_object('id', t.id, 'name', t.name),
    'roles', (
      select coalesce(jsonb_agg(jsonb_build_object('id', cr.id, 'name', cr.name)
                                order by cr.display_order), '[]'::jsonb)
        from credit c
        join credit_role cr on cr.id = c.role_id
       where c.person_id = p.id and c.story_id = s.id
    ),
    'readingCount', (select count(*)::int from reading r where r.story_id = s.id),
    'latestScore', (select g.score::float8
                      from rating g
                     where g.story_id = s.id
                     order by g.set_at desc
                     limit 1),
    'state', ${STORY_STATE},
    'series', ${THE_LINE_IT_STANDS_IN},
    'cover', ${THE_COVER_IT_IS_FACED_OUT_WITH},
    'carriedBy', ${HOW_MANY_OBJECTS_CARRY_IT},
    'wornBy', ${HOW_MANY_NARRATIVES_WEAR_THAT_JACKET}
  )`;

// The two lists, which differ by one word. `whetherRead` is `exists` for what went
// through a Reading and `not exists` for the rest — written once, because the two halves
// answering one question in two copies of the same block is how they would come to
// disagree about what "read" means.
const CREDITED_STORIES = (whetherRead: "exists" | "not exists") => `
  coalesce((
    select jsonb_agg(${CREDITED_STORY} order by lower(s.title), s.id)
      from story s
      join type t on t.id = s.type_id
     where exists (select 1 from credit c
                    where c.person_id = p.id and c.story_id = s.id)
       and ${whetherRead} (select 1 from reading r where r.story_id = s.id)
  ), '[]'::jsonb)`;

// A person's id is generated, so a malformed one is the same event as an unknown one —
// see the verb for why the guard is here rather than in an adapter.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One person with everything they are credited on, read and unread. `null` when there is
 * no such person.
 *
 * The split is the answer: *"what have I read by Jeph Loeb before I commit to the
 * omnibus"* is about the Readings, so a Story sitting credited and unopened must not be
 * counted among them — while hiding it altogether would answer the next question
 * (*"what of his do I still have to read"*) with silence.
 *
 * Both lists are by title, for the reason `listStories` is: the list answers by being
 * readable, and any other order is an opinion the screen has not asked for.
 *
 * One statement rather than one per list, because the two lists are the answer to the
 * same question and reading them separately would be reading two different moments.
 */
export async function findCreditedPerson(personId: string): Promise<PersonCredits | null> {
  if (!UUID.test(personId)) return null;

  const rows = await query<PersonCredits>(
    `select
       p.id,
       p.name,
       ${ROLES_HELD} as roles,
       ${CREDITED_STORIES("exists")} as read,
       ${CREDITED_STORIES("not exists")} as "notRead"
     from person p
    where p.id = $1`,
    [personId]
  );

  return rows[0] ?? null;
}

/** Someone the library already credits, as a row under a field being typed into. */
export type PersonSuggestion = {
  id: string;
  name: string;
  /** Every role they hold anywhere, in the order roles are credited in. */
  roles: CreditRole[];
};

/** What the picker asked. */
export type PersonSuggestionFilter = {
  /** What has been typed so far. Blank suggests nobody, which is a real answer. */
  term: string;
  /**
   * How many to answer with, or the few below.
   *
   * **No guard against a number that is not a count**, which is where this deliberately
   * differs from the finder's `perKind`: that one is reachable over MCP, so it earns its
   * defence against the `NaN` an assistant filling in a schema can send. This is asked by one
   * screen, with a constant, on the owner's side of the gate — and a defence written for a
   * caller that does not exist is a line nobody can test.
   */
  atMost?: number;
};

/** A suggestion list's worth: what fits under a field without covering the form. */
const A_FEW = 6;

// **Where in the name what was typed appears** — 0 for nowhere and 1 for the very start —
// over both sides folded. Written once because it is what the `where` filters on *and* what
// the `order by` ranks on, and a fold applied in one of the two and forgotten in the other is
// a list that answers a question nobody asked.
const MATCHED_AT = "strpos(lower(unaccent(p.name)), typed.term)";

// The whole statement, built once at module load rather than per call: what varies is the two
// parameters. The matching is `queries/finder.ts`'s, deliberately — `unaccent` on both sides so
// `otomo` reaches *Ōtomo* and neither spelling is the special case, and `strpos` rather than
// `ilike '%…%'` so what was typed is a name and not a pattern. The one piece of ranking is the
// same too: a name that *starts* with what was typed is the likelier one.
const THE_PEOPLE_ALREADY_CREDITED = `
  with typed as (select lower(unaccent($1::text)) as term)
  select
    p.id,
    p.name,
    ${ROLES_HELD} as roles
  from person p
  cross join typed
 where exists (select 1 from credit c where c.person_id = p.id)
   and ${MATCHED_AT} > 0
 order by case when ${MATCHED_AT} = 1 then 0 else 1 end,
          lower(p.name),
          p.id
 limit $2`;

/**
 * The people the library already credits whose name holds what has been typed.
 *
 * **This is what stops a second Yusuke Murata.** The name is unique on `lower(name)` and
 * there is no rename and no merge (ADR-0012), so a second spelling is a second person for
 * as long as the library stands, splitting every answer about them in two. The field this
 * fills is a convenience over one that works without it (ADR-0010) — a name typed in full
 * reaches the same verb whether these arrived or not — so what it has to be is *right*
 * rather than present: a suggestion the owner takes has to be the spelling that is already
 * there, character for character, because that is the whole of what makes it the same
 * person.
 *
 * **Only people who already hold a Credit**, for the reason `listCreditedPeople` says: a
 * Person exists in order to be pointed at, and the import wrote rows the `Autore` column
 * never filled. Offering one of those would be suggesting somebody the library has not met.
 *
 * It is not the finder itself, and the difference is the question rather than the mechanism:
 * the finder answers *what in this library is called that* across five kinds, and this
 * answers *who do I already credit* — the Credit area's own question, asked with a Story
 * open and a role about to be chosen beside it.
 *
 * **A blank term suggests nobody**, and that is an answer rather than a shortcut: a field
 * nobody has typed into has asked no question.
 */
export async function suggestCreditedPeople(
  filter: PersonSuggestionFilter
): Promise<PersonSuggestion[]> {
  const term = filter.term.trim();
  if (term === "") return [];

  return query<PersonSuggestion>(THE_PEOPLE_ALREADY_CREDITED, [term, filter.atMost ?? A_FEW]);
}
