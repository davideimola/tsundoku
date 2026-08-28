import {
  findPath,
  listDeclaredConstraints,
  listPaths,
  nextUnreadOnActivePaths,
  nextUnreadOnPath,
} from "@/core/queries/path";
import { type McpTool, stringArgument } from "../tool.ts";

// The Path area: the routes the owner walks, and the sentences they want obeyed while an
// assistant talks about them.
//
// A Path is an ordered route through Stories that the **owner** defined, crossing types,
// publishers and Series freely — *Recupero Batman*, *Angolo Giappone*, *Technical
// Leadership*. Its order is a judgement and never a publication sequence, which is the
// whole reason an assistant should extend a route rather than guess at a genre (user
// stories 34 and 37).
//
// The declared constraints are in this area rather than in one of their own because they
// are declared on a route or over the whole library, and the query that returns them is
// `queries/path.ts`. They are **the point of ADR-0002**, not a footnote: the app holds no
// model, so *"don't accumulate too many unread books"* is an instruction to whoever is
// recommending, and the only way it reaches them is by being read through this door.

const list: McpTool = {
  name: "path_list",
  title: "The owner's Paths, and what comes next on each",
  description: `Every Path the owner has defined, active ones first: its name, the intent they wrote in their own
words, how many stops it has, how many of those are still unread, and the Story that comes next.

A Path is an **ordered route through Stories that the owner chose**, crossing types, publishers and
Series freely. The order is their judgement and not a publication sequence, so it is read and never
recomputed — do not reorder it, and do not reason about it as if it were a series.

Read \`intent\` before recommending into a route: *"privilegiare titoli davvero coerenti con samurai
e cultura giapponese"* is the owner telling you what belongs on that route and what does not.
\`active\` is the distinction they read this list for — an inactive Path is a route deliberately put
aside, not a forgotten one.

\`next\` is \`null\` where the route is exhausted, meaning they have read everything on it. That is a
finished route and an occasion to suggest extending it, not an error.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { paths: await listPaths() };
  },
};

const find: McpTool = {
  name: "path_find",
  title: "One Path, whole",
  description: `One Path by id: the whole route in the owner's order, the constraints declared on that route, and
what comes next.

The \`path_id\` comes from \`path_list\` or \`path_next_on_active_paths\`. Every stop carries the
Story's Type and its state — \`to-read\`, \`reading\`, \`read\` or \`abandoned\` — derived from its
Readings and never stored, so the route shows how far along it the owner is without them keeping a
column.

\`constraints\` here are only the ones declared **on this route**. The ones holding over the whole
library are not in it; \`path_constraints\` returns both, and you want that one before recommending.
Answers \`null\` where no such Path exists, which is an answer and not a failure.`,
  inputSchema: {
    type: "object",
    properties: {
      path_id: { type: "string", description: "A Path id from `path_list`. Exact." },
    },
    required: ["path_id"],
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    return { path: await findPath(stringArgument(input, "path_id") ?? "") };
  },
};

const next: McpTool = {
  name: "path_next",
  title: "What comes next on one Path",
  description: `The next unread Story of one Path, in the owner's order — or \`null\` where the route is exhausted.

"Unread" means the Story's derived state is \`to-read\` and nothing else. A Story the owner is **in
the middle of** is skipped rather than offered, and so is one they abandoned: recommending either
would be telling them to start something they already started.

An exhausted route answers \`null\` honestly. It does not fall back to the first stop and it does
not report the last one as still ahead — a Path with nothing unread left is a route they have
walked.

Whether the Path is active is not asked here, so a route put aside can still be walked
deliberately. For the composed picture across every active route at once, use
\`path_next_on_active_paths\`.`,
  inputSchema: {
    type: "object",
    properties: {
      path_id: { type: "string", description: "A Path id from `path_list`. Exact." },
    },
    required: ["path_id"],
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    return { next: await nextUnreadOnPath(stringArgument(input, "path_id") ?? "") };
  },
};

const nextOnActivePaths: McpTool = {
  name: "path_next_on_active_paths",
  title: "What comes next on every active Path",
  description: `What the owner could pick up right now: the next unread Story of every **active** Path, one entry
each, in the owner's order of routes. Each entry carries the Path it belongs to and that Path's
intent, so a suggestion can say which route it extends.

**An exhausted Path is absent from this list entirely.** There is no entry with a \`null\` next to
filter out — a route with nothing unread left has nothing to contribute, so read its absence as
"that route is finished", never as an error or as missing data. Inactive Paths are absent for the
same kind of reason: the owner put them aside on purpose.

An empty list therefore means every active route is walked out, which is a real and useful answer.
This is what the Reading list composes itself from, so it is the closest thing here to "what should
I read next" — read \`path_constraints\` before turning it into a recommendation.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { ahead: await nextUnreadOnActivePaths() };
  },
};

const constraints: McpTool = {
  name: "path_constraints",
  title: "The constraints the owner has declared",
  description: `**Read this before recommending anything.** These are the owner's own instructions to whoever is
advising them, written as prose and meant to be obeyed: *"don't accumulate too many unread books"*,
*"take it slowly, given the cost"*. This app holds no recommender of its own — you are it — so a
constraint sitting unread here is a constraint that does nothing.

They are returned exactly as the owner wrote them and nothing parses them: an instruction to a
reader that reads prose does not need a schema. The global ones come first, because they hold over
whatever you are about to say; after them come the ones declared on a single Path, each carrying the
route it holds over in \`path\`. \`path\` is \`null\` for a global one.

A constraint is not a filter to apply and report — it is the shape the answer has to take. *"Don't
accumulate too many unread books"* means the honest answer may be one title, or none, rather than a
list of six; *"take it slowly, given the cost"* is about how much to suggest buying, not about which
Series. Where a constraint and an obvious recommendation disagree, the constraint wins and saying so
out loud is better than quietly obeying it.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { constraints: await listDeclaredConstraints() };
  },
};

export default [list, find, next, nextOnActivePaths, constraints];
