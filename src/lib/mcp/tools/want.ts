import { listOpenWants } from "@/core/queries/want";
import { openWant, strikeWant } from "@/core/verbs/want";
import { type McpTool, stringArgument } from "../tool.ts";

// The Want area: *add that to what I want to read*, in one turn.
//
// **Both writes here are direct verbs** (ADR-0005). Opening a Want names a Story that already
// exists, and the verb is the boundary working on its own: it refuses a narrative nobody
// recorded rather than creating one, so an assistant cannot want a title into existence. A
// title nobody recorded is `inbox_propose_story`, then a Want once the owner has approved it.
//
// **Striking is a tool here where it is not for a Volume or a Story, and the difference is
// what a Want holds.** ADR-0014 and ADR-0015 keep strike off this door because the party that
// files a hallucinated entity must not be able to delete rows to tidy up after itself — and
// both of those verbs reach records the owner has lived with, guarded by four refusals each. A
// Want holds nothing: no Pass went through it, no judgement rests on it, and the Story it
// names is untouched by its going. What is destroyed by striking one is a sentence somebody
// said this week, which is exactly the shape of write this door was opened for.
//
// **There is no tool that closes one, and there must not be.** A Want ends by itself, when a
// Pass begins after it was opened. An assistant that "tidied up" a Want because the owner
// mentioned finishing the book would be keeping a second truth beside the Passes, which is
// the whole thing this model refuses to have.

const open: McpTool = {
  name: "want_open",
  title: "Say the owner wants to read a Story",
  description: `Record that the owner means to read a **Story**. It joins the Pile, and that is
all it does.

A Want names one **narrative** and creates nothing. It costs no Path, no order and no name: *"add
that to what I want to read"* is this tool and nothing else, and minting a route for it would be
wrong — a **Path** is an order the owner decided, and one stop is not an order.

**A Want is not a Wish, and the pair is the whole distinction**: a Wish names a *Volume* and is about
owning, a Want names a *Story* and is about reading. Neither implies the other — the owner wants to
read what they will borrow, and buys what they will not open for years. If they said they want to
*buy* something, that is \`wish_open\`.

**A Story the library has not recorded is refused**, in prose saying so — that is the boundary, not
a bug: propose the narrative with \`inbox_propose_story\` and open the Want once the owner has
approved it.

**Nothing closes one**, so do not come back to end it. It falls quiet by itself once a Pass begins
after it was opened, which is why *"I want to read this again"* about something read years ago is an
ordinary Want and needs no mention of rereading.

Refused where a Want on that Story already stands.`,
  inputSchema: {
    type: "object",
    properties: {
      story: {
        type: "string",
        description: `The Story's id. \`finder_search\` and \`stories_read\` answer with them;
\`want_list\` shows what is already wanted.`,
      },
    },
    required: ["story"],
    additionalProperties: false,
  },
  readOnly: false,
  destructive: false,
  async run(input) {
    return { want: await openWant(stringArgument(input, "story") ?? "") };
  },
};

const strike: McpTool = {
  name: "want_strike",
  title: "Take back a Want that was a mistake",
  description: `Remove a Want the owner did not mean to open: the wrong Story picked out of a list, a
misheard title. The row goes and nothing else moves — the Story, its Passes and its Rating are
untouched.

**This is not a way to close one.** A Want the owner has simply not acted on is still true, and there
is no tool that retires it: it falls quiet on its own when a Pass begins after it was opened. So
do **not** call this because they said they finished the book, or because it has been on the list a
long time. Call it when the Want itself was wrong.

Refused where there is no such Want.`,
  inputSchema: {
    type: "object",
    properties: {
      want: { type: "string", description: "The Want's id, from `want_list`." },
    },
    required: ["want"],
    additionalProperties: false,
  },
  readOnly: false,
  // The row is deleted, and when it was said goes with it. Re-opening writes a new Want with
  // today's date rather than putting this one back.
  destructive: true,
  async run(input) {
    await strikeWant(stringArgument(input, "want") ?? "");
    return { struck: true };
  },
};

const list: McpTool = {
  name: "want_list",
  title: "What the owner wants to read",
  description: `Every open Want, newest first, with the Story it names and what kind of thing that is.

This is what the owner has said they want to *read*, which is not what they have said they want to
*buy* (\`wish_list\`) and not the order they mean to read things in (\`path_list\`). It is one of the
three sources the Pile composes itself from, so a Story here is on that list.

A Want the owner has since acted on is absent rather than marked done: it fell quiet because a
Pass began after it was opened. So this answers *what is still wanted*, and a Story missing from
it either was never wanted or has been read since.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { wants: await listOpenWants() };
  },
};

export default [open, strike, list];
