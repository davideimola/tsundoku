import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listCollectionWall } from "@/core/queries/collection";
import { findSeries, listVolumesOutsideASeries } from "@/core/queries/series";
import { findStory } from "@/core/queries/story";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { collect, conclude, place, recordPublished, stopCollecting } from "../actions";
import { Spines } from "../spines";

// One Series, and everything the owner does to it: decide they are completing it, record
// what the publisher has done, and say which position of it each object on the shelf is.
//
// The order on the page is the order of the question. **The picture comes first** — that is
// what the screen is for — and the acts stand above it in the hero, where the two maintenance
// ones are a press away rather than two screenfuls down.
//
// **The spines are the screen** (#30). A publisher's ordered sequence drawn as one: a spine
// per position, filled in the Series' own colour where the object is in the house and hollow
// where it is not, each filled one a way onto the object's own page. The gaps are the answer,
// and they are readable at arm's length in a shop without reading a number.
//
// **The decision to collect is the loud act, and it is never implied.** Buying the whole of
// something performs no decision here: the hollow positions of a Series the owner has not
// decided to complete are *not in the house* and are not missing, which is the difference
// `../positions.ts` exists to keep — holding 42 of Naruto's 72 volumes opens no project. It is
// a plain form and deliberately **not** a panel: it asks for nothing, and a drawer over a
// press with no field in it would be a door in front of a door
// (`@/components/drawer` holds the rule — a panel is for an act that needs a field).
//
// **Nothing on this screen edits a narrative** (#34, user stories 35 and 36). The line's own
// arrow — *this Series publishes that Story* — is read here and set on the Story's page, which
// is the single place a work is managed. That is what keeps this screen answerable in a shop:
// it counts objects, and the one question it answers is *what am I missing*.
//
// **The two maintenance acts are panels** (#32's pattern, adopted here): placing an object at
// a position, and recording what the publisher has done. Both were disclosures and a card at
// the foot of the page, which put a form nobody fills in most visits between the ledger and
// nothing at all. Their open state is the URL, so they cost no script, they are linkable and
// the back button closes them.
//
// A thin adapter over the core (ADR-0002), and every write on it is a plain form post: the
// screen works with nothing running in the browser.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

// The two panels this screen has, read against this list rather than trusted: `?panel=banana`
// opens nothing, which is the honesty every filter on every wall is held to.
const PLACE = "place";
const PUBLISHED = "published";
const PANELS = [PLACE, PUBLISHED] as const;

/** One of them, so an address cannot be built for a panel this screen does not have. */
type Panel = (typeof PANELS)[number];

/**
 * This screen's address with a panel open on it.
 *
 * A Series is one record and this page narrows nothing, so the address carries the panel and
 * nothing else — and deliberately not the news of the last write, which is about the press
 * that produced it and would otherwise be printed again over an act nobody just performed.
 */
function panelled(seriesId: string, panel: Panel): string {
  return `/series/${seriesId}?panel=${panel}`;
}

// shadcn's own input look, borrowed by hand for the native picker in the placing panel — its
// select is a scripted component, and every control here has to work with nothing running.
const PICKER =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30";

export default async function SeriesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Asked>;
}) {
  await requireOwner();

  const [{ id }, asks] = await Promise.all([params, searchParams]);
  const panel = PANELS.find((one) => one === asked(asks, "panel"));

  const [series, placeable, faced] = await Promise.all([
    findSeries(id),
    // Read only where the panel that offers them is open. The objects in no Series are not on
    // this screen otherwise, and a page reading rows it will not show is the thing the filter
    // rule in `AGENTS.md` is about.
    panel === PLACE ? listVolumesOutsideASeries() : [],
    // **The jackets of the objects in the house**, read for one thing: the cover the hero
    // stands beside the name. `findSeries` lists the objects without their faces, and the
    // Collection wall narrowed to this Series is the existing question that has them.
    listCollectionWall({ series: id }),
  ]);

  if (!series) notFound();

  // The first Volume in the house that is faced with anything: how the owner recognises the
  // line, the way a bookshop faces out volume one.
  const firstFaced = faced.find((volume) => volume.cover) ?? null;
  // **What it publishes, as a work**: the Type and who made it, for the hero's two lines. A
  // Series has neither of its own (ADR-0006), so they are read off the Story it publishes,
  // where it says which; a Series that names none simply goes without.
  const work = series.publishes ? await findStory(series.publishes.id) : null;
  const jackets = new Map(faced.map((volume) => [volume.id, volume.cover]));
  const makers = work ? [...new Set(work.credits.map((credit) => credit.person.name))] : [];

  const collecting = Boolean(series.collectingSince);
  const refused = asked(asks, "refused");
  const news = newsFrom(asks);
  const closesTo = `/series/${series.id}`;

  return (
    <main className="px-5 pb-16 sm:px-8">
      {/* No breadcrumb: the shell marks *Series* while the owner is standing here, so a
          trail one step long was a second answer to a question the chrome answers. */}
      {/* **The hero, like a Story's** (ADR-0026, second tranche): the line's first faced
          Volume beside its name, what it is in one quiet line, the name in the display serif
          and who made it in the serif under it — and, across from them, the ledger's one
          figure, *N of M in the house*, over a gilt bar, because how far a line has got is
          progress and progress is gilt.

          No breadcrumb: the shell marks *Series* while the owner is standing here. */}
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-8 sm:pt-12">
        <div className="flex min-w-0 flex-wrap items-end gap-x-7 gap-y-5">
          <Cover
            size="hero"
            href={firstFaced ? `/collection/${firstFaced.id}` : undefined}
            title={series.name}
            tint={tint(series.id)}
            image={firstFaced?.cover}
            label={
              firstFaced
                ? `${firstFaced.title}, the first Volume of ${series.name} in the house`
                : series.name
            }
            className="w-[6.5rem] shrink-0 sm:w-[8.25rem]"
          />

          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">
              {[
                work?.type.name,
                series.publisher,
                series.editionLine,
                series.status === "ongoing" ? "still coming out" : "concluded",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <h1 className="text-balance font-heading text-name font-semibold lg:text-name-lg">
              {series.name}
            </h1>
            {makers.length > 0 ? (
              <p className="font-heading text-xl font-medium">{makers.join(", ")}</p>
            ) : null}

            {/* **The one row that points out of the ledger** (#39): the narrative this line
                publishes, which is read here and set on that Story's own page. Drawn only
                where the Series says which. */}
            {series.publishes ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Publishes{" "}
                <Link
                  href={`/stories/${series.publishes.id}`}
                  className="rounded-sm font-heading text-base font-semibold text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {series.publishes.title}
                </Link>
              </p>
            ) : null}
          </div>
        </div>

        <InTheHouse
          owned={series.ownedCount}
          published={series.publishedCount}
          collecting={collecting}
          missing={series.missing?.length ?? null}
        />

        {/* **The decision leads, because it is the one act that changes what this screen
            means**: the same hollow position is *missing* under a collecting project and
            merely empty without one. It is the one cloth act until it is taken; then it is
            outlined, and the two maintenance acts follow it. */}
        <div className="flex w-full flex-wrap items-center gap-2.5">
          <form action={collecting ? stopCollecting : collect}>
            <input type="hidden" name="seriesId" value={series.id} />
            <Button
              type="submit"
              variant={collecting ? "outline" : "default"}
              className="h-11 sm:h-10 sm:px-6"
            >
              {collecting ? "Stop collecting it" : "Collect this Series"}
            </Button>
          </form>

          <OpensDrawer href={panelled(series.id, PLACE)} emphasis={collecting ? "loud" : "quiet"}>
            Place a Volume
          </OpensDrawer>
          <OpensDrawer href={panelled(series.id, PUBLISHED)}>
            What the publisher has done
          </OpensDrawer>
        </div>
      </header>

      {/* On the page only where no panel is standing over it: a refused write comes back with
          its panel open, and the panel is where the sentence is printed. */}
      {refused && !panel ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {news ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {news}
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="font-heading text-section font-semibold">
          {collecting ? "What I am missing" : "What is here, position by position"}
        </h2>
        {/* Drawn either way, because what the publisher has done is worth knowing before
            anything is decided — and *said* differently, because a hollow position of a
            Series nobody is collecting is empty and not a shopping list. */}
        <p className="mt-1.5 max-w-prose text-pretty text-sm text-muted-foreground">
          Each spine is a Volume, and the filled ones are in the house.{" "}
          {collecting ? (
            <>
              Collecting since{" "}
              <span className="whitespace-nowrap tabular-nums">{series.collectingSince}</span>.
            </>
          ) : (
            "Nothing counts as missing until you decide to collect it."
          )}
        </p>

        <div className="mt-5">
          <Spines ledger={series} volumes={series.volumes} />
        </div>
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="font-heading text-section font-semibold">On the shelf</h2>
        <p className="mt-1.5 text-pretty text-sm text-muted-foreground">
          The same Volumes, by name, with the Binding that tells two printings apart.
        </p>

        {series.volumes.length === 0 ? (
          <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
            No Volume of this Series is placed in it yet. Place one above, and the missing list is
            what remains.
          </p>
        ) : (
          /* The same objects the spines are drawn from, in words: a spine carries its title up
             its side, which a pointer and a screen reader read and a thumb does not. Each row
             opens on the object's own small cover, where it has one. */
          <ul className="mt-4 border-b border-border">
            {series.volumes.map((volume) => (
              <li key={volume.id} className="border-t border-border">
                <Link
                  href={`/collection/${volume.id}`}
                  className="flex items-center gap-4 py-2.5 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Cover
                    size="thumb"
                    title={volume.title}
                    tint={tint(series.id)}
                    image={jackets.get(volume.id)}
                    className="w-10 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-lg font-semibold leading-snug">
                      {volume.title}
                    </span>
                    <span className="block text-label text-muted-foreground">
                      <span className="tabular-nums">{volume.number}</span> of the Series ·{" "}
                      {volume.binding.name}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Placing is chosen from the Collection rather than typed, because the owner knows
          which of their objects is volume 3 and a screen matching on words would place the
          wrong one confidently. */}
      {panel === PLACE ? (
        <Drawer
          title="Place a Volume in this Series"
          description="Which position of the publisher's line this object is."
          refused={refused}
          closesTo={closesTo}
        >
          {placeable.length === 0 ? (
            <p className="max-w-prose text-pretty text-sm text-muted-foreground">
              Every Volume in the house already belongs to a Series. Record the object in the
              Collection first, then place it here.
            </p>
          ) : (
            <form action={place} className="grid gap-4">
              <input type="hidden" name="seriesId" value={series.id} />

              <div className="grid gap-1.5">
                <Label
                  htmlFor="place-volume"
                  className="text-label font-medium text-muted-foreground"
                >
                  Volume
                </Label>
                <select id="place-volume" name="volumeId" required className={PICKER}>
                  {placeable.map((volume) => (
                    <option key={volume.id} value={volume.id}>
                      {volume.title}
                      {volume.editionLine ? ` — ${volume.editionLine}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="place-number"
                  className="text-label font-medium text-muted-foreground"
                >
                  Position
                </Label>
                <Input
                  id="place-number"
                  name="number"
                  inputMode="numeric"
                  placeholder="3"
                  required
                  className="h-11 sm:h-10"
                />
              </div>

              <Button type="submit" className="h-11 w-full sm:h-10">
                Place it
              </Button>
              <p className="max-w-prose text-xs text-muted-foreground">
                An object can stand at a position past the count: the count is yours to keep true
                and nothing here reads a catalogue, so the line is drawn to whichever is further.
              </p>
            </form>
          )}
        </Drawer>
      ) : null}

      {/* **Two acts in one panel, and two forms rather than two submits.** They are one
          subject — what the publisher has done — and each posts on its own, because a second
          submit carrying its own `formAction` needs a script to send the right one and a write
          that only works once a bundle has parsed is not a write this application has
          (ADR-0010). */}
      {panel === PUBLISHED ? (
        <Drawer
          title="What the publisher has done"
          description="How many are out, and whether the line is over. Nothing here reads a catalogue, so the count is yours to keep true."
          refused={refused}
          closesTo={closesTo}
        >
          <div className="grid gap-6">
            <form action={recordPublished} className="grid gap-3">
              <input type="hidden" name="seriesId" value={series.id} />
              <div className="grid gap-1.5">
                <Label
                  htmlFor="published-count"
                  className="text-label font-medium text-muted-foreground"
                >
                  Volumes published
                </Label>
                <Input
                  id="published-count"
                  name="publishedCount"
                  inputMode="numeric"
                  defaultValue={series.publishedCount}
                  className="h-11 sm:h-10"
                />
              </div>
              <Button type="submit" className="h-11 w-full sm:h-10">
                Record it
              </Button>
              <p className="max-w-prose text-xs text-muted-foreground">
                It is what the line is drawn to, and — under a collecting project — what the missing
                list is counted against.
              </p>
            </form>

            {series.status === "ongoing" ? (
              <form action={conclude} className="grid gap-3 border-t border-border pt-5">
                <input type="hidden" name="seriesId" value={series.id} />
                <Button type="submit" variant="outline" className="h-11 w-full sm:h-10">
                  Record it as concluded
                </Button>
                <p className="max-w-prose text-xs text-muted-foreground">
                  There is no way back: a publisher restarting a Series is a new edition, which is a
                  second Series with its own count.
                </p>
              </form>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </main>
  );
}

/** What just happened, in the interface's own words. */
function newsFrom(params: Asked): string | undefined {
  if (asked(params, "collecting"))
    return "You are collecting this Series. What is missing is below.";
  if (asked(params, "stopped")) return "No longer collecting it. Every Volume you own stays yours.";
  if (asked(params, "recorded")) return "The count of published Volumes is recorded.";
  if (asked(params, "concluded")) return "Recorded as concluded: nothing more is coming.";
  const placed = asked(params, "placed");
  if (placed) return `Placed as ${placed} of this Series.`;
  return undefined;
}

/**
 * **The ledger's one figure**: how many of the published Volumes are in the house, said in
 * the serif over a gilt bar — gilt because it is how far the line has got, and progress is
 * the one thing gilt is spent on. The sentence under it is what the figure means, which
 * depends on whether the owner decided to complete the line at all: under a collecting
 * project the rest are *to go*; without one they are simply not here.
 */
function InTheHouse({
  owned,
  published,
  collecting,
  missing,
}: {
  owned: number;
  published: number;
  collecting: boolean;
  missing: number | null;
}) {
  const share = published > 0 ? Math.min(1, owned / published) : 0;

  return (
    <div className="flex min-w-64 flex-col gap-2">
      <p className="font-heading text-2xl font-semibold tabular-nums">
        {owned} of {published} in the house
      </p>
      <span
        role="img"
        aria-label={`${owned} of ${published} Volumes in the house`}
        className="block h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-gilt"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
      <p className="text-label text-muted-foreground">
        {!collecting
          ? "You are not collecting it."
          : missing === 0 || missing === null
            ? "You are collecting it, and it is complete."
            : `You are collecting it. ${missing} to go.`}
      </p>
    </div>
  );
}
