import Link from "next/link";
import { BINDING, type Tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";

// THE COVER, which is what a library looks like when it is faced outwards.
//
// **The covers are the heart of the application, so they are shown clean** (ADR-0026, second
// tranche). Every tile on every screen — the walls, the Pile, a Series, a Wish, a stop on a
// Path, the hero a detail page opens with — is this one component, and it is one shape:
//
//   - **Two by three**, `object-fit: cover`, a four-pixel corner, the soft shadow a book
//     throws on a shelf and the crease where the board meets the spine. No per-Type shape and
//     no tile taller than its neighbours: a row of covers is read along its top edge.
//   - **Nothing is printed over a real jacket.** Not the Binding, not the Type, not the score,
//     not a dash for a score nobody gave, not the title in a strip and not a volume number.
//     The jacket *is* the title, and anything laid over it is a label stuck on somebody's
//     book. What a tile cannot say goes under it, as at most one quiet line (`caption`), and
//     only where that line carries meaning — how far a pass has got, how many stories a
//     volume binds, which number of a Series this is. Everything else is the detail page's.
//   - **Where there is no jacket the cover is drawn**, and it is still the cover rather than a
//     placeholder for one: the Series' cloth (`@/lib/tint`), a darker headband across its
//     head, and the title stamped in the serif in the middle, light on deep. Roughly one Volume
//     in ten will never have a jacket to hotlink — every Bonelli monthly, most of Panini — so
//     the drawn cover is a normal case and is designed as one.
//
// Three things about the jacket are decisions rather than taste, and they are unchanged:
//
//   1. **A plain `<img>`, never `next/image`.** The optimizer would fetch the bytes onto our
//      own server and cache them there, which is precisely the permanent copy ADR-0013 says
//      this application may not hold. The browser fetches the image from the source, and
//      nothing of it ever lands in the cluster.
//   2. **Lazily, and it may fail.** A jacket that 404s must leave a cover rather than a hole.
//      So the drawn cover is always rendered **underneath** the image, and the image carries
//      an empty `alt`: a browser draws nothing at all for a broken decorative image, so the
//      drawn cover is what shows — with no script, which is the point (ADR-0010). A broken
//      jacket is repaired by the lookup the owner runs (`@/core/verbs/cover`), never here.
//   3. **What page the owner is on is not the source's business**: `no-referrer`.

/**
 * How big a cover is drawn, which decides only what the drawn one can carry and how the image
 * is fetched — never the shape.
 *
 *   - `tile`: a wall's tile, as wide as its grid column.
 *   - `thumb`: the small cover at the head of a row (40–52px), where the drawn title is
 *     decoration and the row's own serif name is what is read.
 *   - `hero`: the one large cover a detail page opens with. Fetched eagerly, because it is
 *     the first thing on the page, and thrown a deeper shadow.
 */
export type CoverSize = "tile" | "thumb" | "hero";

export function Cover({
  href,
  title,
  tint,
  image,
  label,
  caption,
  progress,
  stacked = false,
  size = "tile",
  className,
}: {
  /**
   * Where the tile leads, or nothing at all where it leads nowhere — the hero on the object's
   * own page, where a link back to the page you are standing on is a focusable no-op.
   */
  href?: string;
  /** The name of the thing, stamped on a drawn cover. Never printed over a jacket. */
  title: string;
  /** The Series' cloth, or `null` where there is no line to take one from (`@/lib/tint`). */
  tint: Tint | null;
  /**
   * The image the object is faced with, hotlinked from wherever it lives, or nothing — which
   * is the drawn cover. The resolution between the owner's own image and a looked-up one is
   * the core's (`THE_COVER_IT_IS_FACED_WITH`), never this component's.
   */
  image?: { url: string } | null;
  /**
   * The accessible name, and the tooltip: everything the tile cannot fit, opening with the
   * title so a screen reader starts with the word the owner is looking for. Defaults to the
   * title.
   */
  label?: string;
  /** At most one quiet line under the tile, where it carries meaning. */
  caption?: React.ReactNode;
  /**
   * How far through it the owner is, from nought to one, drawn as a thin gilt line under the
   * cover — gilt because it is progress (`src/app/globals.css`). Absent where the work is not
   * counted in parts, which is the ordinary case: no line, rather than a line at nought.
   */
  progress?: number | null;
  /**
   * **Faced out of a stack of paper**: two sheets offset behind the cover. It says *there is
   * more than one thing behind this jacket* — several Stories bound in the one Volume — and
   * the caption under it says how many.
   */
  stacked?: boolean;
  size?: CoverSize;
  className?: string;
}) {
  const name = label ?? title;

  const face = (
    <span
      className={cn(
        "@container relative block aspect-[2/3] w-full overflow-hidden rounded-[4px]",
        size === "hero" ? BINDING.hero : BINDING.shadow,
        href && BINDING.lifted,
        tint ? WORN : cn(UNWORN, "text-foreground")
      )}
      style={worn(tint)}
    >
      {/* The drawn cover, always, and under the jacket where there is one: it is what shows
          when the jacket is slow, broken or withdrawn. Hidden from a screen reader, because
          the tile already carries its name. */}
      <span aria-hidden="true" className="absolute inset-0 flex flex-col">
        <span className={cn("h-[7%] shrink-0", BINDING.headband)} />
        <span className="flex min-h-0 flex-1 items-center justify-center p-[9%]">
          {size === "thumb" ? null : (
            <span className="line-clamp-6 max-h-full overflow-hidden text-balance text-center font-heading text-[clamp(0.625rem,11cqi,1.5rem)] font-semibold leading-[1.15]">
              {title}
            </span>
          )}
        </span>
      </span>

      {image ? (
        // biome-ignore lint/performance/noImgElement: ADR-0013 - `next/image` would fetch and cache these bytes on our own server, which is the permanent copy the source's terms forbid.
        <img
          src={image.url}
          alt=""
          loading={size === "hero" ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}

      {/* The crease, over whatever the face is, so a jacket and a cloth fold in one place. */}
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 rounded-[4px]", BINDING.crease)}
      />
    </span>
  );

  const body = (
    <>
      <span className="relative block">
        {stacked ? <Sheets /> : null}
        {face}
      </span>

      {progress != null ? (
        <span aria-hidden="true" className="mt-2 block h-0.5 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-gilt"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </span>
      ) : null}

      {caption ? (
        <span className="mt-1.5 block text-pretty text-xs leading-snug text-muted-foreground">
          {caption}
        </span>
      ) : null}
    </>
  );

  if (!href) {
    return (
      <span role="img" aria-label={name} title={name} className={cn("block", className)}>
        {body}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={name}
      title={name}
      className={cn(
        "group/cover block rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        // Off the shelf on hover, and only where the owner has not asked things to stay still.
        "motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-0.5",
        className
      )}
    >
      {body}
    </Link>
  );
}

/**
 * The two sheets a stacked cover is faced out of: offset up and to the right, each a step
 * quieter than the one in front of it, so a jacket with several Stories behind it reads as a
 * small stack of paper rather than as one book. The paper's own tokens, so the stack sits in
 * the dark room as well as on the page.
 */
function Sheets() {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-1.5 -translate-y-[5px] rounded-[4px] bg-muted ring-1 ring-border"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-[3px] -translate-y-[2.5px] rounded-[4px] bg-border ring-1 ring-border"
      />
    </>
  );
}
