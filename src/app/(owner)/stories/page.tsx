import Link from "next/link";
import { Cover } from "@/components/cover";
import {
  listStoryWall,
  type StoryState,
  type StoryWallFilter,
  type WallStory,
} from "@/core/queries/story";
import { listTypes, type Type } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { bandName, StoryScore, stateWord, storyDetail, WALL_STATES } from "./story-state";

// THE STORY WALL, and the screen where **the state stopped being a label at the end of a
// row and became the axis of the application** (#22).
//
// Three things are decided here and nowhere else:
//
//   1. **The library is looked at rather than read.** Seventy-seven rows of text became a
//      wall of covers, each in its Series' own tint (`@/lib/tint`). The tint is derived
//      from the Series' identity, so it is the same on every deploy and the owner can learn
//      it; a Story that stands in no line gets a legible tile rather than a gap.
//   2. **The wall is split by state** — reading, the pile, read, abandoned — which is the
//      one genuinely good idea in Goodreads, derived here from the Readings on this request
//      instead of maintained by hand.
//   3. **Narrowing is a `GET`, and the state is in the URL.** Every control on this page is
//      a link: the narrowed wall is bookmarkable, survives a refresh, and works with
//      nothing running in the browser — which is what a screen used on a shop's signal
//      needs (ADR-0010). The filter is an argument to the core query, so a narrowed wall
//      reads only what it shows and never seventy-seven rows to keep four.
//
// A thin adapter over two queries, like every page here (ADR-0002): no SQL, no pool, no
// domain logic, and no colour of its own — the one on screen is the library's.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * The URL of a narrowing, which is the whole of this page's interaction.
 *
 * Written from the narrowing rather than by editing the query string in place: the two
 * axes are the whole state of this screen, so a link that turns one of them off is the same
 * function as a link that turns one on, and there is no third form for *clear*.
 */
function wallAt(narrowing: StoryWallFilter): string {
  const search = new URLSearchParams();
  if (narrowing.typeId) search.set("type", narrowing.typeId);
  if (narrowing.state) search.set("state", narrowing.state);

  const query = search.toString();
  return query === "" ? "/stories" : `/stories?${query}`;
}

export default async function Stories({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const [said, types] = await Promise.all([searchParams, listTypes()]);

  // Read against the vocabulary rather than trusted. A hand-edited `?type=banana` narrows
  // to nothing in the core, which is honest, but the *controls* would then be marking a
  // filter that names no Type — so what the screen shows as on is only ever a Type that
  // exists and one of the four states.
  const wanted = asked(said, "type");
  const typeId = types.find((type) => type.id === wanted)?.id;
  const state = WALL_STATES.find((one) => one === asked(said, "state"));
  const narrowing: StoryWallFilter = { typeId, state };

  const stories = await listStoryWall(narrowing);
  const narrowed = typeId !== undefined || state !== undefined;

  return (
    <main className="px-5 py-8 sm:px-8 sm:py-12">
      <header>
        <h1 className="font-heading text-2xl sm:text-3xl">Stories</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          The narrative unit, at whatever granularity was the right one — and where the owner is
          with each one, derived from its Readings on this request and stored nowhere.
        </p>
      </header>

      <div className="mt-6 space-y-2 border-y border-border py-3">
        <Axis label="Type">
          <Chip href={wallAt({ state })} on={typeId === undefined}>
            All
          </Chip>
          {types.map((type) => (
            <Chip key={type.id} href={wallAt({ state, typeId: type.id })} on={typeId === type.id}>
              {type.name}
            </Chip>
          ))}
        </Axis>

        <Axis label="State">
          <Chip href={wallAt({ typeId })} on={state === undefined}>
            All
          </Chip>
          {WALL_STATES.map((one) => (
            <Chip key={one} href={wallAt({ typeId, state: one })} on={state === one}>
              {stateWord(one)}
            </Chip>
          ))}
        </Axis>
      </div>

      {/* What is on, and the one gesture that turns it all off. Absent entirely when the
          wall is whole, because a *clear* on an unnarrowed wall is a control that does
          nothing and a reason to wonder what it did. */}
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {stories.length} {stories.length === 1 ? "Story" : "Stories"}
          {narrowed ? " here" : " in the library"}
        </span>
        {narrowed ? (
          <Link
            href="/stories"
            className="font-mono text-eyebrow uppercase tracking-eyebrow underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </Link>
        ) : null}
      </p>

      {stories.length === 0 ? (
        <p className="mt-10 max-w-prose text-pretty text-sm text-muted-foreground">
          {narrowed ? emptily(typeId, state, types) : NOTHING_YET}
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {WALL_STATES.map((one) => (
            <Band key={one} state={one} stories={stories.filter((story) => story.state === one)} />
          ))}
        </div>
      )}
    </main>
  );
}

/**
 * One band of the wall: the Stories in one state, standing up.
 *
 * An empty band is dropped rather than drawn as a heading over nothing — this library has
 * ten Stories read and sixty-seven in the pile, and four headings with three of them empty
 * would say less than one.
 *
 * The **grouping** is the screen's and the **narrowing** is the query's, which is the whole
 * of the distinction: a band is where an answer is drawn, and a filter decides what is
 * asked for. A wall showing one state fetched one state.
 */
function Band({ state, stories }: { state: StoryState; stories: WallStory[] }) {
  if (stories.length === 0) return null;

  return (
    <section aria-labelledby={`band-${state}`}>
      <h2
        id={`band-${state}`}
        className="flex items-baseline gap-3 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground"
      >
        {bandName(state)}
        <span className="tabular-nums">{stories.length}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </h2>

      {/* As many covers as the window holds, at the width a title is legible across. The
          wall is the same object on a phone and at the desk — fewer per row, never a
          second layout to maintain — and two of them fit a phone held one-handed. */}
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 sm:gap-4">
        {stories.map((story) => (
          <li key={story.id}>
            <Cover
              href={`/stories/${story.id}`}
              title={story.title}
              tint={tint(story.series?.id)}
              detail={storyDetail(story)}
              foot={<StoryScore of={story.latestScore} />}
              // Borrowed off the first Volume that carries it: a Story is a narrative and has
              // no ISBN of its own, so the jacket it wears is an object's (ADR-0001, #32).
              image={story.cover}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const NOTHING_YET =
  "No Stories yet. Record one, and its state follows from the Readings you give it.";

/**
 * Why the wall came back empty, said in the words it was narrowed by.
 *
 * Written per case rather than once, because *"no Story is both of those things"* is a
 * sentence about two filters and the owner may only have set one — and a screen that says
 * *both* over a single filter is a screen that has stopped reading its own state. The band
 * is named rather than the state worded, because *no Novel is reading* says that a novel
 * is doing the reading.
 */
function emptily(typeId: string | undefined, state: StoryState | undefined, types: Type[]) {
  const type = types.find((one) => one.id === typeId)?.name;

  if (type && state) return `Nothing in ${bandName(state)} is a ${type}. Clear one, or both.`;
  if (type) return `No Story is a ${type} yet.`;
  if (state) return `${bandName(state)} is empty. Clear the filter to see the whole wall.`;

  // Unreachable — the caller asks only when something is narrowed — and answered rather
  // than thrown, because an empty wall is never the place to raise.
  return NOTHING_YET;
}

/** One axis of the narrowing: what it is called, and the values it offers. */
function Axis({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="w-11 shrink-0 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * One value of one axis, as a link.
 *
 * A link and never a control that needs a script: this is the pattern every wall after this
 * one follows (#18). The one that is on is marked for the eye and with `aria-current`, and
 * it still leads somewhere — to itself — because a chip that stopped being clickable when
 * it was chosen would be a target that moves under the thumb.
 */
function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={cn(
        "rounded-full border px-2.5 py-1 font-mono text-eyebrow uppercase tracking-eyebrow transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "border-foreground bg-accent text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
