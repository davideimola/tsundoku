import Link from "next/link";
import { type Tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";

// THE PILE, drawn. The word this application is named after, made visible (#24).
//
// `src/components/mark.tsx` is three spines at 20px, and it says in as many words that this
// is what it is the smallest version of: the same picture at the size of the library's actual
// unread count. Here it is, at that size, and the difference is that **every spine in it is a
// real Story the owner can open**. Sixty-seven of this library's seventy-seven Stories have
// never been read, so the pile is very nearly the whole library, and the honest way to say
// that is not a tile with `67` in it — it is sixty-seven spines, stacked.
//
// Four things follow from that and are the whole of the design:
//
//   1. **The extent is the figure.** Every spine is drawn, at one height each. Nothing is
//      sampled, nothing is capped, and there is no *and 55 more* — a hero drawn from the
//      first twelve would be a picture of a different library.
//   2. **One pile on a phone, several at the desk, and the mass is the same either way.**
//      Sixty-seven spines in a single column is 1,900px: on a phone that is the object, held
//      in the hand and scrolled past, and it is the reading the word *tsundoku* is about. At
//      a desk it is not a picture at all, it is a scroll — and the width is sitting there
//      empty beside it. So the stack folds into as many piles as the window holds, the way a
//      real shelf takes a run of books that outgrew one stack. What is folded is the
//      *drawing*; what is not is the count, because folding a stack does not shorten it.
//   3. **It is read from the side, so a spine is a spine.** A thin horizontal bar in its
//      Series' own tint, the title along it, the way a stack of tankōbon reads on a desk.
//      That is why the tile on the walls is `./cover.tsx` and this is not: a wall is faced
//      outwards and a pile is not.
//   4. **The edges are ragged, and deterministically so.** Objects put down one at a time do
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

/**
 * The pile: every unread Story, stacked — one stack on a phone, and folded into as many as
 * the window holds at the desk.
 *
 * **CSS columns rather than chunked arrays, and the reason is the responsiveness.** How many
 * piles there are is a question about the width of the window, which the server rendering this
 * does not know; splitting the list into *n* arrays would mean either picking one *n* for every
 * screen or rendering the stack two or three times over and hiding all but one. Multi-column
 * asks the browser, which is the only party that can answer, and it does it with nothing
 * running in the browser — the same standard every filter on every wall in this app is held to
 * (ADR-0010).
 *
 * The order survives the folding: the spines run down the first pile, then down the next, so
 * *Berserk* is still at the top-left and the titles still read in order. Capped at four,
 * because past that the columns are shorter than they are wide and a pile stops looking like
 * one.
 *
 * What this costs, at sixty-seven spines: 1,876px in one stack on a phone, 816 in two, 552 in
 * three, 408 in four. The count on the heading above it is what carries the figure exactly;
 * the drawing is what makes it a quantity somebody feels.
 */
export function Pile({ stories }: { stories: readonly PiledStory[] }) {
  return (
    <ol
      className={cn(
        // One stack on a phone, and narrower than the page there — a pile is an object standing
        // on a surface rather than a list filling a column. The cap comes off from `sm` up,
        // where the point is to spend the width the shell handed over.
        "max-w-sm sm:max-w-none",
        // The fourth pile waits for `2xl` rather than `xl`: at 1280px the sidebar has taken
        // 15rem and four columns are ~230px each, which truncates more of the titles than it
        // buys in height. Three at ~310px is the better trade until the window is genuinely
        // wide.
        "columns-1 gap-x-5 sm:columns-2 lg:columns-3 2xl:columns-4"
      )}
    >
      {stories.map((story, place) => {
        const off = lean(place);

        return (
          <li
            key={story.id}
            // Nothing may be split down the middle by a column break: half a spine at the foot
            // of one pile and half at the head of the next is the one way this drawing could
            // read as a rendering error.
            className="break-inside-avoid"
            style={{ paddingLeft: off.start, paddingRight: off.end }}
          >
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
