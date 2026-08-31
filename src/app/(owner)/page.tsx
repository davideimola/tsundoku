import Link from "next/link";
import { Cover } from "@/components/cover";
import { Pile } from "@/components/pile";
import { countWaitingInboxEntries } from "@/core/queries/inbox";
import { type Covered, libraryInFigures, thePile, unrecorded, whole } from "@/core/queries/library";
import { composeReadingList, type ReadingListEntry } from "@/core/queries/reading-list";
import { listStoryWall } from "@/core/queries/story";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { entryKey, entryStanding, entryTitle } from "./reading-list/entry";
import { storyDetail } from "./stories/story-state";

// THE DASHBOARD. For eleven slices this page listed the five Types, which is what a walking
// skeleton's home page looks like; this is the one that tells the owner something (#24).
//
// Four decisions, and each of them is about honesty rather than layout.
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
//   4. **An empty band is an invitation.** Every block here says what is missing and offers
//      the thing that fills it, because with every Reading finished *reading now* is zero and
//      an empty box is the least useful true statement a screen can make.
//
// A thin adapter over five queries, like every page here (ADR-0002): no SQL, no domain logic,
// and no colour of its own — the one on screen is the library's.
export const dynamic = "force-dynamic";

/**
 * How much of the Reading list the dashboard shows.
 *
 * Three, because this band answers *what is next* and not *what is the list* — the list has
 * its own screen, linked from the heading. A fourth row would start to be the list.
 */
const NEXT_UP = 3;

/** The idiom every label on this page is set in, and the app's smallest type. */
const EYEBROW = "font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground";

/** A link in prose, which is most of the invitations below. */
const IN_PROSE =
  "underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export default async function Home() {
  await requireOwner();

  const [reading, entries, waiting, figures, pile] = await Promise.all([
    // Narrowed in the core rather than here, like every wall in this app: the band shows
    // what is being read, so it reads what is being read.
    listStoryWall({ state: "reading" }),
    composeReadingList(),
    countWaitingInboxEntries(),
    libraryInFigures(),
    thePile(),
  ]);

  // **Sliced here, and this is not the narrowing the walls forbid.** The Reading list has no
  // rows to read: it is composed, and its *order* is the answer it gives — pinned first, then
  // the owner's routes, then the Series ledger — so which three come first is not knowable
  // until the whole thing has been composed. The band prints the total beside them, which
  // would need the whole list anyway.
  const next = entries.slice(0, NEXT_UP);

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">Tonight</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          What is in my hands, what is next, and what is waiting for a decision. Everything here is
          derived on this request and stored nowhere.
        </p>
      </header>

      <div className="mt-8 space-y-9">
        <Block label="Reading now" count={reading.length}>
          {reading.length === 0 ? (
            <Invitation>
              No Reading is open.{" "}
              <Link href="/stories?state=to-read" className={IN_PROSE}>
                Pick one out of the pile
              </Link>{" "}
              and say you have started it — a Reading is recorded from the assistant, and the pile
              is drawn at the foot of this page.
            </Invitation>
          ) : (
            /* The wall's own grid and the wall's own tile, at the width a title is legible
               across, so a Story in hand looks here exactly as it looks on the Stories
               screen. */
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 sm:gap-4">
              {reading.map((story) => (
                <li key={story.id}>
                  <Cover
                    href={`/stories/${story.id}`}
                    title={story.title}
                    tint={tint(story.series?.id)}
                    detail={storyDetail(story)}
                    foot={story.type.name}
                  />
                </li>
              ))}
            </ul>
          )}
        </Block>

        <div className="grid gap-9 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Block
            label="What to read next"
            count={entries.length}
            more={
              entries.length > next.length
                ? { href: "/reading-list", word: "All of it" }
                : undefined
            }
          >
            {entries.length === 0 ? (
              <Invitation>
                Nothing composed — every route is walked to the end and every Series I am collecting
                is complete, or there is nothing to compose from yet.{" "}
                <Link href="/paths" className={IN_PROSE}>
                  Define a Path
                </Link>{" "}
                or{" "}
                <Link href="/series" className={IN_PROSE}>
                  decide to collect a Series
                </Link>
                .
              </Invitation>
            ) : (
              <ol>
                {next.map((entry, place) => (
                  <NextEntry key={entryKey(entry)} entry={entry} place={place + 1} />
                ))}
              </ol>
            )}
          </Block>

          {/* The boundary the assistant writes into, and the one nobody looks at until it has
              filled up (ADR-0005). A count and a way in, because deciding is the only thing
              that empties it. */}
          <Block label="Waiting for me" count={waiting}>
            {waiting === 0 ? (
              /* No Amendment in this sentence, though ADR-0011 says the Inbox will carry
                 them: nothing in the schema, the verbs or the MCP door proposes one yet, and
                 an empty band that names a thing the application cannot do is the same
                 dishonesty as an invitation to a form that does not exist. */
              <Invitation>
                Nothing waiting. A Story, a Volume or a Series the assistant meets lands in the{" "}
                <Link href="/inbox" className={IN_PROSE}>
                  Inbox
                </Link>{" "}
                for me to approve, because creating one from outside is the writing this library
                does not allow (ADR-0005).
              </Invitation>
            ) : (
              <p className="text-pretty text-sm">
                <Link href="/inbox" className={IN_PROSE}>
                  {waiting} {waiting === 1 ? "proposal" : "proposals"}
                </Link>{" "}
                <span className="text-muted-foreground">
                  to approve or reject. Nothing was written by the asking.
                </span>
              </p>
            )}
          </Block>
        </div>
      </div>

      <section aria-labelledby="the-library" className="mt-14 border-t border-border pt-8">
        <h2 id="the-library" className="font-heading text-xl sm:text-2xl">
          The library
        </h2>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          What is owned, what is being collected, what that is short of, and what it cost. Every
          figure says what it was counted over, and one that has no data behind it says so instead
          of printing a zero.
        </p>

        <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
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
                </Link>{" "}
                — holding some of it is not the decision.
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

          {/* The figure this ticket exists for. Eighteen of seventy-seven acquisitions carry a
              price, so a total would read as complete and would be wrong by a factor of four
              — and where records exist and not one of them carries a price, there is no figure
              at all. The currency is the one the Collection and the Wishes already print. */}
          <Figure
            label="Spent"
            figure={figureOf(figures.spent, "No acquisition carries a price", "€ ")}
          >
            {figures.spent.of === 0 ? (
              <>Nothing has come home yet, so nothing has been spent.</>
            ) : figures.spent.from === 0 ? (
              <>
                No price on any of the {figures.spent.of}{" "}
                {figures.spent.of === 1 ? "acquisition" : "acquisitions"}.{" "}
                <Link href="/collection" className={IN_PROSE}>
                  Add one
                </Link>{" "}
                as a Volume comes home.
              </>
            ) : whole(figures.spent) ? (
              <>
                Across every one of the {figures.spent.of}{" "}
                {figures.spent.of === 1 ? "acquisition" : "acquisitions"}, as I typed them.
              </>
            ) : (
              <>
                From <Coverage of={figures.spent} records="acquisitions" />. The rest carry no
                price, so this is a floor and not a total.
              </>
            )}
          </Figure>
        </dl>

        <section aria-labelledby="the-pile" className="mt-12">
          <h3 id="the-pile" className={`flex items-baseline gap-3 ${EYEBROW}`}>
            The pile
            <span className="tabular-nums">{pile.spines.length}</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </h3>

          {pile.spines.length === 0 ? (
            <div className="mt-3">
              <Invitation>
                {pile.stories === 0 ? (
                  <>
                    No Stories yet, so there is no pile. A Story is the narrative unit — record one
                    from the assistant, or approve one waiting in the{" "}
                    <Link href="/inbox" className={IN_PROSE}>
                      Inbox
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Nothing unread. All {pile.stories} Stories in the library have been opened at
                    least once, which is the one state this application was not built expecting.{" "}
                    <Link href="/stories" className={IN_PROSE}>
                      The wall
                    </Link>{" "}
                    has them by state.
                  </>
                )}
              </Invitation>
            </div>
          ) : (
            <>
              {/* **A proportion and not a coverage**, which is why it is written here rather
                  than handed to `Coverage`: how much of the library is unread is the thing
                  being reported, where a coverage says how much of the library a figure was
                  able to be computed over. Every Story's state is derivable, so the pile
                  covers all seventy-seven of them and has no gap to declare. */}
              <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
                <span className="tabular-nums text-foreground">
                  {pile.spines.length} of {pile.stories}
                </span>{" "}
                Stories have never been opened. Every spine is one of them, and it opens.
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
 * of the first band at a glance, and it is the same eyebrow-and-rule the Story wall names its
 * shelves with.
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
      <h2 id={id} className={`flex items-baseline gap-3 ${EYEBROW}`}>
        {label}
        <span className="tabular-nums">{count}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        {more ? (
          <Link href={more.href} className={`shrink-0 ${IN_PROSE}`}>
            {more.word}
          </Link>
        ) : null}
      </h2>

      <div className="mt-3">{children}</div>
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

/** One row of the Reading list, as the dashboard shows it: the order, the title, the standing. */
function NextEntry({ entry, place }: { entry: ReadingListEntry; place: number }) {
  return (
    <li className="flex gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
      {/* The ordinal, because the order *is* the answer the Reading list gives. */}
      <span
        aria-hidden="true"
        className="w-5 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-muted-foreground"
      >
        {String(place).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <p className="truncate font-heading text-sm font-medium">{entryTitle(entry)}</p>
        <p className={`mt-0.5 ${EYEBROW}`}>{entryStanding(entry)}</p>
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
      <dt className={EYEBROW}>{label}</dt>
      <dd className="mt-1.5">
        <span className="block font-mono text-3xl tabular-nums sm:text-4xl">{figure}</span>

        <p className="mt-1.5 text-pretty text-xs leading-relaxed text-muted-foreground">
          {children}
        </p>
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
