import Link from "next/link";
import { Cover } from "@/components/cover";
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
import { acquire, catalogue, findCovers } from "./actions";
import {
  howFarTheCoversHaveGot,
  readCoverReport,
  whatNoLookupReaches,
  whatTheLookupFound,
} from "./covers-found";

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
// (ADR-0007). The wall is what is in the house. Under it, in a dashed frame, is the other
// half of the catalogue — objects the library knows and the owner does not have — and the
// answer the owner is in a shop for is which of the two a title is in. Tiles against rows
// is a louder way of saying it than two lists ever were.
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
  const catalogued = asked(params, "catalogued");
  const acquired = asked(params, "acquired");
  const lookedUp = readCoverReport((name) => asked(params, name));

  return (
    <main className="px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <h1 className="font-heading text-2xl sm:text-3xl">Collection</h1>
        <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
          The Volumes physically in the house, standing the way the shelf stands. Not what has been
          read, and not what is wanted — what is owned.
        </p>
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

      {refused ? (
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

      {elsewhere.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
            Known, not in the house
          </h2>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            {elsewhere.length} {elsewhere.length === 1 ? "Volume" : "Volumes"} the library knows and
            the Collection does not claim: catalogued to be wanted, or had once and let go. Say one
            is in the house when it arrives, and it joins the wall above.
          </p>

          {/* Rows in a dashed frame rather than tiles on the wall, because that is the
              difference the screen is about: these are an outline of the shelf instead of
              the shelf. Nothing here has a colour to wear — a tint is a Series', and what
              is drawn in it is what is standing there. */}
          <ul className="mt-4 rounded-xl border border-dashed border-border px-4">
            {elsewhere.map((volume) => (
              <CataloguedRow key={volume.id} volume={volume} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* **The lookup, and it is a verb rather than a setting.** It sits at the foot with the
          other thing the owner comes to this screen to *do*, folded away, because the screen
          is read a hundred times for every time it is repaired. The button is a plain form
          post: a few seconds pass while somebody else's server is asked, and the wall
          re-renders with the jackets on it. Nothing runs in the browser (ADR-0010). */}
      <details className="group mt-10 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
          Look up the covers
          <span className="ml-2 text-muted-foreground group-open:hidden">
            — {howFarTheCoversHaveGot(covers) ?? "nothing catalogued yet"}
          </span>
        </summary>

        <form action={findCovers} className="border-t border-border p-4">
          <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
            Look them up
          </Button>
          <p className="mt-3 max-w-prose text-pretty text-xs text-muted-foreground">
            {howFarTheCoversHaveGot(covers)}{" "}
            {covers.due > 0
              ? `${covers.due} ${covers.due === 1 ? "carries" : "carry"} an ISBN and no cover.`
              : "Nothing with an ISBN is missing one."}{" "}
          </p>
          <NoLookupReaches
            many={covers.withoutAnIsbn}
            className="mt-1 max-w-prose text-pretty text-xs text-muted-foreground"
          />
          <p className="mt-2 max-w-prose text-pretty text-xs text-muted-foreground">
            A cover is asked for by ISBN at Google Books, and at Open Library for what Google does
            not have — and it is <em>pointed at</em> where it lives, never copied here (ADR-0013).
            One run asks about a couple of dozen objects and checks the covers it already has, so a
            jacket that has been withdrawn is looked up again rather than left broken on the wall.
            Press it again for the rest.
          </p>
        </form>
      </details>

      <details className="group mt-4 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
          Catalogue a Volume
          <span className="ml-2 text-muted-foreground group-open:hidden">
            — publisher, Binding, ISBN
          </span>
        </summary>

        {/* Two things this form deliberately does not ask for.
            No medium, and there is none to ask for: digital ownership is not modelled, so
            an owned ebook is not a thing this form could record even if it offered a box.
            And no price and no day, because those are facts about an object *coming home*
            and this form only says what the object is (ADR-0007) — they are asked for by
            the row above, at the moment they are true. */}
        <form action={catalogue} className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
          <Field
            name="title"
            label="Title"
            placeholder="Slam Dunk 1"
            required
            className="sm:col-span-2"
          />
          <Field name="publisher" label="Publisher" placeholder="Planet Manga" required />
          <Field name="editionLine" label="Edition line" placeholder="DC Must Have" />

          <Picker id="catalogue-binding" name="binding" label="Binding" required>
            {bindings.map((one: Binding) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </Picker>

          <Field name="language" label="Language" defaultValue="it" required />
          <Field name="isbn" label="ISBN" placeholder="9788828765431" inputMode="numeric" />

          <div className="sm:col-span-2">
            <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
              Catalogue it
            </Button>
            <p className="mt-2 max-w-prose text-xs text-muted-foreground">
              A language is a code — <code className="font-mono">it</code>,{" "}
              <code className="font-mono">en</code>, <code className="font-mono">ja</code>.
              Cataloguing says what the object is; it does not say you have it. Holding it? Say so
              from <em>Known, not in the house</em> above, with what you paid. Which Series it
              belongs to, and where in it, is said from that Series.
            </p>
          </div>
        </form>
      </details>
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
    <li className="border-t border-dashed border-border first:border-t-0">
      <details className="group">
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
      <Input id={fieldId} name={name} className="h-10" {...props} />
    </div>
  );
}
