import { findCreditedPerson, listCreditedPeople, listCreditRoles } from "@/core/queries/credit";
import { type McpTool, stringArgument } from "../tool.ts";

// The Credit area: the people the library credits, read from the person's side.
//
// A Credit is a person's contribution to a **Story** in a named role. The Credits *of a
// Story* come back with the Story itself, because they are part of the answer to *"what is
// this?"*; this area answers the other direction — *"everything the owner has read by X"*
// (user story 15) — which is the question a recommender actually asks before suggesting
// another book by the same hand.

const roles: McpTool = {
  name: "credit_roles",
  title: "The roles a Credit can be held in",
  description: `Every role the library credits people in, in the order a comic is credited in — Writer, Artist.

Read the list rather than assuming the two you know: a role is a data row here and comic credits are
the clearest growing vocabulary there is — a colourist, a letterer, an inker are roles the owner
will meet. Never say "author": it presumes a single role and silently drops the artist, and the two
are routinely different people — One-Punch Man is written by ONE and drawn by Yusuke Murata.`,
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
Stories they are credited on, and how many of those the owner has actually read.

\`storyCount\` against \`readCount\` is the difference between having heard of someone and having read
them, and it is the reason to start here rather than from a name you assumed: a person credited on
eight Stories of which the owner read one is a very different recommendation from the reverse.

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
  description: `One person, and everything they are credited on, split by whether the owner has read it:
\`read\` for the Stories that went through at least one Reading, \`notRead\` for the ones credited and
never opened.

**The split is the answer.** *"What have I read by Jeph Loeb before I commit to the Batman
omnibus"* is a question about the Readings, so a Story sitting credited and unopened must not be
counted among them — while hiding it would answer the next question, *"what of his do I still have
to read"*, with silence. Recommend from \`read\` and suggest from \`notRead\`.

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

export default [roles, people, person];
