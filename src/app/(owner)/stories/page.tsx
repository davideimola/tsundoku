import Link from "next/link";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listStoriesNothingHasHappenedTo,
  listStoryWall,
  type StoryNothingHasHappenedTo,
  type StoryState,
  type StoryWallFilter,
  type WallStory,
} from "@/core/queries/story";
import { listTypes, type Type } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { strike } from "./actions";
import { whatGoesWithIt } from "./nothing-on-it";
import { carriedAs, NOTHING_ON_IT, THE_WALLS_FILTERS } from "./panels";
import { bandName, StoryScore, stateWord, storyDetail, WALL_STATES } from "./story-state";

// THE STORY WALL, and the screen where **the state stopped being a label at the end of a
// row and became the axis of the application** (#22).
//
// Five things are decided here and nowhere else:
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
//   4. **A Story can be recorded from it** (#33), which is the one thing this wall could not
//      do for two tickets: `createStory` had a single caller in the whole repository — the
//      Inbox's approval — so the owner had to have an assistant propose a narrative and then
//      approve it to themselves, or import a spreadsheet. It is a drawer whose open state is
//      the URL like every other form the owner opens deliberately, and it is the *only* act
//      on this screen. Where the press lands afterwards is the point of it: on the Story,
//      because every act that follows recording one is there (`./actions.ts`).
//   5. **And one can be unmade from it** (ADR-0015), which is the act on the other side of
//      that one and the reason this wall now has two drawers. A Story an assistant proposed
//      and the owner approved in a bulk of forty was permanent, so the wall could be *wrong*
//      — two tiles for one narrative — with nothing on the screen to say so. The control is
//      bulk because the mess is, and it lives over **the Stories nothing has happened to**:
//      that list is the safety, since a narrative the owner has read, judged, planned or holds
//      on a shelf is not in it at all. One Story at a time is on the Story's own page, which
//      is the only place the four refusals can be read.
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
 * The URL of a narrowing, which is most of this page's interaction — **and of a drawer
 * standing over it**, which is the rest.
 *
 * Written from the narrowing rather than by editing the query string in place: the two
 * axes are the whole state of this screen, so a link that turns one of them off is the same
 * function as a link that turns one on, and there is no third form for *clear*.
 *
 * The panel is the same one bit of navigation (`@/components/drawer`), which is why it is an
 * argument here rather than a second function: opening the drawer must leave the two filters
 * exactly where they were, and closing it — `wallAt(narrowing)`, with nothing passed — must
 * put the owner back on the wall they had narrowed. One function, so the two cannot disagree.
 */
function wallAt(narrowing: StoryWallFilter, panel?: string): string {
  const search = new URLSearchParams();
  if (narrowing.typeId) search.set("type", narrowing.typeId);
  if (narrowing.state) search.set("state", narrowing.state);
  if (panel) search.set("panel", panel);

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

  // Two questions, and the second is not the first narrowed. The wall is what the owner
  // narrowed; the clean-up list is the residue of approvals that went through in a hurry, and
  // it is read whole — a dozen rows beside seventy-seven — because a filter over a destructive
  // list would be a way to have half of it in front of you and not know.
  const [stories, nothingOnThem] = await Promise.all([
    listStoryWall(narrowing),
    listStoriesNothingHasHappenedTo(),
  ]);
  const narrowed = typeId !== undefined || state !== undefined;

  // Read against the panels this screen has, the way the filters above are read against the
  // vocabulary: `?panel=banana` opens nothing (`./panels.ts`).
  const panel = asked(said, "panel");
  const striking = panel === NOTHING_ON_IT && nothingOnThem.length > 0;
  const refused = asked(said, "refused");
  const struck = asked(said, "struck");

  return (
    <main className="px-5 py-8 sm:px-8 sm:py-12">
      {/* **The act is one screen away, and that is the correction** (#45). Recording a Story
          was a drawer here, recording a Volume a drawer on the Collection, and joining the two a
          picker on a third screen — and a narrative that only ever appears because the owner
          said something about a title has no business having a door of its own. There is one
          door now: a title or a barcode, and *I bought it* / *I read it* / *I want to read it*.
          It is a link rather than a drawer because it is another screen, and it carries no
          filter through because it is not this wall's act. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl">Stories</h1>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            The narrative unit, at whatever granularity was the right one — and where the owner is
            with each one, derived from its Readings on this request and stored nowhere.
          </p>
        </div>

        <div className="w-full sm:w-auto">
          <OpensDrawer href="/add" emphasis="loud">
            Add to the library
          </OpensDrawer>

          {/* The other door, and it is a sentence rather than a second pill — the Collection's
              own judgement about the same pair of acts (`../collection/page.tsx`): what is
              offered here is *a figure to read*, and a screen with two peers at its head has
              stopped saying which of them it is for. Absent entirely when there is nothing on
              the list, which is the ordinary state of a library nobody has approved a
              duplicate into. */}
          {nothingOnThem.length > 0 ? (
            <p className="mt-2 text-pretty text-xs text-muted-foreground sm:text-right">
              <Link
                href={wallAt(narrowing, NOTHING_ON_IT)}
                className="inline-block rounded py-1.5 underline decoration-foreground/25 underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-mono tabular-nums">{nothingOnThem.length}</span> with nothing
                on {nothingOnThem.length === 1 ? "it" : "them"}
              </Link>
            </p>
          ) : null}
        </div>
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

      {/* **The one write on this screen that says so afterwards, and it is the destructive
          one.** Recording a Story answers itself by landing on the Story; striking leaves
          nothing to land on, so the count is the whole of the receipt — and a bulk delete
          that came back silently would be indistinguishable from one that did nothing. The
          refusal is not printed here: it comes back with the panel open over this page and is
          drawn inside it, beside the ticks it is about (`@/components/drawer`). */}
      {struck ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {struck === "1"
            ? "1 Story struck from the library. It does not know that narrative any more."
            : `${struck} Stories struck from the library. It does not know those narratives any more.`}
        </p>
      ) : null}

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

      {/* **THE OTHER DRAWER: the back door the Inbox's front door made necessary** (ADR-0015).
          The Inbox approves in bulk on purpose (ADR-0011), a safeguard exercised forty at a
          time will let things through, and until this panel existed the wall could hold two
          tiles for one narrative for ever.

          It is safe over a list because of what the list *is*: nothing read, nothing judged,
          no Path, and nothing in the house carrying it — so no tick in here can reach a
          narrative the owner has lived with, and the four refusals the verb writes are
          unreachable from this screen by construction. They are readable one Story at a time,
          on the Story's own page, which is the other half of the same decision.

          **It counts itself, and nothing is running in the browser.** The `<ul>` resets a CSS
          counter, every row holding a ticked box increments it, and the button reads the total
          — so a destructive act says how many it is about to take while the owner is still
          ticking. The bar does not exist until something is ticked, and it sticks to the foot
          of the drawer, because a dozen rows are longer than a phone. */}
      {striking ? (
        <Drawer
          title="Nothing has happened to these"
          description="The Stories the library knows and your life does not touch — the residue of proposals approved in a hurry."
          refused={refused}
          closesTo={wallAt(narrowing)}
        >
          {/* One form around the list and the bar, rather than the `form` attribute the
              Collection's rows need: there is no second form in this drawer for a checkbox to
              be mistaken for belonging to. It is the group the bar watches for a tick, and a
              plain `POST`, so it submits with nothing running (ADR-0010). */}
          <form action={strike} className="group/strike">
            {/* The wall as it stands underneath, carried so both answers come back to it: a
                Server Function has no URL to read a filter off. Under a prefixed name, because
                one of the two filters is called `type` (`./panels.ts`). */}
            {THE_WALLS_FILTERS.map((name) => {
              const value = name === "type" ? typeId : state;
              return value ? (
                <input key={name} type="hidden" name={carriedAs(name)} value={value} />
              ) : null;
            })}

            <p className="text-pretty text-sm text-muted-foreground">
              {nothingOnThem.length} {nothingOnThem.length === 1 ? "Story" : "Stories"} nobody has
              read, judged, planned or holds on a shelf. Most of them are the pile and belong here.
              Tick any that were never real — a narrative proposed and approved in a hurry, the same
              title twice — and strike them: the library stops knowing them, and the Credits on each
              go too. Striking is refused on anything you have lived with, and that is said one
              Story at a time on its own page.
            </p>

            {/* Rows rather than tiles, and the difference is the point: a tile is the shelf,
                and this is a list of records. Nothing here wears a Series' tint — what is drawn
                in a colour is what is standing in the library. */}
            <ul className="mt-4 rounded-xl border border-dashed border-border px-4 [counter-reset:ticked]">
              {nothingOnThem.map((story) => (
                <NothingOnItRow key={story.id} story={story} />
              ))}
            </ul>

            <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-4 hidden border-t border-border bg-background/95 px-5 py-4 backdrop-blur group-has-[input:checked]/strike:block">
              {/* The bar is the height of its button and nothing more. What striking refuses
                  is in the paragraph above the list, where it is read *before* anything is
                  ticked. */}
              <Button type="submit" variant="destructive" className="h-11 w-full sm:h-10">
                Strike <span className="font-mono tabular-nums after:[content:counter(ticked)]" />{" "}
                from the library
              </Button>
            </div>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}

/**
 * One Story nothing has happened to, as a row under a tick.
 *
 * **Ticked by the owner, never on arrival** — the opposite of the Inbox's boxes, and the
 * difference is what the gesture does. There the selection approves proposals and arriving
 * ticked is what makes forty of them one act; here it destroys records, and a list that
 * arrived with everything ticked would be one mis-tap from a library.
 *
 * The tap target is the `<label>` rather than the box: the control is 16px and a thumb is not,
 * and this is a list the owner taps down in a row. What each strike takes with it is said in
 * the row, in the words `./nothing-on-it.ts` decides — a bulk delete that only said *how many*
 * would leave *what else* to be discovered a week later.
 */
function NothingOnItRow({ story }: { story: StoryNothingHasHappenedTo }) {
  return (
    <li className="flex items-start gap-3 border-t border-dashed border-border first:border-t-0 has-[:checked]:[counter-increment:ticked]">
      <label className="-ml-2 flex w-11 shrink-0 cursor-pointer items-start justify-center self-stretch pt-3.5 outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <input
          type="checkbox"
          name="strikeId"
          value={story.id}
          aria-label={`Strike ${story.title}, ${story.type.name}, from the library`}
          className="size-4 accent-foreground"
        />
      </label>

      <span className="min-w-0 flex-1 py-3">
        <Link
          href={`/stories/${story.id}`}
          className="block truncate font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {story.title}
        </Link>
        <span className="mt-0.5 block text-pretty text-xs text-muted-foreground">
          {whatGoesWithIt(story)}
        </span>
      </span>

      {/* The Type, because two rows reading *Slam Dunk 5* are told apart by everything except
          their title — and it is the fact the owner narrowed the wall by two inches above. */}
      <Badge variant="outline" className="mt-3 shrink-0 border-dashed">
        {story.type.name}
      </Badge>
    </li>
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
