import "server-only";

import { query } from "../db.ts";
import type { InboxEntry, ProposedEntity } from "../queries/inbox.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { catalogueVolume } from "./collection.ts";
import { declareSeries } from "./series.ts";
import { createStory } from "./story.ts";

// The Inbox's verbs, and with them the write boundary ADR-0005 draws.
//
// Everything else in this directory is a verb over entities that **already exist**, and
// the MCP door calls those directly: they are narrow, reversible and wrong in an obvious
// way. Creating a Story, a Volume or a Series is the other kind of act — a hallucinated
// title or a fabricated edition becomes a permanent duplicate the owner carries forever —
// so an external assistant cannot do it. It can only say what it heard, and that lands
// here.
//
// Three verbs propose and two decide, and the shape of the set is the boundary:
//
//   proposeStory / proposeVolume / proposeSeries   an assistant says what it heard
//   approveInboxEntry                             the owner creates the entity
//   rejectInboxEntry                              the owner does not, and nothing happened
//
// **Approval is the act that creates the entity.** There is no promotion, no pending row
// in `story` and no flag to flip: until the owner approves, the entry is the only trace
// the proposal has anywhere, which is exactly why a rejected one leaves nothing in the
// domain. And approval creating the entity is why it is *one* transaction — an entry
// marked approved that created nothing, or an entity no entry accounts for, are both
// lies, and neither is representable here (`../transaction.ts`).
//
// The owner corrects on the way through. `details` is the assistant's guess, unchecked and
// untrusted, and the realistic case is a Binding it invented or a publisher it half
// remembered; the approval takes what the owner confirmed and the creating verb refuses
// what is still wrong, in its own prose. That is the friction earning its place.

// An entry's id is generated, so nothing types one: what arrives here came from the screen
// the owner is looking at. A malformed one is the same event as an unknown one — there is
// nothing to decide — and saying so here keeps it from reaching the driver as a syntax
// error on a uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_ENTRY = "No Inbox entry has that id.";

/** What every proposal carries: the sentence it came out of. */
type Reported = {
  /**
   * What was said, in the words it was said in — *"Ho comprato Ultimate Spider-Man
   * Omnibus 1"*. It is what the owner reads when deciding, so it is required: a proposal
   * with no sentence behind it is a row nobody can judge.
   */
  reported: string;
};

/** A Story an assistant heard about and cannot create. */
export type ProposedStory = Reported & {
  title: string;
  /** A Type's slug, where the assistant knew one. */
  typeId?: string | null;
};

/** An object an assistant heard about and cannot catalogue. */
export type ProposedVolume = Reported & {
  title: string;
  publisher?: string | null;
  editionLine?: string | null;
  /** A Binding id. The field an assistant most often guesses wrong. */
  binding?: string | null;
  language?: string | null;
  isbn?: string | null;
};

/** A publisher's line an assistant heard about and cannot declare. */
export type ProposedSeries = Reported & {
  name: string;
  publisher?: string | null;
  editionLine?: string | null;
  /**
   * How many Volumes are out. A string where the assistant sent something that is not a
   * number: `details` is raw on purpose, and keeping *twenty* is how the owner gets to see
   * what was said and fix it, where dropping it would silently lose the only claim made.
   */
  publishedCount?: number | string | null;
  status?: string | null;
};

/**
 * Every field a proposal can carry, across the three entities.
 *
 * Named here rather than in the screen that renders them, because they are the creating
 * verbs' arguments and not the form's: a door that kept its own list would be a door
 * deciding what the core takes. The screen offers the ones the entity being proposed has,
 * and reads this to know what an approval is allowed to correct.
 */
export const PROPOSAL_FIELDS = [
  "title",
  "typeId",
  "name",
  "publisher",
  "editionLine",
  "binding",
  "language",
  "isbn",
  "publishedCount",
  "status",
] as const;

/** One of them. */
export type ProposalField = (typeof PROPOSAL_FIELDS)[number];

/**
 * What the owner confirmed at the moment of approving, over what was proposed.
 *
 * Keys are the fields above, which are the keys `details` already holds — so the form is
 * filled from the proposal and comes back as a correction of it. **`null` is a correction**:
 * an edition line the object does not have is taken back by emptying it, not by leaving it
 * alone, and a field absent here is one the owner was not asked about.
 */
export type InboxCorrections = Partial<Record<ProposalField, string | number | null>>;

/** An entry as the approval reads it, under the row lock. */
type WaitingEntry = Pick<InboxEntry, "proposes"> & {
  details: Record<string, unknown>;
  outcome: string | null;
};

/**
 * Propose a Story: an assistant heard about one the library does not have.
 *
 * It creates **no Story**. What it creates is an Inbox entry the owner approves, which is
 * the only door a new Story enters through from outside (ADR-0005).
 */
export async function proposeStory(story: ProposedStory): Promise<{ id: string }> {
  return propose(story.reported, "story", story.title, {
    title: story.title,
    typeId: story.typeId,
  });
}

/**
 * Propose a Volume: an assistant heard about an object the library has not catalogued.
 *
 * It catalogues **nothing**, and it says nothing about the house either — approving it
 * catalogues the object, and whether it is on the shelf is the separate act ADR-0007 split
 * off (`acquireVolume`, which MCP may call directly once the object exists).
 */
export async function proposeVolume(volume: ProposedVolume): Promise<{ id: string }> {
  return propose(volume.reported, "volume", volume.title, {
    title: volume.title,
    publisher: volume.publisher,
    editionLine: volume.editionLine,
    binding: volume.binding,
    language: volume.language,
    isbn: volume.isbn,
  });
}

/**
 * Propose a Series: an assistant read a publisher's line off a shop page.
 *
 * It declares **no Series**, and approving it declares one without starting a collecting
 * project — that decision is the owner's own verb and nothing implies it (CONTEXT.md).
 */
export async function proposeSeries(series: ProposedSeries): Promise<{ id: string }> {
  return propose(series.reported, "series", series.name, {
    name: series.name,
    publisher: series.publisher,
    editionLine: series.editionLine,
    publishedCount: series.publishedCount,
    status: series.status,
  });
}

/**
 * Approve an entry: **this is the act that creates the entity.** Returns what it made.
 *
 * One transaction, so the entity and the entry that became it land together. Anything the
 * creating verb refuses — a Binding that is not one, a blank title, a Series already
 * declared — is refused in that verb's own prose and the whole approval rolls back, which
 * leaves the entry waiting for the owner to fix and try again rather than half-decided.
 *
 * Refused on an entry that has already been decided. Approving is not repeatable: a second
 * approval would be a second entity for one proposal, which is the duplicate this whole
 * boundary exists to prevent.
 */
export async function approveInboxEntry(
  entryId: string,
  corrections: InboxCorrections = {}
): Promise<{ createdId: string }> {
  if (!UUID.test(entryId)) throw new Refusal("not-found", NO_SUCH_ENTRY);

  return transaction(async (run) => {
    // `for update` for the length of the transaction, so two approvals of one entry cannot
    // both read it as waiting and both create an entity. The entry is the lock: there is
    // nothing else in the database yet to take one on.
    const [entry] = await run<WaitingEntry>(
      `select proposes, details, outcome from inbox_entry where id = $1 for update`,
      [entryId]
    );
    if (!entry) throw new Refusal("not-found", NO_SUCH_ENTRY);
    refuseADecidedEntry(entry);

    const said = { ...entry.details, ...corrections };
    const createdId = await create(entry.proposes, said, run);

    await run(
      `update inbox_entry
          set decided_at = now(), outcome = 'approved', created_id = $2
        where id = $1`,
      [entryId, createdId]
    );

    return { createdId };
  });
}

/**
 * Reject an entry: the owner does not want it, and **nothing happened**.
 *
 * No Story, no Volume, no Series, and nothing to undo — the proposal never wrote anything
 * outside the Inbox, so refusing it is the absence of an act rather than the reversal of
 * one. The entry is kept, decided, because a rejection whose whole effect is an absence
 * would otherwise be invisible to the owner who made it.
 *
 * Refused on an entry that has already been decided.
 */
export async function rejectInboxEntry(entryId: string): Promise<void> {
  if (!UUID.test(entryId)) throw new Refusal("not-found", NO_SUCH_ENTRY);

  // One statement, so the read that diagnoses a no-op cannot disagree with the write:
  // `known` sees the entry as it was, `rejected` is the decision when there was one to
  // make.
  const [outcome] = await refusing(
    () =>
      query<{ known: boolean; outcome: string | null; rejected: boolean }>(
        `with known as (
           select id, outcome from inbox_entry where id = $1
         ), rejected as (
           update inbox_entry set decided_at = now(), outcome = 'rejected'
            where id = $1 and decided_at is null
           returning id
         )
         select exists (select 1 from known)    as known,
                (select outcome from known)     as outcome,
                exists (select 1 from rejected) as rejected`,
        [entryId]
      ),
    "That Inbox entry could not be rejected."
  );

  if (!outcome.known) throw new Refusal("not-found", NO_SUCH_ENTRY);
  if (!outcome.rejected) refuseADecidedEntry(outcome);
}

/** The one insert, and the only thing a proposal does anywhere. */
async function propose(
  reported: string,
  proposes: ProposedEntity,
  reference: string,
  details: Record<string, unknown>
): Promise<{ id: string }> {
  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into inbox_entry (reported, proposes, reference, details)
         values (btrim($1), $2, btrim($3), $4)
         returning id`,
        [reported ?? "", proposes, reference ?? "", said(details)]
      ),
    (constraint) => {
      switch (constraint) {
        case "inbox_entry_reported_is_not_blank":
          return "An Inbox entry says what was said. Report the sentence it came out of.";
        case "inbox_entry_reference_is_not_blank":
          return "A proposal names something: the title, or the reference as it was given.";
        case "inbox_entry_proposes_a_story_volume_or_series":
          return "Only a Story, a Volume or a Series can be proposed.";
        default:
          return "That proposal could not be recorded.";
      }
    }
  );

  const [proposed] = rows;
  if (!proposed) throw new Error("insert into inbox_entry returned no row");
  return proposed;
}

/**
 * The details as they are kept: trimmed, and without the fields nobody said anything
 * about.
 *
 * An absent field and a field holding an empty string are the same event — the assistant
 * did not know — and keeping the second would put a blank into the approval form where the
 * owner reads it as *they told me this*.
 */
function said(details: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      const written = value.trim();
      if (written === "") continue;
      kept[key] = written;
      continue;
    }
    kept[key] = value;
  }
  return kept;
}

/** Create the entity the entry proposed, with the creating verb that owns the prose. */
async function create(
  proposes: ProposedEntity,
  said: Record<string, unknown>,
  run: Executor
): Promise<string> {
  switch (proposes) {
    case "story":
      return createStory(
        {
          title: needed(said, "title", "A Story needs a title."),
          // Deliberately no list of the Types in this prose: they are data rows and
          // nothing in TypeScript enumerates them (ADR-0006).
          typeId: needed(said, "typeId", "A Story needs a Type. Choose one before approving."),
        },
        run
      );
    case "volume": {
      const { id } = await catalogueVolume(
        {
          title: needed(said, "title", "A Volume needs the title printed on it."),
          publisher: needed(said, "publisher", "A Volume needs its publisher."),
          binding: needed(said, "binding", "A Volume needs the Binding it was bound in."),
          language: needed(said, "language", "A Volume needs the language it is printed in."),
          editionLine: optional(said, "editionLine"),
          isbn: optional(said, "isbn"),
        },
        run
      );
      return id;
    }
    case "series":
      return declareSeries(
        {
          name: needed(said, "name", "A Series needs a name."),
          publisher: needed(said, "publisher", "A Series needs its publisher."),
          editionLine: optional(said, "editionLine"),
          // `Number` rather than a check of its own: a count that is not a whole number is
          // refused by `declareSeries` in the prose it already writes, and nought is a
          // legitimate answer — an announced Series with nothing out yet.
          publishedCount: Number(
            needed(
              said,
              "publishedCount",
              "A Series needs how many Volumes are out. Nought is an answer."
            )
          ),
          status: needed(said, "status", "Say whether the Series is ongoing or concluded.") as
            | "ongoing"
            | "concluded",
        },
        run
      );
  }
}

/** A field the entity cannot be created without, refused in prose where it is missing. */
function needed(said: Record<string, unknown>, key: string, prose: string): string {
  const value = optional(said, key);
  if (value === null) throw new Refusal("invalid", prose);
  return value;
}

/** A field as text, or `null` where nothing was said about it. */
function optional(said: Record<string, unknown>, key: string): string | null {
  const value = said[key];
  if (value === null || value === undefined) return null;
  const written = String(value).trim();
  return written === "" ? null : written;
}

/**
 * Refuse a second decision on an entry, naming which one was already made.
 *
 * Two prose answers rather than one, because they are different mistakes: an approved
 * entry is already a row in the library and the owner is looking at the wrong entry, while
 * a rejected one is a decision they are trying to take back — and taking it back is
 * proposing the thing again, not deciding this entry twice.
 */
function refuseADecidedEntry(entry: { outcome: string | null }): void {
  if (entry.outcome === "approved") {
    throw new Refusal(
      "not-allowed",
      "That Inbox entry was already approved, and the entity it created is in the library."
    );
  }
  if (entry.outcome === "rejected") {
    throw new Refusal(
      "not-allowed",
      "That Inbox entry was already rejected. Proposing the thing again is a new entry."
    );
  }
}
