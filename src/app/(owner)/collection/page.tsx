import Link from "next/link";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { Chip } from "@/components/narrowing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Binding, listBindings } from "@/core/queries/binding";
import {
  type CataloguedVolumeOutsideTheCollection,
  type CollectionWallFilter,
  countCollection,
  listCataloguedOutsideTheCollection,
  listCollectionPublishers,
  listCollectionSeries,
  listCollectionWall,
  type WallVolume,
} from "@/core/queries/collection";
import { coverStanding } from "@/core/queries/cover";
import {
  listVolumesCarryingNothing,
  type VolumeCarryingNothing,
} from "@/core/queries/story-to-volume";
import { listTypes, type Type } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { acquire, findCovers, findCoversAgain, strike } from "./actions";
import {
  howFarTheCoversHaveGot,
  readCoverReport,
  whatNoLookupReaches,
  whatTheLookupFound,
} from "./covers-found";
import { CARRYING_NOTHING, COVERS, ELSEWHERE, PANELS, THE_WALLS_FILTERS } from "./panels";

// THE COLLECTION WALL, and the screen this whole redesign exists for: *do I already have
// this?* asked standing in a shop, one-handed, on the shop's signal. So the phone is the
// target and the desk is the same screen with more air — never the other way round.
//
// Four things are decided here.
//
//   1. **Volumes and not Stories, because the object is what the question is about** (#23).
//      Two editions of one story are two different things on a wall, and which one is on the
//      shelf is exactly what the owner cannot remember. So each tile is an object, and the
//      Must Have and the omnibus of *Il lungo Halloween* stand side by side as two.
//   2. **It stands the way the shelf stands**: by the Series an object belongs to, and by
//      its number inside it. A Volume in no Series takes its place under its own title,
//      among the Series, the way a standalone omnibus does on a real shelf — the order is
//      the core's (`listCollectionWall`) and the screen only lays it out.
//   3. **The tile and the tint are the Story wall's, unchanged** (`@/components/cover`,
//      `@/lib/tint`). A Series' colour is a function of its identity, so one is the same
//      colour on both walls and on every deploy — which is what makes a run of one colour
//      read as a run of one Series, and what the owner ends up learning their shelf by.
//   4. **Narrowing is a `GET`, and the state is in the URL** (ADR-0010, #22's pattern):
//      every control is a form field or a link, the narrowed wall is bookmarkable, survives
//      a refresh, and works with nothing running in the browser. The filter is an argument
//      to the core query, so a wall showing four objects read four rows and not ninety-six.
//   5. **The covers are on the tiles and no source is called to put them there** (#32,
//      ADR-0013). What the wall reads is a column; the *lookup* is a verb the owner runs from
//      the disclosure at the foot of this screen, and it is the only path in the application
//      that waits on somebody else's server. A wall that resolved ninety-six ISBNs against
//      Google before it could paint is a wall nobody opens in a shop, which is the one thing
//      this screen exists for.
//
// **The screen keeps its two registers, and the difference between them is the point**
// (ADR-0007). The wall is what is in the house; the other half of the catalogue — objects the
// library knows and the owner does not have — is behind *Not in the house* in the hero, with
// its count on the button.
//
// **That used to be a dashed frame under the wall, and moving it is a correction.** The
// argument for putting the two side by side was that *tiles against rows is a louder way of
// saying it than two lists ever were* — and it was right about the registers and wrong about
// the geometry: at ninety-six tiles the second register began below two screenfuls of the
// first, so the juxtaposition was only ever seen by somebody who scrolled the whole wall, and
// nobody does that in a shop. A figure in the hero says *nineteen objects you do not have* on
// arrival, which is the thing the frame was for, and one tap opens the list to work in.
//
// A thin adapter over the core, like every page here (ADR-0002): it calls queries, lays out
// the answer, and holds no SQL, no rule about what a Volume may be, and no colour of its
// own — the one on screen is the library's.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

/** One asked-for value, as a string, or nothing. */
function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

// The id the tick boxes on the catalogued rows point their `form` attribute at. Named once,
// because a typo here is a checkbox that submits nothing and says nothing about it.
const STRIKE = "strike-the-ticked";

// The panels and the filters are `./panels.ts`: this file is not the only one that spells
// them, and each is a string that fails silently when two files disagree about it.

/**
 * This screen's address with a panel open on it, and **with every filter still on**.
 *
 * That is the whole reason it is a function. A drawer is one bit of navigation, so opening
 * one has to leave the other seven parameters exactly where they were — a *Catalogue* button
 * that dropped `?series=…&type=manga` would answer the owner's search by throwing it away.
 */
function panelled(params: Asked, panel: string): string {
  const asking = onlyTheFilters(params);
  asking.set("panel", panel);
  return `/collection?${asking}`;
}

/** The same address with the panel closed: where every way out of a drawer leads. */
function unpanelled(params: Asked): string {
  const asking = onlyTheFilters(params);
  const said = asking.toString();
  return said === "" ? "/collection" : `/collection?${said}`;
}

/**
 * What the owner asked the *wall* for, without the panel and without the answer to the last
 * write.
 *
 * A banner reporting a lookup is about the press that produced it, so carrying it through
 * the open and the close of a drawer would print it again over an act nobody just performed.
 */
function onlyTheFilters(params: Asked): URLSearchParams {
  const asking = new URLSearchParams();

  for (const name of THE_WALLS_FILTERS) {
    const value = asked(params, name);
    if (value) asking.set(name, value);
  }

  return asking;
}

export default async function CollectionPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  // The vocabularies first, because what the owner asked for is read *against* them.
  const [params, everySeries, publishers, bindings, types, owned] = await Promise.all([
    searchParams,
    listCollectionSeries(),
    listCollectionPublishers(),
    listBindings(),
    listTypes(),
    countCollection(),
  ]);

  // Read against the vocabulary rather than trusted, exactly as the Story wall does. A
  // hand-edited `?series=banana` narrows to nothing in the core, which is honest, but the
  // *controls* would then be marking a Series that does not exist — so what the screen shows
  // as chosen is only ever something the shelf actually holds.
  const title = asked(params, "title");
  const series = everySeries.find((one) => one.id === asked(params, "series"));
  const publisher = publishers.find((one) => one === asked(params, "publisher"));
  const binding = bindings.find((one) => one.id === asked(params, "binding"));
  const type = types.find((one) => one.id === asked(params, "type"));

  const narrowing: CollectionWallFilter = {
    title,
    series: series?.id,
    publisher,
    binding: binding?.id,
    type: type?.id,
  };

  // Whether anything is on, read off the narrowing itself rather than restated: five
  // filters spelled out as five comparisons is five places to forget the sixth.
  const narrowed = Object.values(narrowing).some((one) => one !== undefined);

  const [volumes, elsewhere, carryingNothing, covers] = await Promise.all([
    listCollectionWall(narrowing),
    // Unnarrowed, deliberately: it is a short list beside the Collection, and a search that
    // emptied it would hide the one answer it exists to give — *you catalogued this and you
    // do not have it*.
    listCataloguedOutsideTheCollection(),
    // Unnarrowed for that reason and for one of its own: this list is **the catalogue's** and
    // not the wall's, so a Volume carrying nothing is here whether the house holds it or not
    // (#51). Narrowing it by what the owner typed into a search over the shelf would answer
    // *what has nobody named the contents of* with *of the things on your shelf*.
    listVolumesCarryingNothing(),
    coverStanding(),
  ]);

  const refused = asked(params, "refused");
  const acquired = asked(params, "acquired");
  const lookedUp = readCoverReport((name) => asked(params, name));
  const struck = asked(params, "struck");
  const panel = PANELS.find((one) => one === asked(params, "panel"));

  return (
    <main className="px-5 pb-16 sm:px-8">
      {/* **The primary act on this screen is not on this screen any more** (#45).
          Cataloguing a Volume was a drawer here, recording its narrative a drawer on the Stories
          wall, and joining the two a picker on the object's own page: three acts across two
          screens, and the drift they produced is twenty-two Volumes against twenty-one Stories.
          There is one door now, and this is a link to it — `/add`, where a title or a barcode
          and one of four sentences record all of it at once.

          What is left in the hero is what was already not an act. *Not in the house 19* is **a
          figure**, the second register #18 put here so the shelf and what is not on it are
          legible together on arrival; *Covers* is **housekeeping**, run once in a while at a
          desk. Both stay a quiet line under the control, which is what took the phone back: one
          full-width act, one line of prose, and the wall starts where the fold used to be. */}
      <header className="pt-8 sm:flex sm:items-start sm:justify-between sm:gap-x-6 sm:pt-12">
        <div className="min-w-0">
          <h1 className="font-heading text-title font-semibold lg:text-title-lg">Collection</h1>
          <p className="mt-2 text-pretty text-base text-muted-foreground">
            What is on your shelves.{" "}
            <span className="tabular-nums">
              {owned} {owned === 1 ? "Volume" : "Volumes"}
            </span>
            .
          </p>
        </div>

        <div className="mt-4 sm:mt-0 sm:shrink-0 sm:text-right">
          {/* A link to another screen rather than a drawer over this one, because what it
              opens is not this screen's act: it records a narrative and a Want as readily as an
              object, and a drawer on the Collection saying *I read it* would be a door in the
              wrong wall. */}
          {/* At the desk only: on a phone the raised `+` in the bar is the same door. */}
          <span className="hidden lg:inline">
            <OpensDrawer href="/add" emphasis="loud">
              Add to the library
            </OpensDrawer>
          </span>

          {/* The facts, as a sentence. Each is a link with a thumb's worth of padding around
              it rather than a chip, because what is being offered is *a figure to read* and
              *a run to start* — and a phone that spent a second row of pills on those was
              spending it on the wall.

              **The third of them is a gap, and it is a fact rather than a warning** (#51). A
              Volume carrying no Story is ordinary — nothing refuses one, and an object
              approved from the Inbox arrives without contents by design — so it stands in the
              same sentence as the other two and in the same ink, never as a banner over the
              wall. What makes it legible as something to *do* is one word: *yet*. And it is
              absent at nought, like *not in the house* beside it, for the sharper reason: a
              line reading *nothing is missing its contents* is a screen asking to be
              congratulated on a shop's signal. */}
          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            {elsewhere.length > 0 ? (
              <>
                <Fact href={panelled(params, ELSEWHERE)}>
                  <span className="tabular-nums">{elsewhere.length}</span> not in the house
                </Fact>
                <BetweenFacts />
              </>
            ) : null}
            {carryingNothing.length > 0 ? (
              <>
                <Fact href={panelled(params, CARRYING_NOTHING)}>
                  <span className="tabular-nums">{carryingNothing.length}</span> carrying no Story
                  yet
                </Fact>
                <BetweenFacts />
              </>
            ) : null}
            <Fact href={panelled(params, COVERS)}>Look up covers</Fact>
          </p>
        </div>
      </header>

      {/* **The question, in two registers.** The title is the one thing still typed, and it
          stays under the thumb while the wall scrolls — `top-12` clears the phone's own strip,
          which is `sticky top-0 z-20` in the shell; at the desk that strip is gone and the
          offset with it. The vocabularies are not typed and are not asked with a form: they
          are **links**, a row of chips for the Type and three small menus for the rest, each
          one an address with every other filter still on it. That is what four native
          pickers across the width of a phone were trying to be — a question nobody has to
          submit — and it still works with nothing running (ADR-0010): a chip is a `GET`, and a
          menu is a `<details>` the browser opens on its own. */}
      <search>
        <form
          action="/collection"
          className="sticky top-12 z-10 -mx-5 flex items-end gap-2 border-b border-border bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:top-0"
        >
          {/* The rest of the question rides along, so searching a title inside *Slam Dunk*
              searches inside it rather than across the whole shelf. */}
          {THE_WALLS_FILTERS.filter((name) => name !== "title").map((name) => {
            const value = narrowing[name];
            return value ? <input key={name} type="hidden" name={name} value={value} /> : null;
          })}
          <div className="min-w-0 flex-1">
            <Label htmlFor="search-title" className="sr-only">
              Title
            </Label>
            <Input
              id="search-title"
              name="title"
              defaultValue={title ?? ""}
              placeholder="Slam Dunk"
              autoComplete="off"
              className="h-11 sm:h-10"
            />
          </div>
          <Button type="submit" className="h-11 shrink-0 sm:h-10 sm:px-6">
            Search
          </Button>
        </form>
      </search>

      <nav aria-label="Narrow the Collection" className="mt-3 space-y-2">
        {/* The Type is the axis worth a row of its own: it is the first thing the shelf is
            told apart by, and there are few enough of them to lay out. A Type is a Story's
            attribute, so this narrows by what the Volumes carry — a Volume holding Stories of
            two Types is found under either, and once (ADR-0006). Scrolled sideways on a phone
            rather than wrapped into a block of pills. */}
        <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <li className="shrink-0">
            <Chip href={wallWith(narrowing, "type", undefined)} on={type === undefined}>
              Everything
            </Chip>
          </li>
          {types.map((one: Type) => (
            <li key={one.id} className="shrink-0">
              <Chip href={wallWith(narrowing, "type", one.id)} on={type?.id === one.id}>
                {one.name}
              </Chip>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Menu
            label="Series"
            chosen={seriesName(series) ?? undefined}
            clear={wallWith(narrowing, "series", undefined)}
            options={everySeries.map((one) => ({
              key: one.id,
              said: seriesName(one) ?? one.name,
              href: wallWith(narrowing, "series", one.id),
              on: series?.id === one.id,
            }))}
          />
          <Menu
            label="Publisher"
            chosen={publisher}
            clear={wallWith(narrowing, "publisher", undefined)}
            options={publishers.map((one) => ({
              key: one,
              said: one,
              href: wallWith(narrowing, "publisher", one),
              on: publisher === one,
            }))}
          />
          <Menu
            label="Binding"
            chosen={binding?.name}
            clear={wallWith(narrowing, "binding", undefined)}
            options={bindings.map((one: Binding) => ({
              key: one.id,
              said: one.name,
              href: wallWith(narrowing, "binding", one.id),
              on: binding?.id === one.id,
            }))}
          />
        </div>
      </nav>

      {refused ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {acquired ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {acquired} is in the Collection.
        </p>
      ) : null}
      {struck ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {struck === "1"
            ? "1 Volume struck from the catalogue. The library does not know it any more."
            : `${struck} Volumes struck from the catalogue. The library does not know them any more.`}
        </p>
      ) : null}
      {lookedUp ? (
        <div role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {/* Every clause the run earned, and none it did not. A run that did nothing gets
              a sentence of its own rather than an empty box: pressing a button and being
              answered with silence reads as a button that is broken. */}
          <p>
            {whatTheLookupFound(lookedUp).join(" · ") ||
              "Nothing to look up: every Volume with an ISBN has already been asked about."}
          </p>
          <NoLookupReaches many={lookedUp.skipped} className="mt-1 text-muted-foreground" />
        </div>
      ) : null}

      {/* What is on, and the one gesture that turns it all off. Both are absent on a whole
          wall: the count is already under the title, and a control that does nothing is a
          reason to wonder what it did. */}
      {narrowed ? (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {volumes.length} of {owned} {owned === 1 ? "Volume" : "Volumes"}
          </span>
          <Link
            href="/collection"
            className="rounded-sm text-sm font-medium text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </Link>
        </p>
      ) : null}

      {volumes.length === 0 ? (
        <EmptyShelf>
          {narrowed ? (
            <>
              Nothing you own matches that.{" "}
              <Link href="/collection" className={IN_PROSE}>
                Clear the filters
              </Link>{" "}
              to be sure, then buy it.
            </>
          ) : (
            <>
              Nothing on the shelves yet.{" "}
              <Link href="/add" className={IN_PROSE}>
                Add the Volume in your hand
              </Link>
              .
            </>
          )}
        </EmptyShelf>
      ) : (
        /* As many covers as the window holds, at the width a title is legible across —
           the Story wall's grid, unchanged, so the two walls are one object at two
           addresses. Two of them fit a phone held one-handed. */
        <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-6 sm:gap-x-5">
          {volumes.map((volume) => (
            <li key={volume.id}>
              {/* The jacket clean, and under it the one fact that is read off a run of them:
                  which number this is. An object in no Series has nothing under it — the
                  Binding that used to stand there is the object's own page's to say. */}
              <Cover
                href={`/collection/${volume.id}`}
                title={volume.title}
                tint={tint(volume.series?.id ?? volume.id)}
                label={detailOf(volume)}
                image={volume.cover}
                caption={volume.seriesNumber === null ? undefined : `Vol. ${volume.seriesNumber}`}
              />
            </li>
          ))}
        </ul>
      )}

      {panel === ELSEWHERE && elsewhere.length > 0 ? (
        <Drawer
          title="Known, not in the house"
          description="Catalogued, and not on the shelf."
          closesTo={unpanelled(params)}
        >
          <div className="group/strike">
            <p className="text-pretty text-sm text-muted-foreground">
              {elsewhere.length} {elsewhere.length === 1 ? "Volume" : "Volumes"} wanted, or had once
              and let go. Open one to say it is in the house. Tick any that were never real and
              strike them: the library stops knowing them. Striking is refused on anything you read,
              judged, wished for or hold, and the refusal names which.
            </p>

            {/* Rows rather than tiles, because that is the difference the screen is about:
                these are an outline of the shelf instead of the shelf. Nothing here has a
                colour to wear — a tint is a Series', and what is drawn in it is what is
                standing there. */}
            <ul className="mt-4 rounded-xl border border-dashed border-border px-4 [counter-reset:ticked]">
              {elsewhere.map((volume) => (
                <CataloguedRow key={volume.id} volume={volume} />
              ))}
            </ul>

            {/* **Striking, and it lives over the list rather than on each object's page** —
                because this is the list the mess is *in*. An assistant filed ten duplicates,
                the owner approved them in one gesture, and undoing that one object at a time
                is ten navigations to fix somebody else's minute of work.

                It is safe over a list because of what the list *is*: nothing in the house is
                here. The verb refuses the rest — a Pass through it, an Edition note, a
                Wish — and refuses the whole selection rather than part of it, naming the one
                that stands.

                **It counts itself, and nothing is running in the browser.** The `<ul>` resets
                a CSS counter, every row holding a ticked box increments it, and the number
                below reads the total — so a destructive act says how many it is about to take
                while the owner is still ticking. On a bulk delete that is not decoration; it
                is the one thing to know before pressing, and the alternative was a client
                component on the screen ADR-0010 exists for. The bar is not there at all until
                something is ticked, and it sticks to the foot of the drawer, because nineteen
                rows are longer than a phone. */}
            <form
              id={STRIKE}
              action={strike}
              className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-4 hidden border-t border-border bg-background/95 px-5 py-4 backdrop-blur group-has-[input:checked]/strike:block"
            >
              {/* The bar is the height of its button and nothing more. What striking refuses
                  is in the paragraph above the list, where it is read *before* anything is
                  ticked; repeating it here would spend a third of a phone on a caveat the
                  owner has already gone past. */}
              <Button type="submit" variant="destructive" className="h-11 w-full sm:h-10">
                Strike <span className="tabular-nums after:[content:counter(ticked)]" /> from the
                catalogue
              </Button>
            </form>
          </div>
        </Drawer>
      ) : null}

      {/* **THE GAP, SHOWN** (#51). An object carrying no narrative stands on no Pile
          and takes no judgement, so until somebody looks at it there is no screen it appears
          on — and two ordinary paths produce one: an approval from the Inbox, which may name
          Stories only by an id the assistant found (ADR-0019), and an object catalogued in a
          shop from its cover before the owner knows what is inside.

          **A list with a way to each object and no form in it.** What closes the gap is the
          field under the object's own contents (#47), which reads the library as the owner
          types and mints on Enter what it does not know; a second door onto that over a list
          of nineteen would be the same act built twice, and the one built here would be the
          worse of the two. So every row is a link, and it lands on the rows it is about.

          **It is read against the list rather than against the parameter alone**, which is
          what the *elsewhere* panel beside it does and for the same reason: a panel is an
          address the screen has, and once every object carries something there is no list
          for this one to be about. So a bookmark of `?panel=carrying-nothing` opens nothing
          on a library with no gap in it, exactly as `?panel=banana` does — and the hero has
          already stopped offering it. */}
      {panel === CARRYING_NOTHING && carryingNothing.length > 0 ? (
        <Drawer
          title="Carrying no Story yet"
          description="Nobody has said what is inside these yet."
          closesTo={unpanelled(params)}
        >
          <p className="text-pretty text-sm text-muted-foreground">
            {carryingNothing.length} {carryingNothing.length === 1 ? "Volume" : "Volumes"} with no
            Story named yet. Nothing is wrong with them, but until one carries something it stands
            on no Pile and takes no judgement. Open one and name what it holds.
          </p>

          {/* The *elsewhere* list's register — rows and a dashed frame, an outline of the
              shelf rather than the shelf — because that is what these are, and because a
              wall of tiles would ask this list to be looked at when it is meant to be worked
              through. No colour: a tint is a Series' and it is worn by what is standing
              there. */}
          <ul className="mt-4 rounded-xl border border-dashed border-border px-4">
            {carryingNothing.map((volume) => (
              <CarryingNothingRow key={volume.id} volume={volume} />
            ))}
          </ul>
        </Drawer>
      ) : null}

      {panel === COVERS ? (
        <Drawer
          title="Covers"
          description="Looked up by ISBN and linked to, never copied."
          closesTo={unpanelled(params)}
        >
          <p className="text-pretty text-sm">
            {howFarTheCoversHaveGot(covers)}{" "}
            {covers.due > 0
              ? `${covers.due} ${covers.due === 1 ? "carries" : "carry"} an ISBN and no cover.`
              : "Nothing with an ISBN is missing one."}
          </p>
          <NoLookupReaches
            many={covers.withoutAnIsbn}
            className="mt-2 text-pretty text-sm text-muted-foreground"
          />

          <form action={findCovers} className="mt-5">
            <Button type="submit" className="h-11 w-full sm:h-10">
              Look up what is missing
            </Button>
            <p className="mt-2 text-pretty text-xs text-muted-foreground">
              Google Books first, then Open Library. One run covers a couple of dozen Volumes; press
              it again for the rest.
            </p>
          </form>

          {/* **The repair, and it is a second button because it is a different act.** The run
              above spends no request on a cover that still loads, which is right nearly
              always and is exactly wrong in the one case that brought this screen its worst
              bug: a jacket fetched against an ISBN that was later corrected is *live* and
              belongs to another book. Nothing that asks whether an image loads can see that.
              So this one throws the recorded answers away and asks again from the ISBNs that
              are on the rows now. */}
          <form action={findCoversAgain} className="mt-6 border-t border-border pt-5">
            <Button type="submit" variant="outline" className="h-11 w-full sm:h-10">
              Ask again about the ones already faced
            </Button>
            <p className="mt-2 text-pretty text-xs text-muted-foreground">
              For a cover that is wrong rather than missing, usually because the ISBN was corrected
              after it was looked up. Slower: it asks again about every Volume.
            </p>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}

/**
 * What no lookup will ever reach, where there is anything to say.
 *
 * A component rather than two calls in a ternary, because the sentence is the answer to
 * *"is there anything to say?"* as well as the saying of it — and asking `covers-found.ts` the
 * same question twice in one expression is how the two answers drift apart.
 */
function NoLookupReaches({ many, className }: { many: number; className: string }) {
  const said = whatNoLookupReaches(many);
  if (!said) return null;

  return <p className={className}>{said}</p>;
}

/**
 * One of the quiet facts under the hero's one act: a figure to read, or a run to start.
 *
 * A link with a thumb's worth of padding around it rather than a chip, because what is
 * offered is a *fact* and not a fourth button — and a component rather than the class list
 * written three times, since the third of them arrived with #51 and a fact drawn differently
 * from its neighbours would read as a different kind of thing.
 */
function Fact({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-sm py-1.5 font-medium text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

/** What stands between two of them. Decorative, so nothing reading the page aloud says it. */
function BetweenFacts() {
  return (
    <span aria-hidden className="px-2">
      ·
    </span>
  );
}

/**
 * One object nobody has named the contents of, and the way to the place they are named.
 *
 * **The whole row is the link**, and it lands on the object's contents rather than on the
 * top of its page: what the owner came here to do is on that card, and a phone that opened
 * a Volume's page at the hero would ask them to scroll past the cover, the ISBN and the
 * acquisitions to find it.
 *
 * What it says is what tells two objects of one title apart — who printed it, which edition
 * line it belongs to, and **where it stands**, which is the wall's own rule (`Standing`): the
 * position in the line, or the Binding for an object that stands in none. The line is not
 * named beside it, because the rows come out of the core in the order the shelf stands in and
 * a run reads as a run without a label repeating its own titles.
 *
 * And quietly, whether the house holds it: both halves of the catalogue produce this gap, and
 * an object still in a shop is worked through at a different moment from one on the shelf.
 */
function CarryingNothingRow({ volume }: { volume: VolumeCarryingNothing }) {
  const under = [volume.publisher, volume.editionLine].filter(Boolean).join(" · ");

  return (
    <li className="border-t border-dashed border-border first:border-t-0">
      <Link
        href={`/collection/${volume.id}#stories-it-holds`}
        className="flex min-h-11 items-baseline justify-between gap-3 rounded py-3 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block truncate font-heading text-lg font-semibold leading-snug">
            {volume.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {under}
            {volume.inTheHouse ? null : " · not in the house"}
          </span>
        </span>
        <Badge variant="outline" className="shrink-0 border-dashed">
          <Standing of={volume} />
        </Badge>
      </Link>
    </li>
  );
}

/**
 * A Series, as it is named on a control: *Death Note, Black Edition*.
 *
 * The edition belongs in the name here and nowhere else on this screen, because that is
 * precisely what a picker of Series has to tell apart — the standard printing and the Black
 * Edition are two Series of one story, and choosing between them is the point of the control.
 */
function seriesName(
  series: { name: string; editionLine: string | null } | undefined
): string | null {
  if (!series) return null;

  return [series.name, series.editionLine].filter(Boolean).join(", ");
}

/**
 * Everything the tile cannot fit, in the order the owner would say it: what it is, where it
 * stands, who printed it, how it is bound.
 *
 * It is the tile's accessible name as well as its tooltip, so it carries the facts a sighted
 * owner reads off the colour and the number — the Series and the position — rather than
 * leaving them to the tint.
 */
function detailOf(volume: WallVolume): string {
  const standing = volume.series
    ? `${seriesName(volume.series)} ${volume.seriesNumber}`
    : "In no Series";

  const object = [volume.publisher, volume.editionLine].filter(Boolean).join(", ");

  return [volume.title, standing, object, volume.binding.name].join(" — ");
}

/**
 * The one thing worth reading at the foot of an object's tile: **where it stands**.
 *
 * A number, where the object holds a position in a Series — which is the whole of *do I
 * have volume 12?*, answered by running a finger along one colour and reading the numbers.
 *
 * Where it holds none, the Binding takes the place rather than a dash, because the question
 * an unnumbered object raises is the other one: *which of the two editions is this?* An
 * omnibus and a Must Have of one story are two tiles with one title, and the Binding is what
 * has always told them apart on this screen.
 *
 * It takes the two facts rather than a `WallVolume` since #51, because the rows of objects
 * carrying no Story ask the same question at the other end of the screen and the answer must
 * not be *nearly* the same one. `WhereItStands` is what those two callers agree on, named so
 * that a third one cannot quietly widen it.
 */
type WhereItStands = { seriesNumber: number | null; binding: { name: string } };

function Standing({ of }: { of: WhereItStands }) {
  return <>{of.seriesNumber ?? of.binding.name}</>;
}

/** A link in prose: cloth, because it does something. */
const IN_PROSE =
  "rounded-sm font-medium text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The wall's address with one filter set — or, given nothing, taken off — and **every other
 * filter still on**. One function for both, so a chip that turns a filter on and the
 * *Everything* that turns it off cannot disagree about what else the owner had asked.
 */
function wallWith(
  narrowing: CollectionWallFilter,
  name: keyof CollectionWallFilter,
  value: string | undefined
): string {
  const asking = new URLSearchParams();

  for (const one of THE_WALLS_FILTERS) {
    const kept = one === name ? value : narrowing[one];
    if (kept) asking.set(one, kept);
  }

  const said = asking.toString();
  return said === "" ? "/collection" : `/collection?${said}`;
}

/**
 * **A small menu over a vocabulary** — Series, publisher, Binding — drawn as a chip that
 * opens.
 *
 * A `<details>` rather than a scripted popover: the browser opens and shuts it with nothing
 * running, and every choice inside is a link, so choosing is navigating (ADR-0010). The chip
 * says what is chosen when something is, in cloth like a chip that is on, so the question
 * standing over the wall is readable without opening anything. Every vocabulary here is read
 * rather than written down — the Bindings are rows (ADR-0006), and the Series and the
 * publishers are what the shelf happens to hold — so a seventh Binding appears here without
 * this file being touched.
 */
function Menu({
  label,
  chosen,
  clear,
  options,
}: {
  label: string;
  chosen?: string;
  /** The address with this filter taken off. */
  clear: string;
  options: { key: string; said: string; href: string; on: boolean }[];
}) {
  if (options.length === 0) return null;

  return (
    <details className="group/menu relative">
      <summary
        className={cn(
          "inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          chosen
            ? "border-cloth-fill bg-cloth-fill text-on-cloth"
            : "border-border text-foreground hover:bg-accent/60"
        )}
      >
        <span className="max-w-[14rem] truncate">{chosen ? `${label}: ${chosen}` : label}</span>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className="size-3 shrink-0 transition-transform group-open/menu:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5 6 7.5l3-3" />
        </svg>
      </summary>

      <ul className="absolute left-0 z-30 mt-1.5 max-h-72 w-64 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
        <li>
          <Link
            href={clear}
            aria-current={chosen ? undefined : "true"}
            className={cn(MENU_ROW, !chosen && "font-semibold text-cloth")}
          >
            Any {label.toLowerCase()}
          </Link>
        </li>
        {options.map((one) => (
          <li key={one.key}>
            <Link
              href={one.href}
              aria-current={one.on ? "true" : undefined}
              className={cn(MENU_ROW, one.on && "font-semibold text-cloth")}
            >
              {one.said}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

const MENU_ROW =
  "flex min-h-10 items-center rounded-lg px-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";

/**
 * What an empty wall says: one sentence and the act that fills it, over a drawn empty shelf —
 * a board and two bookends, in the rule's own ink, so the absence is a picture of the place
 * rather than a box with nothing in it.
 */
function EmptyShelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 flex flex-col items-start gap-4">
      <svg viewBox="0 0 160 48" aria-hidden="true" className="h-12 w-40 text-border">
        <rect x="18" y="14" width="6" height="28" rx="1" fill="currentColor" />
        <rect x="136" y="14" width="6" height="28" rx="1" fill="currentColor" />
        <rect x="4" y="42" width="152" height="4" rx="1" fill="currentColor" />
      </svg>
      <p className="max-w-prose text-pretty text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * One Volume the library knows and the house does not hold.
 *
 * A row and a disclosure, quieter than the wall: the title in muted ink, and inside it the
 * one form that changes the answer. The price and the day are asked for **here**, because
 * this is the moment they become true — the object came home, at a price, on a day
 * (ADR-0007) — and the ordinary case is one tap on *It is in the house* with both empty.
 */
function CataloguedRow({ volume }: { volume: CataloguedVolumeOutsideTheCollection }) {
  const under = [volume.publisher, volume.editionLine].filter(Boolean).join(" · ");

  return (
    <li className="flex items-start gap-3 border-t border-dashed border-border first:border-t-0 has-[:checked]:[counter-increment:ticked]">
      {/* **Ticked by the owner, never on arrival** — the opposite of the Inbox's boxes, and
          the difference is what the gesture does. There the selection approves proposals and
          arriving ticked is what makes forty of them one act; here it strikes records, and a
          screen that arrived with everything ticked would be one mis-tap from a catalogue.

          `form` rather than nesting: the row already holds the *acquire* form, HTML has no
          nested forms, and this attribute is how a control belongs to a form somewhere else
          on the page. Plain HTML, so it submits with nothing running (ADR-0010). It sits
          outside the `<summary>` because a checkbox inside one toggles the disclosure. */}
      {/* **A strip rather than a box.** The control is 16px and the thumb is not, so the
          `<label>` around it is the target: full row height, the width of a fingertip, and
          the box centred in it. Nothing else on this screen is drawn under 44px and this was
          the one place that forgot — over a list where the owner taps twenty in a row.

          `form` rather than nesting: the row already holds the *acquire* form, HTML has no
          nested forms, and this attribute is how a control belongs to a form elsewhere on the
          page. Plain HTML, so it submits with nothing running (ADR-0010). It sits outside the
          `<summary>` because a checkbox inside one toggles the disclosure. */}
      <label className="-ml-2 flex w-11 shrink-0 cursor-pointer items-start justify-center self-stretch pt-3.5 outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <input
          type="checkbox"
          form={STRIKE}
          name="strikeId"
          value={volume.id}
          aria-label={`Strike ${volume.title}, ${under}, from the catalogue`}
          className="size-4 accent-foreground"
        />
      </label>

      <details className="group min-w-0 flex-1">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 py-3 marker:hidden">
          <span className="min-w-0">
            <span className="block truncate font-heading text-lg font-semibold leading-snug">
              {volume.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {under}
              {volume.releasedOn ? ` · left the house on ${volume.releasedOn}` : null}
            </span>
          </span>
          <Badge variant="outline" className="shrink-0 border-dashed">
            {volume.binding.name}
          </Badge>
        </summary>

        <form action={acquire} className="grid gap-4 pb-4 sm:grid-cols-2">
          <input type="hidden" name="volumeId" value={volume.id} />
          <input type="hidden" name="title" value={volume.title} />
          {/* The prefix is the object's id, because these two fields are rendered once per
              row and a label has to point at its own input. */}
          <Field
            idPrefix={volume.id}
            name="pricePaid"
            label="Price paid"
            placeholder="6.50"
            inputMode="decimal"
          />
          <Field idPrefix={volume.id} name="acquiredOn" label="Came home" type="date" />

          <div className="sm:col-span-2">
            <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
              It is in the house
            </Button>
            <span className="mt-2 block text-xs text-muted-foreground sm:ml-3 sm:mt-0 sm:inline">
              Leave both empty where the receipt is gone.{" "}
              <Link
                href={`/collection/${volume.id}`}
                className="font-medium text-cloth underline-offset-4 hover:underline"
              >
                This object&apos;s page
              </Link>{" "}
              carries what it holds, and the Edition note.
            </span>
          </div>
        </form>
      </details>
    </li>
  );
}

function Field({
  name,
  label,
  className,
  idPrefix = "acquire",
  ...props
}: {
  name: string;
  label: string;
  className?: string;
  /** What makes the id unique where one field name appears in two forms on the page. */
  idPrefix?: string;
} & React.ComponentProps<typeof Input>) {
  const fieldId = `${idPrefix}-${name}`;

  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={fieldId} className="text-label font-medium text-muted-foreground">
        {label}
      </Label>
      {/* 44px under a thumb, and the desk's own 40px from `sm` up. Every control the owner
          reaches for one-handed in a shop is drawn at this height; a field that was not was
          the one place this screen forgot where it is used. */}
      <Input id={fieldId} name={name} className="h-11 sm:h-10" {...props} />
    </div>
  );
}
