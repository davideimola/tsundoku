import "server-only";

import { query } from "../db.ts";

// What the owner and an external reader ask about the people the library credits.
//
// A Credit is a person's contribution to a **Story** in a named role. The Credits *of a
// Story* are read with the Story itself, in `queries/story.ts`, because they are part of
// the answer to *"what is this?"*; this file answers the other direction — *"what have I
// read by them?"* — which is a screen of its own (user story 15).

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
       (select coalesce(jsonb_agg(jsonb_build_object('id', cr.id, 'name', cr.name)
                                  order by cr.display_order), '[]'::jsonb)
          from (select distinct c.role_id from credit c where c.person_id = p.id) held
          join credit_role cr on cr.id = held.role_id) as roles,
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

/** A Story as the people screen shows it: enough to recognise it, and nothing more. */
export type CreditedStory = {
  id: string;
  title: string;
  type: { id: string; name: string };
  /** The roles this person held on this Story. Both, where they held both. */
  roles: CreditRole[];
  readingCount: number;
  /** The score the owner set most recently, or `null` if they set none. */
  latestScore: number | null;
};

/** One person, split by whether the owner has actually read the thing. */
export type PersonCredits = {
  id: string;
  name: string;
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
                     limit 1)
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
       ${CREDITED_STORIES("exists")} as read,
       ${CREDITED_STORIES("not exists")} as "notRead"
     from person p
    where p.id = $1`,
    [personId]
  );

  return rows[0] ?? null;
}
