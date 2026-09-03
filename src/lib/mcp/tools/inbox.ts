import type { ProposedEntity } from "@/core/queries/inbox";
import { listWaitingInboxEntries } from "@/core/queries/inbox";
import {
  AMENDABLE_FIELDS,
  type InboxCorrections,
  type ProposalField,
  proposeAmendment,
  proposeSeries,
  proposeStory,
  proposeVolume,
} from "@/core/verbs/inbox";
import { type McpTool, numberArgument, stringArgument } from "../tool.ts";

// The Inbox area: the only way a new Story, Volume or Series can be asked for from out
// here, and the reason there is no tool anywhere in this directory that creates one.
//
// **This is the write boundary** (ADR-0005). Everything else this door writes — a Reading,
// a Rating, an acquisition, a Wish — is a verb on something that already exists: narrow,
// reversible, and wrong in a way the owner spots immediately. Creating an entity is the
// other kind of act, because a title an assistant invented or an edition it half remembered
// becomes a permanent duplicate in a library the owner keeps for years. So the attempt does
// not fail and does not half-succeed: it lands here as a proposal, and the owner approving
// it is the act that creates the entity.
//
// **Completing or correcting a record that already exists is the same kind of act**, and it
// lands here too (ADR-0011). An invented ISBN is that risk at its purest — nobody ever reads
// one back, nothing looks wrong, and a wrong one quietly fetches another book's cover for as
// long as the record stands — so an amendment is proposed rather than written, and there is no
// tool anywhere in this directory that writes a field onto a record.
//
// Every description below says that out loud, in the second person, because the assistant
// is the one that has to understand it: the honest thing to tell the owner after calling
// one of these is *"I have put it in your Inbox"* and never *"I have added it"*.
//
// **And each one says the same two things, from one place rather than four** (#53). The
// door already had every tool an assistant needs to avoid a duplicate — `finder_search`,
// `stories_all`, `collection_search`, `series_list` — and assistants proposed duplicates
// anyway, until the owner went back to filling this Inbox by hand and now only asks for
// advice. So the gap was never a capability; it was this prose. `SEARCH_FIRST` and
// `WHAT_A_WRONG_ONE_COSTS` below are that instruction said once and spent by every tool
// that proposes, so a fifth one cannot ship saying it more weakly — and `AGENTS.md` says
// the same thing to whoever writes that fifth one.

/**
 * The instruction the whole area exists to give, and the tool that carries it out.
 *
 * It names `finder_search` rather than an area's list because that is the one call that
 * answers over Stories, Volumes and Series at once: an assistant that searched the wrong
 * area and found nothing has *not* searched. The area's own list is named beside it, per
 * tool, where reading the whole of one is the better call.
 */
const SEARCH_FIRST = `**Search before you propose, and say what you searched for.** \`finder_search\`
is the call: one term, and everything in the library called that comes back — Stories, Volumes,
Series — matched on a fragment of the name, ignoring case and accents. Search the words the owner
used *and* the words a catalogue would use, because the record is often already there under a title
said differently, and an absence you did not look for is not an absence. Then \`inbox_waiting\`, for
what has already been proposed and not decided: a second entry for one thing is one more thing to
turn down.`;

/**
 * What it costs the owner to be wrong, in the owner's own consequences.
 *
 * Not *this is a permanent fact* — an assistant reads that as a policy — but what actually
 * happens to the person on the other side of the Inbox: they read it, they turn it down by
 * hand, and the one that slips through cannot be taken back out (ADR-0014, ADR-0015).
 */
const READ_BY_HAND = `**What a wrong one costs the owner:** every entry in this Inbox is read by hand
and turned down one at a time, so a proposal the library can already answer is work taken off you
and handed to them. They abandoned this Inbox once over exactly that, and went back to typing the
records in themselves.`;

const WHAT_A_WRONG_ONE_COSTS = `${READ_BY_HAND} One approved in a hurry is worse than one rejected:
it is a permanent duplicate, and a record they have read, rated, shelved or put on a route **refuses
to be struck**, so they carry it for years.`;

const PROPOSED_ID = `Returns the Inbox entry's id, and nothing else exists yet. Tell the owner it is
waiting in their Inbox for them to approve, and do not claim to have added anything. Nothing can be
recorded against it — no Reading, no Rating, no acquisition, no Wish — until they have approved it,
so if they asked for one of those in the same breath, say that part is waiting too.`;

const REPORTED = {
  type: "string",
  description: `What the owner said, in the words they said it in — "Ho comprato Ultimate Spider-Man
Omnibus 1", "I finished Slam Dunk". This is what they read when deciding, so quote them rather than
paraphrasing, and never write a sentence they did not say.`,
};

const story: McpTool = {
  name: "inbox_propose_story",
  title: "Propose a Story the library does not have",
  description: `Ask the owner to add a **Story** — the narrative unit they read and form an opinion
about, at whatever granularity they chose for that one: a single volume, an arc, or a whole series.

**You cannot create a Story, and this tool does not create one.** Use it only for a narrative the
library does not hold.

${SEARCH_FIRST} \`stories_all\` is the other call worth making here: it is every Story by title, so it
is what tells you the library has this one under a title the owner says differently.

${WHAT_A_WRONG_ONE_COSTS}

${PROPOSED_ID}`,
  inputSchema: {
    type: "object",
    properties: {
      reported: REPORTED,
      title: { type: "string", description: "The title, as the owner says it." },
      type: {
        type: "string",
        description: `A Type id from \`stories_types\` — an attribute of a Story, and a vocabulary that
grows, so use one you have actually seen rather than guessing at a word. Leave it out where you do
not know: the owner chooses it when they approve.`,
      },
    },
    required: ["reported", "title"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return {
      proposed: await proposeStory({
        reported: stringArgument(input, "reported") ?? "",
        title: stringArgument(input, "title") ?? "",
        typeId: stringArgument(input, "type"),
      }),
    };
  },
};

const volume: McpTool = {
  name: "inbox_propose_volume",
  title: "Propose a Volume the library has not catalogued",
  description: `Ask the owner to catalogue a **Volume** — one object as a library catalogues it: a
tankōbon, an omnibus, a novel, with its publisher, edition line, Binding, language and ISBN.

**You cannot catalogue a Volume, and this tool does not catalogue one.** Use it only for an object
the library has not catalogued.

${SEARCH_FIRST} Here it is the search that matters most, and the reason is a trap: \`collection_search\`
answers with the objects **in the house**, which are a subset of the ones the library knows, so an
absence there is no proof at all. \`finder_search\` reads the whole catalogue, wished-for and let-go
objects included, and it is the one that answers this question.

${WHAT_A_WRONG_ONE_COSTS}

Approving this records the object; it does **not** say it is in the house. Those are two separate
facts, so once the owner has approved it, \`collection_acquire\` is the second thing to say.

${PROPOSED_ID}`,
  inputSchema: {
    type: "object",
    properties: {
      reported: REPORTED,
      title: { type: "string", description: "The title printed on the object." },
      publisher: { type: "string", description: "Panini Comics, Planet Manga, Einaudi." },
      edition_line: {
        type: "string",
        description: `The publisher's line — "Ultimate Deluxe Edition", "Must Have". Leave it out for
the standard printing rather than inventing a name for it.`,
      },
      binding: {
        type: "string",
        description: `A Binding id from \`collection_bindings\`. **Read that list rather than
guessing**: this is the field an assistant gets wrong most often, and the owner has to correct it by
hand.`,
      },
      language: { type: "string", description: "A language code: it, en, ja." },
      isbn: { type: "string", description: "10 or 13 characters, no spaces or dashes." },
    },
    required: ["reported", "title"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return {
      proposed: await proposeVolume({
        reported: stringArgument(input, "reported") ?? "",
        title: stringArgument(input, "title") ?? "",
        publisher: stringArgument(input, "publisher"),
        editionLine: stringArgument(input, "edition_line"),
        binding: stringArgument(input, "binding"),
        language: stringArgument(input, "language"),
        isbn: stringArgument(input, "isbn"),
      }),
    };
  },
};

const series: McpTool = {
  name: "inbox_propose_series",
  title: "Propose a Series the library does not know",
  description: `Ask the owner to declare a **Series** — a publisher's ordered line of Volumes for one
edition, and a completeness ledger rather than a narrative: how many Volumes are out, whether the
publisher is done, which one comes next.

**You cannot declare a Series, and this tool does not declare one.** Use it only for a line the
library does not know.

${SEARCH_FIRST} \`series_list\` is the other call here, and read what it answers carefully: the same
name in another edition is a *different* Series with a different volume count, which is a
distinction worth getting right — but the same name in the *same* edition is the duplicate.

${WHAT_A_WRONG_ONE_COSTS}

Approving this declares the Series. It does **not** start a collecting project — that is a separate
decision only the owner makes, and holding some of a Series is not it.

${PROPOSED_ID}`,
  inputSchema: {
    type: "object",
    properties: {
      reported: REPORTED,
      name: {
        type: "string",
        description: `The Series' name without its edition: "Death Note", not "Death Note Black
Edition".`,
      },
      publisher: { type: "string", description: "Planet Manga, Panini Comics." },
      edition_line: {
        type: "string",
        description: `The publisher's edition — "Black Edition". Leave it out for the standard one.`,
      },
      published_count: {
        type: "number",
        description: `How many Volumes are out. Say it only if the owner did: a count read off a shop
page is the kind of guess that becomes a permanent wrong number.`,
      },
      status: { type: "string", description: `"ongoing" or "concluded".` },
    },
    required: ["reported", "name"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return {
      proposed: await proposeSeries({
        reported: stringArgument(input, "reported") ?? "",
        name: stringArgument(input, "name") ?? "",
        publisher: stringArgument(input, "publisher"),
        editionLine: stringArgument(input, "edition_line"),
        // A number if it is one, and otherwise whatever was actually sent: an unreadable
        // count is a thing the owner should see rather than a detail that vanished.
        publishedCount:
          numberArgument(input, "published_count") ?? stringArgument(input, "published_count"),
        status: stringArgument(input, "status"),
      }),
    };
  },
};

/**
 * Every field an amendment can name, and the prose an assistant reads to fill it in.
 *
 * Keyed by `ProposalField`, so it is **exhaustive**: a field the core makes amendable stops this
 * file compiling until it has prose of its own, where a hand-written schema beside a
 * hand-written list would simply not offer it and say nothing. Both the schema's properties and
 * the lists in the description come out of this, through `AMENDABLE_FIELDS`, so what the tool
 * tells an assistant it may propose is what the verb accepts.
 *
 * **The arguments are the core's own field names, and that is a deliberate break with the
 * snake_case every other tool here reads.** The refusals enumerate these fields — *it can be
 * amended in: title, publisher, editionLine, …* — and a door that renamed them would refuse in
 * words that are not the words the caller can send back.
 */
type Field = { type: "string" | "number"; description: string };

const AMENDABLE: Record<ProposalField, Field> = {
  title: { type: "string", description: "The title, as it should read on the record." },
  typeId: {
    type: "string",
    description: `A Type id from \`stories_types\` — an attribute of a Story. Use one you have actually
seen rather than the word you would expect.`,
  },
  name: {
    type: "string",
    description: `A Series' name without its edition: "Death Note", not "Death Note Black Edition".`,
  },
  publisher: { type: "string", description: "Panini Comics, Planet Manga, Einaudi." },
  editionLine: {
    type: "string",
    description: `The publisher's line — "Ultimate Deluxe Edition", "Must Have". Leave it out for the
standard printing rather than inventing a name for it.`,
  },
  binding: {
    type: "string",
    description: `A Binding id from \`collection_bindings\`. **Read that list rather than guessing**:
this is the field an assistant gets wrong most often.`,
  },
  language: { type: "string", description: "A language code: it, en, ja." },
  isbn: {
    type: "string",
    description: `10 or 13 characters, no spaces or dashes. **Never derive one**: an ISBN worked out
from the series and the number is the most damaging thing you can put in this library, because
nobody ever reads it back. Only one you actually read off the object or off a shop page for that
exact edition.`,
  },
  publishedCount: {
    type: "number",
    description: `How many Volumes of the Series are out. Say it only where you actually read it: a
count guessed off a shop page becomes a permanent wrong number in a completeness ledger.`,
  },
  status: { type: "string", description: `"ongoing" or "concluded".` },
  instalments: {
    type: "number",
    description: `How many **Instalments** the Story has, where it was serialized — Slam Dunk's
twenty, Ultimate Spider-Man's hundred and sixty. It belongs to the narrative and never to a
printing, so it is how many numbered parts the *work* has and never how many volumes, omnibus or
tankōbon a shelf happens to hold. Say it only where the owner did or where you actually
read it: a count guessed off a wiki becomes a permanent wrong denominator, and *seven of twenty* is
read back far more often than it is written.`,
  },
};

/** The fields a record of that kind can be amended in, as the description names them. */
function amendableIn(kind: ProposedEntity): string {
  return AMENDABLE_FIELDS[kind].map((field) => `\`${field}\``).join(", ");
}

/**
 * The fields the call actually named, and only those.
 *
 * A field nobody said anything about is left out rather than sent as null: an amendment
 * proposes what it names and leaves everything else standing, so an absent field and an emptied
 * one must not arrive at the verb as the same thing.
 */
function amended(input: Record<string, unknown>): InboxCorrections {
  const proposed: InboxCorrections = {};
  for (const [field, schema] of Object.entries(AMENDABLE) as [ProposalField, Field][]) {
    // A count that is not a number is kept as what was said, for the reason
    // `inbox_propose_series` keeps one: the owner should see *twenty* and fix it, where dropping
    // it loses the only claim the amendment made.
    const said =
      schema.type === "number"
        ? (numberArgument(input, field) ?? stringArgument(input, field))
        : stringArgument(input, field);
    if (said !== undefined) proposed[field] = said;
  }
  return proposed;
}

/**
 * An amendment's `reported`, which is not a creation's.
 *
 * A proposal comes out of something the owner said; a backfill does not — the owner asked for
 * three hundred ISBNs at once and said nothing about any one of them. So the sentence they read
 * while deciding this entry is **where the fact came from**, and it is the only evidence they
 * have.
 */
const AMENDMENT_REPORTED = {
  type: "string",
  description: `What the owner said, in their own words where they said anything — and where they did
not, where you got the fact from: "read off the back cover", "Panini's shop page for the Must Have,
checked today". This is the whole of what they have to judge the entry by, so never write a sentence
they did not say and never dress a guess up as a source.`,
};

const amendment: McpTool = {
  name: "inbox_propose_amendment",
  title: "Propose a correction to a record the library already holds",
  description: `Ask the owner to complete or correct a record that **already exists** — the ISBN a Volume
was catalogued without, the publisher left blank, the count a Series has fallen behind on.

**You cannot change a record, and this tool does not change one.** It changes nothing at all: what
it makes is an entry waiting in the Inbox, showing what you propose beside what stands in the
record today, and the owner approving it is the act that changes anything. That wait is the point
rather than a formality — a wrong ISBN is silent, is never read back, and quietly fetches another
book's cover for as long as the record stands, which is the opposite of a Reading recorded on the
wrong day.

${READ_BY_HAND} And a wrong ISBN or a wrong count is not obvious: nobody reads one back, so it is
found years later or never.

\`amends\` says which kind of record it is about, and \`subject_id\` is that record's own id, **found
rather than composed**: \`finder_search\` answers with the id of everything called what you type, and
\`collection_search\`, \`stories_all\` and \`series_list\` are the areas' own lists. The record has to exist — there is nothing else to amend — and a
Volume's id is not a Story's, so an id of the wrong kind is refused rather than guessed at.

**Name only what changes.** What an amendment does not name is left standing, so filling in an
ISBN says nothing about the publisher. A field can be filled in from here but not emptied:
taking something back is the owner's own gesture as they approve.

Each kind of record has its own fields, and one belonging to another kind is refused rather than
quietly dropped — a Type is a Story's and an ISBN a Volume's:

- a Volume: ${amendableIn("volume")}
- a Story: ${amendableIn("story")}
- a Series: ${amendableIn("series")}

A **Credit** is not among them. It is a record of its own — a person in a role on a Story — and
\`credit_attribute\` is its door; a misattribution is undone by removing the Credit rather than by
amending the Story.

Returns the entry's id, and the record is exactly as it was. Tell the owner it is **waiting in
their Inbox**, never that you have corrected anything — and if they asked for something that
depends on the change, say that part is waiting too.`,
  inputSchema: {
    type: "object",
    properties: {
      reported: AMENDMENT_REPORTED,
      amends: {
        type: "string",
        // Derived, so the door cannot offer a kind the Inbox does not carry.
        enum: Object.keys(AMENDABLE_FIELDS),
        description:
          "Which kind of record you are amending. `subject_id` is a record of that kind.",
      },
      subject_id: {
        type: "string",
        description: `The record's own id, exact, from a read tool in this conversation. Never one you
composed yourself.`,
      },
      ...AMENDABLE,
    },
    required: ["reported", "amends", "subject_id"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return {
      proposed: await proposeAmendment({
        reported: stringArgument(input, "reported") ?? "",
        // The cast is where an untyped door meets a typed core, and it is safe because the
        // verb refuses a kind it does not carry in prose the assistant can act on rather
        // than trusting this line.
        amends: (stringArgument(input, "amends") ?? "") as ProposedEntity,
        subjectId: stringArgument(input, "subject_id") ?? "",
        proposed: amended(input),
      }),
    };
  },
};

const waiting: McpTool = {
  name: "inbox_waiting",
  title: "What is waiting for the owner to decide",
  description: `The proposals the owner has not decided on yet, oldest first — what was reported,
which entity it proposes, and the raw details it carried.

Read it before proposing anything: the thing may already be waiting, and a second entry for it is
work the owner has to reject. Nothing here exists in the library — a waiting entry is not a Story,
not a Volume and not a Series, and cannot be read, rated, acquired or wished for until the owner
approves it.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { waiting: await listWaitingInboxEntries() };
  },
};

export default [story, volume, series, amendment, waiting];
