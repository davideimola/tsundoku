import Link from "next/link";
import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { composeReadingList, type ReadingListEntry } from "@/core/queries/reading-list";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
// The three steps a shopping list is read in, from the screen that bands by them: this
// picker offered its own copy of the three words, which is a second answer waiting to
// happen (#31).
import { PRIORITIES } from "../wishes/shopping";
import { pin, unpin, unwant, wishFor } from "./actions";
import {
  entryDetail,
  entryFoot,
  entryKey,
  entryLeadsTo,
  entryLine,
  entryStanding,
  entryTitle,
  reasonSaid,
  theWantOn,
} from "./entry";

// THE READING LIST. The screen the owner opens most, and the one the whole application is
// for: the spreadsheet's `Prossimo` column, recomputed by hand for every route, plus three
// dashboard tiles reading `#ERROR!` (#1).
//
// **The screen is two halves now** (#40), and the difference between them is the one idea in
// its layout. The **head** is what the owner pinned: it is short, every row in it is a
// decision, and it is genuinely a sequence — so it keeps the ordinal in the gutter, where
// the eye starts, and reads in pin order. The **reserve** is everything else, and it
// composes itself: it is deliberately unordered, so it has **no ordinal at all**. That
// absence is the design. A number beside a reserve row would say *third best*, which is
// exactly the claim the reserve refuses to make — and the moment an order starts to matter
// the owner pins the row, which moves it up into the half where a number is true.
//
// Everything else is the house style the screens beside it already set. The second line of
// every row says the one thing that decides whether the entry is actionable tonight —
// *tonight*, *on the shelf*, or *buy it first* — and nothing else competes for that line.
//
// **What #29 gave it is the shelf's vocabulary and the width.** Every entry carries the tile
// the walls are laid out as — the Series' own tint, the jacket where a lookup found one, the
// position at its foot — because the thing the owner is choosing between is a book, and a
// column of text is the format the spreadsheet already had. And the row spends the window: at
// a desk the act sits in its own column at the right rather than under the prose, so eleven
// entries are eleven decisions on one screen instead of a scroll.
//
// What is deliberately **not** on this screen: any way to edit the list, and — the one that
// takes saying — any way to *tick an entry off*. There is nothing to edit, because an entry is
// composed; and a Want is answered by reading the Story rather than by a press here (#35), so
// the only thing offered against one is taking back a sentence that was a slip. The
// affordances are a pin (the owner's own order), that strike, and, where an entry needs an
// object they do not have, the proposal the entry already carries.
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

const EYEBROW = "font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function ReadingListPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const params = await searchParams;
  const { head, reserve } = await composeReadingList();

  const refused = asked(params, "refused");
  const wished = asked(params, "wished");
  const composed = head.length + reserve.length;
  const tonight = [...head, ...reserve].filter((entry) => entry.atHand).length;

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">What to read next</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          Two halves. What I pinned leads, in the order I pinned it — that half is mine to keep
          short. Everything under it composes itself from what I said I want to read, the routes I
          am walking and the Series I am completing, and it is in no order at all. When the order
          starts to matter, I pin it.
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

      {composed === 0 ? (
        <div className="mt-10 max-w-prose">
          <p className="text-pretty text-sm text-muted-foreground">
            Nothing composed. Either I want to read nothing in particular, every route is walked to
            the end and every Series I am collecting is complete — which is a real answer — or there
            is nothing to compose from yet.
          </p>
          <p className="mt-4 text-sm">
            Open a{" "}
            <Link href="/stories" className="underline underline-offset-4">
              Story
            </Link>{" "}
            and say I want to read it — that costs nothing else. Or{" "}
            <Link href="/paths" className="underline underline-offset-4">
              define a Path
            </Link>{" "}
            and put Stories on it in the order I mean to read them, or{" "}
            <Link href="/series" className="underline underline-offset-4">
              decide to collect a Series
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-9 space-y-10">
          {/* **The head, numbered, because it is the one place an order means anything.**
              There is no cap on it: twenty pins look wrong here, and pruning them is mine. */}
          <Half label="Pinned" count={head.length} said="In the order I pinned it, newest first.">
            {head.length === 0 ? (
              <p className="max-w-prose text-pretty text-sm text-muted-foreground">
                Nothing pinned. Pin anything below and it leads this list until I unpin it — that is
                the only order I keep by hand.
              </p>
            ) : (
              <ol>
                {head.map((entry, place) => (
                  <Entry key={entryKey(entry)} entry={entry} place={place + 1} pinned />
                ))}
              </ol>
            )}
          </Half>

          {/* **The reserve, unnumbered.** The absence of the ordinal is the point: a number
              here would read as a rank, and this half is not ranked. */}
          <Half
            label="Composed"
            count={reserve.length}
            said={`In no order. ${tonight} of the whole list I could start tonight.`}
          >
            {reserve.length === 0 ? (
              <p className="max-w-prose text-pretty text-sm text-muted-foreground">
                Nothing else composed — everything the library has to offer is pinned above.
              </p>
            ) : (
              <ul>
                {reserve.map((entry) => (
                  <Entry key={entryKey(entry)} entry={entry} pinned={false} />
                ))}
              </ul>
            )}
          </Half>
        </div>
      )}
    </main>
  );
}

/** One half of the list: what it is, how much of it there is, and what its order means. */
function Half({
  label,
  count,
  said,
  children,
}: {
  label: string;
  count: number;
  said: string;
  children: React.ReactNode;
}) {
  const id = `half-${label.toLowerCase()}`;

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={`flex items-baseline gap-3 ${EYEBROW}`}>
        {label}
        <span className="tabular-nums">{count}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </h2>
      <p className="mt-1.5 max-w-prose text-pretty text-sm text-muted-foreground">{said}</p>

      <div className="mt-3">{children}</div>
    </section>
  );
}

// What an entry is called and how its standing is worded are `./entry` now, because the
// dashboard says both as well (#24) and a second wording would be a second answer.

/**
 * One entry: what to read, every reason it is here, and the one thing to do about it.
 *
 * `place` is the ordinal, and it is passed only in the head — the reserve has no order to
 * number.
 */
function Entry({
  entry,
  place,
  pinned,
}: {
  entry: ReadingListEntry;
  place?: number;
  pinned: boolean;
}) {
  const want = theWantOn(entry);

  return (
    <li className="flex gap-3 border-t border-border py-4 sm:gap-5">
      {/* The gutter carries the position in the head, because there the order *is* the
          answer. Tabular so the column stays a column past nine. */}
      {place === undefined ? null : (
        <span
          aria-hidden="true"
          className="w-6 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-muted-foreground"
        >
          {String(place).padStart(2, "0")}
        </span>
      )}

      {/* The object, faced outwards — the same tile as on the walls, in the same colour and
          the same shape, so an entry is recognised by sight rather than read. A Series entry
          nobody has catalogued an object for has no jacket to wear and is the drawn tile,
          which is the normal case here and not a gap. */}
      <div className="w-16 shrink-0 sm:w-20">
        <Cover
          href={entryLeadsTo(entry)}
          title={entryTitle(entry)}
          tint={tint(entryLine(entry))}
          detail={entryDetail(entry)}
          foot={entryFoot(entry)}
          image={entry.object?.cover}
        />
      </div>

      {/* The width, spent: what to read on the left and what to do about it on the right,
          at a desk. On a phone they are one column and the act follows the prose, which is
          the order they are read in either way. */}
      <div className="min-w-0 flex-1 lg:flex lg:items-start lg:gap-8">
        <div className="min-w-0 lg:flex-1">
          <h3 className="font-heading text-lg text-balance">{entryTitle(entry)}</h3>

          {/* The Type belongs to the row and not to each reason: three reasons saying
           *Manga* three times is the same fact three times. */}
          <p className={`mt-1 ${EYEBROW}`}>
            {[entry.story?.type.name, entryStanding(entry)].filter(Boolean).join(" · ")}
          </p>

          {/* **Every reason it is here, and one row says all of them.** Wanted, and on two
              routes, is three sentences under one title rather than the same book three
              times. The owner's own words about a route are quoted only where that route is
              actually offering this stop: a route's intent under all ten of its stops is the
              same sentence ten times. */}
          <ul className="mt-2 space-y-1.5">
            {entry.reasons.map((reason) => {
              const said = reasonSaid(reason);

              return (
                <li
                  key={`${reason.because}:${reason.want?.id ?? reason.path?.id ?? reason.series?.id}`}
                >
                  <p className="text-sm">
                    {said.said}
                    {said.names ? (
                      <Link
                        href={said.names.href}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        {said.names.label}
                      </Link>
                    ) : null}
                  </p>

                  {reason.path?.intent && reason.path.place === 1 ? (
                    <p className="mt-1 max-w-prose text-pretty font-serif text-prose italic text-muted-foreground">
                      {reason.path.intent}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

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
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 lg:mt-0 lg:w-64 lg:shrink-0 lg:justify-end">
          {/* **A pin names the thing to read**, so every row can be pinned — which is what
              makes three stops of one route, then a stop of another, sayable at all (#40).
              The subject travels in the form exactly as the core states it. */}
          <form action={pinned ? unpin : pin}>
            <input type="hidden" name="kind" value={entry.subject.kind} />
            <input type="hidden" name="id" value={entry.subject.id} />
            {entry.subject.kind === "series" ? (
              <input type="hidden" name="position" value={entry.subject.position} />
            ) : null}
            <Button type="submit" variant="ghost" size="sm" className="-ml-2.5 h-9 sm:h-8 lg:ml-0">
              {pinned ? "Unpin" : "Pin it"}
            </Button>
          </form>

          {/* Taking a Want back is a *strike* and reads like one: a Want the owner has not
              acted on is still true, and nothing on this screen ticks one off — a Reading is
              what answers it. */}
          {want ? (
            <form action={unwant}>
              <input type="hidden" name="wantId" value={want.id} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-9 text-muted-foreground hover:text-foreground sm:h-8"
              >
                I did not mean that
              </Button>
            </form>
          ) : null}

          {/* **The proposal, as a form.** The entry proposed it; this submit is what opens
              it. Nothing was written by rendering the row, and the priority the proposal
              suggested is the picker's default rather than its decision. */}
          {entry.proposedWish ? (
            <form action={wishFor} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="volumeId" value={entry.proposedWish.volumeId} />
              <input type="hidden" name="title" value={entryTitle(entry)} />
              <label className="sr-only" htmlFor={`priority-${entryKey(entry)}`}>
                How soon
              </label>
              <select
                id={`priority-${entryKey(entry)}`}
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
