import type { InboxAct, InboxEntry, ProposedEntity } from "@/core/queries/inbox";
import { AMENDABLE_FIELDS, type Approval, type ProposalField } from "@/core/verbs/inbox";

// How a few hundred waiting entries become a handful of decisions, and the words the Inbox
// reads in.
//
// A backfill arrives by the hundred (ADR-0011): an ISBN for every Volume, a publisher for
// every line the sheets left blank. An Inbox sized for one entry at a time makes that cost
// more than typing the fields by hand, which is the same as refusing it. So the screen
// groups, and **what makes a group one decision is that every entry in it proposes the same
// fields on the same kind of record under the same publisher's line.** Fold two of those
// together and the heading lies about what approving does; split one and the owner is back
// to 43 decisions.
//
// It is banding rather than narrowing, which is why it is the screen's and not the query's
// (`AGENTS.md`): the page holds every waiting entry and renders every one of them. And it
// is a pure function over what the query answered — no DOM, no renderer, no database — so
// it is tested beside itself the way the tint and the gate's predicate are.
//
// The vocabulary lives here too, for the same reason the grouping does: a heading naming
// *43 ISBNs* and a field labelled *ISBN* are one word, and two lists would drift.

/** One decision the owner takes: the entries that are about the same thing. */
export type InboxGroup = {
  /** What makes it one group. Stable across requests, so it is usable as a React key. */
  key: string;
  act: InboxAct;
  proposes: ProposedEntity;
  /**
   * The fields the amendments in it propose, in the record's own order. Every field of the
   * record on a group of creations, which is offered the whole thing to fill in.
   */
  fields: ProposalField[];
  /**
   * The publisher every record in the group stands under, where they share one — the axis
   * the owner's trust actually runs along, since a line read off one publisher's site is
   * one piece of work. `null` on a creation, on a Story, and on a record that has gone.
   */
  publisher: string | null;
  /**
   * The sentence every entry in it came out of, where they share one, and `null` where they
   * do not.
   *
   * A folded group is approved on its heading alone, so the assistant's own words have to
   * reach the heading: a backfill of 43 ISBNs is 43 entries reporting *read off the back
   * cover*, and that sentence is how the owner tells a careful piece of work from a guess
   * before opening anything.
   */
  reported: string | null;
  entries: InboxEntry[];
};

/** What each kind of record is called on screen, in the owner's own vocabulary. */
const ENTITY: Record<ProposedEntity, { one: string; many: string }> = {
  story: { one: "Story", many: "Stories" },
  volume: { one: "Volume", many: "Volumes" },
  series: { one: "Series", many: "Series" },
};

/**
 * Every field, as the label above a box and as the word in a heading.
 *
 * `label` is what the owner reads beside the value; `one` and `many` are the same field
 * spoken about in the plural — *43 ISBNs*, *12 published counts* — which is a different
 * grammatical job and not a case conversion of the label.
 */
const FIELD: Record<ProposalField, { label: string; one: string; many: string }> = {
  title: { label: "Title", one: "title", many: "titles" },
  typeId: { label: "Type", one: "Type", many: "Types" },
  name: { label: "Name", one: "name", many: "names" },
  publisher: { label: "Publisher", one: "publisher", many: "publishers" },
  editionLine: { label: "Edition line", one: "edition line", many: "edition lines" },
  binding: { label: "Binding", one: "Binding", many: "Bindings" },
  language: { label: "Language", one: "language", many: "languages" },
  isbn: { label: "ISBN", one: "ISBN", many: "ISBNs" },
  publishedCount: { label: "Volumes published", one: "published count", many: "published counts" },
  status: { label: "Status", one: "status", many: "statuses" },
  instalments: { label: "Instalments", one: "Instalment count", many: "Instalment counts" },
};

/**
 * What approving does, in the library's terms rather than the workflow's.
 *
 * *Catalogue the Volume* is the last thing read before a permanent row exists, and
 * *catalogued* is what the answer says afterwards — one vocabulary for both, because a
 * button saying *Catalogue* and a receipt saying *added* would be two applications talking
 * about one row. **Approve** appears nowhere: it is a word about this screen, and every act
 * here is a word about the library.
 *
 * An amendment is the same act whatever kind of record it is about — it changes one — so it
 * is keyed beside the three entities rather than under each of them.
 */
const APPROVING: Record<"amend" | ProposedEntity, { does: string; done: string }> = {
  amend: { does: "Amend", done: "amended" },
  story: { does: "Create", done: "created" },
  volume: { does: "Catalogue", done: "catalogued" },
  series: { does: "Declare", done: "declared" },
};

/** What each kind of record is called, for however many of them there are. */
export function entityWord(proposes: ProposedEntity, howMany: number): string {
  return howMany === 1 ? ENTITY[proposes].one : ENTITY[proposes].many;
}

/** The label above a field's value or its box. */
export function fieldLabel(field: ProposalField): string {
  return FIELD[field].label;
}

/**
 * The fields an entry is about, in the order the record is read in.
 *
 * **An amendment names its own fields and only those** — what it does not name is left
 * standing — so the diff shows exactly what would change and nothing else. **A creation is
 * offered the whole record**, because approving one is choosing its fields: the Binding an
 * assistant could not know is the ordinary case, and a form showing only what it guessed
 * would have no box to put one in.
 *
 * The order and the membership are both `AMENDABLE_FIELDS`', which is the creating verbs'
 * own list of what each kind of record has: the other door is untyped, so a key an
 * assistant invented is a key no record has, and there is nothing here to draw for it.
 */
export function proposedFields(entry: InboxEntry): ProposalField[] {
  const fields = AMENDABLE_FIELDS[entry.proposes];
  if (entry.act === "create") return [...fields];
  return fields.filter((field) => field in entry.details);
}

/**
 * Group what is waiting, keeping the order it arrived in.
 *
 * The Inbox is worked through rather than browsed, so the query answers oldest first and
 * this keeps that in both directions: the group holding the oldest thing waiting is read
 * first, and the entries inside it stand in the order they were proposed. A grouping that
 * put the biggest group at the top would leave the oldest entry at the bottom forever.
 */
export function groupWaiting(entries: readonly InboxEntry[]): InboxGroup[] {
  const groups = new Map<string, InboxGroup>();

  for (const entry of entries) {
    // **A creation groups by what approving it would make and by nothing else.** Which
    // fields the assistant happened to fill in is not an axis: two proposed Volumes are one
    // decision whether or not one of them arrived without a language — and both are offered
    // the whole record, so the group's fields are the same list either way.
    const fields = proposedFields(entry);
    const publisher = entry.act === "amend" ? publisherOf(entry) : null;
    const about = entry.act === "amend" ? fields.join(",") : "";
    const key = [entry.act, entry.proposes, about, publisher ?? ""].join("|");

    const group = groups.get(key);
    if (group) {
      group.entries.push(entry);
      continue;
    }

    groups.set(key, {
      key,
      act: entry.act,
      proposes: entry.proposes,
      fields,
      publisher,
      reported: entry.reported,
      entries: [entry],
    });
  }

  // The shared sentence is settled at the end rather than as the entries arrive: it is a
  // property of the whole group, and one entry reporting something of its own takes it away
  // from all of them.
  return [...groups.values()].map((group) => ({
    ...group,
    reported: group.entries.every((entry) => entry.reported === group.reported)
      ? group.reported
      : null,
  }));
}

/**
 * What the group is about, in one line: *43 ISBNs on Star Comics Volumes*.
 *
 * The sentence is the decision, so it says the three things the decision is made of — how
 * many, what changes, and on what — and it is written from the group rather than from the
 * first entry in it. It is what the owner reads when they approve a group without opening
 * it, which is the gesture this screen exists to make possible.
 */
export function whatItIsAbout(group: InboxGroup): string {
  const howMany = group.entries.length;
  const what = entityWord(group.proposes, howMany);

  if (group.act === "create") return `${howMany} proposed ${what}`;

  const under = group.publisher === null ? "" : `${group.publisher} `;
  const records = howMany === 1 ? `a ${under}${what}` : `${under}${what}`;
  return `${howMany} ${fieldWords(group.fields, howMany)} on ${records}`;
}

/**
 * What the group holds that the library already has, in one line, or `null` where it holds
 * none.
 *
 * The heading is what a folded group is approved on, so the duplicate has to reach it: an
 * assistant proposing a Story the library already knows is the mistake the whole boundary
 * exists to catch (#53), and it is the one thing about an entry the owner cannot check by
 * reading it. What each namesake actually **is** stays on the entry, beside the proposal it
 * doubles — this says only that there is something to look at, which is what decides
 * whether the group is opened at all.
 *
 * An amendment has none by construction: it names a record, and what stands in that record
 * is the diff.
 */
export function whatIsAlreadyThere(group: InboxGroup): string | null {
  const already = group.entries.filter((entry) => entry.namesakes.length > 0).length;
  if (already === 0) return null;

  const what = entityWord(group.proposes, already);
  if (group.entries.length === 1) return `The library already holds a ${what} called that.`;

  return already === 1
    ? `1 of these names a ${what} the library already holds.`
    : `${already} of these name ${what} the library already holds.`;
}

/** The publisher the record an amendment is about stands under, where the record says. */
function publisherOf(entry: InboxEntry): string | null {
  const publisher = entry.standing?.publisher;
  return typeof publisher === "string" && publisher.trim() !== "" ? publisher : null;
}

/** What approving one of these does, as the button says it and as the receipt says it. */
export function approvingWord(
  act: InboxAct,
  proposes: ProposedEntity
): { does: string; done: string } {
  return APPROVING[act === "amend" ? "amend" : proposes];
}

/**
 * What an approval did, counted by kind: *39 Volumes amended and 2 Stories created.*
 *
 * The verb takes a selection rather than a group, and a selection may hold both acts across
 * all three records, so the receipt cannot be one sentence about one kind. It is written
 * from what the verb answered rather than from what the form asked for: an entry named twice
 * is decided once, and the receipt says so once.
 */
export function receiptFor(approvals: readonly Approval[]): string {
  const counted = new Map<string, number>();
  for (const approval of approvals) {
    const kind = `${approval.act}|${approval.proposes}`;
    counted.set(kind, (counted.get(kind) ?? 0) + 1);
  }

  const said = [...counted].map(([kind, howMany]) => {
    const [act, proposes] = kind.split("|") as [InboxAct, ProposedEntity];
    return `${howMany} ${entityWord(proposes, howMany)} ${approvingWord(act, proposes).done}`;
  });

  return said.length === 0 ? "" : `${inOneBreath(said)}.`;
}

/** The fields of a group, spoken about: *ISBNs*, *publishers and edition lines*. */
function fieldWords(fields: readonly ProposalField[], howMany: number): string {
  return inOneBreath(fields.map((field) => (howMany === 1 ? FIELD[field].one : FIELD[field].many)));
}

/** Several things said as one thing: *a*, *a and b*, *a, b and c*. */
function inOneBreath(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
