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
      select jsonb_build_object('title', story.title, 'typeId', story.type_id)
        from story where story.id = entry.subject_id)
    when 'series' then (
      select jsonb_build_object(
               'name', series.name, 'publisher', series.publisher,
               'editionLine', series.edition_line, 'publishedCount', series.published_count,
               'status', series.status)
        from series where series.id = entry.subject_id)
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
    `select ${ENTRY}
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
    `select ${ENTRY}
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
