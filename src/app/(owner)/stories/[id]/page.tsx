import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CreditRole, listCreditRoles } from "@/core/queries/credit";
import type { StoryCredit, StoryRating, StoryReading } from "@/core/queries/story";
import { findStory } from "@/core/queries/story";
import { requireOwner } from "@/lib/auth/owner";
import { credit, uncredit } from "../../credits/actions";
import { StoryStateLabel } from "../story-state";

export const dynamic = "force-dynamic";

// The page the whole slice exists for, and its one argument is made by the layout: the
// Readings are a **stack, newest first, each carrying its own Rating**. A reread is
// visibly a second Reading with a second opinion beside the first, which is precisely
// what the spreadsheet could not hold — one cell for `Voto`, overwritten.
//
// Monochrome shadcn tokens, one card, one rule between Readings. Nothing here is
// invented, and there is only one column, so the phone gets the same page as the desk.

/** The medium and the outcome, in the words the owner uses. */
function howItWent(reading: StoryReading): string {
  return `${reading.medium}, ${reading.outcome ?? "still reading"}`;
}

/**
 * When it happened, with whichever half of it is known — Goodreads history often carries
 * one date, and a Reading in progress has no end yet.
 */
function whenItHappened(reading: StoryReading): string {
  if (reading.startedOn && reading.endedOn) return `${reading.startedOn} → ${reading.endedOn}`;
  if (reading.startedOn) return `from ${reading.startedOn}`;
  if (reading.endedOn) return `until ${reading.endedOn}`;
  return "no date recorded";
}

/**
 * The role picker.
 *
 * A native select rather than a scripted one, as the Binding picker is: on a phone it
 * opens the platform picker, and it submits whether JavaScript ran or not. The roles come
 * out of the database, so a colourist appears here without this file being touched
 * (ADR-0006).
 */
function RoleSelect({ id, roles }: { id: string; roles: CreditRole[] }) {
  return (
    <select
      id={id}
      name="role"
      required
      className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 sm:w-auto md:text-sm dark:bg-input/30"
    >
      {roles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </select>
  );
}

/** Take a Credit off this Story. The person stays, credited wherever else they are. */
function Uncredit({ storyId, held }: { storyId: string; held: StoryCredit }) {
  return (
    <form action={uncredit} className="shrink-0">
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="creditId" value={held.id} />
      <input type="hidden" name="person" value={held.person.name} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="-mr-2 h-8 text-xs text-muted-foreground hover:text-destructive"
      >
        Remove
      </Button>
    </form>
  );
}

function Judgement({ rating }: { rating: StoryRating }) {
  return (
    <div className="mt-2">
      <p className="font-mono text-sm tabular-nums">
        {rating.score.toFixed(1)}
        <span className="text-muted-foreground"> / 10</span>
      </p>
      {rating.prose ? <p className="mt-1 text-pretty text-sm">{rating.prose}</p> : null}
      <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        {rating.provenance.name}
      </p>
    </div>
  );
}

/** One value out of the query string, or nothing. What a write left behind. */
function said(params: Record<string, string | string[] | undefined>, name: string) {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner();

  const { id } = await params;
  const [story, roles, asked] = await Promise.all([findStory(id), listCreditRoles(), searchParams]);
  if (!story) notFound();

  const refused = said(asked, "refused");
  const credited = said(asked, "credited");
  const uncredited = said(asked, "uncredited");

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-16">
      <Link
        href="/stories"
        className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        tsundoku / stories
      </Link>

      <header className="mt-8">
        <h1 className="text-pretty font-heading text-2xl leading-tight">{story.title}</h1>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {story.type.name}
          </span>
          <StoryStateLabel state={story.state} />
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
      {credited ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {credited} is credited on this Story.
        </p>
      ) : null}
      {uncredited ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {uncredited} is no longer credited here. They keep every other Credit they hold.
        </p>
      ) : null}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Credits</CardTitle>
          <CardDescription className="text-pretty">
            Who wrote it and who drew it. One person can hold both roles, and the two are routinely
            different people — <em>One-Punch Man</em> is written by ONE and drawn by Yusuke Murata.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {story.credits.length === 0 ? (
            <p className="text-pretty text-sm text-muted-foreground">
              Nobody is credited on this Story yet. Neither sheet had a column for it, so every
              Credit here was typed on purpose.
            </p>
          ) : (
            /* Laid out as a comic's indicia is: the role on the left, the name against it.
               A definition list, because that is what it is — and it stacks to one column
               on a phone without the roles stopping being labels. */
            <dl className="-my-1">
              {story.credits.map((held) => (
                <div
                  key={held.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-border py-2.5 first:border-t-0"
                >
                  <dt className="basis-full font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground sm:basis-24">
                    {held.role.name}
                  </dt>
                  <dd className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <Link
                      href={`/credits/${held.person.id}`}
                      className="truncate underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {held.person.name}
                    </Link>
                    <Uncredit storyId={story.id} held={held} />
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/* A name and a role, and nothing else to fill in: a person the library has not
              met is named by crediting them, because the owner is reading a cover rather
              than keeping a register of people. */}
          <form
            action={credit}
            className="mt-6 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          >
            <input type="hidden" name="storyId" value={story.id} />
            <div className="grid gap-1.5">
              <Label htmlFor="credit-person" className="text-xs text-muted-foreground">
                Person
              </Label>
              <Input
                id="credit-person"
                name="person"
                placeholder="Yusuke Murata"
                autoComplete="off"
                required
                className="h-11 sm:h-10"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="credit-role" className="text-xs text-muted-foreground">
                Role
              </Label>
              <RoleSelect id="credit-role" roles={roles} />
            </div>
            <Button type="submit" className="h-11 w-full sm:h-10 sm:w-auto sm:px-6">
              Credit them
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Readings</CardTitle>
          <CardDescription className="text-pretty">
            One act of reading each, newest first, with the Rating it carried. Nothing here is ever
            overwritten: reading it again adds a Reading, and the opinion from last time stays
            beside the new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {story.readings.length === 0 ? (
            <p className="text-pretty text-sm text-muted-foreground">
              No Reading yet, which is the whole of why this Story reads{" "}
              <span className="font-mono text-xs uppercase tracking-[0.18em]">to read</span>.
            </p>
          ) : (
            <ol className="-my-1">
              {story.readings.map((record) => (
                <li key={record.id} className="border-t border-border py-3.5 first:border-t-0">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="font-mono text-xs tabular-nums">{whenItHappened(record)}</span>
                    <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                      {howItWent(record)}
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {record.provenance.name}
                  </p>
                  {record.rating ? (
                    <Judgement rating={record.rating} />
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No Rating on this Reading.</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {story.standaloneRatings.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Ratings with no Reading</CardTitle>
            <CardDescription className="text-pretty">
              A judgement of this Story that points at no particular act of reading — a score that
              arrived from a sheet, most often. The Provenance says how far it can be trusted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="-my-1">
              {story.standaloneRatings.map((rating) => (
                <li key={rating.id} className="border-t border-border py-2 first:border-t-0">
                  <Judgement rating={rating} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="mt-6 text-pretty text-xs leading-relaxed text-muted-foreground">
        The judgement is of the Story and never of an object: a Volume carries an Edition note
        instead, and this page has no place to put one.
      </p>
    </main>
  );
}
