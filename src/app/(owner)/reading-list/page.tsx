import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { composeReadingList, type ReadingListEntry } from "@/core/queries/reading-list";
import type { PinnedSource } from "@/core/verbs/reading-list";
import { requireOwner } from "@/lib/auth/owner";
import { pin, unpin, wishFor } from "./actions";

// THE READING LIST. The screen the owner opens most, and the one the whole application is
// for: the spreadsheet's `Prossimo` column, recomputed by hand for every route, plus three
// dashboard tiles reading `#ERROR!` (#1).
//
// The design has one idea in it, and everything else is the house style the screens beside
// it already set. **The list is a numbered sequence, because it is one.** The order is the
// answer — pinned first, then the routes the owner chose, then the Series ledger — so the
// ordinal sits in the gutter where the eye starts, and the second line of every row says
// the one thing that decides whether the entry is actionable tonight: *tonight*, *on the
// shelf*, or *buy it first*. Nothing else competes for that line.
//
// What is deliberately **not** on this screen: any way to edit the list. There is nothing
// to edit — an entry is composed, so the affordances are a pin (the owner's own order) and,
// where an entry needs an object they do not have, the proposal the entry already carries.
// Pressing that one is opening a Wish, which is why it is a button with a price attached in
// words and not a quiet automatic thing.
//
// A thin adapter over the core (ADR-0002): one query, laid out. Plain forms and POSTs, so
// the screen works with nothing running in the browser — which is what it needs to be on a
// phone, in a shop, on the shop's signal.
export const dynamic = "force-dynamic";

// A native select rather than a scripted one: on a phone it opens the platform picker, and
// it submits with the form whether JavaScript ran or not. shadcn's own input look, borrowed
// by hand — its select is a scripted component and this screen runs nothing.
const PICKER =
  "h-11 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30";

/** The three steps a shopping list is read in, as the Wishes screen names them. */
const PRIORITIES = [
  { value: 1, name: "Next" },
  { value: 2, name: "Soon" },
  { value: 3, name: "Someday" },
] as const;

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function ReadingListPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const params = await searchParams;
  const entries = await composeReadingList();

  const refused = asked(params, "refused");
  const wished = asked(params, "wished");
  const tonight = entries.filter((entry) => entry.atHand).length;

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">What to read next</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          Composed from the routes I am walking and the Series I am completing, in the order I
          should read them. Nothing here is a list I keep: finish something and it recomposes. Pin
          an entry where I disagree with it.
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
      {wished ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          On the shopping list.{" "}
          <Link href="/wishes" className="underline underline-offset-4">
            Wishes
          </Link>{" "}
          has the price and the shop.
        </p>
      ) : null}

      {entries.length === 0 ? (
        <div className="mt-10 max-w-prose">
          <p className="text-pretty text-sm text-muted-foreground">
            Nothing composed. Either every route is walked to the end and every Series I am
            collecting is complete — which is a real answer — or there is nothing to compose from
            yet.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/paths" className="underline underline-offset-4">
              Define a Path
            </Link>{" "}
            and put Stories on it in the order I mean to read them, or{" "}
            <Link href="/series" className="underline underline-offset-4">
              decide to collect a Series
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <p className="mt-8 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} · {tonight} I could start
            tonight
          </p>

          <ol className="mt-3">
            {entries.map((entry, place) => (
              <Entry key={key(entry)} entry={entry} place={place + 1} />
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

/** An entry's source is its identity: one per active Path, one per Series being collected. */
function key(entry: ReadingListEntry): string {
  return `${entry.because}:${entry.path?.id ?? entry.series?.id}`;
}

/** What to call the thing to read. A Series entry names an object, so it says which one. */
function title(entry: ReadingListEntry): string {
  if (entry.story) return entry.story.title;
  if (entry.object) return entry.object.title;

  const series = entry.series;
  if (!series) return "Something to read";
  // Nobody has catalogued this position, so the honest name for it is the Series and the
  // number — which is also exactly what the owner would look for in a shop.
  return [series.name, series.editionLine, series.position].filter(Boolean).join(" ");
}

/** The one line that decides whether the entry is actionable tonight. */
function standing(entry: ReadingListEntry): string {
  if (entry.medium === "digital") return "digital · tonight";
  if (entry.atHand) return "paper · on the shelf";
  return entry.wishAlreadyOpen ? "paper · already on the shopping list" : "paper · buy it first";
}

/** One entry: what to read, why it is here, and the one thing to do about it. */
function Entry({ entry, place }: { entry: ReadingListEntry; place: number }) {
  // The pin's subject, in the verb's own type: an entry comes from one source and that
  // source is what a pin points at.
  const source: PinnedSource = entry.path
    ? { kind: "path", id: entry.path.id }
    : { kind: "series", id: entry.series?.id ?? "" };

  return (
    <li className="flex gap-4 border-t border-border py-4 sm:gap-5">
      {/* The gutter carries the position on the list, because the order *is* the answer
          this screen gives. Tabular so the column stays a column past nine. */}
      <span
        aria-hidden="true"
        className="w-6 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-muted-foreground"
      >
        {String(place).padStart(2, "0")}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-heading text-lg text-balance">{title(entry)}</h2>
          {entry.pinned ? (
            <Badge variant="outline" className="shrink-0 text-muted-foreground">
              Pinned
            </Badge>
          ) : null}
        </div>

        <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {standing(entry)}
        </p>

        {/* Why it is here. A route is a judgement the owner made, so it is named and its
            intent is quoted; a Series is a ledger, so it is counted. */}
        {entry.path ? (
          <p className="mt-2 text-sm">
            Next on{" "}
            <Link
              href={`/paths/${entry.path.id}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {entry.path.name}
            </Link>
            {entry.story ? (
              <span className="text-muted-foreground"> · {entry.story.type.name}</span>
            ) : null}
          </p>
        ) : null}
        {entry.series ? (
          <p className="mt-2 text-sm">
            Volume {entry.series.position} of {entry.series.publishedCount} of{" "}
            <Link
              href={`/series/${entry.series.id}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              {[entry.series.name, entry.series.editionLine].filter(Boolean).join(" ")}
            </Link>
          </p>
        ) : null}

        {entry.path?.intent ? (
          <p className="mt-1.5 max-w-prose text-pretty font-serif text-prose italic text-muted-foreground">
            {entry.path.intent}
          </p>
        ) : null}

        {/* Neither on the shelf nor catalogued: there is nothing to wish for, and saying
            so is better than an affordance that could not work. */}
        {!entry.atHand && !entry.object ? (
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            I have not recorded this object yet, so there is nothing to wish for. Catalogue it on
            the{" "}
            <Link href="/collection" className="underline underline-offset-4">
              Collection
            </Link>{" "}
            and it becomes something I can want.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={entry.pinned ? unpin : pin}>
            <input type="hidden" name="kind" value={source.kind} />
            <input type="hidden" name="id" value={source.id} />
            <Button type="submit" variant="ghost" size="sm" className="-ml-2.5 h-9 sm:h-8">
              {entry.pinned ? "Unpin" : "Pin it first"}
            </Button>
          </form>

          {/* **The proposal, as a form.** The entry proposed it; this submit is what opens
              it. Nothing was written by rendering the row, and the priority the proposal
              suggested is the picker's default rather than its decision. */}
          {entry.proposedWish ? (
            <form action={wishFor} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="volumeId" value={entry.proposedWish.volumeId} />
              <input type="hidden" name="title" value={title(entry)} />
              <label className="sr-only" htmlFor={`priority-${key(entry)}`}>
                How soon
              </label>
              <select
                id={`priority-${key(entry)}`}
                name="priority"
                defaultValue={entry.proposedWish.priority}
                className={PICKER}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="sm" className="h-9 sm:h-8">
                Want it
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </li>
  );
}
