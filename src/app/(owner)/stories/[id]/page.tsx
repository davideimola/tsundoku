import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { Spine } from "@/components/spine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { type CollectionVolume, searchCollection } from "@/core/queries/collection";
import { type CreditRole, listCreditRoles } from "@/core/queries/credit";
import type { SeriesLedger, SeriesPublishingNothing } from "@/core/queries/series";
import { listSeriesPublishingNothing, listSeriesPublishingStory } from "@/core/queries/series";
import type { FoundStory, StoryCredit, StoryRating, StoryReading } from "@/core/queries/story";
import { findStory } from "@/core/queries/story";
import { type CarryingVolume, listVolumesCarryingStory } from "@/core/queries/story-to-volume";
import { theWantOnTheStory } from "@/core/queries/want";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { credit, uncredit } from "../../credits/actions";
import { PersonPicker } from "../../credits/picker";
// The ledger's own caption, borrowed rather than written again: a Series named one way on its
// own screen and another here would be two Series to the owner, and `4 of 27` is the answer
// `core/queries/series.ts` already gives. Three screens print them now, for that one reason.
import { Progress, SeriesName } from "../../series/ledger";
import { PUBLISHES, REACHED, RENAME, SERIALIZE, STRIKE } from "../panels";
import {
  howFarItGot,
  howItWent,
  instalments,
  readingNow,
  SCORES,
  stillOpen,
  theOpenReading,
  whatItCovers,
  whenItHappened,
} from "../readings";
import { StoryScore, StoryStateLabel, storyDetail } from "../story-state";
import {
  carryFromStory,
  finishIt,
  giveUp,
  rate,
  rename,
  sayWhereIGotTo,
  sayWhichSeriesPublishesIt,
  serialize,
  startReading,
  strikeIt,
  unwant,
  wantIt,
} from "./actions";

export const dynamic = "force-dynamic";

// THE STORY, and **the screen where the web caught up with the assistant** (#29).
//
// Its one argument is made by the layout: the Readings are a **stack, newest first, each
// carrying its own Rating**. A reread is visibly a second Reading with a second opinion
// beside the first, which is precisely what the spreadsheet could not hold — one cell for
// `Voto`, overwritten. The stack is the column that gets the width at a desk; the objects and
// the people move beside it, because they are what the Story *is* rather than what happened
// to it.
//
// Three things are decided here:
//
//   1. **A Reading that has started and not ended can be said from this screen.** It is what
//      *reading now* is, it is why the dashboard has a top band, and until this ticket only
//      an assistant could record one: `recordReading` had one door. Starting and closing are
//      two acts, so they are two presses — and closing offers *finished* and *gave up*
//      against one date, because abandoning is as much a fact as finishing.
//   2. **The owner's own prose is set in the serif**, in the box it is typed into as much as
//      where it is read back. What they wrote is not what the application says, and that is
//      the whole of what the third face is for.
//   3. **The tile the owner tapped opens the page**, in the same colour, with the same score
//      at its foot — a detail screen in this redesign wears the shelf's vocabulary, and the
//      objects carrying the Story are a row of spines because that is a shelf seen from the
//      side. It carries no href: a link to the page you are standing on is a focusable no-op.
//
// Every form here is a plain `POST` to a Server Function and every drawer is a link to
// `?panel=…`, so the whole screen works with nothing running in the browser (ADR-0010). A
// thin adapter over the core (ADR-0002): no SQL, no domain logic, and no colour of its own.

/** What the query string carries, in the shape Next hands it over. */
type Asked = Record<string, string | string[] | undefined>;

/** One value out of it, or nothing. What a write left behind on its way back here. */
function said(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

// The five panels this screen has, read against this list rather than trusted: `?panel=banana`
// opens nothing, which is the same honesty every filter on every wall is held to.
//
// **Finishing and giving up are two panels rather than two buttons in one**, and the reason is
// the criterion this whole screen is held to: a second submit carrying its own `formAction`
// needs a script to send the right one, and a write that only works once a bundle has parsed
// is not a write this application has. So each outcome is its own address, its own form and
// its own Server Function, and the one field they share is asked for twice rather than shared
// by something that would not be there.
const START = "start";
const FINISHED = "finished";
const GAVE_UP = "gave-up";
const RATE = "rate";
// **The two #37 adds are in `../panels.ts`**, with `STRIKE` and for its reason: each is
// spelled here and again in `./actions.ts`, which reopens the drawer to print what Postgres
// refused inside it. They are two panels rather than two buttons in one for the reason
// finishing and giving up are — each asks for a field of its own.
// `STRIKE` is the third of them (ADR-0015). The four that are this page's alone are above.
const PANELS = [
  START,
  FINISHED,
  GAVE_UP,
  RATE,
  SERIALIZE,
  REACHED,
  RENAME,
  STRIKE,
  PUBLISHES,
] as const;

/**
 * This screen's address with a panel open on it.
 *
 * There are no filters to carry through — a Story is one record and this page narrows
 * nothing — so what a drawer's address holds is the panel and, for the judgement, **which
 * act of reading it is about**: a Story has as many Ratings as it has Readings, so that one
 * needs saying and the closes do not. There is at most one Reading open, and which one it is
 * is derived rather than carried.
 *
 * What it deliberately drops is the answer to the last write: a refusal is about the press
 * that produced it, and carrying it through the opening of a drawer would print it again over
 * an act nobody just performed.
 */
function panelled(storyId: string, panel: string, readingId?: string): string {
  const asking = new URLSearchParams({ panel });
  if (readingId) asking.set("reading", readingId);
  return `/stories/${storyId}?${asking}`;
}

// shadcn's own input look, borrowed by hand for the native pickers this screen is made of —
// its select is a scripted component and every control here has to work with nothing running.
const PICKER =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:h-10 md:text-sm dark:bg-input/30";

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
    <select id={id} name="role" required className={PICKER}>
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
      {/* The serif, which on this surface means one thing and only one thing: these are the
          owner's own words, and the application's are not. */}
      {rating.prose ? (
        <p className="mt-1 max-w-prose text-pretty font-serif text-prose">{rating.prose}</p>
      ) : null}
      <p className="mt-1 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
        {rating.provenance.name}
      </p>
    </div>
  );
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Asked>;
}) {
  await requireOwner();

  const { id } = await params;
  const [story, roles, carriedBy, publishedBy, want, owned, asked] = await Promise.all([
    findStory(id),
    listCreditRoles(),
    listVolumesCarryingStory(id),
    // Which lines print this work, each with its own ledger. **Many Series may name one
    // Story**, so it is a list and never a row — and what is printed beside each is the
    // ledger's own answer rather than a count this screen took over the shelf.
    listSeriesPublishingStory(id),
    // Its own question rather than a field on the Story: a Want is not a fact about a
    // narrative, it is a sentence the owner said about themselves and the Story is what it
    // names (`core/queries/want.ts`).
    theWantOnTheStory(id),
    // The Collection, because a Volume carrying this Story is an object the owner has: they
    // are choosing from their own shelf, and an id is never typed.
    searchCollection({}),
    searchParams,
  ]);
  if (!story) notFound();

  const carrying = new Set(carriedBy.map((volume) => volume.id));
  const offerable = owned.filter((volume) => !carrying.has(volume.id));

  const refused = said(asked, "refused");
  const credited = said(asked, "credited");
  const uncredited = said(asked, "uncredited");

  // The Reading the owner is in the middle of, which is what decides whether this page offers
  // *start* or *close*. It is `../readings`' answer and not a comparison written here.
  const open = theOpenReading(story.readings);

  const panel = PANELS.find((one) => one === said(asked, "panel"));
  // Which act of reading a judgement is about, read against the stack rather than trusted:
  // a hand-edited `?reading=` naming nothing opens no panel, exactly as `?panel=banana` does.
  const judging = story.readings.find((reading) => reading.id === said(asked, "reading"));
  const closesTo = `/stories/${id}`;

  // Read only where the panel that offers them is open, as the Series screen reads its
  // placeable Volumes: the lines that name no Story are not on this page otherwise, and a
  // page reading rows it will not show is what the filter rule in `AGENTS.md` is about.
  const linesToChooseFrom = panel === PUBLISHES ? await listSeriesPublishingNothing() : [];

  return (
    <main className="px-5 py-8 sm:px-8 sm:py-12">
      {/* No breadcrumb: the shell marks *Stories* while the owner is standing here. The tile
          the wall laid this Story out as opens the page instead, in the same colour and with
          the same score at its foot — so arriving from the wall is arriving at the thing that
          was tapped. It carries no href, because this is the page it would lead to. */}
      <header className="flex items-start gap-4 sm:gap-6">
        <div className="w-20 shrink-0 sm:w-28">
          <Cover
            title={story.title}
            tint={tint(story.series?.id)}
            detail={storyDetail(story)}
            foot={<StoryScore of={story.latestScore} />}
            image={story.cover}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-pretty font-heading text-2xl leading-tight sm:text-3xl">
            {story.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
              {story.type.name}
            </span>
            <StoryStateLabel state={story.state} />
            {/* **The fraction is the run's own unit**, tabular so that 7 of 20 and 12 of 20
                read as places in one book rather than as two different numbers. It is drawn
                only where the work says it has parts, which is the minority of Stories. */}
            {story.howFarItGot ? (
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {howFarItGot(story.howFarItGot)}
              </span>
            ) : null}
          </p>
          {story.series ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <Link
                href={`/series/${story.series.id}`}
                className="underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {[story.series.name, story.series.editionLine].filter(Boolean).join(" ")}
              </Link>
            </p>
          ) : null}

          {/* **The act this screen is opened to perform**, and which one it is follows from
              the Readings rather than from a choice: a Story with something open is one the
              owner is holding, and the only thing to say about it is how it ended. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {open ? (
              <>
                <OpensDrawer href={panelled(id, FINISHED)} emphasis="loud">
                  I finished it
                </OpensDrawer>
                <OpensDrawer href={panelled(id, GAVE_UP)}>I gave up on it</OpensDrawer>
                {story.instalments === null ? null : (
                  <OpensDrawer href={panelled(id, REACHED, open.id)}>Where I am in it</OpensDrawer>
                )}
                <span className="text-sm text-muted-foreground">{readingNow(open)}</span>
              </>
            ) : (
              <>
                <OpensDrawer href={panelled(id, START)} emphasis="loud">
                  Start reading it
                </OpensDrawer>
                {story.readings.length > 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Again — nothing below is replaced.
                  </span>
                ) : null}
              </>
            )}
          </div>

          {/* **The lesser half of the same sentence**, and it is deliberately quiet: *not
              tonight, but soon* is a smaller act than starting, so it sits under the loud one
              in the eyebrow's register rather than beside it as a second button competing for
              the press. A press that asks for nothing is a plain form and not a panel.

              What it says back is the whole of what a Want is. There is no *unwant*: a Want
              falls quiet on its own once a Reading begins after it was opened, so a quiet one
              says which side of the Reading it stands on, and the only press against either is
              taking back a sentence that was a slip. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            {want ? (
              <>
                <span className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                  {want.quiet ? "Wanted, and read since" : "On the Reading list"}
                </span>
                <form action={unwant}>
                  <input type="hidden" name="storyId" value={id} />
                  <input type="hidden" name="wantId" value={want.id} />
                  <Button
                    type="submit"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
                  >
                    I did not mean that
                  </Button>
                </form>
              </>
            ) : (
              <form action={wantIt}>
                <input type="hidden" name="storyId" value={id} />
                <Button
                  type="submit"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
                >
                  I want to read it
                </Button>
              </form>
            )}
          </div>
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

      {/* The stack takes the width at a desk and the rest stands beside it, because what
          happened to a Story is the thing this page is for; on a phone the two columns are
          one and the order is the same. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="grid gap-6">
          <Readings story={story} />

          {story.standaloneRatings.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Ratings with no Reading</CardTitle>
                <CardDescription className="text-pretty">
                  A judgement of this Story that points at no particular act of reading — a score
                  that arrived from a sheet, most often. The Provenance says how far it can be
                  trusted.
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
        </div>

        <div className="grid gap-6">
          <Carriers storyId={story.id} carriedBy={carriedBy} offerable={offerable} />

          <PublishedBy storyId={story.id} ledgers={publishedBy} />

          <Instalments story={story} />

          <Card>
            <CardHeader>
              <CardTitle>Credits</CardTitle>
              <CardDescription className="text-pretty">
                Who wrote it and who drew it. One person can hold both roles, and the two are
                routinely different people — <em>One-Punch Man</em> is written by ONE and drawn by
                Yusuke Murata.
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
                      <dt className="basis-full font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground sm:basis-24">
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
                  than keeping a register of people.

                  The field suggests the people who already exist as it is typed into, and that
                  is the whole of what the script here does: a second spelling of a name is a
                  second person forever (ADR-0012), and this form is where the owner would make
                  one. It stays a plain `POST` with the name in it, so a name typed in full is
                  credited whether the suggestions arrived or not (ADR-0010). */}
              <form action={credit} className="mt-6 grid gap-3 border-t border-border pt-4">
                <input type="hidden" name="storyId" value={story.id} />
                <PersonPicker />
                <div className="grid gap-1.5">
                  <Label htmlFor="credit-role" className="text-xs text-muted-foreground">
                    Role
                  </Label>
                  <RoleSelect id="credit-role" roles={roles} />
                </div>
                <Button type="submit" className="h-11 w-full sm:h-10">
                  Credit them
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
            The judgement is of the Story and never of an object: a Volume carries an Edition note
            instead, and this page has no place to put one.
          </p>
        </div>
      </div>

      {/* **The act that unmakes the record, and it is at the bottom for a reason** (ADR-0015).
          Everything above is what happened to this narrative; this is the statement that none
          of it did — that the row itself was a mistake, a duplicate an assistant proposed and
          a bulk approval let through. So it is the last thing on the page, quiet, one press
          away from a drawer rather than a button beside *Start reading it*.

          **It is offered whatever stands on the Story, and that is deliberate.** The four
          refusals are the verb's (`@/core/verbs/story`), and a screen that re-derived them to
          decide whether to draw this would be a second copy of the rule — one that cannot even
          see the fourth, since this page never asks which Paths name the Story. So the press
          exists and the answer is the verb's own sentence, which names what the owner has lived
          with. That is the whole reason this door is here at all: the wall's list holds only
          Stories nothing has happened to, so no refusal is reachable from it. */}
      {/* **The two acts about the record rather than about the reading**, lightest first. They
          are one strip because they are one thought asked at two strengths — *this is wrong*
          — and putting the rename up in the hero would have set a maintenance act beside the
          three that are about tonight. */}
      <div className="mt-10 grid gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="max-w-prose text-pretty text-xs leading-relaxed text-muted-foreground">
            The work's name is the work's own. A line that came to publish it left it whatever it
            was called as one object, so this is where the two are said the same way again.
          </p>
          <OpensDrawer href={panelled(id, RENAME)}>Correct the title</OpensDrawer>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="max-w-prose text-pretty text-xs leading-relaxed text-muted-foreground">
            If this narrative was never real — the same title twice, a proposal approved in a hurry
            — the library can stop knowing it. Nothing you have read, judged or planned can be
            struck this way.
          </p>
          <OpensDrawer href={panelled(id, STRIKE)}>Strike it from the library</OpensDrawer>
        </div>
      </div>

      {/* **Opening a Reading, and saying nothing about how it ends.** That absence is the
          record: a Reading with no outcome is what makes this Story read *reading*, here and
          on the dashboard, until the owner comes back and closes it. */}
      {panel === START ? (
        <Drawer
          title="Start reading it"
          description="No outcome, so this Story reads as reading from now. Close it when it is over — or do not, and it stays open, which is also the truth."
          closesTo={closesTo}
        >
          <form action={startReading} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />

            <div className="grid gap-1.5">
              <Label htmlFor="reading-medium" className="text-xs text-muted-foreground">
                On paper or digital
              </Label>
              {/* Two options written out, where the Type and the Binding pickers read theirs
                  from the database: a medium is a check constraint and not a vocabulary that
                  grows (`core/verbs/reading.ts` says so at the type), so a third value would
                  be a change to the model rather than an insert. The verb still refuses
                  anything else in its own prose — this list is not what enforces it. */}
              <select
                id="reading-medium"
                name="medium"
                required
                defaultValue="paper"
                className={PICKER}
              >
                <option value="paper">Paper</option>
                <option value="digital">Digital</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="reading-volume" className="text-xs text-muted-foreground">
                Through which object
              </Label>
              <select id="reading-volume" name="volumeId" defaultValue="" className={PICKER}>
                <option value="">No object — digital, borrowed, or not recorded</option>
                {carriedBy.map((volume) => (
                  <option key={volume.id} value={volume.id}>
                    {volume.title} — {volume.binding.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Only the objects carrying this Story are offered, and none is the ordinary answer. A
                digital Reading went through no object at all: an owned ebook is not a thing this
                library has.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="reading-started" className="text-xs text-muted-foreground">
                Started on
              </Label>
              <input id="reading-started" name="startedOn" type="date" className={PICKER} />
              <p className="text-xs text-muted-foreground">
                Leave it empty where the day does not matter — that it is open is the fact.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Start reading it
            </Button>
          </form>
        </Drawer>
      ) : null}

      {/* **Closing it, and the two ways it ends.** Abandoning is a fact worth recording
          rather than a failure to finish — it is evidence about taste, and a recommender
          should weigh it — so it is offered beside finishing and not hidden behind it. */}
      {panel === FINISHED && open ? (
        <CloseTheReading
          storyId={story.id}
          reading={open}
          closesTo={closesTo}
          act={finishIt}
          title="I finished it"
          label="Finished"
        />
      ) : null}
      {panel === GAVE_UP && open ? (
        <CloseTheReading
          storyId={story.id}
          reading={open}
          closesTo={closesTo}
          act={giveUp}
          title="I gave up on it"
          label="Gave up"
        />
      ) : null}

      {/* **The judgement, attached to the act of reading it came out of.** That attachment is
          the whole of why a reread does not overwrite anything: two Readings carry two
          Ratings, and both are on the page. */}
      {panel === RATE && judging ? (
        <Drawer
          title={judging.rating ? "Say it again" : "What I thought of it"}
          description={
            judging.rating
              ? "One Rating per act of reading, so this replaces what is written under that Reading. A second opinion belongs to a second Reading."
              : "Of the Story and never of the object — it was the story that was good or bad. The prose is the point: a score alone cannot tell liked it from liked it for the art."
          }
          closesTo={closesTo}
        >
          <form action={rate} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />
            <input type="hidden" name="readingId" value={judging.id} />

            <p className="text-pretty text-sm text-muted-foreground">
              {howItWent(judging)} · {whenItHappened(judging)}
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="rating-score" className="text-xs text-muted-foreground">
                Out of 10
              </Label>
              {/* The scale as a picker rather than a number field: it moves in half points,
                  and the keyboard a phone offers for a number gives a comma where this wants
                  a dot (`src/core/money.ts` is the other half of that story). */}
              <select
                id="rating-score"
                name="score"
                required
                defaultValue={judging.rating?.score ?? ""}
                className={PICKER}
              >
                <option value="" disabled>
                  Choose a score
                </option>
                {SCORES.map((score) => (
                  <option key={score} value={score}>
                    {score.toFixed(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="rating-prose" className="text-xs text-muted-foreground">
                What I thought
              </Label>
              {/* Set in the serif in the box it is typed into as much as where it is read
                  back: what the owner writes is theirs on both sides of the press. */}
              <textarea
                id="rating-prose"
                name="prose"
                rows={6}
                defaultValue={judging.rating?.prose ?? ""}
                placeholder="The art carries it. I would not have finished it for the story alone."
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 font-serif text-base leading-relaxed outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-prose dark:bg-input/30"
              />
              <p className="text-xs text-muted-foreground">
                This is what feeds a recommendation. A score alone is a rank; the words are the
                evidence.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              {judging.rating ? "Say it again" : "Record it"}
            </Button>
          </form>
        </Drawer>
      ) : null}

      {/* **Saying the work has parts, which is asked nowhere else and of almost nothing.**
          The count is the narrative's and never a printing's, so it is on this page and not on
          any of the objects: an omnibus and a tankōbon carrying the same work carry the same
          twenty. */}
      {/* **Correcting the title**, which is the one field on this page that writes over
          something the owner wrote rather than adding a record beside it. The box arrives
          holding what it is about to replace, the way the Rating's does, because that is what
          makes it a correction and not a fresh answer to the same question. */}
      {panel === RENAME ? (
        <Drawer
          title="Correct the title"
          description="The name of the work, which belongs to the narrative and not to any printing. One Volume records one Story, so a work a line was pointed at may still be carrying the name it had as a single object."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={rename} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />

            <div className="grid gap-1.5">
              <Label htmlFor="story-title" className="text-xs text-muted-foreground">
                Title
              </Label>
              <input
                id="story-title"
                name="title"
                type="text"
                required
                defaultValue={story.title}
                autoComplete="off"
                className={PICKER}
              />
              <p className="text-xs text-muted-foreground">
                Nothing else moves: the objects carrying it, what you read and what you thought of
                it are all about this same record.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Correct it
            </Button>
          </form>
        </Drawer>
      ) : null}

      {panel === SERIALIZE ? (
        <Drawer
          title={story.instalments === null ? "Say how many parts it has" : "Correct the count"}
          description="One numbered part of a serialized work — Slam Dunk's twenty. It belongs to the narrative and never to a printing, so it stays true however you read them. Leave it empty for a Story nobody numbers, which is most of them."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={serialize} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />

            <div className="grid gap-1.5">
              <Label htmlFor="story-instalments" className="text-xs text-muted-foreground">
                How many Instalments
              </Label>
              <input
                id="story-instalments"
                name="instalments"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                defaultValue={story.instalments ?? ""}
                placeholder="20"
                className={PICKER}
              />
              <p className="text-xs text-muted-foreground">
                Empty takes the numbering off again. It is refused while a pass has read further
                than the number you give.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              {story.instalments === null ? "Say it" : "Correct it"}
            </Button>
          </form>
        </Drawer>
      ) : null}

      {/* **Where a pass got to, on the pass and never on the Story.** How far you are is a
          fact about an act of reading, which is what makes a reread start again at nothing
          without this one forgetting where it reached. */}
      {panel === REACHED && judging && story.instalments !== null ? (
        <Drawer
          title="Where I got to"
          description="The last Instalment this pass finished. Reading it again later starts again at nothing, and this pass keeps the number it ended on."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={sayWhereIGotTo} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />
            <input type="hidden" name="readingId" value={judging.id} />

            <p className="text-pretty text-sm text-muted-foreground">
              {howItWent(judging)} · {whenItHappened(judging)}
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="reading-at" className="text-xs text-muted-foreground">
                Last Instalment finished, out of {story.instalments}
              </Label>
              <input
                id="reading-at"
                name="atInstalment"
                type="number"
                min={1}
                max={story.instalments}
                step={1}
                inputMode="numeric"
                defaultValue={judging.atInstalment ?? ""}
                placeholder="7"
                className={PICKER}
              />
              <p className="text-xs text-muted-foreground">
                Empty stops counting. Nothing else follows from it — a pass at the last Instalment
                is still open until you close it.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Record it
            </Button>
          </form>
        </Drawer>
      ) : null}

      {/* **The arrow, set from the end the work is managed from** (#34, user stories 35 and 36).
          The owner is standing on the Story and says which line prints it; the Series screen
          stays a place they look. It asks for one field — which line — so it is a panel and not
          a plain press, and what the press does is said in full above the button, because it is
          the one act on this page that reaches records the owner cannot see from here. */}
      {panel === PUBLISHES ? (
        <Drawer
          title="Say which Series publishes it"
          description="A line prints one Story. Saying so is what makes a Volume joining that line attach to this work instead of minting a new narrative — so it is said once per Series and never again."
          refused={refused}
          closesTo={closesTo}
        >
          {linesToChooseFrom.length === 0 ? (
            <p className="max-w-prose text-pretty text-sm text-muted-foreground">
              No Series is waiting to be told what it prints. Every line the library knows either
              publishes a Story already or has no object in it carrying a narrative yet. Declare the
              Series and place its Volumes in it first.
            </p>
          ) : (
            <form action={sayWhichSeriesPublishesIt} className="grid gap-5">
              <input type="hidden" name="storyId" value={story.id} />

              <div className="grid gap-1.5">
                <Label htmlFor="publishes-series" className="text-xs text-muted-foreground">
                  Which Series
                </Label>
                {/* The two numbers travel in the option itself, because they are the whole of
                    what the press does and nothing here runs in the browser to reveal them
                    after a choice: *eighteen narratives across twenty objects become one*. */}
                <select
                  id="publishes-series"
                  name="seriesId"
                  required
                  defaultValue=""
                  className={PICKER}
                >
                  <option value="" disabled>
                    Choose a Series
                  </option>
                  {linesToChooseFrom.map((line) => (
                    <option key={line.id} value={line.id}>
                      {whatTheLineIsCalled(line)} — {whatItWouldCollapse(line)}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" className="h-11 w-full sm:h-10">
                Say it publishes this
              </Button>

              <div className="grid gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <p className="max-w-prose text-pretty">
                  Every object of that line carries <em>{story.title}</em> afterwards, and the
                  narratives they stood for collapse onto it — any Rating, every Reading and every
                  Credit come with them, and a route or a Want naming one of them comes to name this
                  Story instead.
                </p>
                <p className="max-w-prose text-pretty">
                  Nothing you own moves: the Volumes, the acquisitions and the count published are
                  exactly as they are now. Nothing happens at all if the collapse would lose
                  something — two scores that cannot both be this Story&apos;s one, a narrative an
                  object outside the line carries too, or a pass counted in a narrative&apos;s own
                  parts.
                </p>
              </div>
            </form>
          )}
        </Drawer>
      ) : null}

      {/* **The one panel here whose form has no field in it.** There is nothing to type: the
          whole of the act is the press, and the panel exists so that the press takes two
          deliberate taps and so that what the strike takes with it is read before the second
          one. The refusal is drawn inside here rather than on the page behind, because this
          panel covers the page (`@/components/drawer`) — and it is the sentence that names
          which of the owner's own records stands in the way. */}
      {panel === STRIKE ? (
        <Drawer
          title="Strike it from the library"
          description="For a record that was a mistake — the same narrative twice, a proposal approved in a hurry. Not for something you have finished with: what a Story is and what you did with it are different facts."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={strikeIt} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />

            <p className="text-pretty text-sm text-muted-foreground">
              The library stops knowing <em>{story.title}</em>. The Credits on it go too, and the
              people they name stay, credited wherever else they are; so does the record of which
              objects carried it.
            </p>

            {/* The four, said in full and before the press. They are the verb's own rule and
                this is a copy of it in prose rather than in code — the page draws the press
                whatever stands on the Story, and the sentence the verb answers with names
                which one it was. */}
            <p className="text-pretty text-sm text-muted-foreground">
              It is refused, and nothing happens, if an object in the house carries it, if a Reading
              went through it, if you scored it, or if a Path names it as a stop. Those are your own
              records, and a mistaken row has none of them.
            </p>

            <div>
              <Button type="submit" variant="destructive" className="h-11 w-full sm:h-10">
                Strike it
              </Button>
              <p className="mt-2 text-pretty text-xs text-muted-foreground">
                There is no undo. You land back on the wall.
              </p>
            </div>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}

/**
 * The stack: one act of reading each, newest first, with the Rating it carried.
 *
 * **Nothing here is ever overwritten**, which is the argument the whole page is built to
 * make. Reading it again adds a Reading, and the opinion from last time stays beside the new
 * one — the `Voto` cell held one number and this holds every judgement the owner ever gave.
 */
function Readings({ story }: { story: FoundStory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Readings</CardTitle>
        <CardDescription className="text-pretty">
          One act of reading each, newest first, with the Rating it carried. Nothing here is ever
          overwritten: reading it again adds a Reading, and the opinion from last time stays beside
          the new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {story.readings.length === 0 ? (
          <p className="text-pretty text-sm text-muted-foreground">
            No Reading yet, which is the whole of why this Story reads{" "}
            <span className="font-mono text-xs uppercase tracking-eyebrow">to read</span>. Starting
            one is the button at the top, and it needs no ending.
          </p>
        ) : (
          <ol className="-my-1">
            {story.readings.map((record) => (
              <li key={record.id} className="border-t border-border py-3.5 first:border-t-0">
                <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-mono text-xs tabular-nums">{whenItHappened(record)}</span>
                  <span className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                    {howItWent(record)}
                  </span>
                </p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3 font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                  <span>{record.provenance.name}</span>
                  {/* Where *this* pass got, which is not where the owner is now: a run given
                      up at nine in 2019 says so under itself, and the hero says where the
                      pass in hand is. */}
                  {record.atInstalment === null || story.instalments === null ? null : (
                    <span className="tabular-nums normal-case tracking-normal">
                      {howFarItGot({
                        atInstalment: record.atInstalment,
                        instalments: story.instalments,
                      })}
                    </span>
                  )}
                </p>

                {record.rating ? (
                  <Judgement rating={record.rating} />
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No Rating on this Reading.</p>
                )}

                {/* The judgement is opened from the Reading it will belong to, because that
                    attachment is what a reread's second opinion is made of. An open Reading
                    can be rated too: the owner is two hundred pages in and knows. */}
                <p className="mt-2">
                  <Link
                    href={panelled(story.id, RATE, record.id)}
                    className="font-mono text-eyebrow uppercase tracking-eyebrow underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {record.rating ? "Say it again" : "Rate it"}
                  </Link>
                  {/* Where this pass got, said from the pass it is about — the same shape the
                      judgement is opened in, and for the same reason: both belong to one act
                      of reading rather than to the Story. */}
                  {story.instalments === null ? null : (
                    <Link
                      href={panelled(story.id, REACHED, record.id)}
                      className="ml-3 font-mono text-eyebrow uppercase tracking-eyebrow underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {record.atInstalment === null ? "Say where I got to" : "Move it on"}
                    </Link>
                  )}
                  {stillOpen(record) ? (
                    <span className="ml-3 text-xs text-muted-foreground">Still open.</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * **The lines that print this work, and the one gesture that adds one** (#34, user stories 35
 * and 36).
 *
 * The Story is the single place a work is managed, so the arrow is set here — *say which Series
 * publishes it* — and `/series` stays a place the owner looks. The two are one decision: an
 * editing control on the completeness ledger is the Series screen quietly becoming a second
 * place a narrative is managed, and then *what am I missing* has an act standing beside it in a
 * shop.
 *
 * **Many Series may name one Story**, and the card is a list for that reason rather than for
 * tidiness: the standard printing and a deluxe line are two ledgers over one narrative, and the
 * owner reads how far along each is without leaving the work. What each row says about
 * completeness is the ledger's own answer, drawn with the ledger's own caption — a Series named
 * one way here and another on its own screen would be two Series.
 */
function PublishedBy({ storyId, ledgers }: { storyId: string; ledgers: SeriesLedger[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Series publishing it</CardTitle>
        <CardDescription className="text-pretty">
          A Series says which Story it prints, and that lone arrow is the only thing a line and a
          narrative say to each other. It is what makes a Volume joining the line attach to this
          work instead of minting a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ledgers.length === 0 ? (
          <p className="text-pretty text-sm text-muted-foreground">
            No Series publishes this Story, which is the ordinary answer: most of what is on these
            shelves is not a publisher's numbered line.
          </p>
        ) : (
          <ul className="-my-1">
            {ledgers.map((ledger) => (
              <li key={ledger.id} className="border-t border-border first:border-t-0">
                <Link
                  href={`/series/${ledger.id}`}
                  className="grid gap-1 py-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-pretty">
                    <SeriesName ledger={ledger} />
                  </span>
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Progress ledger={ledger} />
                    {/* The missing read, and only where there is a project it is missing from:
                        a hollow position of a Series nobody decided to complete is empty and
                        never a shopping list (`series/positions.ts` decides that once). */}
                    {ledger.missing === null ? null : ledger.missing.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Complete</span>
                    ) : (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        Missing {ledger.missing.length} · next is {ledger.nextMissing}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 border-t border-border pt-5">
          <OpensDrawer href={panelled(storyId, PUBLISHES)}>
            Say which Series publishes it
          </OpensDrawer>
        </p>
        {/* One clause, and the panel says the rest. What the press does in full is read
            beside the picker where the line is chosen, so that it is read once and about a
            line the owner has actually picked. */}
        <p className="mt-3 text-pretty text-xs leading-relaxed text-muted-foreground">
          Its objects come to carry this work, and nothing you own moves.
        </p>
      </CardContent>
    </Card>
  );
}

/** A Series as the picker names it: the line, and the edition that tells two of them apart. */
function whatTheLineIsCalled(line: SeriesPublishingNothing): string {
  return [line.name, line.editionLine].filter(Boolean).join(" ");
}

/**
 * *20 objects, 18 narratives* — the whole of what one press does, said while the owner is still
 * choosing.
 *
 * Written here rather than counted in the markup because both numbers are the core's answer and
 * the singular is the only judgement in it: a picker that said *1 narratives* would be the one
 * place on this screen the application does not speak.
 */
function whatItWouldCollapse(line: SeriesPublishingNothing): string {
  const objects = `${line.objects} ${line.objects === 1 ? "object" : "objects"}`;
  const narratives = `${line.narratives} ${line.narratives === 1 ? "narrative" : "narratives"}`;
  return `${objects}, ${narratives}`;
}

/**
 * How long the work is, and where the owner is in it.
 *
 * **The count is the narrative's and never a printing's** — which is why it is on this page
 * and on none of the objects. It is optional and it costs nothing where it is not wanted, so
 * a Story that declares none says so in one line and offers the act rather than showing an
 * empty field nobody asked for.
 */
function Instalments({ story }: { story: FoundStory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Instalments</CardTitle>
        <CardDescription className="text-pretty">
          One numbered part of a serialized work. It belongs to the narrative rather than to any
          printing, so <em>seven of twenty</em> stays true whether you read them as tankōbon, in an
          omnibus, or half in each.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {story.instalments === null ? (
          <p className="text-pretty text-sm text-muted-foreground">
            Nobody has numbered this one, which is the ordinary answer: most Stories are read whole
            and asked nothing.
          </p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono text-sm tabular-nums">{instalments(story.instalments)}</span>
            {story.howFarItGot ? (
              <span className="text-sm text-muted-foreground">
                You are at {howFarItGot(story.howFarItGot)}.
              </span>
            ) : null}
          </p>
        )}

        <p className="mt-4">
          <OpensDrawer href={panelled(story.id, SERIALIZE)}>
            {story.instalments === null ? "Say how many parts it has" : "Correct the count"}
          </OpensDrawer>
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The objects carrying the narrative, as **a row of spines** — the other half of ADR-0001,
 * read from the narrative end (#29).
 *
 * Twenty objects would be twenty rows and a scroll. Standing them up is one stretch of the
 * Series' own colour with the numbers along the foot, which is the same picture a Series' own
 * ledger draws and the same one the owner sees on the shelf. A spine the house does not hold
 * is hollow, and what it carried is still true — read, or let go, or never owned.
 */
function Carriers({
  storyId,
  carriedBy,
  offerable,
}: {
  storyId: string;
  carriedBy: CarryingVolume[];
  offerable: CollectionVolume[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Volumes carrying it</CardTitle>
        <CardDescription className="text-pretty">
          The objects this narrative arrived on. One Story spans as many as it spans, and the
          judgement beside it is not multiplied by them: it was the story that was good or bad.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {carriedBy.length === 0 ? (
          <p className="text-pretty text-sm text-muted-foreground">
            No Volume carries this Story, and that is an ordinary answer rather than a gap: read
            digitally, borrowed, or known only from Goodreads history. Being read and being owned
            are unrelated facts.
          </p>
        ) : (
          <>
            <ol className="flex flex-wrap gap-1" aria-label="The objects carrying this Story">
              {carriedBy.map((volume) => (
                <li key={volume.id}>
                  <Spine
                    href={`/collection/${volume.id}`}
                    title={volume.title}
                    // No position to print for an object nobody placed in a line, and an
                    // absence is drawn as one rather than as a glyph standing in for a
                    // number. What it is, is in the label the spine carries.
                    foot={volume.seriesNumber ?? "—"}
                    tint={tint(volume.seriesId)}
                    held={volume.inTheHouse}
                    detail={[
                      volume.title,
                      volume.binding.name,
                      // What of the work is inside this object, where the work is numbered:
                      // an omnibus says *Instalments 1–35* and a tankōbon says the one it is.
                      volume.covers ? whatItCovers(volume.covers) : null,
                      volume.inTheHouse ? "on the shelf" : "not on the shelf",
                    ]
                      .filter(Boolean)
                      .join(" — ")}
                  />
                </li>
              ))}
            </ol>
            <p className="mt-3 text-pretty text-xs leading-relaxed text-muted-foreground">
              {carriedBy.length} {carriedBy.length === 1 ? "Volume" : "Volumes"}, standing in the
              publisher&apos;s order. A hollow spine is one the house does not hold — catalogued, or
              let go — and what it carried is still true. What the owner thinks of any of them as an
              object is an Edition note, on its own page, and it is not a score.
            </p>
          </>
        )}

        {/* The same fact the object's own page writes, recorded from this end because a
            Story spanning twenty objects would otherwise be twenty visits. Take it back on
            the object's page: a Volume carries Stories, so the correction belongs there. */}
        <form action={carryFromStory} className="mt-6 grid gap-3 border-t border-border pt-5">
          <input type="hidden" name="storyId" value={storyId} />
          <div className="grid gap-1.5">
            <Label htmlFor="carry-volume" className="text-xs text-muted-foreground">
              Another Volume carrying it
            </Label>
            <select
              id="carry-volume"
              name="volumeId"
              required
              disabled={offerable.length === 0}
              defaultValue=""
              className={PICKER}
            >
              <option value="" disabled>
                {offerable.length === 0
                  ? "Every Volume in the house already carries it"
                  : "Choose a Volume"}
              </option>
              {offerable.map((volume) => (
                <option key={volume.id} value={volume.id}>
                  {volume.title} — {volume.binding.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={offerable.length === 0} className="h-11 w-full sm:h-10">
            Record it
          </Button>
          <p className="text-xs text-muted-foreground">
            Only Volumes in the house are offered. Record the object in the Collection first if it
            is not there — buying and reading are separate facts.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * The end of a Reading, in whichever of the two ways it ended.
 *
 * One component and two panels: the day and the sentence are the same, and only the verb and
 * the word differ. Written once because *finished* and *gave up* are the same act with
 * different evidence in it — and rendered as two addresses because each carries its own plain
 * form, which is what makes both work with nothing running in the browser.
 */
function CloseTheReading({
  storyId,
  reading,
  closesTo,
  act,
  title,
  label,
}: {
  storyId: string;
  reading: StoryReading;
  closesTo: string;
  act: (form: FormData) => Promise<void>;
  title: string;
  label: string;
}) {
  return (
    <Drawer
      title={title}
      description="Reading it again later is a new Reading, never an edit of this one — which is what keeps this time's judgement beside the next one's."
      closesTo={closesTo}
    >
      <form action={act} className="grid gap-4">
        <input type="hidden" name="storyId" value={storyId} />
        <input type="hidden" name="readingId" value={reading.id} />

        <p className="text-pretty text-sm text-muted-foreground">
          {howItWent(reading)} · {whenItHappened(reading)}
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor="reading-ended" className="text-xs text-muted-foreground">
            Ended on
          </Label>
          <input id="reading-ended" name="endedOn" type="date" className={PICKER} />
          <p className="text-xs text-muted-foreground">
            Leave it empty where the day is gone. A Reading that started on a recorded day and ended
            on none keeps the half it has.
          </p>
        </div>

        <Button type="submit" className="h-11 w-full sm:h-10">
          {label}
        </Button>
      </form>
    </Drawer>
  );
}
