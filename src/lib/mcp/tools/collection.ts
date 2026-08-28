import { listBindings } from "@/core/queries/binding";
import { countCollection, searchCollection } from "@/core/queries/collection";
import { acquireVolume, releaseVolume } from "@/core/verbs/collection";
import { type McpTool, stringArgument } from "../tool.ts";

// The Collection area: the Volumes physically in the owner's house.
//
// Being read is no part of this and neither is wanting: a Volume is here because it is on
// the shelf. What it answers for an assistant is *"they already own that story, in the
// Must Have"* (user story 35), which is a different question from anything in `story.ts`
// and is why the two are separate areas rather than one file about books.
//
// **The Collection is a subset of what the library knows** (ADR-0007), and the description
// below says so, because the silence would otherwise be read as the wrong answer: an object
// missing from a search may be one the owner catalogued and does not own — a thing they
// mean to buy — rather than one nobody has ever recorded.

const search: McpTool = {
  name: "collection_search",
  title: "Search the Collection",
  description: `The Volumes physically in the owner's house, narrowed by title, publisher or Binding.

A Volume is one catalogued object — a tankōbon, an omnibus, a novel — carrying its publisher,
edition line, language and ISBN; the price and the day it came home belong to the acquisition that
put it in the house, and travel with it here. **This answers with the ones in the house, which are
a subset of the objects the library knows**: a Volume the owner catalogued and does not own is not
here, so an absence means "not on the shelf" and not "never heard of". It says nothing about what
was read: a Volume here may hold Stories they never opened, and a Story they loved may have no
Volume at all, because digital ownership is not modelled.

The Binding — Tankōbon, Omnibus, Deluxe, Must Have, Hardcover, Paperback — is how it is bound, and
it is what makes "you already own that in a different edition" sayable. Ask
\`collection_bindings\` for the ids to filter by. With no arguments this returns the whole
Collection; \`owned\` is the size of the whole Collection either way.`,
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
    // of that many*. Both come back as the core answered them and neither is counted
    // here — the count is its own statement in `src/core` for the reason it is its own
    // statement on the page, and a number this door worked out would be a number the page
    // would have to work out again.
    const [volumes, owned] = await Promise.all([searchCollection(filter), countCollection()]);

    return { volumes, owned };
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

// The two write tools, and the line ADR-0005 draws runs right through this area.
//
// **Acquiring is a verb on an object that already exists**, so this door calls it directly:
// it is one row, it says a thing the owner can check by looking at a shelf, and it is
// undone by releasing. **Cataloguing is entity creation**, and it is deliberately absent —
// there is no `collection_catalogue` here and there must not be one, because a fabricated
// edition is a permanent duplicate. ADR-0007 is what makes the split clean: the two acts
// were one verb until it separated them, and the boundary now falls exactly between them.

const acquire: McpTool = {
  name: "collection_acquire",
  title: "Record that a Volume is in the house",
  description: `Record that a catalogued **Volume** is in the owner's house, from a day and at a
price: it joins the Collection.

This is the tool for *"I bought Omnibus 1"* — but only for an object the library already knows. **It
never catalogues one**: a Volume nobody has recorded is \`inbox_propose_volume\`, and the owner
approving that proposal is what records the object. Then this says it came home.

Being catalogued and being in the house are two facts, which is why this is a second act rather than
a field on the first. Said again on a Volume already in the house it is refused — the Collection
cannot claim one object twice. Said again after a release it is a **second acquisition**, which is
the real event: sold, then bought again.

It does **not** end a Wish. Nothing but \`wish_close\` does, deliberately, so do not assume the
shopping list has changed.`,
  inputSchema: {
    type: "object",
    properties: {
      volume: {
        type: "string",
        description: `The Volume's id. \`collection_search\` answers with the objects already in the
house, so an id from there is one this tool will refuse — you want an object the owner has just got.`,
      },
      acquired_on: {
        type: "string",
        description: `The day it came home, written 2024-03-11. Leave it out where the owner does not
know: a Volume owned since before any of this was written down has no receipt, and the fact does not
depend on the day.`,
      },
      price_paid: {
        type: "string",
        description: `What was paid for *this* acquisition, with a dot and no currency: 24.90. Leave
it out for a gift or where the receipt is gone.`,
      },
    },
    required: ["volume"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    await acquireVolume({
      volumeId: stringArgument(input, "volume") ?? "",
      acquiredOn: stringArgument(input, "acquired_on"),
      pricePaid: stringArgument(input, "price_paid"),
    });
    return { acquired: true };
  },
};

const release: McpTool = {
  name: "collection_release",
  title: "Record that a Volume left the house",
  description: `Record that a **Volume** left the owner's hands: the acquisition ends today and the
Collection stops claiming it.

The object stays in the catalogue and its history stays with it. A Reading made through it and the
Edition note written about it are facts about the owner's past, so nothing is deleted — what changes
is only whether the Collection answers with it. Acquiring it again later is a new acquisition.

Refused on a Volume the Collection does not claim, and the two ways of not claiming it are told
apart: one means they let it go already, the other means it is catalogued and was never in the
house.`,
  inputSchema: {
    type: "object",
    properties: {
      volume: { type: "string", description: "The Volume's id, from `collection_search`." },
    },
    required: ["volume"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    await releaseVolume(stringArgument(input, "volume") ?? "");
    return { released: true };
  },
};

export default [search, bindings, acquire, release];
