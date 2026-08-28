import { listWaitingInboxEntries } from "@/core/queries/inbox";
import { proposeSeries, proposeStory, proposeVolume } from "@/core/verbs/inbox";
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
// Every description below says that out loud, in the second person, because the assistant
// is the one that has to understand it: the honest thing to tell the owner after calling
// one of these is *"I have put it in your Inbox"* and never *"I have added it"*.

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

**You cannot create a Story, and this tool does not create one.** Use it when the owner talks about
something \`stories_all\` does not list. Search first: the Story may be there under a title they said
differently, and a duplicate is the one mistake this boundary exists to prevent.

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

**You cannot catalogue a Volume, and this tool does not catalogue one.** Use it when the owner
mentions an object \`collection_search\` does not answer with. Note that search answers with the
objects in the house, which are a subset of the ones the library knows — so an absence there is not
proof the Volume is missing from the catalogue, and proposing a duplicate is worse than asking.

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

**You cannot declare a Series, and this tool does not declare one.** Check \`series_list\` first: the
same name in another edition is a *different* Series with a different volume count, which is a
distinction worth getting right rather than a duplicate worth making.

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

export default [story, volume, series, waiting];
