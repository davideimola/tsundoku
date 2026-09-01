import Link from "next/link";
import { notFound } from "next/navigation";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findSeries, listVolumesOutsideASeries } from "@/core/queries/series";
import { requireOwner } from "@/lib/auth/owner";
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

  const [series, placeable] = await Promise.all([
    findSeries(id),
    // Read only where the panel that offers them is open. The objects in no Series are not on
    // this screen otherwise, and a page reading rows it will not show is the thing the filter
    // rule in `AGENTS.md` is about.
    panel === PLACE ? listVolumesOutsideASeries() : [],
  ]);

  if (!series) notFound();

  const collecting = Boolean(series.collectingSince);
  const refused = asked(asks, "refused");
  const news = newsFrom(asks);
  const closesTo = `/series/${series.id}`;

  return (
    <main className="px-5 pb-16 sm:px-8">
      {/* No breadcrumb: the shell marks *Series* while the owner is standing here, so a
          trail one step long was a second answer to a question the chrome answers. */}
      <header className="pt-8 sm:pt-12">
        <h1 className="text-pretty font-heading text-2xl leading-tight sm:text-3xl">
          {series.name}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{series.publisher}</span>
          {series.editionLine ? <Badge variant="outline">{series.editionLine}</Badge> : null}
          <span>·</span>
          <span>{series.status === "ongoing" ? "Ongoing" : "Concluded"}</span>
          <span>·</span>
          <span className="tabular-nums">{series.publishedCount} published</span>
        </p>

        {/* **The decision leads, because it is the one act that changes what this screen
            means**: the same hollow position is *missing* under a collecting project and
            merely empty without one. The two maintenance acts follow it, quietly. */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
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

          <OpensDrawer href={panelled(series.id, PLACE)}>Place a Volume</OpensDrawer>
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
        <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          {collecting ? "What I am missing" : "What is here, position by position"}
        </h2>

        {/* Drawn either way, because what the publisher has done is worth knowing before
            anything is decided — and *said* differently, because a hollow position of a
            Series nobody is collecting is empty and not a shopping list. */}
        <div className="mt-4">
          <Spines ledger={series} volumes={series.volumes} />
        </div>

        {collecting ? (
          <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
            Collecting since {series.collectingSince}. Stopping ends the project and nothing else:
            every Volume you own stays in the house.
          </p>
        ) : (
          <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
            {series.ownedCount} of {series.publishedCount} published Volumes are in the house, and
            that is all it means. Nothing is missing from a Series you have not decided to complete
            — holding 42 of Naruto's 72 volumes opens no project.
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          On the shelf
        </h2>

        {series.volumes.length === 0 ? (
          <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
            No Volume of this Series is placed in it yet. Place one above, and the missing list is
            what remains.
          </p>
        ) : (
          /* The same objects the spines are drawn from, in words. A spine carries its title
             up its side and as its label, which a pointer and a screen reader read and a
             thumb does not — so the titles are here too, where they can be read at any
             width, with the Binding that tells two printings of one position apart. */
          <ul className="mt-2">
            {series.volumes.map((volume) => (
              <li key={volume.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/collection/${volume.id}`}
                  className="flex items-baseline gap-3 py-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {volume.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{volume.title}</span>
                  <Badge variant="outline" className="shrink-0">
                    {volume.binding.name}
                  </Badge>
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
          description="Which position of the publisher's line the object is. It is the fact the spines are drawn from, and the one nothing else can infer."
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
                <Label htmlFor="place-volume" className="text-xs text-muted-foreground">
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
                <Label htmlFor="place-number" className="text-xs text-muted-foreground">
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
          description="The count is yours to keep true: nothing here reads a catalogue. An ongoing Series grows, and a concluded one is a finite thing you can finish."
          refused={refused}
          closesTo={closesTo}
        >
          <div className="grid gap-6">
            <form action={recordPublished} className="grid gap-3">
              <input type="hidden" name="seriesId" value={series.id} />
              <div className="grid gap-1.5">
                <Label htmlFor="published-count" className="text-xs text-muted-foreground">
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
