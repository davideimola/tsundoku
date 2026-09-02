import Link from "next/link";
import { type Tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { PILE } from "./mark";

// THE COVER, which is what a library looks like when it is faced outwards.
//
// **It is not a placeholder for a missing cover — it is the cover, where there is no image
// of one.** Roughly one Volume in ten will never have a jacket to hotlink — concentrated in
// Panini / Planet Manga, and every Bonelli monthly always, because those carry no ISBN at
// all — and until an ISBN is on a row nothing keyed by one can find anything. So the drawn
// tile stays the normal case, designed first rather than left as a gap: a tile in its
// Series' own tint, the title set across it, and the one number worth reading at this size
// at the foot.
//
// It is shaped like the object it stands for — the proportions of an A4 page, near enough
// to a tankōbon faced out — and that is the argument for the shape rather than taste.
// #22 asked for a spine, and a spine is the narrower, handsomer tile; but covers were coming
// (#32 hotlinks them by ISBN), and an image dropped into a tile shaped like a spine would
// either be letterboxed or reflow the whole wall on the day it arrived. A tile the width of
// the thing that fills it changed nothing when it did, which is the whole of what that
// argument bought.
//
// The title runs across rather than up the tile for the same reason it does on a cover:
// this one is read at four words on a phone, and vertical type is read a beat slower for
// no gain once the tile is wide enough to hold a line.
//
// Full ink and nothing quieter is printed on a tint — no muted foreground, no opacity. The
// tint's wall (`src/lib/tint.test.ts`) proves the reading threshold against `--ink` and
// against nothing else, and a quieter grey on a coloured ground clears no threshold at all.
//
// **And the covers arrived** (#32). Where an object is faced with one, the image fills the
// tile and the drawn one is what is underneath it — same tile, same proportions, same place
// on the wall, which is what the tile was shaped like a page for in the first place. Three
// things about how it is drawn are decisions:
//
//   1. **A plain `<img>`, never `next/image`.** The optimizer would fetch the bytes onto our
//      own server and cache them there, which is precisely the permanent copy ADR-0013 says
//      this application may not hold: Google's covers arrive `cache-control: private,
//      max-age=86400` and their terms forbid keeping one longer. So the browser fetches the
//      image from the source, and nothing of it ever lands in the cluster.
//   2. **Lazily, and it may fail.** A cover is 13 KB and a wall is a hundred of them, so
//      everything below the fold waits until it is scrolled to — a shop's signal is the
//      target. An image that 404s leaves the tint showing rather than breaking the wall, and
//      it is repaired by the lookup the owner runs (`@/core/verbs/cover`), never on a render.
//   3. **The foot survives the image.** *Do I have volume 12?* is answered by running a
//      finger along one colour and reading the numbers, and a covered tile that dropped its
//      number would answer it on some tiles and not others. So the number sits on a strip of
//      the page's own ground over the jacket — tokens, not a colour of this file's.

// **And a Story turned out to be a run** (#34). The jacket is still borrowed off the first
// Volume carrying the narrative (`THE_COVER_IT_IS_FACED_OUT_WITH` in `@/core/queries/story`)
// and that has not changed: volume one's cover is how the owner recognises *Slam Dunk*, and a
// stylised substitute would be a downgrade. What was wrong was not the picture but the tile's
// **claim** — a twenty-volume run and a work carried by one Volume were drawn identically, so
// the jacket read as *this object is the work* rather than as *a run, faced with its first
// volume*. So a
// tile standing for several objects is faced out of a stack; see `THE_RUN_BEHIND_IT`.

/** How wide the edge of the Volume nearest the jacket is, in pixels. */
const NEAREST_EDGE = 4;

/** How much of each edge is tucked under the one in front of it, so none of them floats. */
const TUCKED_UNDER = 1;

/**
 * **What is behind a tile standing for a run**: the edges of the other Volumes the jacket is
 * the front of, showing past its right-hand side.
 *
 * Drawn from the mark's own pile (`./mark`), because the application's mark *is* three spines
 * askew and a run behind a jacket had no business being a second, unrelated shape — an offset
 * card with a shadow under it is precisely what this deliberately is not. Two things are taken
 * from it rather than chosen here: the **tilts**, so a stack on a wall lies askew in the
 * degrees the logo already does, and the **proportion** of the widths, wider nearer the front.
 *
 * The pile's widest spine is **the jacket**, and it is the one that stands square: a wall of
 * tilted covers is a broken wall, so the askewness belongs to what is behind the tile being
 * read. Which leaves the two narrower spines as the two edges — read off the widths rather
 * than off positions in the array, because the mark's own wall (`./mark.test.ts`) pins the
 * geometry and says nothing about the order it is written in.
 *
 * Two of them, for the reason the mark is three: counting the jacket, three is the smallest
 * number that reads as a pile rather than as a pair. It says nothing about **how many** objects
 * there are and is not meant to — the tile spends its one figure on the score, and the count is
 * answered on the Story's own page under *Volumes carrying it*.
 */
const THE_RUN_BEHIND_IT = (() => {
  const [, ...narrower] = [...PILE].sort((one, other) => other.width - one.width);
  const nearest = narrower[0];

  return narrower.map((spine, behind) => ({
    key: spine.y,
    /** In the pile's own proportion, the wider spine nearer the jacket. */
    width: `${((spine.width / nearest.width) * NEAREST_EDGE).toFixed(2)}px`,
    /** How far past the jacket's edge it shows, which is its width less what is tucked under. */
    right: `-${(NEAREST_EDGE - TUCKED_UNDER) * (behind + 1)}px`,
    /** Shorter than the jacket, and each one shorter than the last: a pile is not a diagram. */
    inset: `${(behind + 1) * 4}%`,
    /** The pile's own degrees, about the edge's own centre. */
    rotate: `${spine.tilt}deg`,
  }));
})();

export function Cover({
  href,
  title,
  tint,
  foot,
  detail,
  image,
  objects = 1,
}: {
  /**
   * Where the tile leads, or nothing at all where it leads nowhere.
   *
   * A wall always passes one — a tile is a way onto the object, which is the point of a wall.
   * It is absent on **one** screen: the object's own page draws the tile it was tapped as at
   * its head (#30), and a link back to the page you are standing on is a focusable no-op with
   * a hover lift on it. So the tile is drawn without the affordances of a link rather than
   * given a destination it does not have.
   */
  href?: string;
  title: string;
  /** The Series' colour, or `null` for a Story that stands in no line — see `@/lib/tint`. */
  tint: Tint | null;
  /**
   * The one number the tile carries. A node rather than a string because an absent number
   * is not an empty one: what goes here is a figure, or a dash with the reason beside it
   * for anything that is not looking at the page.
   */
  foot: React.ReactNode;
  /** Everything the tile cannot fit: the Type, the Series, the edition. */
  detail?: string;
  /**
   * The image the object is faced with, hotlinked from wherever it lives, or nothing at all
   * — which is still the normal case and is the drawn tile.
   *
   * The resolution between the owner's own image and the looked-up cover is **the core's**
   * (`THE_COVER_IT_IS_FACED_WITH` in `@/core/queries/cover`), not this component's: three
   * walls draw this tile, and a fallback chain each of them decided for itself would be
   * three answers to one question.
   */
  image?: { url: string } | null;
  /**
   * **How many objects this tile stands for**, which decides whether it is faced out of a
   * stack (#34).
   *
   * One by default, and a Volume is always one object — so the Collection's walls pass nothing
   * and are drawn exactly as they were. A Story is what may be several: nought or one is the
   * plain tile, because there is no run to say anything about, and anything more is a run
   * faced with its first volume (`THE_RUN_BEHIND_IT`).
   *
   * A count rather than a flag because the count is what the caller has — the wall reads it
   * off the query, the Story's page counts the carriers it is already holding — and a boolean
   * here would only be that comparison written twice.
   */
  objects?: number;
}) {
  const faced = image ? (
    <>
      {/* biome-ignore lint/performance/noImgElement: ADR-0013 - `next/image` would fetch and
          cache these bytes on our own server, which is the permanent copy the source's terms
          forbid. The whole point is that the browser goes to them and we keep nothing. */}
      <img
        src={image.url}
        // Empty, because the tile already carries the accessible name: `detail` opens with
        // the title, and a screen reader announcing the jacket as well would say it twice.
        alt=""
        loading="lazy"
        decoding="async"
        // What page the owner is looking at is not the source's business. It does not hide
        // which book was asked for - that is the URL - but it hands over nothing else.
        referrerPolicy="no-referrer"
        className="absolute inset-0 size-full object-cover"
      />
      <span className="relative mt-auto self-center rounded-sm bg-background/85 px-1.5 py-0.5 text-center font-mono text-xs tabular-nums text-foreground">
        {foot}
      </span>
    </>
  ) : null;

  const drawn = faced ?? (
    <>
      <span className="flex min-h-0 flex-1 items-center justify-center">
        {/* Centred on the tile the way a title is centred on a jacket, and clamped rather
            than ellipsised on one line: *La storia della mia vita - Spider-Man* is four
            lines here and a single truncated word in a spine. Set in the chrome's own
            grotesque at its normal width — the width axis is for the headings, and a tile
            this narrow needs the letterforms it has rather than tighter ones.

            Held to the height of the tile as well as to five lines, because the two are not
            the same limit: five lines of this face are taller than a 4rem tile (#31 stood
            nineteen of them beside a shopping list), and a centred block taller than what
            holds it loses as much off the top as off the bottom — *Batman di Jeph Loeb e Tim
            Sale* drawn as *di Jeph Loeb e Ti…*. Clipped at the foot, a title still starts
            with the word the owner is looking for. */}
        <span className="line-clamp-5 max-h-full overflow-hidden text-balance text-center font-heading text-sm font-medium leading-snug">
          {title}
        </span>
      </span>

      <span className="text-center font-mono text-xs tabular-nums">{foot}</span>
    </>
  );

  // 210 by 297: the page the tile is pretending to be, written as the paper size rather
  // than as a decimal nobody could look up.
  const shape = cn(
    "relative flex aspect-[210/297] flex-col justify-between gap-2 overflow-hidden rounded-sm border border-border p-2.5 text-foreground",
    // A faced tile keeps its tint underneath the image, deliberately: the jacket is 128px
    // wide and is being stretched over the tile, so the moment it is slow, broken or
    // withdrawn the Series' own colour is what is there rather than a hole in the wall.
    tint ? WORN : UNWORN
  );

  const tile = !href ? (
    <span title={detail} aria-label={detail} style={worn(tint)} className={shape} role="img">
      {drawn}
    </span>
  ) : (
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
        shape,
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Lifting off the shelf on hover, and only where the owner has not asked things to
        // stay still (user story 67).
        "motion-safe:transition-transform motion-safe:hover:-translate-y-1"
      )}
    >
      {drawn}
    </Link>
  );

  // One object is the tile and nothing else, which is most of this library: twenty-four of
  // its thirty-one Stories are carried by a single Volume, and none of them gains a pixel.
  if (objects <= 1) return tile;

  // A run, faced with its first volume. The edges are **siblings of the tile rather than
  // anything inside it** — the tile clips its own contents so the jacket cannot spill, and
  // what is behind the jacket has to show past that edge. They are painted first and the
  // positioned tile follows in document order, which is what puts them behind it without a
  // z-index; the hover lift then takes the jacket off the pile it is standing on, which is
  // the gesture and not a second decoration. The tint travels on the wrapper, so the edges
  // are the same colour as the tile by inheriting it rather than by asking again.
  return (
    <span className="relative block" style={worn(tint)}>
      {THE_RUN_BEHIND_IT.map((edge) => (
        <span
          key={edge.key}
          // Decoration of a fact the tile already carries: the accessible name is `detail`,
          // and *how many objects* is a sentence on the Story's own page rather than a thing
          // to announce three times on a wall.
          aria-hidden="true"
          style={{
            width: edge.width,
            right: edge.right,
            top: edge.inset,
            bottom: edge.inset,
            rotate: edge.rotate,
          }}
          className={cn(
            "pointer-events-none absolute rounded-sm border border-border",
            tint ? WORN : UNWORN
          )}
        />
      ))}
      {tile}
    </span>
  );
}
