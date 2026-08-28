import { composeReadingList } from "@/core/queries/reading-list";
import type { McpTool } from "../tool.ts";

// The Reading list area: **what to read next**, which is the question this whole app was
// built to make askable from outside (ADR-0002, user story 22).
//
// One tool, because there is one question. The queue already carries the Path each entry
// extends and that Path's intent, so *what comes next per Path* is in this answer and not a
// second tool; `path_next_on_active_paths` is the same derivation without the objects, the
// Series half and the owner's pins, and an assistant that wants the raw routes can still
// ask for it.
//
// Nothing here writes, and that is not a coincidence of this file: the query proposes a
// Wish as a value and never opens one, so there is nothing an assistant could call through
// this door that would buy something. Opening a Wish is `wish_open`'s — #12's write
// boundary — and it is a separate decision, said out loud.

const next: McpTool = {
  name: "reading_list_next",
  title: "What to read next, composed rather than kept",
  description: `**The Reading list**: what the owner could read next, composed on the way out and stored nowhere.
This is the closest thing here to an answer to *"what should I read next"*, and it is the one tool
to reach for when that is the question.

It composes from two sources and nothing else. \`because: "path"\` is **the next unread Story of an
active Path** — an ordered route the owner chose, crossing types and publishers freely — and it
carries that Path and the \`intent\` they wrote for it, so a suggestion can say which route it
extends. \`because: "series"\` is **the next position of a Series they have decided to collect** that
the house has none of; it names an object and no Story, because what narrative a Volume carries is a
separate fact the ledger does not claim to know.

**Order is meaning here.** \`pinned\` entries lead, most recently pinned first: a pin is the owner
overruling the composed order, and it is the strongest signal in this answer. After them come the
Path entries in the owner's order of routes, then the Series.

\`medium\` is the **intended** medium and it is derived, never recorded. \`paper\` means an object is
involved; \`digital\` means none is, because an owned ebook is not something this library models — so
a Story no Volume carries needs nothing bought. \`atHand: true\` is *can be started tonight*;
\`atHand: false\` is *has to be bought first*, and it is the difference between a recommendation the
owner can act on this evening and one that costs money.

\`proposedWish\` is **a proposal and not a Wish**. Where an entry needs an object the owner does not
have, this is what a Wish on it would say — the Volume's id and a priority — and nothing has been
written: reading this list never adds to the shopping list. Turning one into a Wish is a separate,
deliberate act, and it is the owner's call rather than yours to make quietly.
\`wishAlreadyOpen: true\` means they already mean to buy it, so there is nothing to propose and
nothing wrong.

Two absences to read correctly. A \`paper\` entry with **no \`object\`** is one whose Volume the
library has not catalogued — a Series position nobody recorded — so there is nothing to wish for and
naming the object is the owner's act, or an Inbox proposal, never this list's. And an **empty list**
means every active route is walked out and every Series being collected is complete: a real answer,
not missing data. Read \`path_constraints\` before turning any of this into a recommendation.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { entries: await composeReadingList() };
  },
};

export default [next];
