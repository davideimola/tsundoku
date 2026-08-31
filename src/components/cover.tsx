import Link from "next/link";
import { type Tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";

// THE COVER, which is what a library looks like when it is faced outwards.
//
// **It is not a placeholder for a missing cover — it is the cover, until there is a
// photograph of one.** With 0 of 96 Volumes carrying an ISBN (#18) an image is the
// exception and this is the normal case, so it is designed first rather than drawn as a
// gap: a tile in its Series' own tint, the title set across it, and the one number worth
// reading at this size at the foot.
//
// It is shaped like the object it stands for — the proportions of an A4 page, near enough
// to a tankōbon faced out — and that is the argument for the shape rather than taste.
// #22 asked for a spine, and a spine is the narrower, handsomer tile; but covers are coming
// (#32 hotlinks them by ISBN once the backfill lands), and an image dropped into a tile
// shaped like a spine would either be letterboxed or reflow the whole wall on the day it
// arrives. A tile the width of the thing that will fill it changes nothing when it does.
//
// The title runs across rather than up the tile for the same reason it does on a cover:
// this one is read at four words on a phone, and vertical type is read a beat slower for
// no gain once the tile is wide enough to hold a line.
//
// Full ink and nothing quieter is printed on a tint — no muted foreground, no opacity. The
// tint's wall (`src/lib/tint.test.ts`) proves the reading threshold against `--ink` and
// against nothing else, and a quieter grey on a coloured ground clears no threshold at all.

export function Cover({
  href,
  title,
  tint,
  foot,
  detail,
}: {
  href: string;
  title: string;
  /** The Series' colour, or `null` for a Story that stands in no line — see `@/lib/tint`. */
  tint: Tint | null;
  /**
   * The one number the tile carries. A node rather than a string because an absent number
   * is not an empty one: what goes here is a figure, or a dash with the reason beside it
   * for anything that is not looking at the page.
   */
  foot: React.ReactNode;
  /** Everything the tile cannot fit: the Type, the line, the edition. */
  detail?: string;
}) {
  return (
    <Link
      href={href}
      // Twice, because a tooltip is a pointer's affordance and this library is read on a
      // phone: `title` waits under a mouse, and the label is what a screen reader and a
      // touch device get. The detail opens with the title itself, so the accessible name
      // still starts with the word that is drawn on the tile.
      title={detail}
      aria-label={detail}
      // How a tile wears a tint is `@/lib/tint`'s, because the spine in the pile wears one
      // the same way (#24): both grounds travel, and a tile with no tint falls back to the
      // palette's quiet paper.
      style={worn(tint)}
      className={cn(
        // 210 by 297: the page the tile is pretending to be, written as the paper size
        // rather than as a decimal nobody could look up.
        "flex aspect-[210/297] flex-col justify-between gap-2 overflow-hidden rounded-sm border border-border p-2.5 text-foreground",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Lifting off the shelf on hover, and only where the owner has not asked things to
        // stay still (user story 67).
        "motion-safe:transition-transform motion-safe:hover:-translate-y-1",
        tint ? WORN : UNWORN
      )}
    >
      <span className="flex min-h-0 flex-1 items-center justify-center">
        {/* Centred on the tile the way a title is centred on a jacket, and clamped rather
            than ellipsised on one line: *La storia della mia vita - Spider-Man* is four
            lines here and a single truncated word in a spine. Set in the chrome's own
            grotesque at its normal width — the width axis is for the headings, and a tile
            this narrow needs the letterforms it has rather than tighter ones. */}
        <span className="line-clamp-5 text-balance text-center font-heading text-sm font-medium leading-snug">
          {title}
        </span>
      </span>

      <span className="text-center font-mono text-xs tabular-nums">{foot}</span>
    </Link>
  );
}
