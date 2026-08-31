import Link from "next/link";
import type { Tint } from "@/lib/tint";
import { cn } from "@/lib/utils";

// THE SPINE, which is what a library looks like when it is standing up.
//
// **It is not a placeholder for a missing cover.** With 0 of 96 Volumes carrying an ISBN
// (#18) a cover is the exception and this is the normal case, so it is designed first: a
// tall tile in its Series' own tint, the title set the way a title is set on a spine, and
// the one number worth reading at this size at the foot. A cover, if one ever arrives,
// simply covers it.
//
// The title runs top to bottom rather than bottom to top, which is how the spines on the
// owner's own shelf are printed: Italian and English books are read with the head of the
// book to the left, and the glyphs rotate with the line rather than standing on end.
//
// Full ink and nothing quieter is printed on a tint — no muted foreground, no opacity. The
// tint's wall (`src/lib/tint.test.ts`) proves the reading threshold against `--ink` and
// against nothing else, and a quieter grey on a coloured ground clears no threshold at all.

export function Spine({
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
      // The two grounds are not a filter over each other, so the tint carries both and the
      // sheet's own dark variant picks one. A tile with no tint falls back to the palette's
      // quiet paper, which is legible by construction (`src/app/palette.test.ts`).
      style={
        tint
          ? ({ "--tint": tint.paper, "--tint-dark": tint.dark } as React.CSSProperties)
          : undefined
      }
      className={cn(
        "flex aspect-[2/5] flex-col justify-between gap-2 overflow-hidden rounded-sm border border-border p-2 text-foreground",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Lifting off the shelf on hover, and only where the owner has not asked things to
        // stay still (user story 67).
        "motion-safe:transition-transform motion-safe:hover:-translate-y-1",
        tint ? "bg-[var(--tint)] dark:bg-[var(--tint-dark)]" : "bg-muted"
      )}
    >
      <span className="flex min-h-0 flex-1 justify-center overflow-hidden">
        {/* The width axis Archivo was bought for (#19): a spine is the narrowest thing in
            the application, and setting it in the same family as the headings is what keeps
            the shelf in one voice. Ellipsised along the block axis, which in vertical text
            is the height — so a long title runs out at the foot rather than overflowing. */}
        <span className="max-h-full overflow-hidden text-ellipsis whitespace-nowrap font-heading text-sm font-medium font-stretch-semi-condensed [writing-mode:vertical-rl]">
          {title}
        </span>
      </span>

      <span className="text-center font-mono text-xs tabular-nums">{foot}</span>
    </Link>
  );
}
