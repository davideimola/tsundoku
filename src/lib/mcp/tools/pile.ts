import { composePile } from "@/core/queries/pile";
import type { McpTool } from "../tool.ts";

// The Pile area: **what to take on next**, which is the question this whole app was built
// to make askable from outside (ADR-0002, user story 22).
//
// It was the Reading list until #59, and the word changed because *what to read next*
// named only half of what stands on it (ADR-0021). **The Pile** is what the application is
// itself named after: the pile that keeps growing.
//
// One tool, because there is one question. The answer already carries the routes each entry
// stands on and their intent, so *what comes next per Path* is in this answer and not a
// second tool; `path_next_on_active_paths` is the same derivation without the objects, the
// Series half and the owner's own order, and an assistant that wants the raw routes can
// still ask for it.
//
// **It answers with two lists and not one** (#40), because the two are different kinds of
// answer: the head is what the owner *decided*, and the reserve is what merely composed. An
// assistant that flattened them would be reporting a decision and a coincidence in the same
// voice.
//
// Nothing here writes, and that is not a coincidence of this file: the query proposes a
// Wish as a value and never opens one, so there is nothing an assistant could call through
// this door that would buy something. Opening a Wish is `wish_open`'s — #12's write
// boundary — and it is a separate decision, said out loud.

const next: McpTool = {
  name: "pile_next",
  title: "What to take on next, composed rather than kept",
  description: `**The Pile**: what the owner could take on next, composed on the way out and stored
nowhere. This is the closest thing here to an answer to *"what should I read next"*, and it is the
one tool to reach for when that is the question.

**It answers with two lists, and the difference between them is the most useful thing in it.**
\`head\` is what the owner **pinned**, in pin order, newest pin leading — every row in it is a
decision they took, and it is the only place an order means anything. \`reserve\` is everything
else: it composes itself and is **deliberately unordered**, sorted by a rule nobody maintains (the
newest Want first, then the routes, then the runs in progress, then the Series), so **do not read a place in it as a
preference**. Say what the owner decided apart from what merely composed.

Every entry carries \`reasons\`, and **one Story is one row however many reasons put it there**: a
Story that is wanted *and* stands on two routes is one entry naming all three, never three entries.
\`because: "want"\` is **an open Want** — the owner having said *I want to read this Story*, which
belongs to no route and carries no order; it falls quiet by itself once a Pass begins after it,
so what is here is still wanted. \`because: "path"\` is **a stop on an active Path** — an ordered
route the owner chose, crossing types and publishers freely — carrying that route, the \`intent\`
they wrote for it, and \`place\`, which is where the stop stands among what is still to read on it:
\`1\` is what comes next, and anything higher stands behind it. \`because: "run"\` is **a run with somewhere left to
go**: a serialized Story the owner has neither finished nor abandoned. It carries
\`howFarItGot\` — \`atInstalment\` out of \`instalments\`, in the work's own units and never in
volumes — and \`nextInstalment\`, the part to take on next, so you can say *carry on with Slam Dunk,
you are at seven of twenty*. **A run nobody has opened is here too**, at \`atInstalment: 0\`, and
that is the row this whole list was rebuilt for: a work owned complete and unread is invisible to
the Series half, which names only what is **missing**. Nothing was marked to put it here — no
route, no flag on its Series, no Want — and it leaves the list by itself when a Pass finishes
or abandons it, or when a pass has reached the last part. \`because: "series"\` is
**the next position of a Series they have decided to collect** that the house has none of; it names
an object and no Story, because what narrative a Volume carries is a separate fact the ledger does
not claim to know.

\`subject\` is the thing to take on — a Story, or a position of a Series — and it is what a pin names.

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
naming the object is the owner's act, or an Inbox proposal, never this list's. And **both lists
empty** means every active route is walked out, nothing is wanted, every run is finished or set
aside and every Series being collected is complete: a real answer, not missing data. Read \`path_constraints\` before turning any of this
into a recommendation.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return composePile();
  },
};

export default [next];
