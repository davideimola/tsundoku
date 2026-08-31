import "server-only";

import { query } from "../db.ts";
import type { InboxAct, InboxEntry, ProposedEntity } from "../queries/inbox.ts";
import { isRefusal, Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { amendVolume, catalogueVolume } from "./collection.ts";
import { amendSeries, declareSeries, type SeriesStatus } from "./series.ts";
import { amendStory, createStory } from "./story.ts";

// The Inbox's verbs, and with them the write boundary ADR-0005 and ADR-0011 draw.
//
// Everything else in this directory is a verb over entities that **already exist**, and
// the MCP door calls those directly: they are narrow, reversible and wrong in an obvious
// way. Creating a Story, a Volume or a Series is the other kind of act — a hallucinated
// title or a fabricated edition becomes a permanent duplicate the owner carries forever —
// so an external assistant cannot do it. It can only say what it heard, and that lands
// here.
//
// **Completing or correcting a record that already exists is the same kind of act**, and
// it lands here too (ADR-0011). An ISBN is that risk at its purest: nobody ever reads one
// back, nothing looks wrong, and a wrong one quietly fetches another book's cover for as
// long as the record stands. So an amendment is proposed rather than written, and
// approving it is what changes the record.
//
// Four verbs propose and two decide, and the shape of the set is the boundary:
//
//   proposeStory / proposeVolume / proposeSeries   an assistant says what it heard
//   proposeAmendment                               …about a record that already exists
//   approveInboxEntries / approveInboxEntry        the owner creates it, or changes it
//   rejectInboxEntry                               the owner does not, and nothing happened
//
// **Approval is the act.** There is no promotion, no pending row in `story` and no flag to
// flip: until the owner approves, the entry is the only trace the proposal has anywhere,
// which is exactly why a rejected one leaves nothing in the domain. And approval being the
// act is why it is *one* transaction — an entry marked approved that created nothing, or an
// entity no entry accounts for, are both lies, and neither is representable here
// (`../transaction.ts`).
//
// **The selection is the unit, and the singular is the convenience.** A backfill arrives by
// the hundred, so approving is one gesture over many entries and one transaction over all
// of them: half an applied backfill is a library nobody can tell the state of, and the
// owner would have no way to find where it stopped.
//
// The owner corrects on the way through. `details` is the assistant's guess, unchecked and
// untrusted, and the realistic case is a Binding it invented or a publisher it half
// remembered; the approval takes what the owner confirmed and the verb behind it refuses
// what is still wrong, in its own prose. That is the friction earning its place.

// An entry's id is generated, so nothing types one: what arrives here came from the screen
// the owner is looking at. A malformed one is the same event as an unknown one — there is
// nothing to decide — and saying so here keeps it from reaching the driver as a syntax
// error on a uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_SUCH_ENTRY = "No Inbox entry has that id.";

/**
 * The three records the Inbox carries, and the prose for anything else.
 *
 * Said once, because it is answered in two places that must not drift: the check in front
 * of an amendment below, and the constraint behind every proposal. The other door is
 * untyped — an assistant fills in a schema, so `amends` arrives as whatever it sent — and
 * `ProposedEntity` is a promise TypeScript cannot keep across it.
 */
const AMENDS_SOMETHING_ELSE = "Only a Story, a Volume or a Series can be proposed or amended.";

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

/**
 * Which fields each kind of record can be amended in.
 *
 * The creating verbs' arguments, split by the entity that has them — a Type belongs to a
 * Story and an ISBN to a Volume, so an amendment naming the wrong one is refused rather
 * than quietly dropped, which would leave the owner approving something that does nothing.
 *
 * **These are fields of the record, and a Credit is not one.** ADR-0011 names the
 * uncredited artist alongside the missing ISBN, and it is the same risk; what differs is
 * that a Credit is a record of its own — a person in a role on a Story — rather than a
 * column to fill in, and ADR-0012 gives it a door of its own on both surfaces. So a
 * misattribution is undone by removing the Credit rather than by amending the Story.
 *
 * Exported, like `PROPOSAL_FIELDS` beside it, because it is what an approval may correct:
 * the screen offers the owner exactly the fields the record has, and the tool tells an
 * assistant what it may propose.
 */
export const AMENDABLE_FIELDS: Record<ProposedEntity, readonly ProposalField[]> = {
  story: ["title", "typeId"],
  volume: ["title", "publisher", "editionLine", "binding", "language", "isbn"],
  series: ["name", "publisher", "editionLine", "publishedCount", "status"],
};

/**
 * What each kind of record cannot be created without, in the prose it is refused in.
 *
 * The prose is the point: only the creating verb knows why a field is needed, and *A Volume
 * needs the Binding it was bound in* is what the owner reads. It is a map rather than ten
 * string literals so that the **list** of needed fields is derivable from it — the screen
 * marks a needed field the assistant left empty, and a screen keeping its own list of which
 * those are would be a screen guessing at what the core will refuse.
 */
const NEEDED = {
  story: {
    title: "A Story needs a title.",
    // Deliberately no list of the Types in this prose: they are data rows and nothing in
    // TypeScript enumerates them (ADR-0006).
    typeId: "A Story needs a Type. Choose one before approving.",
  },
  volume: {
    title: "A Volume needs the title printed on it.",
    publisher: "A Volume needs its publisher.",
    binding: "A Volume needs the Binding it was bound in.",
    language: "A Volume needs the language it is printed in.",
  },
  series: {
    name: "A Series needs a name.",
    publisher: "A Series needs its publisher.",
    publishedCount: "A Series needs how many Volumes are out. Nought is an answer.",
    status: "Say whether the Series is ongoing or concluded.",
  },
} satisfies Record<ProposedEntity, Partial<Record<ProposalField, string>>>;

/**
 * Which fields a creation cannot be approved without — the keys of the prose above.
 *
 * Derived rather than declared, so the list and the refusals cannot fall out of step: a
 * field that stops being needed stops being refused in the same edit. It is exported for
 * the same reason `AMENDABLE_FIELDS` is — the screen marks the ones the assistant left
 * empty, so an approval of two hundred entries is not refused whole over a Binding nobody
 * was told about.
 *
 * **An amendment needs none of them**: it names the fields it proposes and leaves the rest
 * standing, so a record that already exists is never missing anything.
 */
export const NEEDED_TO_CREATE: Record<ProposedEntity, readonly ProposalField[]> = {
  story: Object.keys(NEEDED.story) as ProposalField[],
  volume: Object.keys(NEEDED.volume) as ProposalField[],
  series: Object.keys(NEEDED.series) as ProposalField[],
};

/** An amendment to a record the library already holds. */
export type ProposedAmendment = Reported & {
  /** Which kind of record it is about, and therefore which table `subjectId` is in. */
  amends: ProposedEntity;
  /** The record itself. It must already exist: there is nothing else to amend. */
  subjectId: string;
  /**
   * The fields it proposes, **and only those**: what an amendment does not name is left
   * standing, so filling in an ISBN says nothing about the publisher.
   */
  proposed: InboxCorrections;
};

/** What an approval did, which is one of two things and never both. */
export type Approval = {
  entryId: string;
  act: InboxAct;
  proposes: ProposedEntity;
  /** The Story, Volume or Series it created, and `null` where it amended one. */
  createdId: string | null;
  /** The record it changed, and `null` where it created one. */
  subjectId: string | null;
};

/** An entry as the approval reads it, under the row lock. */
type WaitingEntry = Pick<InboxEntry, "proposes" | "reference"> & {
  id: string;
  act: InboxAct;
  subjectId: string | null;
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
 * Propose an Amendment: an assistant found a record that is incomplete or wrong.
 *
 * It changes **nothing**. The ISBN a Volume was catalogued without, the publisher left
 * blank, the count a Series has fallen behind on — all of it waits for the owner exactly as
 * a proposed Story does, and for the same reason (ADR-0011): an invented ISBN is a
 * permanent fact nobody reads back and nothing looks wrong about.
 *
 * The entry names the record and is refused where there is none, because an amendment
 * against nothing is a row the owner cannot judge. Its `reference` is read **off the
 * record** rather than taken from the assistant, so what an entry says it is about is what
 * it is about.
 */
export async function proposeAmendment(amendment: ProposedAmendment): Promise<{ id: string }> {
  // Before anything reads `amends` as one of the three: a Credit is a record of its own
  // rather than a field of a Story (`AMENDABLE_FIELDS`), and an assistant reaching for one
  // through here has to be told so in prose it can act on. Everything below — the fields
  // this kind of record has, the table its subject is in, the word for it in the refusals
  // — is indexed by this, so an unnamed kind reaching them is an internal error carrying
  // nothing for the caller rather than an answer.
  const amendable = AMENDABLE_FIELDS[amendment.amends] as readonly ProposalField[] | undefined;
  if (!amendable) {
    throw new Refusal(
      "invalid",
      `${AMENDS_SOMETHING_ELSE} A Credit is a record of its own rather than a field of one, so it ` +
        `is attributed on the Story and never amended into it.`
    );
  }

  const NO_SUCH_RECORD = `No ${OF[amendment.amends]} has that id, so there is nothing to amend.`;
  if (!UUID.test(amendment.subjectId ?? "")) throw new Refusal("not-found", NO_SUCH_RECORD);

  const proposed = said(amendment.proposed as Record<string, unknown>);
  const named = Object.keys(proposed);
  if (named.length === 0) {
    throw new Refusal("invalid", "An amendment proposes at least one field. Say what changes.");
  }

  const foreign = named.filter((field) => !amendable.includes(field as ProposalField));
  if (foreign.length > 0) {
    throw new Refusal(
      "invalid",
      `A ${OF[amendment.amends]} has no ${foreign.join(" and no ")}. It can be amended in: ${amendable.join(", ")}.`
    );
  }

  // One statement, so an amendment cannot name a record that was not there when it was
  // written: the row is the insert's own source, and no row means no entry. Which table it
  // reads is `proposes`, which is the whole of what polymorphism costs here.
  const rows = await refusing(
    () =>
      query<{ id: string }>(
        `insert into inbox_entry (reported, act, proposes, reference, subject_id, details)
         select btrim($1), 'amend', $2, subject.reference, subject.id, $4
           from (
                  select id, title as reference from volume where $2 = 'volume' and id = $3
            union all
                  select id, title              from story  where $2 = 'story'  and id = $3
            union all
                  select id, name               from series where $2 = 'series' and id = $3
                ) as subject
         returning id`,
        [amendment.reported ?? "", amendment.amends, amendment.subjectId, proposed]
      ),
    (constraint) => whyAProposalRefused(constraint, "That amendment could not be recorded.")
  );

  const [entry] = rows;
  if (!entry) throw new Refusal("not-found", NO_SUCH_RECORD);
  return entry;
}

/**
 * Approve a selection: **this is the act**, and it happens to every entry or to none.
 *
 * One transaction over the whole selection, because a backfill arrives by the hundred and a
 * partial failure leaves a library nobody can tell the state of (ADR-0011). Anything the
 * verb behind an entry refuses — a Binding that is not one, a blank title, a record deleted
 * while the entry waited — is refused in that verb's own prose, and every other entry in the
 * selection rolls back with it and stays waiting.
 *
 * A creation makes its entity and the entry names it; an amendment changes its record and
 * creates nothing. An entry named twice is decided once. Refused whole where one of them is
 * unknown or has already been decided: approving is not repeatable, and a second approval
 * would be a second entity for one proposal.
 *
 * `corrections` is keyed by entry id, so the one entry the owner fixed on the way through
 * travels with the selection it was fixed in.
 */
export async function approveInboxEntries(
  entryIds: readonly string[],
  corrections: Record<string, InboxCorrections> = {}
): Promise<Approval[]> {
  const chosen = [...new Set(entryIds)];
  if (chosen.length === 0) {
    throw new Refusal("invalid", "Choose the entries to approve: this decides nothing.");
  }
  for (const entryId of chosen) {
    if (!UUID.test(entryId)) throw new Refusal("not-found", NO_SUCH_ENTRY);
  }

  return transaction(async (run) => {
    // `for update` for the length of the transaction, so two approvals of one entry cannot
    // both read it as waiting and both act on it. The entries are the lock: there is
    // nothing else in the database a creation could take one on. **In id order**, which is
    // what keeps two overlapping selections from deadlocking each other half way through.
    const entries = await run<WaitingEntry>(
      `select id, act, proposes, reference, subject_id as "subjectId", details, outcome
         from inbox_entry
        where id = any($1::uuid[])
        order by id
          for update`,
      [chosen]
    );
    if (entries.length !== chosen.length) throw new Refusal("not-found", NO_SUCH_ENTRY);

    const approved = new Map<string, Approval>();
    for (const entry of entries) {
      refuseADecidedEntry(entry);
      const said = { ...entry.details, ...corrections[entry.id] };
      approved.set(entry.id, await namingTheEntry(entry, () => carryOut(entry, said, run)));
    }

    // One statement for the whole selection rather than one per entry: the decision is one
    // act, and a backfill of three hundred should cost three hundred writes rather than six
    // hundred.
    await run(
      `update inbox_entry as entry
          set decided_at = now(), outcome = 'approved', created_id = decided.created_id
         from unnest($1::uuid[], $2::uuid[]) as decided(id, created_id)
        where entry.id = decided.id`,
      [chosen, chosen.map((entryId) => approved.get(entryId)?.createdId ?? null)]
    );

    // In the order they were chosen in, which is the order the caller can read its own
    // selection back against.
    return chosen.map((entryId) => approved.get(entryId) as Approval);
  });
}

/**
 * Approve one entry, with what the owner corrected on the way through.
 *
 * The selection above is the verb; this is the one-entry gesture the screen and the tests
 * spend most of their time in, and it is that verb with one entry in it.
 */
export async function approveInboxEntry(
  entryId: string,
  corrections: InboxCorrections = {}
): Promise<Approval> {
  const [approval] = await approveInboxEntries([entryId], { [entryId]: corrections });
  return approval;
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
    (constraint) => whyAProposalRefused(constraint, "That proposal could not be recorded.")
  );

  const [proposed] = rows;
  if (!proposed) throw new Error("insert into inbox_entry returned no row");
  return proposed;
}

/** The prose for every constraint the `inbox_entry` table can refuse a proposal with. */
function whyAProposalRefused(constraint: string | undefined, otherwise: string): string {
  switch (constraint) {
    case "inbox_entry_reported_is_not_blank":
      return "An Inbox entry says what was said. Report the sentence it came out of.";
    case "inbox_entry_reference_is_not_blank":
      return "A proposal names something: the title, or the reference as it was given.";
    case "inbox_entry_proposes_a_story_volume_or_series":
      return AMENDS_SOMETHING_ELSE;
    default:
      return otherwise;
  }
}

/** What each kind of record is called in prose the owner and an assistant both read. */
const OF: Record<ProposedEntity, string> = {
  story: "Story",
  volume: "Volume",
  series: "Series",
};

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

/**
 * Do one entry's work, and put the entry's own name in front of anything it is refused with.
 *
 * The verbs keep their prose — they are the only things that know what was wrong — and they
 * cannot know *which* entry was wrong, because they were handed a record and a field and no
 * Inbox. In a selection of three hundred, *hardback is not a Binding* is unactionable
 * without the title in front of it, and the owner has no way to find where the gesture
 * stopped. It reads the same on a selection of one, where it costs nothing.
 */
async function namingTheEntry(
  entry: WaitingEntry,
  work: () => Promise<Approval>
): Promise<Approval> {
  try {
    return await work();
  } catch (error) {
    if (!isRefusal(error)) throw error;
    throw new Refusal(error.code, `${entry.reference} — ${error.message}`, {
      constraint: error.constraint,
      cause: error,
    });
  }
}

/**
 * Do what the entry asked for, with the verb that owns the prose, and say what it did.
 *
 * The two branches are the two acts and they share nothing but this line: a creation makes
 * a record and names it, an amendment changes one that exists and makes nothing.
 */
async function carryOut(
  entry: WaitingEntry,
  said: Record<string, unknown>,
  run: Executor
): Promise<Approval> {
  const decided = { entryId: entry.id, act: entry.act, proposes: entry.proposes };

  if (entry.act === "amend") {
    // An amendment names a record: `inbox_entry_an_amendment_names_what_it_amends` refuses
    // a row where it does not, so an entry arriving here without one is this repository's
    // bug rather than an answer for the owner, and it stays an error.
    const { subjectId } = entry;
    if (!subjectId) throw new Error("an amendment with no subject reached the approval");
    await amend(entry.proposes, subjectId, said, run);
    return { ...decided, createdId: null, subjectId };
  }

  return { ...decided, createdId: await create(entry.proposes, said, run), subjectId: null };
}

/**
 * Change the record the amendment names, in the fields it named and no others.
 *
 * A field the owner emptied on the way through is a field the amendment no longer proposes,
 * so it leaves what stands there today — which is the same sentence the amending verbs
 * write in SQL.
 */
async function amend(
  proposes: ProposedEntity,
  subjectId: string,
  said: Record<string, unknown>,
  run: Executor
): Promise<void> {
  switch (proposes) {
    case "story":
      return amendStory(
        subjectId,
        { title: optional(said, "title"), typeId: optional(said, "typeId") },
        run
      );
    case "volume":
      return amendVolume(
        subjectId,
        {
          title: optional(said, "title"),
          publisher: optional(said, "publisher"),
          editionLine: optional(said, "editionLine"),
          binding: optional(said, "binding"),
          language: optional(said, "language"),
          isbn: optional(said, "isbn"),
        },
        run
      );
    case "series": {
      const publishedCount = optional(said, "publishedCount");
      return amendSeries(
        subjectId,
        {
          name: optional(said, "name"),
          publisher: optional(said, "publisher"),
          editionLine: optional(said, "editionLine"),
          // `Number` rather than a check of its own: a count that is not a whole number is
          // refused by `amendSeries` in the prose it already writes.
          publishedCount: publishedCount === null ? null : Number(publishedCount),
          status: optional(said, "status") as SeriesStatus | null,
        },
        run
      );
    }
  }
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
          title: needed(said, "title", NEEDED.story.title),
          typeId: needed(said, "typeId", NEEDED.story.typeId),
        },
        run
      );
    case "volume": {
      const { id } = await catalogueVolume(
        {
          title: needed(said, "title", NEEDED.volume.title),
          publisher: needed(said, "publisher", NEEDED.volume.publisher),
          binding: needed(said, "binding", NEEDED.volume.binding),
          language: needed(said, "language", NEEDED.volume.language),
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
          name: needed(said, "name", NEEDED.series.name),
          publisher: needed(said, "publisher", NEEDED.series.publisher),
          editionLine: optional(said, "editionLine"),
          // `Number` rather than a check of its own: a count that is not a whole number is
          // refused by `declareSeries` in the prose it already writes, and nought is a
          // legitimate answer — an announced Series with nothing out yet.
          publishedCount: Number(needed(said, "publishedCount", NEEDED.series.publishedCount)),
          status: needed(said, "status", NEEDED.series.status) as "ongoing" | "concluded",
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
