import { listBindings } from "@/core/queries/binding";
import { countCollection, searchCollection } from "@/core/queries/collection";
import { type McpTool, stringArgument } from "../tool.ts";

// The Collection area: the Volumes physically in the owner's house.
//
// Being read is no part of this and neither is wanting: a Volume is here because it is on
// the shelf. What it answers for an assistant is *"they already own that story, in the
// Must Have"* (user story 35), which is a different question from anything in `story.ts`
// and is why the two are separate areas rather than one file about books.

const search: McpTool = {
  name: "collection_search",
  title: "Search the Collection",
  description: `The Volumes physically in the owner's house, narrowed by title, publisher or Binding.

A Volume is one object they bought and kept — a tankōbon, an omnibus, a novel — carrying its
publisher, edition line, language, price paid and ISBN. It says nothing about what was read: a
Volume here may hold Stories they never opened, and a Story they loved may have no Volume at all,
because digital ownership is not modelled.

The Binding — Tankōbon, Omnibus, Deluxe, Must Have, Hardcover, Paperback — is how it is bound, and
it is what makes "you already own that in a different edition" sayable. Ask
\`collection_bindings\` for the ids to filter by. With no arguments this returns the whole
Collection; \`owned\` is always the total, so a search reads as "3 of 98".`,
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Matched anywhere in the title, ignoring case." },
      publisher: {
        type: "string",
        description: "Matched anywhere in the publisher, ignoring case.",
      },
      binding: {
        type: "string",
        description: "A Binding id from `collection_bindings`. Exact.",
      },
    },
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    const filter = {
      title: stringArgument(input, "title"),
      publisher: stringArgument(input, "publisher"),
      binding: stringArgument(input, "binding"),
    };

    // Two questions, asked together because the answer is one sentence: *these ones, out
    // of that many*. The count is its own statement in the core for the reason it is its
    // own statement on the page — counting by fetching would read the whole Collection to
    // print one number.
    const [volumes, owned] = await Promise.all([searchCollection(filter), countCollection()]);

    return { volumes, matched: volumes.length, owned };
  },
};

const bindings: McpTool = {
  name: "collection_bindings",
  title: "The Binding vocabulary",
  description: `Every Binding, with the id to filter \`collection_search\` by and the name to say out loud.

A Binding is how a Volume is bound, and the owner's vocabulary for it grows — a kanzenban is a
Binding they will meet — so read the list rather than assuming the six you know.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { bindings: await listBindings() };
  },
};

export default [search, bindings];
