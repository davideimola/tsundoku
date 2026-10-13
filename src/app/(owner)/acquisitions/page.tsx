import Link from "next/link";
import { Cover } from "@/components/cover";
import {
  type AcquisitionMade,
  type MonthThingsCameHome,
  theMonthsThingsCameHome,
} from "@/core/queries/acquisition";
import { unrecorded, whole } from "@/core/queries/library";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { acquisitionDetail, monthNamed, standingOf, whenItWas } from "./months";

// THE LEDGER. What came home, month by month, and what each month cost.
//
// It is the one screen in *Owning* that is read at a desk rather than in a shop. The
// Collection answers *do I already have this?* with a book in the owner's hand; this answers
// *what have I been doing?* — which objects joined the library in March, and what March came
// to — and the two are different questions about the same table, which is why the ledger is
// its own query (`@/core/queries/acquisition`) and not a sort order on the wall.
//
// Four decisions, and each of them is the same one this application keeps making about
// money: say what the figure was counted over, or do not print it.
//
//   1. **Every acquisition is on it, including the ones that ended.** Money spent on a Volume
//      later sold was still spent, so a released object keeps its place in the month it came
//      home in and says on its row that it has gone (ADR-0007). A ledger that showed only the
//      shelf would be the Collection with dates on it, and it would not reconcile against a
//      bank statement.
//   2. **A month's total arrives with its coverage.** Eighteen of this library's
//      seventy-seven acquisitions carry a price, so *€ 31.40* over a month of six purchases
//      is a **floor** and the heading says so. Where the month has acquisitions and not one
//      price, there is no figure at all — an em dash with the reason said out loud, the same
//      posture the dashboard takes.
//   3. **The acquisitions with no day recorded have a band of their own**, at the foot. A
//      book owned since before any of this was written down has no receipt and no day, and
//      dropping it out of the ledger would be the library quietly losing an object it holds.
//      It is the shopping list's rule — nothing disappears — applied to what already
//      happened, and the band is the one place the owner can see what is left to fill in.
//   4. **Nothing is judged.** No month is over or under, nothing is coloured, nothing is
//      compared to an average. A period is what happened, and this application does not have
//      an opinion about the owner's spending any more than it enforces their plans (ADR-0023).
//
// A thin adapter over one query (ADR-0002). The banding and the figures are the core's,
// because a month is what the question is about; the words are `./months`, tested beside
// themselves.
export const dynamic = "force-dynamic";

/** The idiom every label on this screen is set in: small sans, sentence case. */
const LABEL = "text-label font-medium text-muted-foreground tabular-nums";

export default async function AcquisitionsPage() {
  await requireOwner();

  const months = await theMonthsThingsCameHome();

  // The day the screen is being read, which is what makes *this month* sayable. Read once and
  // handed down, so every band on the page agrees about which month it is.
  const today = new Date();
  // The length of a list the page holds whole and renders whole, which is not a figure the
  // coverage rule binds: there is nothing partial about it and no denominator to get wrong.
  const acquisitions = months.reduce((made, month) => made + month.acquisitions.length, 0);

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-title font-semibold lg:text-title-lg">Acquisitions</h1>
        <p className="mt-2 text-pretty text-base text-muted-foreground">
          What came home, month by month.
        </p>
        <details className="mt-3 max-w-prose text-sm text-muted-foreground">
          <summary className="cursor-pointer text-sm font-medium text-cloth">
            How this works
          </summary>
          <p className="mt-2 text-pretty">
            An object that has since left the house is still here, in the month it arrived in — the
            money was spent. A total says what it was counted over, because most acquisitions carry
            no price.
          </p>
        </details>
      </header>

      <p className={`mt-8 ${LABEL}`}>
        {acquisitions} {acquisitions === 1 ? "acquisition" : "acquisitions"}
        {months.length > 0 ? (
          <> across {months.length === 1 ? "one band" : `${months.length} bands`}</>
        ) : null}
      </p>

      {months.length === 0 ? (
        <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
          Nothing has come home yet. Say <em>I bought it</em> in{" "}
          <Link href="/add" className="font-medium text-cloth underline-offset-4 hover:underline">
            Add to the library
          </Link>{" "}
          and the object, the day and the price are written in one press.
        </p>
      ) : (
        <div className="mt-4 space-y-10">
          {months.map((month) => (
            <Month key={month.month ?? "no-day"} month={month} today={today} />
          ))}
        </div>
      )}
    </main>
  );
}

/** One band of the ledger: the month, what it came to, and what came home in it. */
function Month({ month, today }: { month: MonthThingsCameHome; today: Date }) {
  const id = `band-${month.month ?? "no-day"}`;
  const hint = whenItWas(month.month, today);

  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2"
      >
        <span className="font-heading text-section font-semibold">{monthNamed(month.month)}</span>
        {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
        <CameTo month={month} />
      </h2>

      {/* The band with no month is the one the owner can act on, and it says what the act is
          rather than leaving them to work it out from a heading. */}
      {month.month === null ? (
        <p className="mt-3 max-w-prose text-pretty text-sm text-muted-foreground">
          Nobody wrote the day down, so these are in no month's total. Fill the day in on the
          object's own page and it moves into its month.
        </p>
      ) : null}

      <ul className="mt-3 max-w-3xl">
        {month.acquisitions.map((made) => (
          <Row key={made.id} made={made} />
        ))}
      </ul>
    </section>
  );
}

/**
 * **What a month came to**, beside its name — and what that figure was counted over wherever
 * it was not counted over all of it.
 *
 * The two numbers come off the query's own answer (`Covered`), never off anything this page
 * added up, which is what makes the denominator impossible to invent. A month with
 * acquisitions and no price at all gets no figure: a `€ 0.00` there would be a claim about
 * the owner's money, where the truth is that nobody wrote it down.
 */
function CameTo({ month }: { month: MonthThingsCameHome }) {
  return (
    <span className="ml-auto flex items-baseline gap-2">
      {unrecorded(month.comesTo) ? (
        <span className="text-sm text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">No acquisition in this month carries a price</span>
        </span>
      ) : (
        <>
          <span className="text-sm font-semibold tabular-nums">€ {month.comesTo.figure}</span>
          {whole(month.comesTo) ? null : (
            <span className="text-sm text-muted-foreground">
              from {month.comesTo.from} of {month.comesTo.of} priced
            </span>
          )}
        </>
      )}
      <span className="text-sm text-muted-foreground tabular-nums">
        {month.acquisitions.length}{" "}
        {month.acquisitions.length === 1 ? "acquisition" : "acquisitions"}
      </span>
    </span>
  );
}

/**
 * One acquisition, as a row: a small jacket, the name in the serif, one quiet line of facts,
 * and the price at the right in the figure's own face.
 *
 * The Binding used to stand beside the name as a badge, competing with it; it is one of the
 * facts in the quiet line now, which is where a reader looks for *which edition*. The name
 * leads to the object's own page, which is where the day and the price are corrected; the
 * jacket beside it is the same thing's picture rather than a second link to it.
 */
function Row({ made }: { made: AcquisitionMade }) {
  const said = [
    made.volume.publisher,
    made.volume.editionLine,
    made.volume.binding.name,
    made.acquiredOn === null ? "no day recorded" : `came home ${made.acquiredOn}`,
    standingOf(made).toLowerCase(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-start gap-3.5 border-t border-border py-3.5 first:border-t-0">
      <Cover
        title={made.volume.title}
        tint={tint(made.volume.series?.id ?? made.volume.id)}
        label={acquisitionDetail(made)}
        image={made.volume.cover}
        size="thumb"
        className="w-11 shrink-0 sm:w-12"
      />

      <div className="min-w-0 flex-1">
        <h3 className="font-heading text-lg font-semibold leading-snug text-balance">
          <Link
            href={`/collection/${made.volume.id}`}
            className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {made.volume.title}
          </Link>
        </h3>
        <p className={`mt-0.5 text-pretty ${LABEL} first-letter:uppercase`}>{said}</p>
      </div>

      <p className="shrink-0 pt-0.5 font-heading text-lg font-semibold tabular-nums">
        {made.pricePaid === null ? (
          <span className="text-muted-foreground">
            <span aria-hidden="true">—</span>
            <span className="sr-only">No price recorded for this acquisition</span>
          </span>
        ) : (
          <>€ {made.pricePaid}</>
        )}
      </p>
    </li>
  );
}
