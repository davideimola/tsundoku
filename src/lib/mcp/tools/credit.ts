import { findCreditedPerson, listCreditedPeople, listCreditRoles } from "@/core/queries/credit";
import { creditStory } from "@/core/verbs/credit";
import { type McpTool, stringArgument } from "../tool.ts";

// The Credit area: the people the library credits, read from the person's side — and the
// one act out here that credits somebody.
//
// A Credit is a person's contribution to a **Story** in a named role. The Credits *of a
// Story* come back with the Story itself, because they are part of the answer to *"what is
// this?"*; the reads here answer the other direction — *"everything the owner has read by X"*
// (user story 15) — which is the question a recommender actually asks before suggesting
// another Story by the same hand.
//
// **`credit_attribute` writes, and it writes directly.** The library holds 0 people and 0
// Credits (#18) — the workbook that carried the `Autore` column was imported empty — so
// without this door the reads above answer nothing at all and the backfill ADR-0011 was
// written for cannot happen. Why an attribution sits on the direct side of that line is
// ADR-0012, and what risk it accepts is at the top of `src/core/verbs/credit.ts`; neither
// argument is repeated here.
//
// What the door owes in return is the one thing no boundary is carrying: a misspelling mints a
// second person forever, so the tool's own prose is where *read the people who are already
// there first* has to be said.

const roles: McpTool = {
  name: "credit_roles",
  title: "The roles a Credit can be held in",
  description: `Every role the library credits people in, in the order a comic is credited in.

Read it rather than assuming the roles you know: a role is a data row here and comic credits are the
clearest growing vocabulary there is — a colourist, a letterer, an inker are roles the owner will
meet, and none of them is a deployment away. Never say "author": it presumes a single role and
silently drops the artist, and the two are routinely different people — One-Punch Man is written by
ONE and drawn by Yusuke Murata.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { roles: await listCreditRoles() };
  },
};

const people: McpTool = {
  name: "credit_people",
  title: "Everyone the library credits",
  description: `Everyone holding a Credit anywhere in the library, by name, with every role they hold, how many
Stories they are credited on, and how many of those the owner has opened.

\`storyCount\` against \`readCount\` is the difference between having heard of someone and having read
them, and it is the reason to start here rather than from a name you assumed: a person credited on
eight Stories of which the owner read one is a very different recommendation from the reverse.
\`readCount\` counts the Stories that went through **at least one Reading**, and an abandoned Reading
counts among them — giving up on something is still an act of reading, and it is often the more
useful signal. It is not a count of Stories they finished and liked; \`credit_person\` and
\`stories_read\` are where that is answerable.

One person may hold both roles on the same Story, so the roles are a set and not a label. Only
people something points at are here — a person exists in order to be credited — so this list is
never a directory of names the library has merely heard.

Take an id from here to \`credit_person\` for the Stories themselves.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { people: await listCreditedPeople() };
  },
};

const person: McpTool = {
  name: "credit_person",
  title: "Everything the owner has read by one person",
  description: `One person, and everything they are credited on, split by whether the owner has opened it:
\`read\` for the Stories that went through **at least one Reading**, \`notRead\` for the ones credited
and never opened.

**The split is the answer.** *"What have I read by Jeph Loeb before I commit to the Batman
omnibus"* is a question about the Readings, so a Story sitting credited and unopened must not be
counted among them — while hiding it would answer the next question, *"what of his do I still have
to read"*, with silence. Recommend from \`read\` and suggest from \`notRead\`.

\`read\` means opened and not necessarily finished or liked: **a Story the owner abandoned is in
\`read\`**, because giving up on it is still an act of reading. \`readingCount\` says how many times
they went through it and \`latestScore\` says what they thought; a Story in \`read\` with no score is
one they never judged, and neither of those is evidence to recommend from on its own.

Each Story carries the roles this person held **on that Story** — not all of theirs — its Type, how
many Readings it has, and \`latestScore\`, the score the owner set most recently on a scale of 1 to
10 in half points, or \`null\` where they set none. A Rating is always of the Story and never of a
Volume: the object was not the thing that was good or bad. For the prose the owner wrote alongside a
score, and the Provenance of both, read \`stories_read\`.

The \`person_id\` comes from \`credit_people\`. Answers \`null\` where no such person exists, which is
an answer and not a failure.`,
  inputSchema: {
    type: "object",
    properties: {
      person_id: { type: "string", description: "A person id from `credit_people`. Exact." },
    },
    required: ["person_id"],
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    return { person: await findCreditedPerson(stringArgument(input, "person_id") ?? "") };
  },
};

const attribute: McpTool = {
  name: "credit_attribute",
  title: "Credit a person on a Story in a named role",
  description: `Record that a person wrote or drew a **Story** — the one thing in this area that writes,
and the door the library's Credits were missing: the column that carried them was imported empty,
so \`credit_people\` may well answer with nothing at all and every question it exists to answer
stays unanswerable until this is used.

**This writes on the spot**, unlike a proposed Story or an amendment, so say what you did rather
than that anything is waiting. It is on this side of the line because a Credit is a record of its
own and not a field: a wrong one is visible on the Story and on the person, and the owner removes
it whole.

**The name mints the person where the library has not met them**, and a name it already knows —
in any capitalisation — is that person rather than a second row. That is the whole of the risk
here, and it is the one thing removing the Credit does not undo: there is no rename and no merge,
so a second spelling is a second Yusuke Murata forever, splitting every answer about him in two.
So **read \`credit_people\` first
and reuse the spelling that is already there**; where the person is genuinely new, take the name
from what the owner told you or from the object in front of them, never from memory and never
from the web.

The role is an id from \`credit_roles\` — read that list rather than assuming the two you know, a
colourist and a letterer are roles this library will meet. **Never say "author"**: it presumes a
single role and silently drops the artist, and the two are routinely different people — One-Punch
Man is written by ONE and drawn by Yusuke Murata, which is two calls and not one. One person may
hold both roles on one Story and two people may hold the same role; the same person in the same
role twice is refused, which is an answer and not a failure.

A Credit hangs off a Story and **never off a Volume**: the narrative is what somebody wrote and
drew, and the object is a printing of it. The \`story_id\` comes from a read tool in this
conversation — \`stories_all\`, \`stories_read\` — and a Story the library does not have is
\`inbox_propose_story\` first: there is nothing to credit until the owner has approved it.`,
  inputSchema: {
    type: "object",
    properties: {
      story_id: {
        type: "string",
        description: "A Story id from a read tool. Exact, and never one you composed yourself.",
      },
      person: {
        type: "string",
        description: `The name they are credited with — "ONE", "Yusuke Murata", "Jeph Loeb". A name and
not an id: the library finds the person it knows, and names a new one where it knows none.`,
      },
      role: {
        type: "string",
        description: "A role id from `credit_roles`. Read it rather than guessing at the word.",
      },
    },
    required: ["story_id", "person", "role"],
    additionalProperties: false,
  },
  readOnly: false,
  // The Credit itself the owner removes whole; the **person** it minted stays. There is no
  // rename and no merge, so a misspelling is a second Yusuke Murata forever, splitting
  // every answer about him in two — the one thing on this door that undoing does not undo
  // (ADR-0012). The prose above asks the assistant to read `credit_people` first; this is
  // the same warning said to the client instead.
  destructive: true,
  async run(input) {
    return {
      credited: await creditStory({
        storyId: stringArgument(input, "story_id") ?? "",
        person: stringArgument(input, "person") ?? "",
        roleId: stringArgument(input, "role") ?? "",
      }),
    };
  },
};

export default [roles, people, person, attribute];
