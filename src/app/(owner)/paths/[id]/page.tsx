import Link from "next/link";
import { notFound } from "next/navigation";
import { Drawer, OpensDrawer } from "@/components/drawer";
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
import { NAMING_A_ROUTE, SAYING_WHAT_A_ROUTE_IS_FOR, THE_PANELS_ON_A_ROUTE } from "../acts";
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
// **In the shell now** (#31), and three things follow from it.
//
//   1. **The width is spent on the two things that are read together**: the route on the
//      left, and on the right what the owner has said about it. A constraint is an
//      instruction to the advisor *about this route*, and reading it two screenfuls under
//      the route it holds over was reading it somewhere else. On a phone they are one
//      column, in the order they are asked about.
//   2. **The two acts that need a field are panels**, not a disclosure over the heading:
//      calling the route something else and saying what it is for are two verbs, so they are
//      two addresses and two forms — a `formAction` on a second submit needs a script to send
//      the right one, and a write that only works once a bundle has parsed is not a write
//      this application has. **The intent stays on the page** where it is read, in the
//      owner's own serif; the panel is the act and the prose is the record, exactly as an
//      Edition note is on a Volume (#30).
//   3. **A press that asks for nothing is a plain form**: putting a route aside takes no
//      field, and a picker under the list it adds to is not a panel either.
//
// A thin adapter over the core (ADR-0002): two queries, the verbs behind the forms, and
// no rule of its own about what a route may be.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

// The two acts this screen has that need a field are named in `../acts`, and the panel is
// read against them rather than trusted — the way the Volume's page reads one against the
// acts it offers: a hand-typed `?panel=banana` opens nothing, and neither does a panel for
// an act that is not on this screen.

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
  const panel = THE_PANELS_ON_A_ROUTE.find((one) => one === asked(said, "panel"));

  return (
    <main className="px-5 pb-16 sm:px-8">
      {/* No breadcrumb: the shell marks *Paths* while the owner is standing here. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pt-8 sm:pt-12">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h1 className="font-heading text-2xl sm:text-3xl">{path.name}</h1>
            {path.active ? null : (
              <Badge variant="outline" className="text-muted-foreground">
                Put aside
              </Badge>
            )}
          </div>

          {/* The intent, in the owner's words and in the owner's face. It is read here and
              written in a panel: what was said is the record, and the box is the act. */}
          {path.intent ? (
            <p className="mt-2 max-w-prose text-pretty font-serif text-prose italic">
              {path.intent}
            </p>
          ) : (
            <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
              Nothing said about what this route is for. The recommender reads those words to extend
              it rather than guess at a genre.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <OpensDrawer href={`${back}?panel=${NAMING_A_ROUTE}`}>Call it something else</OpensDrawer>
          <OpensDrawer href={`${back}?panel=${SAYING_WHAT_A_ROUTE_IS_FOR}`}>
            {path.intent ? "Restate what it is for" : "Say what it is for"}
          </OpensDrawer>
        </div>
      </header>

      {refused && !panel ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}

      {/* The route and what has been said about it, side by side at a desk. They are read
          together — a constraint is an instruction about *this* route — and one under the
          other on a phone, which is the order they are asked about. */}
      <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0">
          <section>
            <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
              The route, in my order
            </h2>

            {path.stops.length === 0 ? (
              <p className="mt-3 max-w-prose text-pretty text-sm text-muted-foreground">
                Nothing on this route yet. Put a Story on it below; it lands at the end, and the
                arrows move it.
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

          {/* **A picker under the list it adds to is not a panel** (#30's rule): saying
              which Story goes on the route is done while reading the route above it, and a
              drawer in front of it would be a door in front of a door. */}
          <section className="mt-8 rounded-xl ring-1 ring-foreground/10">
            <h2 className="px-4 pt-3 text-sm font-medium">
              Put a Story on this route
              <span className="ml-2 text-muted-foreground">— it lands at the end</span>
            </h2>

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
          </section>
        </div>

        <aside className="mt-10 min-w-0 lg:mt-0">
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
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="-ml-2.5 text-muted-foreground"
              >
                {path.active ? "Put this route aside" : "Take this route up again"}
              </Button>
            </form>
            <p className="mt-1 text-pretty text-xs text-muted-foreground">
              The Reading list composes itself from the active routes only. A route put aside keeps
              its order, so taking it up again costs nothing.
            </p>
          </section>
        </aside>
      </div>

      {/* Two acts, two panels, two verbs. One form calling both would invent a transaction
          that does not exist, and a second submit choosing between them would need a script. */}
      {panel === NAMING_A_ROUTE ? (
        <Drawer
          title="Call it something else"
          description="The route, its order and everything said about it are untouched. Only the name changes."
          refused={refused}
          closesTo={back}
        >
          <form action={rename} className="grid gap-4">
            <input type="hidden" name="pathId" value={path.id} />
            <input type="hidden" name="back" value={back} />
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Name</span>
              <input
                name="name"
                defaultValue={path.name}
                required
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
              />
            </label>
            <Button type="submit" className="h-11 w-full sm:h-10">
              Call it that
            </Button>
          </form>
        </Drawer>
      ) : null}

      {panel === SAYING_WHAT_A_ROUTE_IS_FOR ? (
        <Drawer
          title={path.intent ? "Restate what it is for" : "Say what it is for"}
          description="Your own words, read by the assistant that recommends. It extends the route from them rather than guessing at a genre."
          refused={refused}
          closesTo={back}
        >
          <form action={restateIntent} className="grid gap-4">
            <input type="hidden" name="pathId" value={path.id} />
            <input type="hidden" name="back" value={back} />
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">What this route is for</span>
              <textarea
                name="intent"
                rows={4}
                defaultValue={path.intent ?? ""}
                placeholder="privilegiare titoli davvero coerenti con samurai e cultura giapponese"
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 font-serif text-base leading-relaxed outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-prose dark:bg-input/30"
              />
            </label>
            <Button type="submit" className="h-11 w-full sm:h-10">
              Say it
            </Button>
            <p className="text-xs text-muted-foreground">
              Emptying it removes the words; the route is untouched.
            </p>
          </form>
        </Drawer>
      ) : null}
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
        <span className="whitespace-nowrap font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          {stop.type.name}
        </span>
        <span className="mt-0.5 flex items-baseline gap-3">
          <StoryStateLabel state={stop.state} />
          {/* The answer the spreadsheet's `Prossimo` column was maintained by hand for,
              printed where it belongs: on the stop it points at. */}
          {next ? (
            <span className="font-mono text-eyebrow uppercase tracking-eyebrow">
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
            className="h-11 px-2 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground sm:h-9"
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
