import Link from "next/link";
import { notFound } from "next/navigation";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PathCandidate, PathStop } from "@/core/queries/path";
import { findPath, listStoriesNotOnPath } from "@/core/queries/path";
import { requireOwner } from "@/lib/auth/owner";
import { tint, UNWORN, WORN, worn } from "@/lib/tint";
import { cn } from "@/lib/utils";
import { StoryStateLabel } from "../../stories/story-state";
import {
  makeFirst,
  moveEarlier,
  moveLater,
  placeStories,
  removeStory,
  rename,
  restateIntent,
  setActive,
} from "../actions";
import { NAMING_A_ROUTE, SAYING_WHAT_A_ROUTE_IS_FOR, THE_PANELS_ON_A_ROUTE } from "../acts";
import { DeclaredConstraints } from "../constraints";
import { type Run, theRunsOnOffer, theWholeRunPress } from "./candidates";

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
// - **Stories arrive by the run, not one at a time.** The picker was a `<select>` of every
//   Story in the library and a button, so a route through twenty tankōbon was twenty
//   searches and twenty round trips — which is why nobody built one. It is now a banded
//   list of what could still go on this route: ticks for the ordinary case, and one press
//   over a whole line for the case that made this worth changing. What it is banded by is
//   the judgement (`./candidates.ts`): the **line the objects stand in**, because that is
//   the run the owner is working through, and it arrives already wearing the colour the
//   wall taught them.
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

// **What the owner is looking for in the picker, and the form the ticks belong to.**
//
// `PICK` is a filter and lives in the URL like every other one (`AGENTS.md`): the picker
// narrowed to *slam* is a `GET` of this same screen, so it survives a refresh and costs no
// script. `PLACE` is the id the row checkboxes point their `form` attribute at — the rows sit
// outside that form, because each band header holds a form of its own and HTML has no nested
// forms. Both are strings two places spell, which is what buys them a name.
const PICK = "pick";
const PLACE = "put-them-on";

export default async function PathPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Asked>;
}) {
  await requireOwner();

  const { id } = await params;
  const said = await searchParams;

  // What the owner typed into the picker, which is the one narrowing this screen has. It is
  // in the URL like every other filter in this application (`AGENTS.md`), so a narrowed
  // picker survives a refresh and is an argument to the core query rather than a pass over
  // seventy-seven rows the page fetched to keep four.
  const pick = asked(said, PICK);

  // Two questions, and the second is the picker's rather than the wall's: *what could still
  // go on this route*, which is a fact about the Path and is therefore the Path's query. The
  // screen used to ask for every Story and subtract the route in memory, and could not order
  // what was left, because the order that matters here belongs to the objects.
  const [path, candidates] = await Promise.all([
    findPath(id),
    listStoriesNotOnPath(id, { title: pick }),
  ]);
  if (!path) notFound();

  const back = `/paths/${path.id}`;
  const runs = theRunsOnOffer(candidates);
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
              which Stories go on the route is done while reading the route above it, and a
              drawer in front of it would be a door in front of a door. The list is capped and
              scrolls inside itself for the same reason — sixty candidates must not push the
              route they are being added to two screenfuls up the page.

              **The whole section is one group and the ticks are what it watches.** The submit
              does not exist until something is ticked, and it counts itself with a CSS counter
              — the `<ul>` resets it, a ticked row increments it, the button reads it — so the
              press says how many stops it is about to write with nothing running in the
              browser (ADR-0010, and the Collection's strike is the same device). */}
          <section className="group/place mt-8 rounded-xl ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-3">
              <h2 className="text-sm font-medium">
                Put Stories on this route
                <span className="ml-2 text-muted-foreground">
                  — they land at the end, in this order
                </span>
              </h2>
              {pick ? (
                <p className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                  {candidates.length} {candidates.length === 1 ? "match" : "matches"}
                </p>
              ) : null}
            </div>

            {candidates.length === 0 && !pick ? (
              <p className="border-t border-border p-4 text-pretty text-sm text-muted-foreground">
                Every Story in the library is already on this route.
              </p>
            ) : (
              <>
                {/* A `GET` to this same screen, so the narrowed picker is an address. It is a
                    field and a button rather than a live filter: nothing here waits for a
                    bundle, and the platform's own keyboard sends it. */}
                <form
                  action={back}
                  className="flex items-end gap-2 border-t border-border p-4 pb-3"
                >
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Find a Story by title</span>
                    <input
                      name={PICK}
                      defaultValue={pick ?? ""}
                      placeholder="slam dunk"
                      autoComplete="off"
                      className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 md:text-sm dark:bg-input/30"
                    />
                  </label>
                  <Button type="submit" variant="outline" className="h-11 shrink-0 sm:h-10">
                    Find
                  </Button>
                  {pick ? (
                    <Link
                      href={back}
                      className="shrink-0 rounded px-1 py-3 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Clear
                    </Link>
                  ) : null}
                </form>

                {candidates.length === 0 ? (
                  <p className="border-t border-border p-4 text-pretty text-sm text-muted-foreground">
                    Nothing off this route matches <em>{pick}</em>. Clear it, or record the Story on
                    the wall first — a route can only point at narratives the library has.
                  </p>
                ) : (
                  /* Capped and scrolling inside itself, and the cap is the argument for
                     banding: what a scroll pane must never do is hide *that there is more of
                     one run below the fold*, so a run arrives as one block with its own press
                     rather than as rows the owner has to reach the end of. */
                  <ul className="max-h-96 overflow-y-auto overscroll-contain border-t border-border [counter-reset:ticked]">
                    {runs.map((run) => (
                      <RunBand
                        key={run.seriesId ?? run.name}
                        run={run}
                        pathId={path.id}
                        back={back}
                      />
                    ))}
                  </ul>
                )}

                {/* The ticked selection. Hidden until there is one, so an empty press is not a
                    thing the screen offers — and the count is the button's, because *how many
                    stops am I about to write* is the one fact to know before pressing. */}
                <form
                  id={PLACE}
                  action={placeStories}
                  className="hidden border-t border-border p-4 group-has-[input:checked]/place:block"
                >
                  <input type="hidden" name="pathId" value={path.id} />
                  <input type="hidden" name="back" value={back} />
                  <Button type="submit" className="h-11 w-full sm:h-10">
                    Put <span className="font-mono tabular-nums after:[content:counter(ticked)]" />{" "}
                    on the route
                  </Button>
                </form>
              </>
            )}
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

/**
 * **One run of candidates, as a band with a press over it** — the thing that makes twenty
 * stops one gesture rather than twenty.
 *
 * The band wears the line's own colour, and it is the same colour the tile of every one of
 * these Stories wears on the wall (`@/lib/tint`): the owner recognises *Slam Dunk* as a
 * colour before they read the name, which is the whole point of the tint being derived and
 * stable. What stands in no line wears the page's quiet ground rather than a colour of its
 * own, because it is not a run.
 *
 * The header sticks to the top of the scroll pane, so the line a row belongs to is still
 * legible thirty rows down — a run of twenty is taller than the pane by design.
 *
 * **Its press is a form of its own, and that is why the rows are not inside a form.** HTML has
 * no nested forms, so the ticks belong to the selection's form by `form={PLACE}` and this one
 * carries its own stories as hidden fields. Both post the same action with the same field
 * name: putting a whole run on and putting a tick's worth on are one act (`../actions.ts`).
 */
function RunBand({ run, pathId, back }: { run: Run; pathId: string; back: string }) {
  // Whether this run has shelf positions at all: a numbered run gets a column for them, and
  // one that has none — novels, omnibuses, anything carried by no object — does not spend a
  // fifth of a phone's width on an empty gutter.
  const numbered = run.stories.some((story) => story.standsAt !== null);

  return (
    <li className="border-t border-border first:border-t-0">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-dashed border-border bg-background/95 px-4 py-2 backdrop-blur">
        <span
          aria-hidden
          style={worn(tint(run.seriesId))}
          className={cn("h-4 w-1 shrink-0 rounded-full", run.seriesId ? WORN : UNWORN)}
        />
        <h3 className="min-w-0 flex-1 truncate font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
          {run.name}
        </h3>

        <form action={placeStories} className="shrink-0">
          <input type="hidden" name="pathId" value={pathId} />
          <input type="hidden" name="back" value={back} />
          {run.stories.map((story) => (
            <input key={story.id} type="hidden" name="storyId" value={story.id} />
          ))}
          <Button type="submit" variant="ghost" size="sm" className="-mr-2 h-8 text-xs">
            {theWholeRunPress(run)}
          </Button>
        </form>
      </div>

      <ul>
        {run.stories.map((story) => (
          <Candidate key={story.id} story={story} numbered={numbered} />
        ))}
      </ul>
    </li>
  );
}

/**
 * One Story that could go on the route, as a row under a tick.
 *
 * The tap target is the `<label>` and not the box: sixteen pixels is not a thumb, and this is
 * a list the owner taps down in a row of twenty.
 *
 * Two facts beside the title, and each earns its place. **The position** is what makes a run
 * readable as a run — 1, 2, 3 down the gutter, which is also the order these stops will be
 * placed in — and **the state** is printed only where it is not *to read*: a route grows from
 * the pile, so the pile is the silent case, and *read* beside a title is the one thing that
 * would make the owner untick it. Saying *to read* on sixty rows would be sixty labels
 * carrying no decision.
 */
function Candidate({ story, numbered }: { story: PathCandidate; numbered: boolean }) {
  return (
    <li className="flex items-center gap-2 border-t border-dashed border-border first:border-t-0 has-[:checked]:[counter-increment:ticked] has-[:checked]:bg-accent/40">
      <label className="flex w-11 shrink-0 cursor-pointer items-center justify-center self-stretch outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <input
          type="checkbox"
          form={PLACE}
          name="storyId"
          value={story.id}
          aria-label={`Put ${story.title} on this route`}
          className="size-4 accent-foreground"
        />
      </label>

      <span className="flex min-w-0 flex-1 items-baseline gap-2 py-2.5 pr-4">
        {numbered ? (
          <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {story.standsAt ?? "—"}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm">{story.title}</span>
        {story.state === "to-read" ? null : <StoryStateLabel state={story.state} />}
      </span>
    </li>
  );
}
