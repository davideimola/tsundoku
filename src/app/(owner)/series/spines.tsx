import { Spine } from "@/components/spine";
import type { SeriesLedger, SeriesVolume } from "@/core/queries/series";
import { type Tint, tint } from "@/lib/tint";

import { type Position, positionsOf, standingSaid, whatTheFillMeans } from "./positions";

// THE SPINES, which are a Series' whole question made into a picture (#30).
//
// A Series answers *what am I missing* and never *was it any good*: it is a ledger, and the
// ledger is a publisher's ordered sequence of objects. So it is drawn as one — **a row of
// spines standing side by side, filled in the Series' own tint where the object is on the
// shelf and hollow where it is not.** The gaps *are* the answer, readable at arm's length in
// a shop without reading a number, which is the whole difference between this and the four
// hand-written rows in a spreadsheet that said `#ERROR!`.
//
// **Spines here and covers on the walls, and the difference is not decoration.** A wall is
// faced outwards, so `@/components/cover` is shaped like the page an image will one day fill
// (#32). A Series is a sequence of objects seen from the outside, the way a shelf is seen: a
// seventy-two volume Series is one screen of spines and would be six screens of covers, and
// one stretch of colour with two notches taken out of it is the picture the owner came for.
// The pile draws its spines lying down (`@/components/pile`) because a pile is read from the
// side; these stand up because a shelf does.
//
// It names no colour: the tint is the library's own, a function of the Series' identity, and
// the wiring by which a tile wears one is `@/lib/tint`'s — shared with the cover and the
// pile, so an untinted spine here cannot come to sit on a different ground than one there.
//
// **The drawing left this file in #29** and is `@/components/spine`, because a Story's page
// draws the objects carrying a narrative the same way and two spines drawn from two files
// would drift. What stays here is the only half that is a Series': what a *position* is, and
// where one leads.
//
// What each position **is** — held, missing, or merely empty — is `./positions.ts`, tested
// beside itself, because the difference between *missing* and *empty* is a claim about the
// owner's intentions and not a colour.

/**
 * A Series drawn as spines: one per position, and the sentence that says what the fill means.
 *
 * `volumes` is what the shelf holds of it, where the caller read them. The list of Series
 * reads ledgers without their objects, and the same drawing is made from those — filled
 * spines carrying a number, with nothing to lead to.
 */
export function Spines({
  ledger,
  volumes = [],
}: {
  ledger: SeriesLedger;
  volumes?: readonly SeriesVolume[];
}) {
  const positions = positionsOf(ledger, volumes);

  if (positions.length === 0) {
    return (
      <p className="text-pretty text-sm text-muted-foreground">
        Nothing published yet. Nothing to miss — record the count when the first one is out.
      </p>
    );
  }

  const colour = tint(ledger.id);
  const fill = whatTheFillMeans(ledger, positions);

  return (
    <div>
      {/* Wrapping rather than scrolling sideways: seventy-two spines grow down the page in
          as many rows as the window holds, which is how it stays legible on a phone and how
          it spends the width at a desk. A shelf does the same thing. */}
      <ol className="flex flex-wrap gap-1" aria-label="The positions of this Series">
        {positions.map((position) => (
          <li key={position.number}>
            <SeriesSpine position={position} tint={colour} />
          </li>
        ))}
      </ol>

      {/* The fill, said in words — for anyone who cannot see it, and because the numbers
          are what the owner types into a shop's search. Which sentence this is belongs to
          `./positions.ts`, with the standings it is about. */}
      <p className="mt-3 text-pretty text-sm">
        <span className="text-muted-foreground">
          {fill.said}
          {fill.missing.length > 0 ? ": " : null}
        </span>
        {fill.missing.length > 0 ? (
          <span className="font-mono tabular-nums">{fill.missing.join(", ")}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * One position of the Series, as a spine.
 *
 * The drawing is `@/components/spine` — it stands on the Story's page too, over the objects
 * carrying a narrative (#29) — and what is left here is the only part that is a Series':
 * **what the position means**. A position the house holds is a link to the object, so the
 * ledger is a way onto the shelf as well as a picture of it; a gap is not, because there is
 * nothing there to open.
 */
function SeriesSpine({ position, tint }: { position: Position; tint: Tint | null }) {
  const held = position.standing === "held";
  // The object standing here, where the caller read the objects at all: what makes this spine
  // a way onto the shelf rather than only a picture of it.
  const leadsTo = held ? position.volume : null;

  return (
    <Spine
      href={leadsTo ? `/collection/${leadsTo.id}` : undefined}
      title={position.volume?.title}
      foot={position.number}
      tint={tint}
      held={held}
      detail={[
        position.volume?.title,
        `${position.number} of the Series`,
        standingSaid(position.standing),
      ]
        .filter(Boolean)
        .join(" — ")}
    />
  );
}
