import Link from "next/link";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Binding, listBindings } from "@/core/queries/binding";
import {
  type InboxEntry,
  listDecidedInboxEntries,
  listWaitingInboxEntries,
} from "@/core/queries/inbox";
import { listTypes, type Type } from "@/core/queries/type";
import { NEEDED_TO_CREATE, type ProposalField } from "@/core/verbs/inbox";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { recordHref } from "../find/kinds";
// The rows a found record is drawn in, borrowed from the finder rather than written again:
// *what the library already holds under this name* is the finder's own question asked about
// one entry, and a namesake that read one way here and another under the field would be the
// owner learning that the two are different libraries.
import { FoundRow, ROW } from "../find/row";
import { decide } from "./actions";
import {
  approvingWord,
  entityWord,
  fieldLabel,
  groupWaiting,
  type InboxGroup,
  proposedFields,
  whatIsAlreadyThere,
  whatItIsAbout,
} from "./decisions";

// THE INBOX, and the screen a maintenance session happens in (#27).
//
// It was the one door a new Story, Volume or Series enters through from outside (ADR-0005),
// and it is now also the one door a **repair** comes through (ADR-0011): the ISBN a Volume
// was catalogued without, the publisher the sheets left blank. That is what rewrote this
// screen. An assistant handed the two doors arrives with hundreds of proposals — an ISBN for
// every one of 96 Volumes — and an Inbox sized for one entry at a time makes that backfill
// cost more than typing the fields by hand, which is the same as refusing it.
//
// So five decisions, and the first one reverses what this screen used to say out loud.
//
//   1. **Bulk is the point.** The old version of this file declared that *nothing is bulk*,
//      because a boundary you can clear in one tap is not a boundary. That was right while
//      the Inbox carried nothing but new entities, and ADR-0011 took it back: 43 ISBNs on
//      Star Comics Volumes is **one** decision, and the boundary that survives is the
//      owner's judgement rather than the number of taps it costs them. Every entry in a
//      group is ticked when the screen arrives; the gesture is to untick what you doubt.
//   2. **Entries are grouped by what they are about** (`./decisions`), and a group is one
//      sentence: the same fields, on the same kind of record, under the same publisher's
//      line. Folded shut past three entries, because the heading is what the owner reads
//      when they approve a group without opening it — and open below three, where folding a
//      thing to hide two of them is a click that buys nothing.
//   3. **An amendment is read as a diff and never as a form.** What stands in the record
//      today, beside what is proposed for it, so approving is a judgement rather than a
//      leap. Correcting an ISBN by hand is exactly the work the owner asked the assistant
//      to do, so this screen does not offer to: a wrong one is rejected, and the entry was
//      its only trace. **A creation is the opposite** — approving one is choosing its
//      fields, since the Binding an assistant could not know is the ordinary case — so it
//      is the whole record as boxes, filled with what was said.
//   4. **A creation is read against what the library already holds** (#53). The assistant
//      is told to search before it proposes, and the entry is where that instruction is
//      *checked*: an amendment has always shown what stands in the record it names, and a
//      creation now shows the records already called what it proposes. It is what a
//      duplicate looks like on this screen — the owner cannot hold seventy-seven titles in
//      their head, and used to approve one in a hurry and strike it later. The count reaches
//      the group's heading and opens it, because a group folded shut is approved on that
//      heading alone.
//   5. **The assistant's own words stay on every entry**, quoted rather than summarised.
//      They are how the owner tells a careful proposal from a guess: *read off the back
//      cover* and *ho comprato Ultimate Spider-Man Omnibus 1* are different kinds of
//      evidence, and neither is derivable from the fields underneath.
//
// **No field on this screen is `required`, and that is a consequence rather than an
// oversight.** A group is one form, so the browser would refuse to submit it over an empty
// box on an entry the owner had deliberately unticked — the validation would fight the
// gesture. What replaces it is the creating verb's own refusal, which now names the entry it
// was refused on, and a `needed` mark on the boxes the assistant left empty so the owner
// sees it before pressing anything.
//
// Everything else follows the screens it sits beside: `POST`s to a Server Function, native
// pickers, and nothing running in the browser (ADR-0010).
export const dynamic = "force-dynamic";

// A native select rather than a scripted one: on a phone it opens the platform picker, and
// it submits whether JavaScript ran or not. The look is shadcn's input, borrowed by hand —
// the same borrowing the shopping list does, for the same reason.
const PICKER =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30";

/** Past this many entries a group arrives folded, with its heading as the whole decision. */
const FOLDED_PAST = 3;

// Two lists of fields, and they are here rather than in `./decisions` beside the words on
// purpose: layout and typography are the screen's, and a field left out of either of them is
// simply an ordinary one — nothing goes wrong, which is what makes them safe to keep short.

/** The fields worth a whole row of the form: a title is not half a line of anything. */
const WIDE: readonly ProposalField[] = ["title", "name", "isbn"];

/**
 * The two fields that are figures.
 *
 * The typography contract reserves the monospace for numbers, ISBNs, dates and prices, so a
 * diff spends it on exactly those and never on a title — an ISBN is read digit by digit and
 * a name is not.
 */
const FIGURES: readonly ProposalField[] = ["isbn", "publishedCount"];

type Asked = Record<string, string | string[] | undefined>;

/**
 * The two vocabularies a creation is filled in from.
 *
 * They travel together from the page to every box, because they are read together and mean
 * nothing apart: a Type and a Binding are both lists this library grows rather than enums
 * TypeScript could hold (ADR-0006), so the boxes that offer them have to be handed the rows.
 */
type Vocabularies = { types: Type[]; bindings: Binding[] };

/** One asked-for value, as a string, or nothing. */
function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** A detail the assistant supplied, as text for a box, or empty. */
function said(entry: InboxEntry, field: ProposalField): string {
  const value = entry.details[field];
  return value === null || value === undefined ? "" : String(value);
}

/**
 * The fields the record cannot be created without and the proposal cannot supply.
 *
 * **A guess that is not in the vocabulary counts as nothing supplied**, and that is the case
 * this matters in: an assistant that said `hardback` gets no default in the picker, so the
 * box is as empty as if it had said nothing — and the entry is refused on approval unless
 * the owner chooses. Marking it only when the field was blank would leave the mark off the
 * one entry in a group that is about to stop the gesture.
 */
function missing(entry: InboxEntry, vocabularies: Vocabularies): ProposalField[] {
  if (entry.act === "amend") return [];
  return NEEDED_TO_CREATE[entry.proposes].filter((field) => !usable(entry, field, vocabularies));
}

/**
 * Whether what the assistant said for a field is something the form can offer back.
 *
 * Said once, because two places ask it: the mark above a box, and the box's own default. A
 * picker showing the first Binding as though it had been proposed and a label saying nothing
 * was missing are the same mistake made twice.
 */
function usable(entry: InboxEntry, field: ProposalField, vocabularies: Vocabularies): boolean {
  const value = said(entry, field);
  if (value === "") return false;

  const vocabulary = offered(field, vocabularies);
  return vocabulary === null || vocabulary.some((option) => option.value === value);
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const [params, waiting, decided, types, bindings] = await Promise.all([
    searchParams,
    listWaitingInboxEntries(),
    listDecidedInboxEntries(),
    listTypes(),
    listBindings(),
  ]);

  // Banding what came back, which is the screen's job and not the query's: the page holds
  // every waiting entry and renders every one of them.
  const groups = groupWaiting(waiting);

  const vocabularies: Vocabularies = { types, bindings };

  const refused = asked(params, "refused");
  const done = asked(params, "done");

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">Inbox</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          What an assistant asked for and you have not decided. Nothing here has touched the
          library: approving is the act that writes, and rejecting leaves no trace of it anywhere.
        </p>
      </header>

      {refused ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-pretty text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm text-pretty">
          {done}
        </p>
      ) : null}

      <p className="mt-8 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
        {waiting.length} waiting
        {groups.length < waiting.length ? ` in ${groups.length} decisions` : null}
      </p>

      {waiting.length === 0 ? (
        <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
          Nothing to decide. An assistant that meets a Story, a Volume or a Series this library does
          not have cannot add it, and one that finds a record standing incomplete cannot fill it in
          — both leave a proposal here, and it waits for you.
        </p>
      ) : (
        <ul className="mt-4 space-y-6">
          {groups.map((group) => (
            <li key={group.key}>
              <Decision group={group} vocabularies={vocabularies} />
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 ? (
        <details className="group mt-12 rounded-xl ring-1 ring-foreground/10">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
            Decided
            <span className="ml-2 text-muted-foreground group-open:hidden">
              — {decided.length} you have already answered
            </span>
          </summary>
          {/* Kept and shown, because a rejection's whole effect is an absence: this is the
              only place the owner can see that they said no to something. */}
          <ul className="border-t border-border">
            {decided.map((entry) => (
              <Decided key={entry.id} entry={entry} />
            ))}
          </ul>
        </details>
      ) : null}
    </main>
  );
}

/**
 * One decision: the entries that are about the same thing, and the two acts they can meet.
 *
 * One `<form>` per group, because approving a selection is one submission — and therefore
 * the *Reject it* on each row is a second submit button in that same form rather than a form
 * of its own, which HTML would not allow inside this one (`./actions`).
 */
function Decision({ group, vocabularies }: { group: InboxGroup; vocabularies: Vocabularies }) {
  const howMany = group.entries.length;
  const what = entityWord(group.proposes, howMany);
  const { does } = approvingWord(group.act, group.proposes);
  const incomplete = group.entries.filter(
    (entry) => missing(entry, vocabularies).length > 0
  ).length;
  const alreadyThere = whatIsAlreadyThere(group);

  return (
    <form action={decide} className="rounded-xl ring-1 ring-foreground/10">
      {/* The decision, and above the entries rather than under them — because **the first
          submit button in a form is the one Enter presses**, and the other button in here
          rejects an entry. A creation is typed into boxes, so a return key while filling one
          in has to reach the act the owner is in the middle of and never the destructive one
          on the row above. The button names what it does to the library, too: *Approve* is a
          word about this screen, and every act here is a word about the library. */}
      <div className="px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-heading text-lg leading-snug text-pretty">{whatItIsAbout(group)}</h2>
          <span className="ml-auto font-mono text-eyebrow text-muted-foreground">
            {group.entries[0].proposedAt}
          </span>
        </div>

        {/* The assistant's own words, where every entry came out of the same sentence: this
            is what a group folded shut is approved on, and *read off the back cover* and *I
            think it was Star Comics* are not the same evidence. */}
        {group.reported === null ? null : (
          <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-pretty">
            {group.reported}
          </blockquote>
        )}

        <p className="mt-2 max-w-prose text-xs text-pretty text-muted-foreground">
          {group.act === "amend"
            ? "Only the fields named change; everything else is left standing."
            : `Approving is what creates ${howMany === 1 ? "it" : "them"}, and nothing here undoes it.`}
        </p>

        {/* Louder than the line above it and quieter than a refusal, because it is neither:
            two editions of one line are two records the library is meant to hold, so this
            says there is something to read rather than that something is wrong. */}
        {alreadyThere === null ? null : (
          <p className="mt-2 max-w-prose text-xs text-pretty">
            {alreadyThere}{" "}
            {howMany === 1
              ? "It is under the entry below."
              : "Each one is under the entry it doubles."}
          </p>
        )}

        <Button type="submit" className="mt-3 h-11 w-full sm:h-10 sm:w-auto sm:px-6">
          {howMany === 1 ? `${does} the ${what}` : `${does} the ${howMany} ticked ${what}`}
        </Button>

        <p className="mt-2 max-w-prose text-xs text-pretty text-muted-foreground">
          {howMany === 1
            ? "Untick it below and this decides nothing."
            : "Every entry is ticked. Untick what you doubt — what is left is applied in one transaction, so if one of them is refused, none of them lands."}
          {incomplete > 0
            ? ` ${incomplete} ${incomplete === 1 ? "is" : "are"} missing something a ${entityWord(group.proposes, 1)} needs, and will be refused until the box is filled in.`
            : null}
        </p>
      </div>

      {/* A group holding a duplicate arrives open however many entries it has: the folding
          exists so that 43 careful ISBNs are one heading, and a heading is exactly what a
          proposal the library already answers must not be approved on. */}
      <details
        className="group border-t border-border"
        open={howMany <= FOLDED_PAST || alreadyThere !== null}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-xs text-muted-foreground marker:hidden">
          <span className="group-open:hidden">
            Read the {howMany} {howMany === 1 ? "entry" : "entries"} one by one
          </span>
          <span className="hidden group-open:inline">Fold them away</span>
        </summary>

        <ul className="border-t border-border">
          {group.entries.map((entry) => (
            <li key={entry.id} className="border-b border-border last:border-b-0">
              <Entry entry={entry} vocabularies={vocabularies} />
            </li>
          ))}
        </ul>
      </details>
    </form>
  );
}

/**
 * One entry: what it is about, what was said, and what would change.
 *
 * The row reads in the order the judgement is made — the record it names, the sentence it
 * came out of, then the change itself — and the tick is what carries it into the selection.
 */
function Entry({ entry, vocabularies }: { entry: InboxEntry; vocabularies: Vocabularies }) {
  const tick = `${entry.id}-tick`;
  const fields = proposedFields(entry);

  return (
    <div className="flex items-start gap-3 px-4 py-4">
      {/* Ticked on arrival, which is the whole of *approve the group in one gesture* on a
          screen that runs nothing in the browser: there is no script here to tick 43 boxes,
          so the boxes arrive ticked and the owner unticks. */}
      <input
        id={tick}
        type="checkbox"
        name="entryId"
        value={entry.id}
        defaultChecked
        className="mt-1 size-4 shrink-0 accent-foreground"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <Label htmlFor={tick} className="text-sm">
            {entry.reference}
          </Label>
          <span className="font-mono text-eyebrow text-muted-foreground">{entry.proposedAt}</span>
        </div>

        {/* What was said, quoted: the evidence the decision is actually made on, where the
            fields below are a guess about it. */}
        <blockquote className="mt-1.5 border-l-2 border-border pl-3 text-sm text-pretty">
          {entry.reported}
        </blockquote>

        {/* Above the boxes rather than under them, because it is read before them: it is
            what decides whether this entry is filled in at all. */}
        <Namesakes entry={entry} />

        {entry.act === "amend" ? (
          <Diff entry={entry} fields={fields} />
        ) : (
          <Fill entry={entry} fields={fields} vocabularies={vocabularies} />
        )}

        {/* The cheap half of the two, and it looks it: rejecting writes nothing into the
            domain, so it needs no confirmation and gets no weight. The friction belongs on
            the irreversible half, which is the button at the foot of the group. */}
        <button
          type="submit"
          name="reject"
          value={entry.id}
          className="mt-3 rounded-lg text-xs text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Reject it
        </button>
      </div>
    </div>
  );
}

/**
 * What the library already holds under the name this entry proposes.
 *
 * The creation's half of the diff below: an amendment is judged against the record it
 * names, and a creation was judged against the owner's memory of seventy-seven titles until
 * this was here (#53). It is a **reading and not a warning** — two editions of one object
 * are two records this library exists to keep apart, and the word beside each name is what
 * says which is which — so it is drawn in the finder's own rows, quietly, and each one is a
 * link to the record it names: the answer to *is this the same thing?* is on that page and
 * not in a list.
 */
function Namesakes({ entry }: { entry: InboxEntry }) {
  if (entry.namesakes.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="max-w-prose text-xs text-pretty text-muted-foreground">
        Already in the library under that name. Approving this makes a second record, and a record
        you have read, rated or shelved refuses to be struck.
      </p>
      <ul className="-mx-2 mt-1">
        {entry.namesakes.map((namesake) => (
          <li key={namesake.id}>
            <Link
              href={recordHref({ kind: entry.proposes, id: namesake.id })}
              className={cn(
                ROW,
                "text-muted-foreground outline-none transition-colors",
                "hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <FoundRow name={namesake.name} qualifier={namesake.qualifier} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What stands in the record today, beside what is proposed for it.
 *
 * The half of ADR-0011 that makes approving a judgement rather than a leap. An absence is an
 * em dash rather than a blank, because *this Volume carries no ISBN* is the reason the
 * amendment was proposed at all.
 */
function Diff({ entry, fields }: { entry: InboxEntry; fields: ProposalField[] }) {
  if (entry.standing === null) {
    return (
      <p className="mt-3 text-xs text-pretty text-destructive">
        The record this amends is no longer in the library, so there is nothing to change. Approving
        it is refused; rejecting it costs nothing.
      </p>
    );
  }

  const standing = entry.standing;

  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
      {fields.map((field) => (
        <Fragment key={field}>
          <dt className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground sm:pt-1">
            {fieldLabel(field)}
          </dt>
          <dd className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <Value field={field} value={standing[field]} quiet />
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
            <span className="sr-only">becomes</span>
            <Value field={field} value={entry.details[field]} />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** One side of a diff: what is there, or an em dash where there is nothing. */
function Value({ field, value, quiet }: { field: ProposalField; value: unknown; quiet?: boolean }) {
  if (value === null || value === undefined || value === "") {
    return (
      <span className="text-muted-foreground">
        —<span className="sr-only">nothing</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        FIGURES.includes(field) && "font-mono",
        quiet ? "text-muted-foreground" : "font-medium"
      )}
    >
      {String(value)}
    </span>
  );
}

/**
 * The record a creation would make, as boxes filled with what was said.
 *
 * Every field the record has rather than only the ones the assistant knew: approving a
 * creation is choosing its fields, and a form showing only what was guessed would have no
 * box for the Binding nobody could know.
 */
function Fill({
  entry,
  fields,
  vocabularies,
}: {
  entry: InboxEntry;
  fields: ProposalField[];
  vocabularies: Vocabularies;
}) {
  const gaps = missing(entry, vocabularies);

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const vocabulary = offered(field, vocabularies);

        return vocabulary === null ? (
          <Field key={field} entry={entry} field={field} needed={gaps.includes(field)} />
        ) : (
          <Picker
            key={field}
            entry={entry}
            field={field}
            options={vocabulary}
            proposed={usable(entry, field, vocabularies) ? said(entry, field) : null}
            needed={gaps.includes(field)}
          />
        );
      })}
    </div>
  );
}

/** The vocabulary a field is picked from, or `null` where it is typed. */
function offered(
  field: ProposalField,
  vocabularies: Vocabularies
): { value: string; name: string }[] | null {
  switch (field) {
    case "typeId":
      return vocabularies.types.map((type) => ({ value: type.id, name: type.name }));
    case "binding":
      return vocabularies.bindings.map((binding) => ({
        value: binding.id,
        name: binding.name,
      }));
    case "status":
      return [
        { value: "ongoing", name: "Ongoing" },
        { value: "concluded", name: "Concluded" },
      ];
    default:
      return null;
  }
}

/** One box of a creation, filled with what the assistant said. */
function Field({
  entry,
  field,
  needed,
}: {
  entry: InboxEntry;
  field: ProposalField;
  needed: boolean;
}) {
  const id = `${entry.id}-${field}`;

  return (
    <div className={cn("grid gap-1.5", WIDE.includes(field) && "sm:col-span-2")}>
      <BoxLabel field={field} id={id} needed={needed} />
      <Input
        id={id}
        name={`${entry.id}:${field}`}
        defaultValue={said(entry, field)}
        inputMode={field === "publishedCount" ? "numeric" : undefined}
        className="h-11 sm:h-10"
      />
    </div>
  );
}

/**
 * A vocabulary the owner picks from rather than types.
 *
 * The proposal's value is the default **only if it is one of the options**: an assistant that
 * guessed `hardback` gets no default at all and the owner has to choose, which is better
 * than a picker silently showing the first Binding as though it had been proposed. What was
 * guessed is named in the empty option rather than dropped, because it is the thing the
 * owner most needs to see.
 */
function Picker({
  entry,
  field,
  options,
  proposed,
  needed,
}: {
  entry: InboxEntry;
  field: ProposalField;
  options: { value: string; name: string }[];
  /** What was proposed, where it is one of the options, and `null` where it is not. */
  proposed: string | null;
  needed: boolean;
}) {
  const id = `${entry.id}-${field}`;
  const guessed = said(entry, field);

  return (
    <div className="grid gap-1.5">
      <BoxLabel field={field} id={id} needed={needed} />
      <select
        id={id}
        name={`${entry.id}:${field}`}
        defaultValue={proposed ?? ""}
        className={PICKER}
      >
        {/* The empty option names the guess when the guess was not one of the options, and
            says nothing about it otherwise: it is the only place the owner would learn that
            the assistant said `hardback`, and saying so about a value that *is* offered
            would be a warning about nothing. */}
        <option value="" disabled>
          {guessed === "" || proposed !== null
            ? "Choose one"
            : `Not a ${fieldLabel(field)}: ${guessed}`}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * What a box is, and whether the record cannot be created without it.
 *
 * The mark is what replaces the `required` this screen cannot use — a group is one form, so
 * the browser would refuse to submit it over a box on an entry the owner had unticked. It is
 * read from the core (`NEEDED_TO_CREATE`) rather than from a list kept here, because a screen
 * with its own list would be a screen guessing at what the approval will refuse.
 */
function BoxLabel({ field, id, needed }: { field: ProposalField; id: string; needed: boolean }) {
  return (
    // Two children of one flex row, and the gap between them is the `Label`'s own: the mark
    // is a word beside the field's name rather than part of it.
    <Label htmlFor={id} className="text-xs text-muted-foreground">
      {fieldLabel(field)}
      {needed ? <span className="text-destructive">needed</span> : null}
    </Label>
  );
}

/** One entry the owner has answered: what it was, and which way it went. */
function Decided({ entry }: { entry: InboxEntry }) {
  const { done } = approvingWord(entry.act, entry.proposes);

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block truncate text-sm">{entry.reference}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {entry.reported}
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="font-mono text-eyebrow text-muted-foreground">{entry.decidedAt}</span>
        <Badge
          variant={entry.state === "approved" ? "secondary" : "outline"}
          className="capitalize"
        >
          {entry.state === "approved" ? done : "Rejected"}
        </Badge>
      </span>
    </li>
  );
}
