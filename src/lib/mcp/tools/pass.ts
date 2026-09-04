import { listMedia } from "@/core/queries/medium";
import { FIRST_HAND, listProvenances } from "@/core/queries/provenance";
import { abandonPass, finishPass, type Medium, type Outcome, recordPass } from "@/core/verbs/pass";
import { type McpTool, stringArgument } from "../tool.ts";

// The Pass area, and the first of this door's write tools.
//
// A Pass is one pass through a Story — read, or played — and recording one is exactly the
// act ADR-0005 says an assistant may perform directly: it names a Story that already
// exists, it is one row, and it is wrong in a way the owner spots the moment they look.
// **It is also the reason this app exists at all** — *"I finished volume 23, I'd give it an
// 8"*, said out loud, landing in the database without a form.
//
// What it cannot do is invent the Story. `story` is an id from `stories_all`, and a Story
// nobody has recorded is `inbox_propose_story`'s business.
//
// The area was called `reading` until #59 and its tools `reading_*`. It is **Pass** now,
// because a Reading was *one act of reading a Story* and half of what this library holds is
// not read (ADR-0021). `./pass.test.ts` is what holds the whole door to the new word.

// `FIRST_HAND` is the core's: the owner telling an assistant what they read is the same
// evidence as typing it themselves, and which Provenance that is is the model's business
// rather than this door's. Anything weaker is worth naming explicitly, which is what
// `pass_provenances` is for.

const PROVENANCE = {
  type: "string",
  description: `A Provenance id from \`pass_provenances\` — how this came to be known, and
therefore how far it can be trusted later. Leave it out when the owner is telling you now: that is
"${FIRST_HAND}", which is the strongest thing here. Name a weaker one when it is weaker:
reading an old export to them is not the same as them remembering it.`,
  default: FIRST_HAND,
};

const DAY = "A day, written 2024-03-11. Leave it out where the owner did not say one.";

const record: McpTool = {
  name: "pass_record",
  title: "Record a Pass through a Story",
  description: `Record that the owner went through — or is going through — a **Story**: when, by what
medium, through which Volume if there was one, and whether they finished it or gave up.

This is the tool for *"I finished Slam Dunk"*, *"I've started the Batman omnibus"* and *"I finished
Expedition 33 on the PS5"*. Give \`outcome\` when it is over and leave it out while they are still
at it: a Pass with no outcome is what makes the Story read as *reading*, and \`pass_finish\` closes
it later.

**It never overwrites and never replaces.** Going through a thing again is ordinary here, so a
second Pass through the same Story is a second row and the Rating the first carried survives beside
it. If the owner is correcting a Pass they just described, that is still a Pass — say so rather than
expecting an edit.

A Pass needs no Volume, and **only \`paper\` may have one**: an owned ebook is not something this
model has, and neither is a disc on a shelf, so every other medium went through no object. On
paper, name the Volume from \`collection_search\` when the owner named the object; leave it out
when they named the story.

Returns the Pass's id. Give it to \`rating_set\` as \`pass\` when the owner scores it in the same
breath — that is what ties the judgement to this one pass rather than to the Story in general, and
it is what lets a second time through carry a different score.`,
  inputSchema: {
    type: "object",
    properties: {
      story: {
        type: "string",
        description: `The Story's id, from \`stories_all\`. A Story the library does not have cannot
be read into existence — propose it with \`inbox_propose_story\` and wait for the owner.`,
      },
      medium: {
        type: "string",
        description: `A medium id from \`pass_media\` — what they went through it by. Paper,
digital, or the console they played it on. **Read that list rather than guessing**: it is a
vocabulary the owner grows, so the console bought last month is on it and a name invented here
is refused.`,
      },
      outcome: {
        type: "string",
        description: `"finished" or "abandoned". Leave it out for a Pass still under way — abandoning
is as much a fact as finishing, and neither is a failure to record.`,
      },
      started_on: { type: "string", description: DAY },
      ended_on: {
        type: "string",
        description: `${DAY} Only meaningful once the Pass has an outcome.`,
      },
      volume: {
        type: "string",
        description: `The Volume's id, from \`collection_search\`, where the owner read a particular
object. Absent is ordinary, and the only possibility on any medium but \`paper\`.`,
      },
      provenance: PROVENANCE,
    },
    required: ["story", "medium"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return {
      // The verb refuses a medium or an outcome that is not one of its own — in prose the
      // owner reads — so nothing here checks them: a tool that filtered the vocabulary
      // would be a second place the model is written down (ADR-0002).
      pass: await recordPass({
        storyId: stringArgument(input, "story") ?? "",
        medium: (stringArgument(input, "medium") ?? "") as Medium,
        outcome: stringArgument(input, "outcome") as Outcome | undefined,
        startedOn: stringArgument(input, "started_on"),
        endedOn: stringArgument(input, "ended_on"),
        volumeId: stringArgument(input, "volume"),
        provenanceId: stringArgument(input, "provenance") ?? FIRST_HAND,
      }),
    };
  },
};

const finish: McpTool = {
  name: "pass_finish",
  title: "Close a Pass the owner finished",
  description: `Close a Pass that was under way: the owner finished it, and the Story stops reading as
*reading*.

The Pass's id comes from \`stories_find\`, which lists every Pass through a Story with its state.
Refused on a Pass that has already ended — going through something again is a new Pass
(\`pass_record\`), never an edit of the old one, because the judgement the old one carried belongs to
that pass.`,
  inputSchema: {
    type: "object",
    properties: {
      pass: { type: "string", description: "The Pass's id, from `stories_find`." },
      ended_on: { type: "string", description: DAY },
    },
    required: ["pass"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    await finishPass(
      stringArgument(input, "pass") ?? "",
      stringArgument(input, "ended_on") ?? null
    );
    return { finished: true };
  },
};

const abandon: McpTool = {
  name: "pass_abandon",
  title: "Close a Pass the owner gave up on",
  description: `Close a Pass that was under way: the owner gave up, and the Story reads *abandoned*
unless they finished it some other time.

Abandoning is a fact worth recording rather than an absence — it is evidence about taste, and a
recommender should weigh it. Refused on a Pass that has already ended.`,
  inputSchema: {
    type: "object",
    properties: {
      pass: { type: "string", description: "The Pass's id, from `stories_find`." },
      ended_on: { type: "string", description: DAY },
    },
    required: ["pass"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    await abandonPass(
      stringArgument(input, "pass") ?? "",
      stringArgument(input, "ended_on") ?? null
    );
    return { abandoned: true };
  },
};

const provenances: McpTool = {
  name: "pass_provenances",
  title: "The Provenance vocabulary",
  description: `Every Provenance, with the id a Pass or a Rating carries and the sentence saying how
far that kind of record can be trusted.

Read it rather than assuming: it is a vocabulary that grows, and it is the axis a recommender weighs
evidence on. It is **origin only** — how coarse a score is is a separate question, on the Rating's
own \`scale\`.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { provenances: await listProvenances() };
  },
};

// **The other vocabulary a Pass carries**, beside the Provenance above and for its reason: it
// grows, and a door that named its values would be the place they went stale. That was true
// the day the medium became a table (#61, ADR-0022) and it *bites* the day the consoles are on
// it (#62) — `paper` and `digital` could be written into a sentence because they were the
// only two there would ever be, and `playstation-5` cannot, because the next console is an
// insert and a sentence naming three is a second place the list is written down (ADR-0002).
const media: McpTool = {
  name: "pass_media",
  title: "The medium vocabulary",
  description: `Every medium a Pass can have gone by, with the id a Pass carries and whether a pass
by it went through an object.

Read it rather than assuming: it holds paper, digital and the consoles the owner plays on, and it
grows when they buy hardware. \`goesThroughAnObject\` is the rule behind the refusal you will meet
if you name a Volume anyway — it is true of \`paper\` alone, because an owned ebook is not something
this model has and neither is a disc on a shelf.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { media: await listMedia() };
  },
};

export default [record, finish, abandon, provenances, media];
