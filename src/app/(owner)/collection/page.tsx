import Link from "next/link";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
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
import { listTypes, type Type } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { acquire, catalogue, findCovers, findCoversAgain, identify, strike } from "./actions";
import {
  howFarTheCoversHaveGot,
  readCoverReport,
  whatNoLookupReaches,
  whatTheLookupFound,
} from "./covers-found";
import { whatFilledItIn } from "./identified";
import { ScanAnIsbn } from "./scan";

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

// The two panels this screen has, named rather than typed out at four call sites, and read
// against this pair rather than trusted: `?panel=banana` opens nothing, which is the same
// honesty every filter on this wall is held to.
// The id the tick boxes on the catalogued rows point their `form` attribute at. Named once,
// because a typo here is a checkbox that submits nothing and says nothing about it.
const STRIKE = "strike-the-ticked";

const COVERS = "covers";
const CATALOGUE = "catalogue";
const ELSEWHERE = "elsewhere";
const ISBN = "isbn";
const PANELS = [COVERS, CATALOGUE, ELSEWHERE, ISBN] as const;

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

  for (const name of ["title", "series", "publisher", "binding", "type"]) {
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

  const [volumes, elsewhere, covers] = await Promise.all([
    listCollectionWall(narrowing),
    // Unnarrowed, deliberately: it is a short list beside the Collection, and a search that
    // emptied it would hide the one answer it exists to give — *you catalogued this and you
    // do not have it*.
    listCataloguedOutsideTheCollection(),
    coverStanding(),
  ]);

  const refused = asked(params, "refused");
  // What a lookup by ISBN handed the catalogue form, and the sentence saying where it came
  // from (`./identified.ts`). They are read under their own names rather than as `title` and
  // `publisher`, which are two of this wall's five filters: a prefill sharing a name with a
  // filter would narrow the shelf behind the panel and stay narrowed after it closed.
  const scanned = asked(params, "isbn");
  const record = asked(params, "record");
  const publishedBy = asked(params, "publishedBy");
  const filledIn = whatFilledItIn(asked(params, "from"));
  const catalogued = asked(params, "catalogued");
  const acquired = asked(params, "acquired");
  const lookedUp = readCoverReport((name) => asked(params, name));
  const struck = asked(params, "struck");
  const panel = PANELS.find((one) => one === asked(params, "panel"));

  return (
    <main className="px-5 pb-16 sm:px-8">
      {/* **The two acts the owner comes here to perform, in the hero rather than at the
          foot.** Recording an object and facing the wall with jackets are the screen's two
          verbs, and folded into disclosures under ninety-six tiles they were a scroll away
          from a screen that is read on a phone. They are links to `?panel=…` and the form
          arrives as a drawer over the window — the open state is the URL, so it costs no
          script, it is bookmarkable and the back button closes it (`@/components/drawer`). */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pt-8 sm:pt-12">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl">Collection</h1>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            The Volumes physically in the house, standing the way the shelf stands. Not what has
            been read, and not what is wanted — what is owned.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* **The second register, as a figure rather than a frame at the foot of the wall.**
              The other half of the catalogue used to sit under ninety-six tiles, which meant
              the juxtaposition the screen was designed around — the shelf against what is not
              on it — was only ever visible to somebody who scrolled the whole wall. Nobody
              does that in a shop. So it is a number in the hero that opens into the list: the
              same two registers, one of them now legible at a glance and one tap deep. */}
          {elsewhere.length > 0 ? (
            <OpensDrawer href={panelled(params, ELSEWHERE)}>
              Not in the house
              <span className="font-mono tabular-nums text-muted-foreground">
                {elsewhere.length}
              </span>
            </OpensDrawer>
          ) : null}
          <OpensDrawer href={panelled(params, COVERS)}>Covers</OpensDrawer>
          {/* **A second way into the same act, and it is in the hero because of where it is
              used.** *Catalogue a Volume* asks for five fields; this one asks for the barcode
              on the back and fills them in. It is a third button rather than a control inside
              the form beside it for the reason ADR-0007's two verbs are two buttons: what the
              owner presses says what they are about to do, and *I am holding the object* is a
              different starting point from *I know what it is called*. */}
          <OpensDrawer href={panelled(params, ISBN)}>From an ISBN</OpensDrawer>
          <OpensDrawer href={panelled(params, CATALOGUE)} emphasis="loud">
            Catalogue a Volume
          </OpensDrawer>
        </div>
      </header>

      {/* One form, in two registers.
          The title and the button stay under the thumb while the wall scrolls, because the
          answer is read while scrolling and the question is the thing the owner keeps
          changing. `top-12` clears the phone's own chrome strip, which is `sticky top-0
          z-20` in the shell and would otherwise slide over this; at the desk that strip is
          gone and the offset with it.
          The four pickers scroll away with the wall rather than sitting in that strip: a
          sticky block holding six controls is a quarter of a phone permanently spent on the
          question, and the one control that *submits* them is the button above, which is
          always on screen. */}
      <search>
        <form action="/collection">
          <div className="sticky top-12 z-10 -mx-5 flex items-end gap-2 border-b border-border bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:top-0">
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
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Picker id="search-series" name="series" label="Series" chosen={series?.id} any="Any">
              {everySeries.map((one) => (
                <option key={one.id} value={one.id}>
                  {seriesName(one)}
                </option>
              ))}
            </Picker>

            <Picker
              id="search-publisher"
              name="publisher"
              label="Publisher"
              chosen={publisher}
              any="Any"
            >
              {publishers.map((one) => (
                <option key={one} value={one}>
                  {one}
                </option>
              ))}
            </Picker>

            {/* Type is a Story's attribute, so this narrows by what the Volumes carry
                rather than by anything on the object itself — a Volume holding three
                Stories of two Types is found under either of them, and once (ADR-0006). */}
            <Picker id="search-type" name="type" label="Type" chosen={type?.id} any="Any">
              {types.map((one: Type) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </Picker>

            <Picker
              id="search-binding"
              name="binding"
              label="Binding"
              chosen={binding?.id}
              any="Any"
            >
              {bindings.map((one: Binding) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </Picker>
          </div>
        </form>
      </search>

      {/* Not while the ISBN panel is open: that panel covers the screen and carries the
          refusal itself, beside the field it is about, which is what `@/components/drawer`
          asks of a screen that shows one — a refusal the owner cannot read is worse than
          none. */}
      {refused && panel !== ISBN ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {catalogued ? (
        <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
          {catalogued} is in the catalogue. Say it is in the house when you have it.
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

      {/* What is on, and the one gesture that turns it all off. The clear is absent on a
          whole wall, because a control that does nothing is a reason to wonder what it
          did. */}
      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {narrowed
            ? `${volumes.length} of ${owned} ${owned === 1 ? "Volume" : "Volumes"}`
            : `${owned} ${owned === 1 ? "Volume" : "Volumes"} in the house`}
        </span>
        {narrowed ? (
          <Link
            href="/collection"
            className="font-mono text-eyebrow uppercase tracking-eyebrow underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear
          </Link>
        ) : null}
      </p>

      {volumes.length === 0 ? (
        <p className="mt-6 max-w-prose text-pretty text-sm text-muted-foreground">
          {narrowed
            ? "Nothing owned matches that. Which is the answer worth having in a shop — widen it to be sure, then buy it."
            : "Nothing in the Collection yet. Catalogue the Volume in your hand below, then say it is in the house."}
        </p>
      ) : (
        /* As many covers as the window holds, at the width a title is legible across —
           the Story wall's grid, unchanged, so the two walls are one object at two
           addresses. Two of them fit a phone held one-handed. */
        <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 sm:gap-4">
          {volumes.map((volume) => (
            <li key={volume.id}>
              <Cover
                href={`/collection/${volume.id}`}
                title={volume.title}
                tint={tint(volume.series?.id)}
                detail={detailOf(volume)}
                foot={<Standing of={volume} />}
                image={volume.cover}
              />
            </li>
          ))}
        </ul>
      )}

      {panel === ELSEWHERE && elsewhere.length > 0 ? (
        <Drawer
          title="Known, not in the house"
          description="The other half of the catalogue: objects the library knows and the Collection does not claim."
          closesTo={unpanelled(params)}
        >
          <div className="group/strike">
            <p className="text-pretty text-sm text-muted-foreground">
              {elsewhere.length} {elsewhere.length === 1 ? "Volume" : "Volumes"} catalogued to be
              wanted, or had once and let go. Say one is in the house when it arrives, and it joins
              the wall. Tick any that were never real — a duplicate proposed and approved in a hurry
              — and strike them: the library stops knowing them, and any acquisition that ended goes
              too. Striking is refused on anything you read, judged or wished for, and on anything
              in the house; one that stands refuses the whole tick and says which.
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
                here. The verb refuses the rest — a Reading through it, an Edition note, a
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
                Strike <span className="font-mono tabular-nums after:[content:counter(ticked)]" />{" "}
                from the catalogue
              </Button>
            </form>
          </div>
        </Drawer>
      ) : null}

      {panel === COVERS ? (
        <Drawer
          title="Covers"
          description="Asked for by ISBN, pointed at where they live, and never copied here."
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
              Google Books first, then Open Library for what Google does not have. One run asks
              about a couple of dozen objects and checks the ones already faced, so a jacket that
              has been withdrawn is looked up again rather than left broken. Press it again for the
              rest.
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
              For a cover that is wrong rather than missing — the wall showing another book&apos;s
              jacket because the ISBN it was asked about has since been corrected. This ignores what
              is recorded and asks the sources from scratch. It costs a request per object, so it is
              the slower of the two.
            </p>
          </form>
        </Drawer>
      ) : null}

      {panel === ISBN ? (
        <Drawer
          title="From an ISBN"
          description="The barcode on the back, and what the library — yours first, then the national one — already knows about it."
          refused={refused}
          closesTo={unpanelled(params)}
        >
          {/* **One field, one plain form, and the scanner writes into it.** The camera is the
              fastest way to fill this in and it is not the only one: typed, pasted, or read
              out of the printed digits by the phone's own text scanner in the keyboard, this
              posts and answers with no script running at all (ADR-0010). Which is why the
              field is first and the camera is the button under it. */}
          <form action={identify} className="grid gap-4">
            <Field
              name="isbn"
              label="ISBN"
              idPrefix="scan"
              defaultValue={scanned ?? ""}
              placeholder="9788828765431"
              inputMode="numeric"
              autoComplete="off"
              // **Not focused**, deliberately. Autofocus here would open the phone's keyboard
              // on a panel whose other control is a camera button, and cover it — the field is
              // one tap away for whoever means to type, and out of the way for whoever came to
              // scan.
              required
            />

            <div>
              <Button type="submit" className="h-11 w-full sm:h-10">
                Look it up
              </Button>
              <p className="mt-2 text-pretty text-xs text-muted-foreground">
                Your own catalogue first — if this object is already recorded, this goes straight to
                it, which is the answer to <em>do I already have this?</em> Then SBN, Italy&apos;s
                legal-deposit catalogue, for the title and the publisher. Hyphens and spaces are
                fine here.
              </p>
            </div>
          </form>

          <div className="mt-6 border-t border-border pt-5">
            <ScanAnIsbn into="scan-isbn" />
            <p className="mt-2 text-pretty text-xs text-muted-foreground">
              The camera reads the barcode and looks it up on its own. A Bonelli monthly has no ISBN
              to read — its barcode is a periodical&apos;s — and neither has anything sold without
              one, so those are catalogued by hand.
            </p>
          </div>
        </Drawer>
      ) : null}

      {panel === CATALOGUE ? (
        <Drawer
          title="Catalogue a Volume"
          description="What the object is. It does not say you have it — that is the next act, and a different one (ADR-0007)."
          closesTo={unpanelled(params)}
        >
          {/* Two things this form deliberately does not ask for.
              No medium, and there is none to ask for: digital ownership is not modelled, so
              an owned ebook is not a thing this form could record even if it offered a box.
              And no price and no day, because those are facts about an object *coming home*
              and this form only says what the object is (ADR-0007) — they are asked for by
              the row on the wall, at the moment they are true. */}
          {/* **Where the fields came from, when they did not come from the owner.** Three
              sentences for three states — filled in, nothing published under that ISBN, and
              the catalogue could not be asked — because they are three different things to do
              next, and `./identified.ts` is which is which. A form that silently arrived
              half-filled would be a form the owner has no reason to check. */}
          {filledIn ? (
            <p className="mb-4 text-pretty text-sm text-muted-foreground">{filledIn}</p>
          ) : null}

          <form action={catalogue} className="grid gap-4">
            <Field
              name="title"
              label="Title"
              defaultValue={record ?? ""}
              placeholder="Slam Dunk 1"
              required
            />
            <Field
              name="publisher"
              label="Publisher"
              defaultValue={publishedBy ?? ""}
              placeholder="Planet Manga"
              required
            />
            <Field name="editionLine" label="Edition line" placeholder="DC Must Have" />

            <Picker id="catalogue-binding" name="binding" label="Binding" required>
              {bindings.map((one: Binding) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </Picker>

            <Field name="language" label="Language" defaultValue="it" required />
            {/* Carried from the lookup where there was one, and typed here otherwise — where
                a printed ISBN's hyphens are refused by the column rather than laundered
                (`volume_isbn_is_ten_or_thirteen_characters`). The panel that reads a barcode
                is the lenient door, and what it hands over is already bare digits. */}
            <Field
              name="isbn"
              label="ISBN"
              defaultValue={scanned ?? ""}
              placeholder="9788828765431"
              inputMode="numeric"
            />

            <div>
              <Button type="submit" className="h-11 w-full sm:h-10">
                Catalogue it
              </Button>
              <p className="mt-2 text-pretty text-xs text-muted-foreground">
                A language is a code — <code className="font-mono">it</code>,{" "}
                <code className="font-mono">en</code>, <code className="font-mono">ja</code>.
                Holding it already? Say so from <em>Known, not in the house</em> on the wall, with
                what you paid. Which Series it belongs to, and where in it, is said from that
                Series.
              </p>
            </div>
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
 */
function Standing({ of }: { of: WallVolume }) {
  return <>{of.seriesNumber ?? of.binding.name}</>;
}

/**
 * A picker over a vocabulary — Series, publisher, Type, Binding.
 *
 * A native select rather than a scripted one: on a phone it opens the platform picker, and
 * it submits with the form whether JavaScript ran or not. Every vocabulary here is read
 * rather than written down — the Bindings and the Types are rows (ADR-0006), and the Series
 * and the publishers are what the shelf happens to hold — so a seventh Binding and a new
 * publisher appear on this screen without this file being touched.
 */
function Picker({
  id,
  name,
  label,
  chosen,
  any,
  required,
  children,
}: {
  id: string;
  name: string;
  label: string;
  chosen?: string;
  /** The wording for "none in particular", where not choosing is allowed. */
  any?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        name={name}
        defaultValue={chosen ?? ""}
        required={required}
        className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
      >
        {any ? <option value="">{any}</option> : null}
        {children}
      </select>
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
            <span className="block truncate font-medium text-muted-foreground">{volume.title}</span>
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
                className="underline underline-offset-4 hover:text-foreground"
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
  idPrefix = "catalogue",
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
      <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {/* 44px under a thumb, and the desk's own 40px from `sm` up. Every control the owner
          reaches for one-handed in a shop is drawn at this height; a field that was not was
          the one place this screen forgot where it is used. */}
      <Input id={fieldId} name={name} className="h-11 sm:h-10" {...props} />
    </div>
  );
}
