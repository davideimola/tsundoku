import { findSeries, listMissingVolumes, listSeries } from "@/core/queries/series";
import { type McpTool, stringArgument } from "../tool.ts";

// The Series area: the completeness ledger, and nothing about whether anything was good.
//
// A Series here is a publisher's ordered line of Volumes for one edition — how many are
// out, whether the line is ongoing or concluded, which position comes next. It answers
// *"what am I missing"* and never *"was it any good"*, which is why it is a separate area
// from `story.ts` rather than a second opinion about the same books.
//
// `series_missing` is user story 36: an assistant reads it and can suggest a purchase that
// completes something, without the owner having typed a single row of what is absent.

const missing: McpTool = {
  name: "series_missing",
  title: "What is missing from the Series being collected",
  description: `The positions the owner does not have yet, for every Series they have **decided to collect** and
that still has a gap.

A Series is a publisher's ordered line of Volumes for one edition — Death Note in six Black
Edition volumes or twelve standard ones are two Series, with different volume counts. This is a
completeness ledger and not a narrative: nothing here says whether the story is good, which is
\`stories_read\`'s business.

\`missing\` is the positions absent from the house, ascending, and \`nextMissing\` is the one to buy
next. Both are computed from the published count against the shelf, so they cannot be stale — and a
Volume the owner has released counts as missing again, because the shelf is what the ledger is
measured against.

**Collecting is a deliberate decision and never derived from ownership.** A Series the owner has
not decided to collect is not in this list at all, however many of its Volumes they happen to own:
holding 42 of Naruto's 72 opens no project, and suggesting the other 30 would be inventing an
intention. Ask \`series_list\` to see those. A collected Series with nothing absent is also not
here — the question is what is missing, and a complete line is not an answer to it, so an empty
list means the owner is not missing anything rather than that something went wrong.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { series: await listMissingVolumes() };
  },
};

const list: McpTool = {
  name: "series_list",
  title: "Every declared Series",
  description: `Every Series the owner has written down, whether they are collecting it or not, with its
publisher, edition line, status (ongoing or concluded), how many Volumes are published and how many
are in the house.

Read this to know the shape of a line before saying anything about it — that Naruto is 72 volumes
is worth having before recommending a start. \`collectingSince\` is the day the owner decided to
complete the Series, or \`null\` where they never did, and \`nextMissing\` is the position to buy next
where there is a collecting project and something absent from it.

**\`missing\` is \`null\` for a Series that is not being collected, and that is not the same as
nothing being missing.** An empty list means the line is complete in the house; \`null\` means there
is no collecting project, so there is nothing that counts as absent. Do not read one as the other,
and do not turn \`null\` into a shopping list. \`series_missing\` is the narrower list of gaps that
the owner has actually committed to closing.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { series: await listSeries() };
  },
};

const find: McpTool = {
  name: "series_find",
  title: "One Series, with what of it is on the shelf",
  description: `One Series by id: its ledger, and the Volumes of it physically in the owner's house, by position,
each with its Binding.

The \`series_id\` comes from \`series_list\` or \`series_missing\`. Only owned objects are listed —
a released Volume is absent here and counts as missing again — so the list is the shelf and not the
publisher's catalogue. Answers \`null\` where no such Series exists, which is an answer and not a
failure.

A Volume standing here says nothing about the story having been read: being on the shelf and having
been read are unrelated facts, and \`stories_read\` is the one that knows.`,
  inputSchema: {
    type: "object",
    properties: {
      series_id: {
        type: "string",
        description: "A Series id from `series_list` or `series_missing`. Exact.",
      },
    },
    required: ["series_id"],
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    return { series: await findSeries(stringArgument(input, "series_id") ?? "") };
  },
};

export default [missing, list, find];
