import Link from "next/link";
import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { composePile, type PileEntry, theKeyOf } from "@/core/queries/pile";
import type { PinnedSubject } from "@/core/verbs/pile";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
// The three steps a shopping list is read in, from the screen that bands by them: this
// picker offered its own copy of the three words, which is a second answer waiting to
// happen (#31).
import { PRIORITIES } from "../wishes/shopping";
import { pin, unpin, unwant, wishFor } from "./actions";
import {
  type StopBehind,
  THE_ROUTE,
  theAddressWith,
  theReserveAsRows,
  theReserveIsSaid,
  theRoutesAskedFor,
  type WhatStandsBehind,
} from "./behind";
import {
  entryDetail,
  entryFoot,
  entryLeadsTo,
  entryLine,
  entryStanding,
  entryTitle,
  reasonSaid,
  theWantOn,
} from "./entry";

// THE PILE. The screen the owner opens most, and the one the whole application is
// for: the spreadsheet's `Prossimo` column, recomputed by hand for every route, plus three
// dashboard tiles reading `#ERROR!` (#1).
//
// **It is called the Pile, which is the thing the application is named after** (#58,
// ADR-0021). It was the *Reading list* until a videogame could stand on it, and half of what
// composes here is not read: a Story is what you would give a score to, and a game passes
// that test the way a manga does. So the screen, the route and the line in the navigation
// say one word, and the copy on every row says what is true of both halves of the library —
// *take on* rather than *read*, and a fraction with no verb after it.
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

export default async function PilePage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const params = await searchParams;
  const { head, reserve } = await composePile();

  const refused = asked(params, "refused");
  const wished = asked(params, "wished");
  // Which routes the owner asked to look behind — a repeated parameter, because more than one
  // can stand open at once and putting a second away to read a first would be the screen
  // choosing for them.
  const shown = theRoutesAskedFor(params[THE_ROUTE]);
  // The reserve is drawn as rows that lead and the stops standing behind them (#42), which is
  // the screen's own judgement over a composed list and lives in `./behind`.
  const rows = theReserveAsRows(reserve, shown);
  const composed = head.length + reserve.length;
  const tonight = [...head, ...reserve].filter((entry) => entry.atHand).length;

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">The Pile</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          What to take on next — read or play. Two halves: what I pinned leads, in the order I
          pinned it, and that half is mine to keep short. Everything under it composes itself from
          what I said I want, the routes I am walking, the runs I am in the middle of and the Series
          I am completing, and it is in no order at all. When the order starts to matter, I pin it.
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
            Nothing composed. Either I want to take on nothing in particular, every route is walked
            to the end and every Series I am collecting is complete — which is a real answer — or
            there is nothing to compose from yet.
          </p>
          <p className="mt-4 text-sm">
            Open a{" "}
            <Link href="/stories" className="underline underline-offset-4">
              Story
            </Link>{" "}
            and say I want to take it on — that costs nothing else. Or{" "}
            <Link href="/paths" className="underline underline-offset-4">
              define a Path
            </Link>{" "}
            and put Stories on it in the order I mean to take them on, or{" "}
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
                  <Entry
                    key={theKeyOf(entry.subject)}
                    entry={entry}
                    place={place + 1}
                    pinned
                    shown={shown}
                  />
                ))}
              </ol>
            )}
          </Half>

          {/* **The reserve, unnumbered.** The absence of the ordinal is the point: a number
              here would read as a rank, and this half is not ranked. */}
          <Half
            label="Composed"
            count={reserve.length}
            // **The count of what is put away is on the screen**, so the fold never reads as
            // a shorter list than the one the library composed (#42).
            said={theReserveIsSaid(tonight, reserve.length - rows.length)}
          >
            {reserve.length === 0 ? (
              <p className="max-w-prose text-pretty text-sm text-muted-foreground">
                Nothing else composed — everything the library has to offer is pinned above.
              </p>
            ) : (
              <ul>
                {rows.map((row) => (
                  <Entry
                    key={theKeyOf(row.entry.subject)}
                    entry={row.entry}
                    behind={row.behind}
                    pinned={false}
                    shown={shown}
                  />
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
 * number. `behind` is what stands behind this row on the routes it **leads**, and only a
 * reserve row ever has any: a pinned row is a decision the owner already took, and hanging a
 * route's remaining stops off it would swell the half that is meant to stay short.
 */
function Entry({
  entry,
  place,
  pinned,
  shown,
  behind = [],
}: {
  entry: PileEntry;
  place?: number;
  pinned: boolean;
  /** The routes being looked behind, carried through every form so a write does not close one. */
  shown: string[];
  behind?: WhatStandsBehind[];
}) {
  const want = theWantOn(entry);

  return (
    <li className="border-t border-border py-4">
      <div className="flex gap-3 sm:gap-5">
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
                    key={`${reason.because}:${reason.want?.id ?? reason.path?.id ?? reason.series?.id ?? "run"}`}
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
                I have not recorded this object yet, so there is nothing to wish for. Catalogue it
                on the{" "}
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
              <Subject subject={entry.subject} />
              <RoutesShown shown={shown} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="-ml-2.5 h-9 sm:h-8 lg:ml-0"
              >
                {pinned ? "Unpin" : "Pin it"}
              </Button>
            </form>

            {/* Taking a Want back is a *strike* and reads like one: a Want the owner has not
                acted on is still true, and nothing on this screen ticks one off — a Pass is
                what answers it. */}
            {want ? (
              <form action={unwant}>
                <input type="hidden" name="wantId" value={want.id} />
                <RoutesShown shown={shown} />
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
                <RoutesShown shown={shown} />
                <label className="sr-only" htmlFor={`priority-${theKeyOf(entry.subject)}`}>
                  How soon
                </label>
                <select
                  id={`priority-${theKeyOf(entry.subject)}`}
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
      </div>

      {/* **What stands behind this stop on the routes this row leads** (#42). Under the whole
          row rather than inside the prose column, because a route is a *rail* and a rail wants
          the width — and because what is behind belongs to the row rather than to one of its
          sentences. */}
      {behind.length > 0 ? (
        <div className="mt-3 space-y-3 sm:pl-4">
          {behind.map((route) => (
            <Behind key={route.route.id} behind={route} shown={shown} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * What stands behind one row on one route: how many there are, and — when the owner presses —
 * the rail itself, with a pin against every stop.
 *
 * **The count is outside the press and the rail is inside it.** What the owner needs in order
 * to decide whether to look is *how many* and *on which route*, and both are on the row
 * whether it is open or shut.
 *
 * The rail is quoted from the route's own screen deliberately (`../paths/[id]/page.tsx`): the
 * numbers are the owner's order, printed as they are printed there, so what opens here is
 * recognisable as a piece of the route rather than as a second list about it.
 */
function Behind({ behind, shown }: { behind: WhatStandsBehind; shown: string[] }) {
  const standing = behind.stops.length;

  return (
    <div>
      <Link
        href={theAddressWith(
          shown,
          behind.shown ? { hide: behind.route.id } : { show: behind.route.id }
        )}
        className="inline-block rounded py-1.5 text-sm text-muted-foreground underline decoration-foreground/25 underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {behind.shown ? "Hide the " : "Show the "}
        <span className="font-mono tabular-nums">{standing}</span>
        {standing === 1 ? " stop behind it on " : " stops behind it on "}
        {behind.route.name}
      </Link>

      {behind.shown ? (
        <ol className="mt-1 border-l border-border pl-3 sm:pl-4">
          {behind.stops.map((stop) => (
            <Stop key={theKeyOf(stop.entry.subject)} stop={stop} shown={shown} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * One stop on the rail: where it stands on the route, what it is, and the press that pins it.
 *
 * It is deliberately **not** a full entry — no tile, no reasons, no proposal. A stop standing
 * behind another is read as part of a sequence rather than chosen out of a shelf, and the act it is here
 * for is the pin: seeing the second and the third stop is the whole of what makes *three
 * Marvel stories and then a DC one* sayable (#42). Everything else about it is one tap away
 * on its own page.
 */
function Stop({ stop, shown }: { stop: StopBehind; shown: string[] }) {
  const leadsTo = entryLeadsTo(stop.entry);
  const title = entryTitle(stop.entry);

  return (
    <li className="flex items-baseline gap-3 border-t border-border py-2.5 first:border-t-0">
      {/* The route's own number, and it is true where a number in this half would not be: it
          says where the stop stands on the *route*, never where it stands on the list. */}
      <span
        aria-hidden="true"
        className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground"
      >
        {stop.place}
      </span>

      <span className="min-w-0 flex-1">
        {leadsTo ? (
          <Link href={leadsTo} className="underline-offset-4 outline-none hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
        <span className={`mt-0.5 block ${EYEBROW}`}>{entryStanding(stop.entry)}</span>
      </span>

      <form action={pin} className="shrink-0">
        <Subject subject={stop.entry.subject} />
        <RoutesShown shown={shown} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          aria-label={`Pin ${title}`}
          className="h-11 px-2 sm:h-9"
        >
          Pin it
        </Button>
      </form>
    </li>
  );
}

/**
 * What a pin names, as the fields a form carries — the core's own vocabulary and never a
 * second encoding of it.
 *
 * Three forms send it now (the row's pin, the row's unpin, and the pin on a stop standing
 * behind one), which is exactly the moment a copy of it would start to drift.
 */
function Subject({ subject }: { subject: PinnedSubject }) {
  return (
    <>
      <input type="hidden" name="kind" value={subject.kind} />
      <input type="hidden" name="id" value={subject.id} />
      {subject.kind === "series" ? (
        <input type="hidden" name="position" value={subject.position} />
      ) : null}
    </>
  );
}

/**
 * **The routes being looked behind, carried through the write.** Every act on this screen is a
 * POST that redirects back, so a form that did not say what was open would close the rail the
 * owner is pinning out of — and pinning the second stop and then the third is two presses.
 */
function RoutesShown({ shown }: { shown: string[] }) {
  return (
    <>
      {shown.map((id) => (
        <input key={id} type="hidden" name={THE_ROUTE} value={id} />
      ))}
    </>
  );
}
