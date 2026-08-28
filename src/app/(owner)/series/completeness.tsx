import type { SeriesLedger } from "@/core/queries/series";

// The one loud thing in this slice's two screens, and the answer to the tile that says
// `#ERROR!` in the owner's spreadsheet today.
//
// A Series is a row of positions, so the ledger is drawn as one: **one cell per published
// Volume, filled where it is in the house and hollow where it is not.** The gaps are the
// answer, and they are visible at arm's length in a shop without reading a number —
// which is the whole difference between this and the four hand-written rows it replaces.
//
// It wraps on a phone and grows down rather than sideways, which is why a 72-volume Series
// is legible here at all. Numbers stay in the cells because the missing ones are what the
// owner types into a search, and they are repeated as prose underneath for anyone who
// cannot see the fill.

/** The positions of a Series, filled where the house holds one. */
export function Completeness({
  publishedCount,
  missing,
}: {
  publishedCount: number;
  /** The positions the house has none of. */
  missing: number[];
}) {
  if (publishedCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing published yet. Nothing to miss — record the count when the first one is out.
      </p>
    );
  }

  const gaps = new Set(missing);
  const positions = Array.from({ length: publishedCount }, (_, index) => index + 1);

  return (
    <div>
      <ol className="flex flex-wrap gap-1" aria-label="Positions of the Series">
        {positions.map((position) => {
          const absent = gaps.has(position);
          return (
            <li
              key={position}
              // `title` rather than a legend: the two states are told apart by fill, and
              // the sentence under the strip says which is which in words.
              title={absent ? `${position} — missing` : `${position} — in the house`}
              className={`flex h-7 w-7 items-center justify-center rounded-sm font-mono text-[0.65rem] tabular-nums ${
                absent
                  ? "border border-dashed border-foreground/30 text-muted-foreground"
                  : "bg-foreground text-background"
              }`}
            >
              {position}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-pretty text-sm">
        {missing.length === 0 ? (
          <span className="text-muted-foreground">
            Every published Volume of this Series is in the house.
          </span>
        ) : (
          <>
            <span className="text-muted-foreground">Missing: </span>
            <span className="font-mono tabular-nums">{missing.join(", ")}</span>
          </>
        )}
      </p>
    </div>
  );
}

/** How far along a Series is, in the two numbers that say it: `4 of 27`. */
export function Progress({ ledger }: { ledger: SeriesLedger }) {
  return (
    <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
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
        <span className="ml-2 whitespace-nowrap font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {ledger.editionLine}
        </span>
      ) : null}
    </>
  );
}
