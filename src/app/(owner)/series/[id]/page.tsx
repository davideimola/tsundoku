import Link from "next/link";
import { notFound } from "next/navigation";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  findSeries,
  listVolumesOutsideASeries,
  whatAMergeWouldCollapse,
} from "@/core/queries/series";
import { requireOwner } from "@/lib/auth/owner";
import { collect, conclude, merge, place, recordPublished, stopCollecting } from "../actions";
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
const MERGE = "merge";
const PANELS = [PLACE, PUBLISHED, MERGE] as const;

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

  const [series, placeable, collapsing] = await Promise.all([
    findSeries(id),
    // Read only where the panel that offers them is open. The objects in no Series are not on
    // this screen otherwise, and a page reading rows it will not show is the thing the filter
    // rule in `AGENTS.md` is about.
    panel === PLACE ? listVolumesOutsideASeries() : [],
    // Two counts rather than the rows behind them, which is why this is read on every visit
    // and not only behind the panel: whether the merge is offered at all depends on there
    // being something to collapse, and the panel then says the same two numbers out loud.
    whatAMergeWouldCollapse(id),
  ]);

  if (!series) notFound();

  const collecting = Boolean(series.collectingSince);
  // Offered only where there is something to collapse. A line with no objects placed in it, or
  // one whose objects stand for no narrative yet, is a line the gesture refuses — and a control
  // that is only ever refused is a control that should not be drawn.
  const mergeable = (collapsing?.narratives ?? 0) > 0;
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

        {/* **The one row on this screen that points out of the ledger** (#39). Everything in
            the row above counts objects — a publisher, an edition, a status, a number out —
            and this names a *narrative*, so it stands on its own rather than joining them
            behind a middle dot.

            Drawn only where the Series says which Story it publishes, and there is
            deliberately nothing here when it does not: this screen stays a place the owner
            *looks* rather than one they edit, and an empty slot with a control in it would be
            the Series screen quietly becoming a second place a narrative is managed. */}
        {series.publishes ? (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
              Publishes
            </span>
            <Link
              href={`/stories/${series.publishes.id}`}
              className="rounded font-heading text-base underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {series.publishes.title}
            </Link>
          </p>
        ) : null}

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

        {/* **The merge, offered where the line is drawn and not in the hero** (#41). It is the
            one act on this screen that makes a *narrative*, and the two reasons it is here are
            the same reason: it is about the sequence above it rather than about the ledger, and
            the hero's three presses are peers of each other in a way a fourth would not have
            been (#33 on the Collection, where four pills in a wrapping row was the symptom).

            **Drawn once in a Series' life.** A line that already publishes a Story carries the
            *Publishes* link in the hero instead, so the moment this is pressed the offer is gone
            and the link is there — which is what keeps that row's rule true: the Series screen
            is still a place the owner looks, and the one press that mints a narrative hands them
            straight to the page it is managed from. */}
        {!series.publishes && mergeable && collapsing ? (
          <p className="mt-6 max-w-prose text-pretty text-sm text-muted-foreground">
            These <span className="tabular-nums text-foreground">{collapsing.objects}</span> objects
            stand for <span className="tabular-nums text-foreground">{collapsing.narratives}</span>{" "}
            {collapsing.narratives === 1 ? "narrative" : "narratives"}, and volume seven is not a
            thing you would give a score to.{" "}
            <Link
              href={panelled(series.id, MERGE)}
              className="rounded text-foreground underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Merge them into one Story
            </Link>
            .
          </p>
        ) : null}
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

      {/* **The gesture that undoes a split the owner never asked for** (#41). It asks for one
          field — what the work is called — so it is a panel and not a plain press, and the field
          arrives filled in with the line's own name, because that is the answer nine times out
          of ten.

          The two numbers lead, in the ledger's own tabular face: *eighteen narratives across
          twenty objects become one* is the whole of what the press does, and it is the one thing
          the owner cannot read anywhere else on the screen. Under the field, what comes with the
          work and what does not — said before the press, the way a strike says what it takes, so
          nothing about the shelf is a surprise afterwards. */}
      {panel === MERGE && collapsing ? (
        <Drawer
          title="Merge into one Story"
          description="A line prints one Story. This is the gesture that says so, and it is pressed once per Series."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={merge} className="grid gap-5">
            <input type="hidden" name="seriesId" value={series.id} />

            <p className="text-pretty font-heading text-lg leading-snug">
              <span className="tabular-nums">{collapsing.narratives}</span>
              {collapsing.narratives === 1 ? " narrative across " : " narratives across "}
              <span className="tabular-nums">{collapsing.objects}</span>
              {collapsing.objects === 1 ? " object becomes one." : " objects become one."}
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="merge-title" className="text-xs text-muted-foreground">
                What the Story is called
              </Label>
              <Input
                id="merge-title"
                name="title"
                defaultValue={series.name}
                required
                className="h-11 sm:h-10"
              />
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Merge them
            </Button>

            <div className="grid gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <p className="max-w-prose text-pretty">
                Every object of the line carries that Story afterwards, and any Rating, every Reading
                and every Credit come with it. A route or a Want naming one of these narratives
                comes to name it instead.
              </p>
              <p className="max-w-prose text-pretty">
                Nothing you own moves: the Volumes, the acquisitions and the count published are
                exactly as they are now. Nothing is merged at all if two of these narratives are
                judged apart — a Story has one score to give.
              </p>
            </div>
          </form>
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
  if (asked(params, "merged"))
    return "Merged. The line prints one Story now, and it is linked above — everything you own is where it was.";
  const placed = asked(params, "placed");
  if (placed) return `Placed as ${placed} of this Series.`;
  return undefined;
}
