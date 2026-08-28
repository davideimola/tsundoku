import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PathStop } from "@/core/queries/path";
import { findPath } from "@/core/queries/path";
import { listStories } from "@/core/queries/story";
import { requireOwner } from "@/lib/auth/owner";
import { StoryStateLabel } from "../../stories/story-state";
import {
  makeFirst,
  moveEarlier,
  moveLater,
  placeStory,
  removeStory,
  rename,
  restateIntent,
  setActive,
} from "../actions";
import { DeclaredConstraints } from "../constraints";

// ONE PATH, and **the screen where the order is made by hand**. Everything else in this
// app derives; this is the one place the owner's judgement is typed in, so the order is
// what the page is built around:
//
// - The route is a **numbered rail**. The numbers are not decoration — they are the
//   judgement, and they are the only thing on the page that could not have been derived.
// - The next unread Story is **marked in the rail** rather than repeated somewhere else,
//   because "what comes next" is a position on the route and not a separate fact.
// - Re-ordering is two arrows, and they are **submit buttons in plain forms**. No
//   JavaScript runs on this page: no drag handle, no client component, nothing to hydrate
//   before the owner can move *Musashi* above *Vagabond* on a phone in a shop. A drag
//   interaction would be the only thing in this repo that needed a bundle to work, and it
//   would fail exactly where this app is used.
//
// A thin adapter over the core (ADR-0002): two queries, the verbs behind the forms, and
// no rule of its own about what a route may be.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function PathPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Asked>;
}) {
  await requireOwner();

  const { id } = await params;
  const [path, stories, said] = await Promise.all([findPath(id), listStories(), searchParams]);
  if (!path) notFound();

  const back = `/paths/${path.id}`;
  const onTheRoute = new Set(path.stops.map((stop) => stop.storyId));
  const elsewhere = stories.filter((story) => !onTheRoute.has(story.id));
  const refused = asked(said, "refused");

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 sm:px-8">
      <header className="pt-8 sm:pt-12">
        <Link
          href="/paths"
          className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          tsundoku / paths
        </Link>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h1 className="font-heading text-2xl sm:text-3xl">{path.name}</h1>
          {path.active ? null : (
            <Badge variant="outline" className="text-muted-foreground">
              Put aside
            </Badge>
          )}
        </div>
      </header>

      {refused ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}

      {/* The intent, in the owner's words, and editable in place: it is prose the
          recommender reads, so it is worth as much as the route itself. The name is
          editable beside it, because a route defined with a typo would otherwise keep
          the right name from ever being used again. Two forms rather than one: each
          submits to its own verb, and one form calling two would invent a transaction
          that does not exist. */}
      <details className="group mt-6">
        <summary className="cursor-pointer list-none marker:hidden">
          {path.intent ? (
            <span className="max-w-prose text-pretty italic">{path.intent}</span>
          ) : (
            <span className="text-sm text-muted-foreground underline underline-offset-4">
              Say what this route is for
            </span>
          )}
          <span className="ml-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground group-open:hidden">
            edit
          </span>
        </summary>

        <form action={rename} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="pathId" value={path.id} />
          <input type="hidden" name="back" value={back} />
          <label className="grid flex-1 gap-1.5">
            <span className="text-xs text-muted-foreground">Name</span>
            <input
              name="name"
              defaultValue={path.name}
              required
              autoComplete="off"
              className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
            />
          </label>
          <Button type="submit" variant="outline" className="h-11 sm:h-10 sm:px-5">
            Call it that
          </Button>
        </form>

        <form action={restateIntent} className="mt-3 grid gap-2">
          <input type="hidden" name="pathId" value={path.id} />
          <input type="hidden" name="back" value={back} />
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">What this route is for</span>
            <textarea
              name="intent"
              rows={3}
              defaultValue={path.intent ?? ""}
              placeholder="privilegiare titoli davvero coerenti con samurai e cultura giapponese"
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
          </label>
          <div>
            <Button type="submit" variant="outline" className="h-11 sm:h-10 sm:px-5">
              Say it
            </Button>
            <span className="ml-3 text-xs text-muted-foreground">
              Emptying it removes the words; the route is untouched.
            </span>
          </div>
        </form>
      </details>

      <section className="mt-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          The route, in my order
        </h2>

        {path.stops.length === 0 ? (
          <p className="mt-3 max-w-prose text-pretty text-sm text-muted-foreground">
            Nothing on this route yet. Put a Story on it below; it lands at the end, and the arrows
            move it.
          </p>
        ) : (
          <ol className="mt-3">
            {path.stops.map((stop, place) => (
              <Stop
                key={stop.storyId}
                stop={stop}
                place={place + 1}
                next={stop.storyId === path.next?.storyId}
                pathId={path.id}
                back={back}
                first={place === 0}
                last={place === path.stops.length - 1}
              />
            ))}
          </ol>
        )}

        {path.stops.length > 0 && path.next === null ? (
          <p className="mt-4 text-pretty text-sm text-muted-foreground">
            Nothing unread left on this route. Put another Story on it, or put the route aside.
          </p>
        ) : null}
      </section>

      <details className="group mt-8 rounded-xl ring-1 ring-foreground/10">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
          Put a Story on this route
          <span className="ml-2 text-muted-foreground group-open:hidden">
            — it lands at the end
          </span>
        </summary>

        <form
          action={placeStory}
          className="grid gap-3 border-t border-border p-4 sm:grid-cols-[1fr_auto]"
        >
          <input type="hidden" name="pathId" value={path.id} />
          <input type="hidden" name="back" value={back} />
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">Story</span>
            {/* A native select: it opens the platform picker on a phone and submits with
                the form whether JavaScript ran or not. Any Type — a route crosses them. */}
            <select
              name="storyId"
              required
              disabled={elsewhere.length === 0}
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:h-10 md:text-sm dark:bg-input/30"
            >
              {elsewhere.map((story) => (
                <option key={story.id} value={story.id}>
                  {story.title} — {story.type.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={elsewhere.length === 0}
              className="h-11 w-full sm:h-10 sm:w-auto sm:px-6"
            >
              Put it on
            </Button>
          </div>
          {elsewhere.length === 0 ? (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Every Story in the library is already on this route.
            </p>
          ) : null}
        </form>
      </details>

      <DeclaredConstraints
        constraints={path.constraints}
        pathId={path.id}
        back={back}
        scope="this route"
        placeholder="take it slowly, given the cost"
      />

      <section className="mt-10 border-t border-border pt-4">
        <form action={setActive}>
          <input type="hidden" name="pathId" value={path.id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="active" value={path.active ? "false" : "true"} />
          <Button type="submit" variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground">
            {path.active ? "Put this route aside" : "Take this route up again"}
          </Button>
        </form>
        <p className="mt-1 max-w-prose text-pretty text-xs text-muted-foreground">
          The Reading list composes itself from the active routes only. A route put aside keeps its
          order, so taking it up again costs nothing.
        </p>
      </section>
    </main>
  );
}

/**
 * One stop on the route: its place, the Story, and the two arrows that change its place.
 *
 * The place is printed in the rail and the next unread Story is marked there too, so the
 * order and the answer read as one thing rather than as a list plus a banner.
 */
function Stop({
  stop,
  place,
  next,
  pathId,
  back,
  first,
  last,
}: {
  stop: PathStop;
  place: number;
  next: boolean;
  pathId: string;
  back: string;
  first: boolean;
  last: boolean;
}) {
  return (
    <li className="flex items-baseline gap-3 border-t border-border py-3 first:border-t-0">
      {/* The rail. Tabular so a two-digit route stays a straight line. The place is
          always printed — it is the judgement, and hiding it behind the marker would
          replace the one thing on the page that could not have been derived. */}
      <span
        className={`w-8 shrink-0 text-right font-mono text-xs tabular-nums ${
          next ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {place}
      </span>

      <span className="min-w-0 flex-1">
        <Link
          href={`/stories/${stop.storyId}`}
          className={`underline-offset-4 outline-none hover:underline focus-visible:underline ${
            next ? "font-heading" : ""
          }`}
        >
          {stop.title}
        </Link>{" "}
        <span className="whitespace-nowrap font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {stop.type.name}
        </span>
        <span className="mt-0.5 flex items-baseline gap-3">
          <StoryStateLabel state={stop.state} />
          {/* The answer the spreadsheet's `Prossimo` column was maintained by hand for,
              printed where it belongs: on the stop it points at. */}
          {next ? (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em]">
              ← next on this route
            </span>
          ) : null}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1">
        {/* One tap for the move the arrows are the wrong tool for: a Story forty stops
            down that the owner has decided to read next. */}
        <form action={makeFirst}>
          <Where pathId={pathId} storyId={stop.storyId} back={back} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={first}
            aria-label={`Move ${stop.title} to the front of this route`}
            className="h-11 px-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground sm:h-9"
          >
            first
          </Button>
        </form>
        <Nudge
          action={moveEarlier}
          pathId={pathId}
          stop={stop}
          back={back}
          disabled={first}
          label={`Move ${stop.title} one place earlier`}
          glyph="↑"
        />
        <Nudge
          action={moveLater}
          pathId={pathId}
          stop={stop}
          back={back}
          disabled={last}
          label={`Move ${stop.title} one place later`}
          glyph="↓"
        />
        <form action={removeStory}>
          <Where pathId={pathId} storyId={stop.storyId} back={back} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label={`Take ${stop.title} off this route`}
            title="Take it off this route"
            className="size-11 text-muted-foreground sm:size-9"
          >
            ×
          </Button>
        </form>
      </span>
    </li>
  );
}

/**
 * Which Story on which route, and where to come back to: what every control on a stop
 * has to say, in one place rather than four inputs repeated per form.
 */
function Where({ pathId, storyId, back }: { pathId: string; storyId: string; back: string }) {
  return (
    <>
      <input type="hidden" name="pathId" value={pathId} />
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="back" value={back} />
    </>
  );
}

/** One arrow: a form with a verb behind it, and nothing running in the browser. */
function Nudge({
  action,
  pathId,
  stop,
  back,
  disabled,
  label,
  glyph,
}: {
  action: (form: FormData) => Promise<void>;
  pathId: string;
  stop: PathStop;
  back: string;
  disabled: boolean;
  label: string;
  glyph: string;
}) {
  return (
    <form action={action}>
      <Where pathId={pathId} storyId={stop.storyId} back={back} />
      {/* Touch-sized on a phone, tighter on a desk. Disabled at the ends of the route
          rather than hidden, so the arrows do not move under the thumb. */}
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={label}
        className="size-11 text-muted-foreground sm:size-9"
      >
        {glyph}
      </Button>
    </form>
  );
}
