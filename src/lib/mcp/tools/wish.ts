import { listOpenWishes } from "@/core/queries/wish";
import { closeWish, openWish } from "@/core/verbs/wish";
import { type McpTool, numberArgument, stringArgument } from "../tool.ts";

// The Wish area: the shopping list, written from a conversation.
//
// Opening a Wish names a Volume that already exists, so this door calls the verb directly
// (ADR-0005) — and the verb is the boundary working on its own: it refuses a Volume nobody
// catalogued rather than creating one, so an assistant cannot want a book into the library.
// A title nobody recorded is `inbox_propose_volume`, then a Wish once the owner approves.
//
// Two tools, and there is no third: a Wish is opened deliberately and closed deliberately.
// Nothing else ends one — not acquiring the object, not releasing it — because the owner's
// stated reason is that nothing should silently disappear from what they meant to buy.

const open: McpTool = {
  name: "wish_open",
  title: "Open a Wish on a Volume",
  description: `Record that the owner means to acquire a **Volume**: how soon, what it should cost,
what it costs where it was found, and where that was.

A Wish names one catalogued object and creates nothing. **A Volume the library has not catalogued is
refused**, in prose saying so — that is the boundary, not a bug: propose the object with
\`inbox_propose_volume\` and open the Wish once the owner has approved it.

*"Complete this series"* is **not** a Wish. That is the collecting decision on a Series, and the
missing Volumes follow from it as a query rather than as rows anybody types — so do not open one Wish
per missing volume.

Refused where there is already an open Wish for that Volume, so the list cannot say *buy this* twice
for one object. A Wish the owner already owns the object of is allowed and shown as such: wanting a
second copy or a better edition is a real intention.`,
  inputSchema: {
    type: "object",
    properties: {
      volume: {
        type: "string",
        description: `The Volume's id. \`collection_search\` answers with the ones in the house;
\`wish_list\` shows what is already wanted.`,
      },
      priority: {
        type: "number",
        description:
          "1 next, 2 soon, 3 someday. Ask rather than guessing: it decides what gets bought.",
      },
      target_price: {
        type: "string",
        description: `What it should cost, with a dot and no currency: 15.00. Leave it out while the
owner is only watching for it.`,
      },
      price_found: {
        type: "string",
        description: "What it costs where they found it: 12.90.",
      },
      shop: {
        type: "string",
        description: `Where that price was, as a name the owner reads — "Star Shop", "Amazon". Not a
vocabulary; write what they said.`,
      },
    },
    required: ["volume", "priority"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return {
      wish: await openWish({
        volumeId: stringArgument(input, "volume") ?? "",
        // `NaN` where an assistant sent something that is not a number, which the verb
        // refuses with the picker's own three labels.
        priority: numberArgument(input, "priority") ?? Number.NaN,
        targetPrice: stringArgument(input, "target_price"),
        priceFound: stringArgument(input, "price_found"),
        shop: stringArgument(input, "shop"),
      }),
    };
  },
};

const close: McpTool = {
  name: "wish_close",
  title: "End a Wish",
  description: `End a Wish: the Volume leaves the shopping list today.

**This is the only thing that ends one**, and it is deliberate. Do not call it because the owner
bought the object — say \`collection_acquire\` for that, and leave the Wish open unless they tell you
to close it. The model does not record *why* a Wish ended: bought here, bought elsewhere, no longer
wanted are the same event to it, and "acquired" is not a state a Wish has.

Refused on a Wish that has already ended.`,
  inputSchema: {
    type: "object",
    properties: {
      wish: { type: "string", description: "The Wish's id, from `wish_list`." },
    },
    required: ["wish"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    await closeWish(stringArgument(input, "wish") ?? "");
    return { closed: true };
  },
};

const list: McpTool = {
  name: "wish_list",
  title: "The shopping list",
  description: `Every open Wish, with the Volume it names, how soon the owner wants it, what it should
cost, what it costs and where.

It is a shopping list rather than a wish-shaped diary: what is here is what the owner means to buy.
An open Wish says nothing about whether they have read the Story the object carries, and a Volume
already in the house can still be wanted — a better edition, or a second copy.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { wishes: await listOpenWishes() };
  },
};

export default [open, close, list];
