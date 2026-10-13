import Link from "next/link";
import { Cover } from "@/components/cover";
import { Pile } from "@/components/pile";
import { whatThisMonthHasCost } from "@/core/queries/acquisition";
import { countWaitingInboxEntries } from "@/core/queries/inbox";
import { type Covered, libraryInFigures, thePile, unrecorded, whole } from "@/core/queries/library";
import { composePile, type PileEntry, theKeyOf } from "@/core/queries/pile";
import { listStoryWall } from "@/core/queries/story";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { monthNamed } from "./acquisitions/months";
import { DoorInTheHeader } from "./door";
import { entrySaid, entryTitle } from "./pile/entry";
import { storyDetail } from "./stories/story-state";

// THE DASHBOARD. For eleven slices this page listed the five Types, which is what a walking
// skeleton's home page looks like; this is the one that tells the owner something (#24).
//
// Five decisions, and each of them is about honesty rather than layout.
//
//   1. **Two bands, and the actionable one is on top.** Tonight first — what is in the
//      owner's hands, what is next, what is waiting for a decision — and then, under a rule,
//      what the library *is*. The order is the posture: somebody opening this at nine in the
//      evening wants the first band, and the second one is a thing to look at.
//   2. **The hero is the pile, and it is at the foot of the page.** *Tsundoku* is named for
//      the pile of unread books that keeps growing, so the signature of this application is
//      that pile drawn at its real size, every spine a Story the owner can open
//      (`@/components/pile`). It goes last because it is the biggest thing on the screen —
//      one stack of 67 on a phone, folded into as many piles as the width holds at the desk —
//      and the band above it is the one you act on. A hero that pushed the actionable band
//      off the screen would have got the first decision backwards.
//   3. **No figure is printed without what it was computed over.** Eighteen of seventy-seven
//      acquisitions carry a price. `libraryInFigures` answers with the coverage beside every
//      figure precisely so this page cannot invent a denominator, and where the records exist
//      but none of them carries the fact, the figure is **absent** rather than zero: a `0.00`
//      under *spent* is a claim about the owner's money, and it would be wrong. An empty
//      library is the other case and gets its zero, because nothing bought is a measurement
//      rather than a gap — `figureOf` is where that line is drawn, once.
//   4. **The money on this page has a period on it.** What stood here was every acquisition
//      ever made added up, and a figure with no period could only ever grow: it said the same
//      thing every evening, and there was nothing to do about it. *This month* is a figure the
//      owner can still act on, it is the one they came to look at, and the months behind it
//      are `/acquisitions` — which is where a total belongs, beside the objects it was paid
//      for. It is read from `whatThisMonthHasCost` off the database's own clock rather than
//      worked out here from `new Date()`, so the month named is the month summed.
//   5. **An empty band is an invitation.** Every block here says what is missing and offers
//      the thing that fills it, because with every Pass finished *under way* is zero and
//      an empty box is the least useful true statement a screen can make.
//
// A thin adapter over six queries, like every page here (ADR-0002): no SQL, no domain logic,
// and no colour of its own — the one on screen is the library's.
export const dynamic = "force-dynamic";

/**
 * How much of the Pile the dashboard shows.
 *
 * Three, because this band answers *what is next* and not *what is the list* — the list has
 * its own screen, linked from the heading. A fourth row would start to be the list.
 */
const NEXT_UP = 3;

/** A section's heading: the name of a band, in the serif. */
const HEADING = "font-heading text-section font-semibold";

/** The count beside a heading, quiet and in the interface's face. */
const COUNT = "text-sm font-normal text-muted-foreground tabular-nums";

/** A link in prose, which is most of the invitations below: cloth, because it does something. */
const IN_PROSE =
  "font-medium text-cloth underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

export default async function Home() {
  await requireOwner();

  const [underWay, entries, waiting, figures, thisMonth, pile] = await Promise.all([
    // Narrowed in the core rather than here, like every wall in this app: the band shows
    // what is open, so it reads what is open.
    listStoryWall({ state: "reading" }),
    composePile(),
    countWaitingInboxEntries(),
    libraryInFigures(),
    whatThisMonthHasCost(),
    thePile(),
  ]);

  // **Sliced here, and this is not the narrowing the walls forbid.** The Pile has no
  // rows to read: it is composed, and its *order* is the answer it gives — the head the owner
  // pinned, in pin order, and then the reserve, which is in no order at all — so which three
  // come first is not knowable until the whole thing has been composed. The band prints the
  // total beside them, which would need the whole list anyway.
  //
  // The two halves are read in order and then sliced, which is the honest reading of them
  // here: what the owner decided leads, and the rest of the tile is whatever composed. The
  // *list* is where the difference between the halves is drawn (#40); a tile of three rows is
  // not the place to draw it.
  const composed = [...entries.head, ...entries.reserve];
  const next = composed.slice(0, NEXT_UP);

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-8 sm:pt-10">
        <div>
          <h1 className="font-heading text-title font-semibold lg:text-title-lg">Tonight</h1>
          <p className="mt-2 text-pretty text-base text-muted-foreground">
            What you are in the middle of, and what comes next.
          </p>
        </div>
        <DoorInTheHeader />
      </header>

      <div className="mt-10 space-y-10">
        <Block label="Under way" count={underWay.length}>
          {underWay.length === 0 ? (
            <Invitation>
              No Pass is open.{" "}
              <Link href="/stories?state=to-read" className={IN_PROSE}>
                Pick something you have not started
              </Link>
              .
            </Invitation>
          ) : (
            /* The wall's own grid and the wall's own tile, at the width a title is legible
               across, so a Story in hand looks here exactly as it looks on the Stories
               screen. */
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 sm:gap-4">
              {underWay.map((story) => (
                <li key={story.id}>
                  <Cover
                    href={`/stories/${story.id}`}
                    title={story.title}
                    tint={tint(story.series?.id)}
                    label={storyDetail(story)}
                    image={story.cover}
                  />
                </li>
              ))}
            </ul>
          )}
        </Block>

        <div className="grid gap-9 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Block
            label="The Pile"
            count={composed.length}
            more={
              composed.length > next.length
                ? { href: "/pile", word: `See all ${composed.length}` }
                : undefined
            }
          >
            {composed.length === 0 ? (
              <Invitation>
                The Pile is empty.{" "}
                <Link href="/paths" className={IN_PROSE}>
                  Define a Path
                </Link>{" "}
                or{" "}
                <Link href="/series" className={IN_PROSE}>
                  collect a Series
                </Link>{" "}
                to fill it.
              </Invitation>
            ) : (
              <ol>
                {next.map((entry, place) => (
                  <NextEntry key={theKeyOf(entry.subject)} entry={entry} place={place + 1} />
                ))}
              </ol>
            )}
          </Block>

          {/* The boundary the assistant writes into, and the one nobody looks at until it has
              filled up (ADR-0005). A count and a way in, because deciding is the only thing
              that empties it — drawn on soft cloth, because it is the one block here that is
              asking the owner for something. */}
          <section aria-labelledby="band-waiting">
            <h2 id="band-waiting" className="sr-only">
              Waiting for you
            </h2>
            {waiting === 0 ? (
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[0.9375rem] font-semibold">Nothing is waiting</p>
                <p className="mt-0.5 text-pretty text-label text-muted-foreground">
                  What an assistant proposes lands in the{" "}
                  <Link href="/inbox" className={IN_PROSE}>
                    Inbox
                  </Link>{" "}
                  for you to approve.
                </p>
              </div>
            ) : (
              <Link
                href="/inbox"
                className="flex items-center gap-4 rounded-2xl bg-cloth-soft p-4 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold">
                    <span className="tabular-nums">{waiting}</span>{" "}
                    {waiting === 1 ? "proposal is waiting" : "proposals are waiting"}
                  </span>
                  <span className="mt-0.5 block text-label text-muted-foreground">
                    Nothing changes until you say yes.
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-cloth">Review</span>
              </Link>
            )}
          </section>
        </div>
      </div>

      <section aria-labelledby="the-library" className="mt-14 border-t border-border pt-8">
        <h2 id="the-library" className={HEADING}>
          The library
        </h2>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {/* Whole by construction, both of the next two: an acquisition is recorded
              deliberately and a collecting decision is made deliberately (ADR-0007), so every
              Volume and every Series answers the question and no figure here can be a gap.
              They still go through `figureOf`, because a figure that decides for itself
              whether the rule applies to it is the figure that gets it wrong. */}
          <Figure label="In the house" figure={figureOf(figures.owned, "No Volume is catalogued")}>
            {figures.owned.of === 0 ? (
              <>
                Nothing catalogued yet.{" "}
                <Link href="/collection" className={IN_PROSE}>
                  Catalogue the Volume in your hand
                </Link>
                .
              </>
            ) : figures.owned.figure === 0 ? (
              <>
                None of the {figures.owned.of} the library knows is on the shelf.{" "}
                <Link href="/collection" className={IN_PROSE}>
                  Say one is in the house
                </Link>
                .
              </>
            ) : (
              <>
                {figures.owned.figure === 1 ? "Volume" : "Volumes"}, of the {figures.owned.of} the
                library knows.
              </>
            )}
          </Figure>

          <Figure
            label="Being collected"
            figure={figureOf(figures.collecting, "No Series is declared")}
          >
            {figures.collecting.of === 0 ? (
              <>
                No Series declared.{" "}
                <Link href="/series" className={IN_PROSE}>
                  Declare one
                </Link>{" "}
                and its ledger follows.
              </>
            ) : figures.collecting.figure === 0 ? (
              <>
                None of the {figures.collecting.of} declared.{" "}
                <Link href="/series" className={IN_PROSE}>
                  Decide to complete one
                </Link>
                .
              </>
            ) : (
              /* No plural to pick: *Series* is one word for one line and for nine, which is
                 the whole reason `CONTEXT.md` spends *collection* on the shelf instead. */
              <>Series, of the {figures.collecting.of} declared.</>
            )}
          </Figure>

          {/* **The one figure of the four that can be a gap on its own terms.** A Series being
              collected whose published count nobody recorded is measured against zero, so
              nothing is missing from it — and printing that as `0` would say *complete*, which
              is the loudest lie this page could tell. No Series collected at all is a different
              event and a real zero: there is nothing to be missing from, which is what the
              prose says beside it. */}
          <Figure
            label="Missing from them"
            figure={figureOf(
              figures.missing,
              "No Series being collected has a published count to measure against"
            )}
          >
            {figures.collecting.figure === 0 ? (
              <>Nothing is missing from a Series nobody decided to complete.</>
            ) : figures.missing.from === 0 ? (
              <>
                {figures.missing.of === 1
                  ? "The Series being collected has no published count."
                  : `None of the ${figures.missing.of} Series being collected has a published count.`}{" "}
                <Link href="/series" className={IN_PROSE}>
                  Open one and record how many are out
                </Link>
                .
              </>
            ) : !whole(figures.missing) ? (
              <>
                Volumes, counted over <Coverage of={figures.missing} records="Series" /> being
                collected — the rest have no published count recorded.
              </>
            ) : figures.missing.figure === 0 ? (
              <>
                Every Series I am collecting is complete, all {figures.missing.of} of{" "}
                {figures.missing.of === 1 ? "it" : "them"}.
              </>
            ) : (
              <>Volumes, across the {figures.missing.of} Series I am collecting.</>
            )}
          </Figure>

          {/* **The one figure here with a period on it.** Eighteen of seventy-seven
              acquisitions carry a price, so a month's total would read as complete and would
              be wrong — and where the month has acquisitions and not one of them carries a
              price, there is no figure at all. A month with nothing in it still gets its zero,
              because nothing bought is a measurement. The currency is the one the Collection
              and the Wishes already print, and the months behind this one are the ledger. */}
          <Figure
            label={`Spent in ${monthNamed(thisMonth.month)}`}
            figure={figureOf(thisMonth.comesTo, "No acquisition this month carries a price", "€ ")}
          >
            {thisMonth.comesTo.of === 0 ? (
              <>
                Nothing has come home this month.{" "}
                <Link href="/acquisitions" className={IN_PROSE}>
                  The months before it
                </Link>{" "}
                are on the ledger.
              </>
            ) : thisMonth.comesTo.from === 0 ? (
              <>
                No price on any of this month's {thisMonth.comesTo.of}{" "}
                {thisMonth.comesTo.of === 1 ? "acquisition" : "acquisitions"}.{" "}
                <Link href="/acquisitions" className={IN_PROSE}>
                  They are on the ledger
                </Link>
                , and the price is on each object's own page.
              </>
            ) : whole(thisMonth.comesTo) ? (
              <>
                Across all {thisMonth.comesTo.of} of this month's{" "}
                {thisMonth.comesTo.of === 1 ? "acquisition" : "acquisitions"}, as I typed them.{" "}
                <Link href="/acquisitions" className={IN_PROSE}>
                  Month by month
                </Link>
                .
              </>
            ) : (
              <>
                From <Coverage of={thisMonth.comesTo} records="acquisitions" /> this month. The rest
                carry no price, so this is a floor and not a total —{" "}
                <Link href="/acquisitions" className={IN_PROSE}>
                  month by month
                </Link>
                .
              </>
            )}
          </Figure>
        </dl>

        {/* **The spines, and they are no longer called *the pile*** (#58). The Pile is the
            composed answer above and a screen of its own now, and this is every Story nobody
            has opened — the same set the wall bands as *Not started*, drawn from the side
            because that is what a stack of unread things looks like. One word for two of
            them, on one screen, was the collision the rename made. */}
        <section aria-labelledby="not-started" className="mt-12">
          <h3 id="not-started" className={`flex items-baseline gap-3 ${HEADING}`}>
            Not started
            <span className={COUNT}>{pile.spines.length}</span>
          </h3>

          {pile.spines.length === 0 ? (
            <div className="mt-3">
              <Invitation>
                {pile.stories === 0 ? (
                  <>
                    No Stories yet.{" "}
                    <Link href="/add" className={IN_PROSE}>
                      Add the first one
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Every one of the {pile.stories} Stories has been opened.{" "}
                    <Link href="/stories" className={IN_PROSE}>
                      See them all
                    </Link>
                    .
                  </>
                )}
              </Invitation>
            </div>
          ) : (
            <>
              {/* **A proportion and not a coverage**, which is why it is written here rather
                  than handed to `Coverage`: how much of the library is unread is the thing
                  being reported, where a coverage says how much of the library a figure was
                  able to be computed over. Every Story's state is derivable, so this count
                  covers all seventy-seven of them and has no gap to declare. */}
              <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
                <span className="tabular-nums text-foreground">
                  {pile.spines.length} of {pile.stories}
                </span>{" "}
                Stories have never been opened. Each spine opens one.
              </p>

              <div className="mt-5">
                <Pile
                  stories={pile.spines.map((story) => ({
                    id: story.id,
                    href: `/stories/${story.id}`,
                    title: story.title,
                    tint: tint(story.series?.id),
                    detail: storyDetail(story),
                  }))}
                />
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

/**
 * One block of the first band: what it is called, how many there are, and a way to the screen
 * that holds all of them.
 *
 * The count is beside the label rather than inside the block, because the three blocks are
 * scanned before any of them is read — *two in hand, nine next, three waiting* is the whole
 * of the first band at a glance.
 */
function Block({
  label,
  count,
  more,
  children,
}: {
  label: string;
  count: number;
  /** The screen that holds the rest of it, where the block is showing a part. */
  more?: { href: string; word: string };
  children: React.ReactNode;
}) {
  const id = `band-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section aria-labelledby={id}>
      <div className="flex items-baseline gap-3">
        <h2 id={id} className={`flex items-baseline gap-3 ${HEADING}`}>
          {label}
          <span className={COUNT}>{count}</span>
        </h2>
        {more ? (
          <Link href={more.href} className={`ml-auto shrink-0 text-sm ${IN_PROSE}`}>
            {more.word}
          </Link>
        ) : null}
      </div>

      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * What an empty block says: what is missing, and the thing that fills it.
 *
 * A sentence rather than a box with nothing in it. It is set at the measure prose is read at
 * because it *is* prose — an empty band is the one place on this screen where the application
 * has to explain itself rather than show something.
 */
function Invitation({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-pretty text-sm text-muted-foreground">{children}</p>;
}

/** One row of the Pile, as the dashboard shows it: the order, the title, the standing. */
function NextEntry({ entry, place }: { entry: PileEntry; place: number }) {
  return (
    <li className="flex items-baseline gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
      {/* The ordinal, because the order *is* the answer the Pile gives. */}
      <span aria-hidden="true" className="w-4 shrink-0 text-sm tabular-nums text-muted-foreground">
        {place}
      </span>

      <div className="min-w-0">
        <p className="truncate font-heading text-lg font-semibold leading-snug">
          {entryTitle(entry)}
        </p>
        <p className="mt-0.5 text-label text-muted-foreground first-letter:uppercase">
          {entrySaid(entry)}
        </p>
      </div>
    </li>
  );
}

/**
 * **The figure, or the absence that stands where the fact behind it was never recorded.**
 *
 * The rule itself is `unrecorded` in the core, beside `whole`, because the line it draws is a
 * statement about the data rather than about layout — records that exist and carry nothing is
 * a gap, and no records at all is a measurement that has earned its zero. What is decided
 * *here* is only what an absence looks like.
 *
 * A function rather than a prop on `Figure` because the rule is the same for all four figures
 * and the prose underneath them is not: this is the half that must never be written twice.
 */
function figureOf(covered: Covered<number | string>, absent: string, unit = ""): React.ReactNode {
  if (unrecorded(covered)) return <Absent because={absent} />;

  return `${unit}${covered.figure}`;
}

/**
 * What stands where a figure would be.
 *
 * An em dash for the eye and the reason in words for anything not looking at the page, which
 * is how an unrated Story already reads on the Story wall — the same idiom, because it is the
 * same statement: this is a silence rather than a nought.
 */
function Absent({ because }: { because: string }) {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{because}</span>
    </span>
  );
}

/**
 * One figure of the second band, with what it was computed over underneath it.
 *
 * It draws whatever `figureOf` handed it and decides nothing: whether there is a figure at all
 * is the rule above, in one place, and this component would otherwise be the second place it
 * could be got wrong.
 */
function Figure({
  label,
  figure,
  children,
}: {
  label: string;
  figure: React.ReactNode;
  /** What the figure was computed over, in words. */
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="block font-heading text-figure font-semibold tabular-nums">{figure}</span>
        <span aria-hidden="true" className="mt-1.5 block text-sm font-medium">
          {label}
        </span>

        <p className="mt-1 text-pretty text-label text-muted-foreground">{children}</p>
      </dd>
    </div>
  );
}

/**
 * How much of the library a figure speaks for: *18 of 77 acquisitions*.
 *
 * The two numbers come off the query's own answer (`Covered`), never off anything this page
 * counted, which is what makes the denominator impossible to invent. Rendered only where the
 * coverage is short — every caller above checks `whole` first — because a coverage sentence on
 * a figure that covers everything is noise the owner learns to skip, and then skips on the one
 * that matters.
 */
function Coverage({ of, records }: { of: Covered<unknown>; records: string }) {
  return (
    <span className="tabular-nums text-foreground">
      {of.from} of {of.of} {records}
    </span>
  );
}
