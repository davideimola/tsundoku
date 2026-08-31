import { findInTheLibrary } from "@/core/queries/finder";
import { type McpTool, numberArgument, stringArgument } from "../tool.ts";

// The finder area: one word, and everything in the library that is called it.
//
// **It exists because the owner's own field does** (#25). The finder in the web shell is
// the same `findInTheLibrary` this tool calls, so the two doors search one library and get
// one answer; a field the owner could reach a record with that an assistant cannot is the
// state where, the first time the two disagree, neither of them can be believed. That is
// why the query went into `src/core` and this file is four lines of prose over it.
//
// It is also the tool that makes the rest of this directory usable. Every write tool here
// takes an **id** — `collection_acquire` wants a Volume's, `rating_set` wants a Story's —
// and until now an assistant reached one by listing an area and reading titles. *"I
// finished volume 23 of Slam Dunk"* is one call now, and the answer says which of the two
// editions it found.

const search: McpTool = {
  name: "finder_search",
  title: "Find anything in the library by name",
  description: `Everything in the library that is **called** what you type — Stories, Volumes, Series,
the people credited on them, and the owner's Paths — grouped by which of those it is.

This is the tool for *"which of these is in the library, and what is its id?"*, and it is the fastest
way to the id every other tool wants. It matches a **fragment of a name**, ignoring case and ignoring
accents in both directions: \`juju\` finds *Jujutsu Kaisen*, \`perche\` finds *Perché non sono già
morto?*, \`kohei\` finds *Kōhei Horikoshi*. What it does not do is interpret: it looks at names only,
so a Type, a state, a publisher or a year is a question for the area's own tool.

Each result carries \`kind\`, the record's \`id\`, its \`name\`, and a \`qualifier\` — the one word that
tells two records of one name apart: a Story's Type, a Volume's Binding, the edition line a Series
is. Two rows called *Batman: Il lungo Halloween* qualified *Must Have* and *Paperback* are two
objects on a shelf and not a duplicate.

Two things to read correctly. A **Story is not a Volume** (ADR-0001): the narrative is what was read
and rated, the Volume is a printed object, and one word usually finds both. And the Volumes here are
the whole **catalogue**, not the Collection — one may be catalogued and not in the house — so use
\`collection_search\` when the question is whether the owner *owns* it.`,
  inputSchema: {
    type: "object",
    properties: {
      term: {
        type: "string",
        description: `A word or a fragment of a name. Matched anywhere in it, ignoring case and
accents. Not a pattern: \`%\` and \`_\` are ordinary characters, so \`100%\` finds *100% Doraemon*.`,
      },
      per_kind: {
        type: "number",
        description: `How many of each kind to answer with, 10 by default. Per kind rather than
overall, so a word matching thirty Volumes still shows you the Series. Raise it when you need the
whole of a Series' Volumes in one call.`,
      },
    },
    required: ["term"],
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    return {
      // The count the assistant did not ask for is this door's default rather than the
      // query's: an owner's suggestion list is five rows because five is what fits under a
      // field, and an assistant is reading rather than looking — it can hold more, and a
      // second call to see the sixth Volume of a Series is a worse answer.
      found: await findInTheLibrary({
        term: stringArgument(input, "term") ?? "",
        perKind: numberArgument(input, "per_kind") ?? 10,
      }),
    };
  },
};

export default [search];
