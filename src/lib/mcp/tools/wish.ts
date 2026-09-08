import { listOpenWishes } from "@/core/queries/wish";
import { boughtWhatWasWished } from "@/core/verbs/bought-what-was-wished";
import { amendWish, closeWish, openWish, type WishAmendment } from "@/core/verbs/wish";
import { type McpTool, stringArgument } from "../tool.ts";

// The Wish area: the shopping list, written from a conversation.
//
// Opening a Wish names a Volume that already exists, so this door calls the verb directly
// (ADR-0005) — and the verb is the boundary working on its own: it refuses a Volume nobody
// catalogued rather than creating one, so an assistant cannot want an object into existence.
// A title nobody recorded is `inbox_propose_volume`, then a Wish once the owner approves.
//
// Four tools now (ADR-0023). A Wish is opened deliberately, **replanned** on the record, and
// ended deliberately — by `wish_close`, or by `wish_bought`, which is the one press that says
// why it ended. Nothing else ends one: acquiring the object from the Collection does not, and
// releasing it does not, because the owner's stated reason is that nothing should silently
// disappear from what they meant to buy.
//
// **`wish_amend` is a tool where `volume_amend` is not**, and the line is ADR-0005's rather
// than an inconsistency. An amending verb is kept off this door where the record is a Story, a
// Volume or a Series, because a half-remembered publisher is a permanent fact nobody reads back
// (ADR-0011). A Wish is none of those: it is narrow, reversible and wrong in an obvious way —
// the owner reads the whole of it every time they stand in a shop.
//
// **A month, never a day.** Every period on this door is `YYYY-MM`, and the absence of one is
// *someday*: a real answer the owner picks, and not a field left blank.

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

The **period** is which month they mean to buy it in, and it is the whole of *how soon*: there is no
priority and no rank, because the owner buys everything in a month rather than in an order.

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
      period: {
        type: "string",
        description: `The month the owner means to buy it in: \`2026-09\`. Leave it out for *someday*, which is
the honest answer when they have not said — **ask rather than guessing a month**, because this is
what the shopping list bands on and what it adds up.`,
      },
      target_price: {
        type: "string",
        description: `What it should cost, with no currency: 15.00. A comma is taken too. Leave it out while the
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
    required: ["volume"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return {
      wish: await openWish({
        volumeId: stringArgument(input, "volume") ?? "",
        // Nothing sent is *someday* rather than a refusal: the absence of a plan is a plan
        // the owner is allowed to have.
        period: stringArgument(input, "period"),
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
  description: `End a Wish: the Volume leaves the shopping list today, and nothing else happens.

**Use it when the owner stopped wanting the object** — a better edition turned up, the plan is off, they
read it in a library. **If they bought it, say \`wish_bought\` instead**: that one records the acquisition
and ends the Wish together, which is what actually happened.

The model does not record *why* a Wish ended: this call and \`wish_bought\` leave the same row behind,
and what tells them apart is the acquisition beside it. "Acquired" is not a state a Wish has.

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

/**
 * Whether the call **named** this field at all, which is the difference between *leave what
 * stands there* and *clear it*.
 *
 * `stringArgument` reads a blank as nothing sent, and it is right to everywhere else on this
 * door: an assistant clearing a box has to mean one thing consistently. Here the two readings
 * genuinely differ, because replanning is where the owner takes a number **off** a Wish — so
 * a field that is absent is left standing, and one sent as `null` or empty is emptied.
 */
function named(input: Record<string, unknown>, key: string): boolean {
  return key in input && input[key] !== undefined;
}

const amend: McpTool = {
  name: "wish_amend",
  title: "Replan a Wish",
  description: `Rewrite what an open Wish says: which month it is planned into, what it should cost, what it
costs where it was found, and where that was.

**This is how a Wish moves between months.** Do not close one and open another to reschedule it — that
loses the day the intention was opened, which is what the list orders by and what says *they have been
meaning to buy this since March*.

**A field left out is left standing; a field sent as \`null\` is emptied.** That is deliberate and it is
how the owner says *someday* — clear the period — or takes a price off that is no longer on the shelf.
It is also why sending every field with a guess is worse than sending the one they changed.

It says nothing about the object. A Wish that names the wrong Volume is closed rather than repointed,
and correcting the object itself is an Amendment the owner approves (\`inbox_propose_amendment\`).

Refused on a Wish that has already ended, and on a call that changes nothing.`,
  inputSchema: {
    type: "object",
    properties: {
      wish: { type: "string", description: "The Wish's id, from `wish_list`." },
      period: {
        type: ["string", "null"],
        description: "The month to buy it in: `2026-09`. `null` for *someday*.",
      },
      target_price: {
        type: ["string", "null"],
        description: "What it should cost, with no currency: 15.00. `null` to take it off.",
      },
      price_found: {
        type: ["string", "null"],
        description: "What it costs where they found it: 12.90. `null` to take it off.",
      },
      shop: {
        type: ["string", "null"],
        description: "Where that price was, as a name the owner reads. `null` to take it off.",
      },
    },
    required: ["wish"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    const amendment: WishAmendment = {};
    if (named(input, "period")) amendment.period = stringArgument(input, "period") ?? null;
    if (named(input, "target_price"))
      amendment.targetPrice = stringArgument(input, "target_price") ?? null;
    if (named(input, "price_found"))
      amendment.priceFound = stringArgument(input, "price_found") ?? null;
    if (named(input, "shop")) amendment.shop = stringArgument(input, "shop") ?? null;

    await amendWish(stringArgument(input, "wish") ?? "", amendment);
    return { amended: true };
  },
};

const boughtIt: McpTool = {
  name: "wish_bought",
  title: "The object a Wish named came home",
  description: `The owner bought it: the Volume joins the Collection **and** the Wish ends, in one act.

Say this when they tell you they bought something on the shopping list — *"I picked up Slam Dunk 3"*.
It is one call rather than \`collection_acquire\` followed by \`wish_close\`, because it is one event:
either both are written or neither is.

**The price is what they paid, and not what the Wish said.** Leave it out rather than copying the
price the Wish found — that number is what a shop was asking, and inventing a receipt from it is the
one thing this tool must not do. Leave the day out too where they did not say one; today is the
default.

Refused where the Wish has already ended, and where the house already holds the object — the second is
a Volume acquired twice, which is a mistake worth naming rather than a second copy.`,
  inputSchema: {
    type: "object",
    properties: {
      wish: { type: "string", description: "The Wish's id, from `wish_list`." },
      price_paid: {
        type: "string",
        description: "What was actually paid, with no currency: 12.90. Leave it out if unknown.",
      },
      acquired_on: {
        type: "string",
        description: "The day it came home, `2026-09-08`. Leave it out for today.",
      },
    },
    required: ["wish"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    await boughtWhatWasWished(stringArgument(input, "wish") ?? "", {
      pricePaid: stringArgument(input, "price_paid"),
      acquiredOn: stringArgument(input, "acquired_on"),
    });
    return { bought: true };
  },
};

const list: McpTool = {
  name: "wish_list",
  title: "The shopping list",
  description: `Every open Wish, with the Volume it names, how soon the owner wants it, what it should
cost, what it costs and where.

Every Wish carries the **period** it is planned into — the month the owner means to buy it in, \`2026-09\`
— or none at all, which is *someday*. A month that has gone by is not late and not a state: the Wish is
still open and still says the month it was planned for.

It is a shopping list rather than a wish-shaped diary: what is here is what the owner means to buy.
An open Wish says nothing about whether they have read the Story the object carries, and a Volume
already in the house can still be wanted — a better edition, or a second copy.

The Volume also carries what the owner's own screen draws it as: the line it stands in (\`seriesId\`,
\`seriesNumber\`) where it stands in one, and \`cover\`, a **reference** to an image on somebody else's
domain. Neither is anything to act on — do not fetch the cover, and do not read a missing line as a
gap in the catalogue: a position of a Series is filled by what is on the shelf, so most of what is
wanted stands in none.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { wishes: await listOpenWishes() };
  },
};

export default [open, amend, boughtIt, close, list];
