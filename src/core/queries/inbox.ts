import "server-only";

import { query } from "../db.ts";

// What is waiting for the owner, and what they have already decided.
//
// The Inbox is a first-class entity rather than a log (ADR-0005), and this is the shape it
// has on a screen: the sentence that was reported, which of the three entities is being
// proposed, and everything the assistant supplied as it supplied it. The owner reads all
// of it before deciding, because deciding is the only thing that writes.
//
// **The state is derived here and stored nowhere**, like every other state in this app: an
// entry is waiting until it has been decided, and a decided one says which way it went and
// what the approval made.

/** Which of the three entities ADR-0005 allows an assistant to propose. */
export type ProposedEntity = "story" | "volume" | "series";

/** Where an entry stands. Waiting is the Inbox; the other two are what happened to it. */
export type InboxState = "waiting" | "approved" | "rejected";

/** One Inbox entry, as the owner reads it before deciding. */
export type InboxEntry = {
  id: string;
  /** What was said, in the words it was said in. */
  reported: string;
  proposes: ProposedEntity;
  /** The title or reference as given. */
  reference: string;
  /**
   * Everything else the assistant supplied, untrusted and unchecked — the keys are the
   * fields the creating verb takes, so the approval form is filled from this directly.
   */
  details: Record<string, unknown>;
  /** `YYYY-MM-DD HH:MM`. The clock matters: an Inbox is worked through in one sitting. */
  proposedAt: string;
  state: InboxState;
  /** When the owner decided, or `null` while it is waiting. */
  decidedAt: string | null;
  /** The Story, Volume or Series the approval created. `null` unless it was approved. */
  createdId: string | null;
};

const ENTRY = `
  id,
  reported,
  proposes,
  reference,
  details,
  to_char(proposed_at, 'YYYY-MM-DD HH24:MI')             as "proposedAt",
  coalesce(outcome, 'waiting')                           as state,
  to_char(decided_at, 'YYYY-MM-DD HH24:MI')              as "decidedAt",
  created_id                                             as "createdId"`;

/**
 * What is waiting for a decision, **oldest first**.
 *
 * An Inbox is worked through rather than browsed, so it reads in the order things arrived:
 * the oldest proposal is the one that has been waiting longest, and putting the newest at
 * the top would leave it there forever.
 */
export async function listWaitingInboxEntries(): Promise<InboxEntry[]> {
  return query<InboxEntry>(
    `select ${ENTRY} from inbox_entry where decided_at is null order by proposed_at, id`
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
    `select ${ENTRY} from inbox_entry
      where decided_at is not null
      order by decided_at desc, id`
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
