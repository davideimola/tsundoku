import Link from "next/link";
import { ownsItsCover } from "@/components/bound-together";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
// The chips are a control two walls share now, so there is one of them (#64,
// `@/components/narrowing`): this wall narrows by Type and state, and the Pile narrows by Type.
import { Axis, Chip, Views } from "@/components/narrowing";
import { RatingMark, scoreSaid } from "@/components/rating-mark";
import { StackSheet, StoryShelf, theOpenStack } from "@/components/story-shelf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type HowFarItGot,
  type LastEnding,
  listLastEndings,
  listRunsInProgress,
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
import { strike } from "./actions";
import {
  lastThroughInAMonth,
  lastThroughInAYear,
  latestFirst,
  type View,
  viewAsked,
} from "./diary";
import { whatGoesWithIt } from "./nothing-on-it";
import { carriedAs, NOTHING_ON_IT, THE_WALLS_FILTERS } from "./panels";
import { bandName, storyDetail, WALL_STATES } from "./story-state";

// THE STORY WALL, and the screen where **the state stopped being a label at the end of a
// row and became the axis of the application** (#22).
//
// Five things are decided here and nowhere else:
//
//   1. **The library is looked at rather than read.** Seventy-seven rows of text became a
//      wall of covers, each in its Series' own tint (`@/lib/tint`). The tint is derived
//      from the Series' identity, so it is the same on every deploy and the owner can learn
//      it; a Story that stands in no line gets a legible tile rather than a gap.
//   2. **The wall is split by state** — under way, not started, finished, abandoned — which
//      is the one genuinely good idea in Goodreads, derived here from the Passes on this request
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
function wallAt(narrowing: Wall, panel?: string, bound?: string): string {
  const search = new URLSearchParams();
  if (narrowing.typeId) search.set("type", narrowing.typeId);
  if (narrowing.state) search.set("state", narrowing.state);
  // How the settled bands are laid out (`./diary.ts`): carried by every address on the wall,
  // and absent where it is the default, so the plain wall is still `/stories`.
  if (narrowing.view && narrowing.view !== "list") search.set("view", narrowing.view);
  if (panel) search.set("panel", panel);
  // A stack of Stories bound in one Volume, open over the wall: the same one bit of
  // navigation as a panel, under its own name because it carries which stack.
  if (bound) search.set("bound", bound);

  const query = search.toString();
  return query === "" ? "/stories" : `/stories?${query}`;
}

/** What the owner is looking at: the two filters, and how the settled bands are laid out. */
type Wall = StoryWallFilter & { view?: View };

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
  const view = viewAsked(asked(said, "view"));
  const looking: Wall = { ...narrowing, view };

  // Two questions, and the second is not the first narrowed. The wall is what the owner
  // narrowed; the clean-up list is the residue of approvals that went through in a hurry, and
  // it is read whole — a dozen rows beside seventy-seven — because a filter over a destructive
  // list would be a way to have half of it in front of you and not know.
  //
  // The other two are what makes the wall a diary rather than a second shelf: **what is about
  // the owner** under each tile. How far a run in hand has got is the core's own answer to
  // *seven of twenty* (the one Home's *Under way* reads), and when each Story was last gone
  // through is asked under the wall's own narrowing.
  const [stories, nothingOnThem, runs, endings] = await Promise.all([
    listStoryWall(narrowing),
    listStoriesNothingHasHappenedTo(),
    listRunsInProgress(),
    listLastEndings(narrowing),
  ]);
  const says: Diary = {
    howFar: new Map(runs.map((run) => [run.story.id, run.howFarItGot])),
    endings: new Map(endings.map((ending) => [ending.storyId, ending])),
    verbPast: new Map(types.map((type) => [type.id, type.verbPast])),
  };
  const narrowed = typeId !== undefined || state !== undefined;
  const firstSettled = WALL_STATES.find(
    (one) => settled(one) && stories.some((story) => story.state === one)
  );

  // Read against the panels this screen has, the way the filters above are read against the
  // vocabulary: `?panel=banana` opens nothing (`./panels.ts`).
  const panel = asked(said, "panel");
  const striking = panel === NOTHING_ON_IT && nothingOnThem.length > 0;
  const refused = asked(said, "refused");
  const struck = asked(said, "struck");

  // The stack the URL opens, looked for band by band — the bands are where tiles are bound,
  // so a key is only ever a stack inside one of them.
  const bound = asked(said, "bound");
  const stack =
    WALL_STATES.map((one) =>
      theOpenStack(
        stories.filter((story) => story.state === one),
        bound
      )
    ).find((found) => found !== null) ?? null;

  return (
    <main className="px-5 py-8 sm:px-8 sm:py-12">
      {/* **The act is one screen away, and that is the correction** (#45). Recording a Story
          was a drawer here, recording a Volume a drawer on the Collection, and joining the two a
          picker on a third screen — and a narrative that only ever appears because the owner
          said something about a title has no business having a door of its own. There is one
          door now: a title or a barcode, and *I bought it* / *I want to buy it* / *I read it* /
          *I want to read it*.
          It is a link rather than a drawer because it is another screen, and it carries no
          filter through because it is not this wall's act. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-title font-semibold lg:text-title-lg">Stories</h1>
          <p className="mt-2 text-pretty text-base text-muted-foreground">
            What you have read, played, or mean to.
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
                href={wallAt(looking, NOTHING_ON_IT)}
                className="inline-block rounded-sm py-1.5 text-sm font-medium underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="tabular-nums">{nothingOnThem.length}</span> with nothing on{" "}
                {nothingOnThem.length === 1 ? "it" : "them"}
              </Link>
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-6 space-y-2 border-y border-border py-3">
        <Axis label="Type">
          <Chip href={wallAt({ state, view })} on={typeId === undefined}>
            All
          </Chip>
          {types.map((type) => (
            <Chip
              key={type.id}
              href={wallAt({ state, typeId: type.id, view })}
              on={typeId === type.id}
            >
              {type.name}
            </Chip>
          ))}
        </Axis>

        <Axis label="State">
          <Chip href={wallAt({ typeId, view })} on={state === undefined}>
            All
          </Chip>
          {WALL_STATES.map((one) => (
            <Chip key={one} href={wallAt({ typeId, state: one, view })} on={state === one}>
              {bandName(one)}
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
            ? "1 Story struck from the library."
            : `${struck} Stories struck from the library.`}
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
            href={wallAt({ view })}
            className="rounded-sm text-sm font-medium text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
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
            <Band
              // The switch stands over the first settled band on the wall and only there: it
              // lays out both, and two of them would read as two settings.
              first={one === firstSettled}
              key={one}
              state={one}
              stories={stories.filter((story) => story.state === one)}
              opens={(key) => wallAt(looking, undefined, key)}
              says={says}
              view={view}
              views={
                <Views
                  label="How finished and abandoned Stories are laid out"
                  options={[
                    {
                      said: "List",
                      href: wallAt({ ...narrowing, view: "list" }),
                      on: view === "list",
                    },
                    {
                      said: "Covers",
                      href: wallAt({ ...narrowing, view: "covers" }),
                      on: view === "covers",
                    },
                  ]}
                />
              }
            />
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
      {stack ? <StackSheet stack={stack} closesTo={wallAt(looking)} /> : null}

      {striking ? (
        <Drawer
          title="Nothing has happened to these"
          description="Stories nobody has read, judged, planned or holds on a shelf."
          refused={refused}
          closesTo={wallAt(looking)}
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
              const value =
                name === "type"
                  ? typeId
                  : name === "state"
                    ? state
                    : view === "covers"
                      ? view
                      : null;
              return value ? (
                <input key={name} type="hidden" name={carriedAs(name)} value={value} />
              ) : null;
            })}

            <p className="text-pretty text-sm text-muted-foreground">
              Most of these are the pile and belong here. Tick any that were never real, such as the
              same title twice, and strike them. Their Credits go with them.
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
                Strike <span className="tabular-nums after:[content:counter(ticked)]" /> from the
                library
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
          className="block truncate font-heading text-lg font-semibold leading-snug underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {story.title}
        </Link>
        <span className="mt-0.5 block text-pretty text-label text-muted-foreground">
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
 * What the wall says about **the owner** under a tile — the half of the screen that makes it a
 * diary rather than a second shelf. Read once per request and handed to every band.
 */
type Diary = {
  /** How far a run in hand has got, by Story, where it is counted in parts. */
  howFar: ReadonlyMap<string, HowFarItGot>;
  /** When each Story was last gone through to an end, where a day was written down. */
  endings: ReadonlyMap<string, LastEnding>;
  /** What going through each Type is called — *read*, *played* — by Type id. */
  verbPast: ReadonlyMap<string, string>;
};

/** Whether a band is settled: what is over, finished or given up on. */
function settled(state: StoryState): boolean {
  return state === "read" || state === "abandoned";
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
 *
 * **What stands under a tile is about the owner, never about the object** — that is the
 * Collection's, which says a Volume's number and its Binding. Under way, how far it has got;
 * finished, the bookmark and the year it was last gone through. A settled band is read the way
 * a diary is, the most recent first, and can be laid out as rows (`./diary.ts`).
 */
function Band({
  state,
  stories,
  opens,
  says,
  view,
  views,
  first,
}: {
  /** Whether this is the first settled band on the wall, which carries the switch. */
  first: boolean;
  state: StoryState;
  stories: WallStory[];
  /** This wall's own address with a stack open on it. */
  opens: (key: string) => string;
  says: Diary;
  view: View;
  /** The control that switches a settled band between covers and rows. */
  views: React.ReactNode;
}) {
  if (stories.length === 0) return null;

  const isSettled = settled(state);
  const inOrder = isSettled ? latestFirst(stories, says.endings) : stories;

  return (
    <section aria-labelledby={`band-${state}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2
          id={`band-${state}`}
          className="flex items-baseline gap-2.5 font-heading text-section font-semibold"
        >
          {bandName(state)}
          <span className="font-sans text-sm font-normal text-muted-foreground tabular-nums">
            {stories.length}
          </span>
        </h2>
        {isSettled && first ? views : null}
      </div>

      <div className="mt-4">
        {isSettled && view === "list" ? (
          <DiaryRows stories={inOrder} state={state} says={says} />
        ) : (
          /* Covers, and nothing printed on them: the jacket is the title, and the name is
             the tile's accessible name. Stories bound in one Volume stand as one stack
             (`@/components/story-shelf`). The same grid on a phone and at the desk — fewer
             per row, never a second layout. */
          <StoryShelf
            stories={inOrder}
            opens={opens}
            label={(story) => saidOf(story, says)}
            progress={
              state === "reading"
                ? (story) => {
                    const far = says.howFar.get(story.id);
                    return far ? far.atInstalment / far.instalments : null;
                  }
                : undefined
            }
            caption={(story) => <UnderTheTile story={story} state={state} says={says} />}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Everything a Story's tile cannot fit, and the half of it that is about the owner: the title,
 * the Type and the line (`storyDetail`), then how far it got, the score and when.
 */
function saidOf(story: WallStory, says: Diary): string {
  const far = says.howFar.get(story.id);
  const ending = says.endings.get(story.id);

  return [
    storyDetail(story),
    story.state === "reading" && far ? `${far.atInstalment} of ${far.instalments}` : null,
    story.latestScore !== null ? `rated ${scoreSaid(story.latestScore)} out of 10` : null,
    ending ? lastThroughInAYear(ending, verbOf(story, says)).toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" — ");
}

/** What going through this Story is called, off its Type; *read* where the Type says nothing. */
function verbOf(story: WallStory, says: Diary): string {
  return says.verbPast.get(story.type.id) ?? "read";
}

/**
 * The one quiet line under a tile, and it differs by band: how far a run has got under way,
 * nothing under a Story not started — there is nothing yet to say about the owner and it — and
 * the bookmark and the year once it is settled. *Not rated* is said only under what was
 * finished: a book given up on is not waiting for a score.
 */
function UnderTheTile({
  story,
  state,
  says,
}: {
  story: WallStory;
  state: StoryState;
  says: Diary;
}) {
  if (state === "reading") {
    const far = says.howFar.get(story.id);
    return far ? (
      <span className="tabular-nums">
        {far.atInstalment} of {far.instalments}
      </span>
    ) : null;
  }

  if (!settled(state)) return null;

  const ending = says.endings.get(story.id);

  return (
    <span aria-hidden="true" className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {story.latestScore !== null ? (
        <RatingMark score={story.latestScore} className="text-foreground" />
      ) : state === "read" ? (
        <span>Not rated</span>
      ) : null}
      {ending ? (
        <span className="tabular-nums">{lastThroughInAYear(ending, verbOf(story, says))}</span>
      ) : null}
    </span>
  );
}

/**
 * A settled band as **rows of a diary**: a small cover, the name in the serif, the bookmark and
 * the month it was last gone through — denser than covers, and read down rather than across.
 *
 * Every Story is its own row here, the tales of an omnibus included: a row is told apart by
 * its name, so nothing repeats, and each tale carries its own score. A tale wears its own cloth
 * rather than the jacket it shares (`ownsItsCover`), the rule its own page keeps.
 */
function DiaryRows({
  stories,
  state,
  says,
}: {
  stories: WallStory[];
  state: StoryState;
  says: Diary;
}) {
  return (
    /* In two columns at the desk, and as columns rather than a grid: a diary is read down,
       so the most recent is at the top of the first and the order runs on into the second. */
    <ul className="gap-x-10 lg:columns-2">
      {stories.map((story) => {
        const ending = says.endings.get(story.id);
        const line = story.series ? story.series.name : null;

        return (
          <li key={story.id} className="break-inside-avoid border-t border-border">
            <Link
              href={`/stories/${story.id}`}
              aria-label={saidOf(story, says)}
              className="flex min-h-16 items-center gap-4 py-2.5 outline-none hover:text-cloth focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true" className="w-10 shrink-0">
                <Cover
                  title={story.title}
                  tint={tint(story.series?.id ?? story.id)}
                  image={ownsItsCover(story) ? story.cover : null}
                  size="thumb"
                />
              </span>

              <span aria-hidden="true" className="min-w-0 flex-1">
                <span className="block truncate font-heading text-lg font-semibold leading-snug">
                  {story.title}
                </span>
                <span className="mt-0.5 block truncate text-label text-muted-foreground">
                  {[story.type.name, line].filter(Boolean).join(" · ")}
                  {/* On a phone the month stands here, under the name, so the name keeps the
                      width; at the desk it has a column of its own. */}
                  <span className="sm:hidden">
                    {" · "}
                    {ending ? lastThroughInAMonth(ending) : "No day"}
                  </span>
                </span>
              </span>

              <span aria-hidden="true" className="flex shrink-0 justify-end sm:w-20">
                {story.latestScore !== null ? (
                  <RatingMark score={story.latestScore} />
                ) : state === "read" ? (
                  <span className="text-sm text-muted-foreground">Not rated</span>
                ) : null}
              </span>

              <span
                aria-hidden="true"
                className="hidden w-28 shrink-0 text-right text-sm text-muted-foreground tabular-nums sm:block"
              >
                {ending ? lastThroughInAMonth(ending) : "No day"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const NOTHING_YET =
  "No Stories yet. Record one, and its state follows from the Passes you give it.";

/**
 * Why the wall came back empty, said in the words it was narrowed by.
 *
 * Written per case rather than once, because *"no Story is both of those things"* is a
 * sentence about two filters and the owner may only have set one — and a screen that says
 * *both* over a single filter is a screen that has stopped reading its own state. The band
 * is named rather than the state worded, because *no Novel is under way* reads as a claim
 * about the novel rather than about the band.
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
