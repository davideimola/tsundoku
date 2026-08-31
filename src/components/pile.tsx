import Link from "next/link";
import { type Tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";

// THE PILE, drawn. The word this application is named after, made visible (#24).
//
// `src/components/mark.tsx` is three spines at 20px, and it says in as many words that this
// is what it is the smallest version of: the same picture at the height of the library's
// actual unread count. Here it is, at that height, and the difference is that **every spine
// in it is a real Story the owner can open**. Sixty-seven of this library's seventy-seven
// Stories have never been read, so the pile is very nearly the whole library, and the honest
// way to say that is not a tile with `67` in it — it is sixty-seven spines, stacked, going on
// past the bottom of the screen.
//
// Three things follow from that and are the whole of the design:
//
//   1. **The height is the figure.** Every spine is drawn, at one height each, so the pile
//      is exactly as tall as the pile is. Nothing is sampled, nothing is capped, and there
//      is no *and 55 more* — a hero drawn from the first twelve would be a picture of a
//      different library, and the discomfort of a stack this tall is the information.
//   2. **It is read from the side, so a spine is a spine.** A thin horizontal bar in its
//      Series' own tint, the title along it, the way a stack of tankōbon reads on a desk.
//      That is why the tile on the walls is `./cover.tsx` and this is not: a wall is faced
//      outwards and a pile is not.
//   3. **The edges are ragged, and deterministically so.** Objects put down one at a time do
//      not stack flush. The lean is a function of the spine's place in the stack, so it is
//      the same on every render and every deploy — a pile that reshuffled itself between two
//      page loads would read as an animation nobody asked for.
//
// It names no colour, and it does not decide how a tint is worn either: that wiring is
// `@/lib/tint`'s, shared with the cover, so an untinted spine and an untinted cover cannot
// come to sit on two different grounds.

/** One object in the pile: the Story it stands for, and the colour of the line it stands in. */
export type PiledStory = {
  id: string;
  /** Where the spine leads. A spine is a way into the Story, which is the point of it. */
  href: string;
  title: string;
  /** The Series' colour, or `null` for a Story that stands in no line — see `@/lib/tint`. */
  tint: Tint | null;
  /** Everything a spine cannot fit: the Type, the line, the edition. */
  detail?: string;
};

/**
 * How far this spine lies off the stack's left edge, and how much shorter it is than the
 * one below it — in pixels, both derived from its place in the stack.
 *
 * Two coprime multipliers over two odd moduli, which is all it takes: the sequence does not
 * visibly repeat down a stack of seventy, and it is arithmetic rather than a table of
 * numbers somebody would have to maintain. Small on purpose — a stack put down without care,
 * not one about to fall over, which is the same judgement `mark.tsx` makes about its tilts.
 */
function lean(place: number): { start: number; end: number } {
  return { start: (place * 5) % 9, end: (place * 7) % 11 };
}

/** The pile: every unread Story, stacked, top of the pile first. */
export function Pile({ stories }: { stories: readonly PiledStory[] }) {
  return (
    // Narrower than the page, because a pile is an object standing on a surface rather than
    // a list filling a column — and left-aligned rather than centred, since the width of
    // this screen belongs to the shell.
    <ol className="max-w-sm">
      {stories.map((story, place) => {
        const off = lean(place);

        return (
          <li key={story.id} style={{ paddingLeft: off.start, paddingRight: off.end }}>
            <Spine story={story} />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One spine.
 *
 * **28px on a phone and 24px at the desk, which is under the 44px the controls on every other
 * screen are drawn at, and that is a decision rather than an oversight.** The pile's job is
 * its mass: sixty-seven spines at a thumb's height would be two and a half metres of page, so
 * the stack would stop being a picture of anything. What buys the compromise is that a spine
 * is a full-width row — there is no horizontal precision to get wrong, only vertical — and
 * that the same Stories are one tap away as covers on the Story wall, at the size a thumb
 * wants. Opening a Story is never something this screen is the only route to.
 *
 * Pulling out to the right on hover rather than lifting, because that is the gesture: an
 * object comes out of a stack sideways.
 */
function Spine({ story }: { story: PiledStory }) {
  return (
    <Link
      href={story.href}
      // Twice, for the reason the cover does it twice: `title` waits under a mouse, and the
      // label is what a screen reader and a touch device get.
      title={story.detail}
      aria-label={story.detail}
      style={worn(story.tint)}
      className={cn(
        "flex h-7 items-center overflow-hidden rounded-sm border border-border px-2 text-foreground sm:h-6",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "motion-safe:transition-transform motion-safe:hover:translate-x-1.5",
        story.tint ? WORN : UNWORN
      )}
    >
      {/* Full ink and nothing quieter, as on the covers: the tint's wall proves the reading
          threshold against `--ink` and against nothing else. */}
      <span className="truncate font-heading text-xs font-medium">{story.title}</span>
    </Link>
  );
}
