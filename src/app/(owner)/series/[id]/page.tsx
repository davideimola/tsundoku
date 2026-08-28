import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findSeries, listVolumesOutsideASeries } from "@/core/queries/series";
import { requireOwner } from "@/lib/auth/owner";
import { collect, conclude, place, recordPublished, stopCollecting } from "../actions";
import { Completeness } from "../completeness";

// One Series, and everything the owner does to it: decide they are completing it, record
// what the publisher has done, and say which position of it each object on the shelf is.
//
// The order on the page is the order of the question. **What is missing comes first** —
// that is what the screen is for — then the shelf, then the acts that change either. The
// decision to collect sits above the shelf on purpose: it is the thing that turns a Series
// the owner knows about into a project, and no amount of buying performs it.
//
// A thin adapter over the core (ADR-0002), plain and phone-first like the Collection.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function SeriesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Asked>;
}) {
  await requireOwner();

  const { id } = await params;
  const [series, placeable, asks] = await Promise.all([
    findSeries(id),
    listVolumesOutsideASeries(),
    searchParams,
  ]);

  if (!series) notFound();

  const collecting = Boolean(series.collectingSince);
  const refused = asked(asks, "refused");
  const news = newsFrom(asks);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <Link
          href="/series"
          className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          tsundoku / series
        </Link>
        <h1 className="mt-6 font-heading text-2xl sm:text-3xl">{series.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{series.publisher}</span>
          {series.editionLine ? <Badge variant="outline">{series.editionLine}</Badge> : null}
          <span>·</span>
          <span>{series.status === "ongoing" ? "Ongoing" : "Concluded"}</span>
          <span>·</span>
          <span className="tabular-nums">{series.publishedCount} published</span>
        </p>
      </header>

      {refused ? (
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

      <section className="mt-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          {collecting ? "What I am missing" : "Not collecting this Series"}
        </h2>

        <div className="mt-4">
          {collecting ? (
            <Completeness publishedCount={series.publishedCount} missing={series.missing ?? []} />
          ) : (
            <p className="text-pretty text-sm text-muted-foreground">
              {series.ownedCount} of {series.publishedCount} published Volumes are in the house, and
              that is all it means. Nothing is missing from a Series you have not decided to
              complete — holding 42 of Naruto's 72 volumes opens no project.
            </p>
          )}
        </div>

        <form action={collecting ? stopCollecting : collect} className="mt-5">
          <input type="hidden" name="seriesId" value={series.id} />
          <Button
            type="submit"
            variant={collecting ? "outline" : "default"}
            className="h-11 w-full sm:h-10 sm:w-auto sm:px-6"
          >
            {collecting ? "Stop collecting it" : "Collect this Series"}
          </Button>
          {series.collectingSince ? (
            <span className="mt-2 block text-xs text-muted-foreground sm:ml-3 sm:mt-0 sm:inline">
              Collecting since {series.collectingSince}. Stopping keeps every Volume you own.
            </span>
          ) : null}
        </form>
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          On the shelf
        </h2>

        {series.volumes.length === 0 ? (
          <p className="mt-4 text-pretty text-sm text-muted-foreground">
            No Volume of this Series is placed in it yet. Record one below, and the missing list is
            what remains.
          </p>
        ) : (
          <ul className="mt-2">
            {series.volumes.map((volume) => (
              <li
                key={volume.id}
                className="flex items-baseline gap-3 border-t border-border py-3 first:border-t-0"
              >
                <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {volume.number}
                </span>
                <span className="min-w-0 flex-1 truncate">{volume.title}</span>
                <Badge variant="outline" className="shrink-0">
                  {volume.binding.name}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {/* Placing is chosen from the Collection rather than typed, because the owner
            knows which of their objects is volume 3 and a screen matching on words would
            place the wrong one confidently. */}
        <details className="group mt-6 rounded-xl ring-1 ring-foreground/10">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
            Place a Volume in this Series
            <span className="ml-2 text-muted-foreground group-open:hidden">
              — which position it is
            </span>
          </summary>

          {placeable.length === 0 ? (
            <p className="text-pretty border-t border-border p-4 text-sm text-muted-foreground">
              Every Volume in the house already belongs to a Series. Record the object in the
              Collection first, then place it here.
            </p>
          ) : (
            <form
              action={place}
              className="grid gap-4 border-t border-border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            >
              <input type="hidden" name="seriesId" value={series.id} />

              <div className="grid gap-1.5">
                <Label htmlFor="place-volume" className="text-xs text-muted-foreground">
                  Volume
                </Label>
                <select
                  id="place-volume"
                  name="volumeId"
                  required
                  className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
                >
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
                  className="h-11 sm:h-10 sm:w-24"
                />
              </div>

              <Button type="submit" className="h-11 sm:h-10 sm:px-6">
                Place it
              </Button>
            </form>
          )}
        </details>
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          What the publisher has done
        </h2>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          The count is yours to keep true: nothing here reads a catalogue. An ongoing Series grows,
          and a concluded one is a finite thing you can finish.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <form action={recordPublished} className="grid gap-1.5">
            <input type="hidden" name="seriesId" value={series.id} />
            <Label htmlFor="published-count" className="text-xs text-muted-foreground">
              Volumes published
            </Label>
            <div className="flex gap-2">
              <Input
                id="published-count"
                name="publishedCount"
                inputMode="numeric"
                defaultValue={series.publishedCount}
                className="h-11 w-24 sm:h-10"
              />
              <Button type="submit" variant="outline" className="h-11 sm:h-10">
                Record it
              </Button>
            </div>
          </form>

          {series.status === "ongoing" ? (
            <form action={conclude} className="grid content-end gap-1.5">
              <input type="hidden" name="seriesId" value={series.id} />
              <Button type="submit" variant="outline" className="h-11 sm:h-10">
                Record it as concluded
              </Button>
              <span className="text-xs text-muted-foreground">
                There is no way back: a publisher restarting a Series is a new edition, which is a
                second Series.
              </span>
            </form>
          ) : null}
        </div>
      </section>
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
