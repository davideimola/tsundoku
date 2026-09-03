import "server-only";

import { query } from "../db.ts";

// What is waiting for the owner, and what they have already decided.
//
// The Inbox is a first-class entity rather than a log (ADR-0005), and this is the shape it
// has on a screen: the sentence that was reported, whether the entry makes a record or
// changes one, which of the three entities it is about, and everything the assistant
// supplied as it supplied it. The owner reads all of it before deciding, because deciding
// is the only thing that writes.
//
// An amendment is read with one thing more, and it is the thing that makes approving a
// judgement rather than a leap: **what stands in the record today**, beside what is
// proposed for it (ADR-0011). It is read here, in the same statement, because a screen that
// fetched the records itself would be a screen holding the model's shape.
//
// **The state is derived here and stored nowhere**, like every other state in this app: an
// entry is waiting until it has been decided, and a decided one says which way it went and
// what the approval made.

/** Which of the three entities ADR-0005 allows an assistant to propose. */
export type ProposedEntity = "story" | "volume" | "series";

/**
 * What an entry asks for: a record that does not exist yet, or a change to one that does.
 *
 * The two are one boundary and not two, which is why they are one table and one decision
 * (ADR-0011): a fabricated edition and an invented ISBN are the same permanent, silent,
 * unnoticed wrong fact, and the owner turns both down in the same sitting.
 */
export type InboxAct = "create" | "amend";

/** Where an entry stands. Waiting is the Inbox; the other two are what happened to it. */
export type InboxState = "waiting" | "approved" | "rejected";

/**
 * One record the library already holds under the name a proposal uses.
 *
 * The same three things the finder answers with, and deliberately so: what it is called,
 * the id that opens it, and the one word that tells two records of one name apart — a
 * Story's Type, an object's Binding, the edition line a Series is. Two Volumes called
 * *Batman: Il lungo Halloween*, one *Must Have* and one *Paperback*, are two objects on a
 * shelf and not a duplicate, and the qualifier is the whole of what says so.
 */
export type Namesake = {
  id: string;
  name: string;
  qualifier: string | null;
};

/** One Inbox entry, as the owner reads it before deciding. */
export type InboxEntry = {
  id: string;
  /** What was said, in the words it was said in. */
  reported: string;
  act: InboxAct;
  /**
   * Which kind of record the entry is about: what a creation would make, and what table an
   * amendment's subject is in — an ISBN amendment is about a Volume, a published-count
   * amendment about a Series.
   */
  proposes: ProposedEntity;
  /** The title or reference as given, and on an amendment the record's own title. */
  reference: string;
  /** The record an amendment is about. `null` on a creation, which has no record yet. */
  subjectId: string | null;
  /**
   * Everything else the assistant supplied, untrusted and unchecked — the keys are the
   * fields the creating verb takes, so the approval form is filled from this directly. On
   * an amendment they are the fields it proposes, **and only those**: what it does not name
   * is left standing.
   */
  details: Record<string, unknown>;
  /**
   * What stands in the record today, in the same keys `details` uses — so that approving is
   * a judgement made against what is there rather than a leap (ADR-0011).
   *
   * `null` on a creation, and on an amendment whose record has been deleted since. Nulls
   * inside it are kept rather than stripped: *this Volume carries no ISBN* is the half of
   * the diff that says why the amendment was proposed at all.
   */
  standing: Record<string, unknown> | null;
  /**
   * What the library already holds under the name a **creation** proposes, so a duplicate
   * is read rather than remembered (#53).
   *
   * It is the creation's half of what `standing` is for an amendment: approving a proposal
   * is a judgement, and the fact that decides it — *there is already a Story called that* —
   * is a fact no screen and no owner can hold in their head across seventy-seven titles.
   * Empty on an amendment, which is read against the one record it names, and empty where
   * the library holds nothing called that, which is the ordinary case.
   */
  namesakes: Namesake[];
  /** `YYYY-MM-DD HH:MM`. The clock matters: an Inbox is worked through in one sitting. */
  proposedAt: string;
  state: InboxState;
  /** When the owner decided, or `null` while it is waiting. */
  decidedAt: string | null;
  /**
   * The Story, Volume or Series the approval created. `null` unless it was approved, and
   * `null` on an approved amendment, which changed a record rather than making one.
   */
  createdId: string | null;
};

/**
 * What stands in the record an entry is about, shaped in the keys the proposal uses.
 *
 * One fragment rather than three queries, and one statement rather than a screen fetching
 * the records itself. The fields are the amendable ones — `AMENDABLE_FIELDS` in
 * `../verbs/inbox.ts` is the same list on the writing side, and a field added to one wants
 * adding here, or the diff on screen shows nothing where the amendment proposes something.
 */
const STANDING = `
  case entry.proposes
    when 'volume' then (
      select jsonb_build_object(
               'title', volume.title, 'publisher', volume.publisher,
               'editionLine', volume.edition_line, 'binding', volume.binding_id,
               'language', volume.language, 'isbn', volume.isbn)
        from volume where volume.id = entry.subject_id)
    when 'story' then (
      select jsonb_build_object('title', story.title, 'typeId', story.type_id,
                                'instalments', story.instalments)
        from story where story.id = entry.subject_id)
    when 'series' then (
      select jsonb_build_object(
               'name', series.name, 'publisher', series.publisher,
               'editionLine', series.edition_line, 'publishedCount', series.published_count,
               'status', series.status)
        from series where series.id = entry.subject_id)
  end`;

/** How many namesakes are worth reading beside a proposal. A wall of them is not evidence. */
const A_FEW = 5;

/**
 * A name shorter than this is only a namesake of a record called **exactly** that.
 *
 * Without it the containment below is a coincidence generator: a Story called *It* or *Ai*
 * stands inside half the titles in the library, every one of those false matches opens a
 * group the owner had folded shut, and a screen that cries wolf on the ordinary case is a
 * screen they stop reading — which is the failure this whole thing exists to fix.
 */
const A_SCRAP_OF_A_NAME = 4;

/**
 * Where the records of one kind are, as the fragment below needs them: the table, what the
 * record is called, and what qualifies it.
 *
 * A table rather than three hand-written branches, for `finder.ts`'s reason — the three
 * have to be matched the *same* way, and an accent fold applied to two of them and
 * forgotten on the third is a duplicate that gets approved. The columns are the finder's
 * too, because this asks the finder's question about one kind of record: *what in this
 * library is called that?*
 */
type Named = {
  proposes: ProposedEntity;
  /** The table and whatever it must be joined to for its qualifier, aliased. */
  from: string;
  id: string;
  /** The column a proposal's `reference` is compared against. */
  name: string;
  /** The one word that tells two records of one name apart. */
  qualifier: string;
};

const NAMED: readonly Named[] = [
  {
    proposes: "story",
    from: "story s join type t on t.id = s.type_id",
    id: "s.id",
    name: "s.title",
    qualifier: "t.name",
  },
  {
    // The **catalogue**, not the Collection (ADR-0007). An object the owner catalogued and
    // never had is exactly what a second proposal would duplicate, and a match read off the
    // Collection would miss every one of them.
    proposes: "volume",
    from: "volume v join binding b on b.id = v.binding_id",
    id: "v.id",
    name: "v.title",
    qualifier: "b.name",
  },
  {
    proposes: "series",
    from: "series se",
    id: "se.id",
    name: "se.name",
    qualifier: "se.edition_line",
  },
];

/**
 * The records already called what one creation proposes.
 *
 * Four decisions, and each one is about the mistake this is for — an assistant proposing a
 * record the library already holds (#53):
 *
 *   - **the match runs both ways.** A name containing the proposal *and* a proposal
 *     containing the name, because the two duplicates that actually arrive are *Slam Dunk*
 *     proposed over *Slam Dunk 1* and *Slam Dunk 1* proposed over *Slam Dunk*. A screen
 *     showing only the first would be silent on the twenty-first narrative named after a
 *     volume, which is the one this library already has on its shelves;
 *   - **and only where the shorter of the two is a name rather than a scrap.** Containment
 *     both ways is a coincidence generator over short names, so under
 *     `A_SCRAP_OF_A_NAME` characters nothing but an exact match counts — where the finder
 *     answers a question the owner asked and can retype, this speaks unbidden and is read
 *     as a warning;
 *   - **`strpos` over `unaccent`, both sides**, which is `finder.ts`'s matching and not a
 *     second one: `perche` finds *Perché*, and `%` is an ordinary character in *100%
 *     Doraemon* rather than a wildcard;
 *   - **only its own kind.** A Story, a Series and a Volume of one name are what this
 *     library is *for* (ADR-0001), so a proposal is read against the records it could
 *     duplicate and against nothing else. A screen warning about the other two would be a
 *     screen crying wolf on the ordinary case.
 *
 * The name it matches exactly comes first, and the rest read alphabetically.
 */
function namesakesOn(named: Named): string {
  const folded = `lower(unaccent(${named.name}))`;

  return `when '${named.proposes}' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', found.id, 'name', found.name, 'qualifier', found.qualifier)), '[]'::jsonb)
        from (select ${named.id}::text as id, ${named.name} as name, ${named.qualifier} as qualifier
                from ${named.from}
               where ${folded} = proposed.name
                  or (length(proposed.name) >= ${A_SCRAP_OF_A_NAME}
                      and strpos(${folded}, proposed.name) > 0)
                  or (length(${folded}) >= ${A_SCRAP_OF_A_NAME}
                      and strpos(proposed.name, ${folded}) > 0)
               order by case when ${folded} = proposed.name then 0 else 1 end, ${named.name}
               limit ${A_FEW}) as found)`;
}

/**
 * What the library already holds under an entry's name, or nothing to read.
 *
 * `'[]'` rather than `null` in the two cases that are not a match — an amendment, which is
 * read against its own record, and a proposal naming nothing at all — because *nothing is
 * called that* and *this entry is not that kind of question* are both answered by an empty
 * list, and a screen with one shape to draw cannot get the second case wrong.
 */
const NAMESAKES = `
  case when entry.act = 'create' and btrim(entry.reference) <> '' then (
    select case entry.proposes
             ${NAMED.map(namesakesOn).join("\n             ")}
           end
      from (select lower(unaccent(entry.reference)) as name) as proposed)
  end`;

const ENTRY = `
  entry.id,
  entry.reported,
  entry.act,
  entry.proposes,
  entry.reference,
  entry.subject_id                                       as "subjectId",
  entry.details,
  ${STANDING}                                            as standing,
  to_char(entry.proposed_at, 'YYYY-MM-DD HH24:MI')       as "proposedAt",
  coalesce(entry.outcome, 'waiting')                     as state,
  to_char(entry.decided_at, 'YYYY-MM-DD HH24:MI')        as "decidedAt",
  entry.created_id                                       as "createdId"`;

/**
 * What is waiting for a decision, **oldest first**.
 *
 * An Inbox is worked through rather than browsed, so it reads in the order things arrived:
 * the oldest proposal is the one that has been waiting longest, and putting the newest at
 * the top would leave it there forever.
 */
export async function listWaitingInboxEntries(): Promise<InboxEntry[]> {
  return query<InboxEntry>(
    `select ${ENTRY},
            coalesce(${NAMESAKES}, '[]'::jsonb) as namesakes
       from inbox_entry as entry
      where entry.decided_at is null
      order by entry.proposed_at, entry.id`
  );
}

/**
 * What the owner has already decided, most recently first.
 *
 * It is kept and shown because an approval is a receipt — *this proposal became that row*
 * — and because a rejection is the one act in this app whose whole effect is an absence:
 * the entry is the only place the owner can see that they said no to something.
 */
export async function listDecidedInboxEntries(): Promise<InboxEntry[]> {
  return query<InboxEntry>(
    // **Namesakes are the waiting list's alone**, and not to save the three subqueries: an
    // approved creation's namesake is the record its own approval made, so reading them
    // here would answer *there is already one of these* about a decision the owner took and
    // a row they now own.
    `select ${ENTRY}, '[]'::jsonb as namesakes
       from inbox_entry as entry
      where entry.decided_at is not null
      order by entry.decided_at desc, entry.id`
  );
}

/**
 * How many proposals are waiting.
 *
 * Its own statement rather than the length of the list above, because it is read where the
 * list is not: the home page says how many there are so that the Inbox is not a screen the
 * owner has to remember to open. A boundary nobody looks at is a boundary that fills up.
 */
export async function countWaitingInboxEntries(): Promise<number> {
  const [counted] = await query<{ waiting: number }>(
    "select count(*)::int as waiting from inbox_entry where decided_at is null"
  );
  return counted.waiting;
}
