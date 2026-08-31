import type { SeriesLedger } from "@/core/queries/series";

// The two small things both Series screens print beside a ledger: **what it is called**, and
// **how far along it is.** They are here rather than in `./spines.tsx` because that file is
// the picture and these are the caption around it — and rather than in either page because
// both pages print them, and a Series named one way on the list and another on its own page
// would be two Series to the owner.

/** How far along a Series is, in the two numbers that say it: `4 of 27`. */
export function Progress({ ledger }: { ledger: SeriesLedger }) {
  return (
    <span className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground tabular-nums">
      {ledger.ownedCount} of {ledger.publishedCount}
      {ledger.status === "ongoing" ? " · ongoing" : ""}
    </span>
  );
}

/** The Series' name, with the edition that tells two of them apart. */
export function SeriesName({ ledger }: { ledger: SeriesLedger }) {
  return (
    <>
      <span className="font-heading">{ledger.name}</span>
      {ledger.editionLine ? (
        <span className="ml-2 whitespace-nowrap font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          {ledger.editionLine}
        </span>
      ) : null}
    </>
  );
}
