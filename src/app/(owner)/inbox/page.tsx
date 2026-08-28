import Link from "next/link";
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
import type { ProposalField } from "@/core/verbs/inbox";
import { requireOwner } from "@/lib/auth/owner";
import { approve, reject } from "./actions";

// THE INBOX. What an external assistant asked for and the owner has not decided yet, and
// the one door a new Story, Volume or Series enters through from outside (ADR-0005).
//
// The screen has one job and it is a judgement: *is this thing real, and is this how it
// should be recorded?* Everything on it follows from that.
//
// - **The sentence that was reported is the biggest thing on the card**, quoted rather than
//   summarised. The owner is not deciding about a form; they are deciding about something
//   they said, and *"Ho comprato Ultimate Spider-Man Omnibus 1"* is what tells them whether
//   the fields underneath are right. It is the one place this screen is loud.
// - **The two acts are unmistakable and asymmetric**, because they are asymmetric acts.
//   Approving writes a permanent row into a library kept for years, so it is a form the
//   owner reads, and its button names the entity it will create — *Catalogue the Volume*,
//   not *Approve*. Rejecting writes nothing anywhere, so it is one quiet button, and the
//   line under it says exactly that. The friction belongs on the irreversible half.
// - **The fields are editable, and that is the friction earning its place.** A Binding an
//   assistant invented is the ordinary case; correcting it here is cheaper than a duplicate
//   the owner finds in a shop two years from now.
// - **Nothing is bulk.** There is no approve-all, no select-many and no keyboard-driven
//   triage: a boundary you can clear in one tap is not a boundary.
//
// Everything else follows the screens it sits beside: a `GET`-free page, `POST`s to server
// actions, native pickers, and nothing running in the browser.
export const dynamic = "force-dynamic";

// A native select rather than a scripted one: on a phone it opens the platform picker, and
// it submits whether JavaScript ran or not. The look is shadcn's input, borrowed by hand —
// the same borrowing the shopping list does, for the same reason.
const PICKER =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30";

/** What approving one of the three creates, in the words the owner reads. */
const CREATES = {
  story: {
    act: "Create the Story",
    what: "a Story",
    says: "The narrative unit you read and judge. No Volume is implied and none is created.",
  },
  volume: {
    act: "Catalogue the Volume",
    what: "a Volume",
    says: "The object as a catalogue holds it. It does not join the Collection — say it is in the house on the Collection screen.",
  },
  series: {
    act: "Declare the Series",
    what: "a Series",
    says: "The publisher's line as a completeness ledger. It starts no collecting project.",
  },
} as const;

type Asked = Record<string, string | string[] | undefined>;

/** One asked-for value, as a string, or nothing. */
function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** A detail the assistant supplied, as text for a field, or empty. */
function said(entry: InboxEntry, key: ProposalField): string {
  const value = entry.details[key];
  return value === null || value === undefined ? "" : String(value);
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const params = await searchParams;
  const [waiting, decided, types, bindings] = await Promise.all([
    listWaitingInboxEntries(),
    listDecidedInboxEntries(),
    listTypes(),
    listBindings(),
  ]);

  const refused = asked(params, "refused");
  const approved = asked(params, "approved");
  const rejected = asked(params, "rejected");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          tsundoku
        </Link>
        <h1 className="mt-6 font-heading text-2xl sm:text-3xl">Inbox</h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          What an assistant asked for and you have not decided. Nothing here is in the library yet:
          approving is what creates the thing, and rejecting leaves no trace of it anywhere.
        </p>
      </header>

      {refused ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {approved ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {approved} is in the library now.
        </p>
      ) : null}
      {rejected ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {rejected} was rejected. Nothing was created, and nothing changed outside this screen.
        </p>
      ) : null}

      <p className="mt-8 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {waiting.length} waiting
      </p>

      {waiting.length === 0 ? (
        <p className="mt-4 text-pretty text-sm text-muted-foreground">
          Nothing to decide. An assistant that meets a Story, a Volume or a Series this library does
          not have cannot add it — it leaves a proposal here, and it waits for you.
        </p>
      ) : (
        <ul className="mt-4 space-y-6">
          {waiting.map((entry) => (
            <li key={entry.id}>
              <Waiting entry={entry} types={types} bindings={bindings} />
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
 * One proposal, and the two acts it can meet.
 *
 * The card reads top to bottom in the order the decision is made: what was said, what it
 * proposes, what would be written, and then — below a rule — the two things the owner can
 * do about it.
 */
function Waiting({
  entry,
  types,
  bindings,
}: {
  entry: InboxEntry;
  types: Type[];
  bindings: Binding[];
}) {
  const creates = CREATES[entry.proposes];

  return (
    <article className="rounded-xl ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-4">
        <Badge variant="outline">Proposes {creates.what}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{entry.proposedAt}</span>
      </div>

      {/* What was said, quoted. The loudest thing on the screen, because it is the evidence
          the decision is actually made on — the fields below are a guess about it. */}
      <blockquote className="mx-4 mt-3 border-l-2 border-border pl-3 font-heading text-lg leading-snug text-pretty">
        {entry.reported}
      </blockquote>

      <p className="mt-3 px-4 text-xs text-pretty text-muted-foreground">{creates.says}</p>

      <form action={approve} className="px-4 pt-4">
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="reference" value={entry.reference} />

        <div className="grid gap-4 sm:grid-cols-2">
          {entry.proposes === "story" ? (
            <>
              <Field entry={entry} name="title" label="Title" required className="sm:col-span-2" />
              <Picker
                entry={entry}
                name="typeId"
                label="Type"
                required
                options={types.map((type) => ({ value: type.id, name: type.name }))}
              />
            </>
          ) : null}

          {entry.proposes === "volume" ? (
            <>
              <Field entry={entry} name="title" label="Title" required className="sm:col-span-2" />
              <Field entry={entry} name="publisher" label="Publisher" required />
              <Field entry={entry} name="editionLine" label="Edition line" />
              <Picker
                entry={entry}
                name="binding"
                label="Binding"
                required
                options={bindings.map((binding) => ({ value: binding.id, name: binding.name }))}
              />
              <Field entry={entry} name="language" label="Language" required placeholder="it" />
              <Field entry={entry} name="isbn" label="ISBN" className="sm:col-span-2" />
            </>
          ) : null}

          {entry.proposes === "series" ? (
            <>
              <Field entry={entry} name="name" label="Name" required className="sm:col-span-2" />
              <Field entry={entry} name="publisher" label="Publisher" required />
              <Field entry={entry} name="editionLine" label="Edition line" />
              <Field
                entry={entry}
                name="publishedCount"
                label="Volumes published"
                required
                inputMode="numeric"
                placeholder="0"
              />
              <Picker
                entry={entry}
                name="status"
                label="Status"
                required
                options={[
                  { value: "ongoing", name: "Ongoing" },
                  { value: "concluded", name: "Concluded" },
                ]}
              />
            </>
          ) : null}
        </div>

        {/* The button names what it makes. "Approve" would be a word about the workflow;
            this is a word about the library, and it is the last thing read before a
            permanent row exists. */}
        <div className="mt-4 border-t border-border pt-4">
          <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
            {creates.act}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Fix anything the assistant guessed at first. This is the only way {creates.what} gets
            into the library, and there is no undo.
          </p>
        </div>
      </form>

      {/* The cheap half, and it looks it. Rejecting writes nothing into the domain, so it
          needs no confirmation and gets no weight — what it gets is a sentence saying so,
          because an act with no visible consequence is one the owner will otherwise doubt. */}
      <form action={reject} className="px-4 pt-3 pb-4">
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="reference" value={entry.reference} />
        <Button type="submit" variant="destructive" size="sm" className="h-11 sm:h-9">
          Reject it
        </Button>
        <span className="ml-3 text-xs text-muted-foreground">
          Nothing is created. The entry stays here, decided.
        </span>
      </form>
    </article>
  );
}

/** One entry the owner has answered: what it was, and which way it went. */
function Decided({ entry }: { entry: InboxEntry }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block truncate text-sm">{entry.reference}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {entry.reported}
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span className="font-mono text-xs text-muted-foreground">{entry.decidedAt}</span>
        <Badge variant={entry.state === "approved" ? "secondary" : "outline"}>
          {entry.state === "approved" ? "In the library" : "Rejected"}
        </Badge>
      </span>
    </li>
  );
}

/**
 * One field of the approval, filled with what the assistant said.
 *
 * `required` is the browser's own refusal, and it is only the first one: the creating verb
 * refuses the same absences in the prose the owner reads, which is what happens when a
 * field is required and empty on a form nobody scripted.
 */
function Field({
  entry,
  name,
  label,
  className,
  ...props
}: {
  entry: InboxEntry;
  name: ProposalField;
  label: string;
  className?: string;
} & React.ComponentProps<typeof Input>) {
  const id = `${entry.id}-${name}`;

  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        defaultValue={said(entry, name)}
        className="h-11 sm:h-10"
        {...props}
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
  name,
  label,
  required,
  options,
}: {
  entry: InboxEntry;
  name: ProposalField;
  label: string;
  required?: boolean;
  options: { value: string; name: string }[];
}) {
  const id = `${entry.id}-${name}`;
  const proposed = said(entry, name);
  const offered = options.some((option) => option.value === proposed);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={offered ? proposed : ""}
        className={PICKER}
      >
        {/* The empty option names the guess when the guess was not one of the options, and
            says nothing about it otherwise: it is the only place the owner would learn that
            the assistant said `hardback`, and saying so about a value that *is* offered
            would be a warning about nothing. */}
        <option value="" disabled>
          {proposed === "" || offered ? "Choose one" : `Not a ${label}: ${proposed}`}
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
