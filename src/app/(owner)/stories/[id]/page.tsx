import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { Drawer } from "@/components/drawer";
import { RatingMark, scoreSaid, Unrated } from "@/components/rating-mark";
import { Spine } from "@/components/spine";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type CollectionVolume, searchCollection } from "@/core/queries/collection";
import { type CreditRole, listCreditRoles } from "@/core/queries/credit";
import { theMediaToOffer } from "@/core/queries/medium";
import type { SeriesLedger, SeriesPublishingNothing } from "@/core/queries/series";
import { listSeriesPublishingNothing, listSeriesPublishingStory } from "@/core/queries/series";
import type { FoundStory, StoryCredit, StoryPass, StoryRating } from "@/core/queries/story";
import { findStory } from "@/core/queries/story";
import { type CarryingVolume, listVolumesCarryingStory } from "@/core/queries/story-to-volume";
import { theWantOnTheStory } from "@/core/queries/want";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
// **The door's own rule, imported rather than restated** (`../../add/door.ts`, ADR-0022):
// whether a Type is a thing you can hold, read off the media it offers and never off its name.
// A second copy of it here is a second answer, and the eighth Type would have to be told twice.
import { aTypeCarriesAnObject } from "../../add/door";
import { credit, uncredit } from "../../credits/actions";
import { PersonPicker } from "../../credits/picker";
// The ledger's own caption, borrowed rather than written again: a Series named one way on its
// own screen and another here would be two Series to the owner, and `4 of 27` is the answer
// `core/queries/series.ts` already gives. Three screens print them now, for that one reason.
import { Progress, SeriesName } from "../../series/ledger";
import {
  IMAGE,
  PUBLISHES,
  REACHED,
  RENAME,
  SERIALIZE,
  STRIKE,
  STRIKE_OUTCOME,
  STRIKE_PASS,
  STRIKE_RATING,
} from "../panels";
import {
  howFarItGot,
  howItWent,
  passNow,
  SCORES,
  stillOpen,
  theCountItDeclares,
  theOpenPass,
  whatItCovers,
  whenItHappened,
} from "../passes";
import { stateWord, storyDetail } from "../story-state";
import {
  carryFromStory,
  faceWithOwnImage,
  finishIt,
  giveUp,
  rate,
  rename,
  sayWhereIGotTo,
  sayWhichSeriesPublishesIt,
  serialize,
  startPass,
  strikeIt,
  strikeThisOutcome,
  strikeThisPass,
  strikeThisRating,
  takeOwnImageOff,
  unwant,
  wantIt,
} from "./actions";

export const dynamic = "force-dynamic";

// THE STORY, and **the screen where the web caught up with the assistant** (#29).
//
// Its one argument is made by the layout: the Passes are a **stack, newest first, each
// carrying its own Rating**. A second pass is visibly a second Pass with a second opinion
// beside the first, which is precisely what the spreadsheet could not hold — one cell for
// `Voto`, overwritten. The stack is the column that gets the width at a desk; the objects and
// the people move beside it, because they are what the Story *is* rather than what happened
// to it.
//
// Three things are decided here:
//
//   1. **A Pass that has started and not ended can be said from this screen.** It is what
//      *under way* is, it is why the dashboard has a top band, and until this ticket only
//      an assistant could record one: `recordPass` had one door. Starting and closing are
//      two acts, so they are two presses — and closing offers *finished* and *gave up*
//      against one date, because abandoning is as much a fact as finishing.
//   2. **The owner's own prose is set in the serif**, in the box it is typed into as much as
//      where it is read back. What they wrote is not what the application says, and that is
//      the whole of what the third face is for.
//   3. **The page opens with the cover, large and clean** (ADR-0026, second tranche): the
//      jacket — or the drawn cloth — on a quiet panel, the name in the display serif, who made
//      it, the last rating as a bookmark, and one cloth act. What follows is sections under
//      rules rather than a stack of boxes, and the objects carrying the Story are still a row
//      of spines, because that is a shelf seen from the side. The cover carries no href: a
//      link to the page you are standing on is a focusable no-op.
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
  STRIKE_PASS,
  STRIKE_RATING,
  STRIKE_OUTCOME,
  PUBLISHES,
  IMAGE,
] as const;

/**
 * This screen's address with a panel open on it.
 *
 * There are no filters to carry through — a Story is one record and this page narrows
 * nothing — so what a drawer's address holds is the panel and, for the judgement, **which
 * Pass it is about**: a Story has as many Ratings as it has Passes, so that one
 * needs saying and the closes do not. There is at most one Pass open, and which one it is
 * is derived rather than carried.
 *
 * What it deliberately drops is the answer to the last write: a refusal is about the press
 * that produced it, and carrying it through the opening of a drawer would print it again over
 * an act nobody just performed.
 */
function panelled(
  storyId: string,
  panel: string,
  about?: { pass?: string; rating?: string }
): string {
  const asking = new URLSearchParams({ panel });
  if (about?.pass) asking.set("pass", about.pass);
  if (about?.rating) asking.set("rating", about.rating);
  return `/stories/${storyId}?${asking}`;
}

// shadcn's own input look, borrowed by hand for the native pickers this screen is made of —
// its select is a scripted component and every control here has to work with nothing running.
const PICKER =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:h-10 md:text-sm dark:bg-input/30";

// The hero's acts, as the canvas draws them (ADR-0026, second tranche): **one cloth act** the
// page is opened for, the rest outlined in the edge of a field, and the corrections as quiet
// text. Links rather than buttons where they open a drawer, so they work with nothing running.
const ACT =
  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-[0.9375rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const LOUD_ACT = `${ACT} bg-primary font-semibold text-primary-foreground hover:bg-primary/90`;
const OUTLINED_ACT = `${ACT} border border-input font-medium text-foreground hover:bg-muted`;
const QUIET_ACT =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-[0.9375rem] text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

/** A link in a sentence: cloth, because it does something. */
const IN_PROSE =
  "rounded-sm font-medium text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/** An act in a row that is a correction rather than the row's point: quiet ink. */
const QUIET_LINK =
  "rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/** One row of a section: a hairline over it, and air. */
const ROW = "border-t border-border py-3.5";

/**
 * A section of the page: a heading in the serif, one short line under it, and rows separated
 * by hairlines — rather than a boxed card, because a detail page is read down like a page.
 */
function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const id = `section-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <section aria-labelledby={id} className="min-w-0">
      <h2 id={id} className="font-heading text-section font-semibold">
        {title}
      </h2>
      {intro ? <p className="mt-1 text-pretty text-sm text-muted-foreground">{intro}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * **The owner's last judgement, as a bookmark**, with what it is said beside it — or the
 * absence said in words, and the act that fills it where there is a Pass to hang it on.
 */
function LastRating({
  score,
  finished,
  rate,
  large = false,
}: {
  score: number | null;
  finished: number;
  rate?: string;
  large?: boolean;
}) {
  const times =
    finished === 0
      ? null
      : finished === 1
        ? "Finished once."
        : finished === 2
          ? "Finished twice."
          : `Finished ${finished} times.`;

  if (score === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Not rated yet.{" "}
        {rate ? (
          <Link href={rate} className={IN_PROSE}>
            Rate it
          </Link>
        ) : null}
        {times ? <span className="block">{times}</span> : null}
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3.5">
      <RatingMark score={score} size={large ? "large" : "small"} />
      <p className="text-label leading-snug text-muted-foreground lg:text-sm">
        Your last rating,
        <br />
        out of 10.{times ? ` ${times}` : null}
      </p>
    </div>
  );
}

/** What the house holds of it, said the way the owner would: *Bompiani, Hardcover*. */
function yourCopies(held: CarryingVolume[]): string {
  const [first] = held;
  if (held.length === 1) {
    return [first.publisher, first.editionLine, first.binding.name].filter(Boolean).join(", ");
  }
  const publishers = [...new Set(held.map((volume) => volume.publisher))];
  return `${held.length} Volumes, ${publishers.join(" and ")}`;
}

/** The way back to the wall: a chevron, stroked at the nib's weight. */
function Back({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
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

/**
 * A score and the owner's words beside it: the bookmark, then what they wrote in the serif's
 * italic — which on this surface means one thing only, that these words are theirs.
 */
function Judgement({
  rating,
  storyId,
  saidAlready,
}: {
  rating: StoryRating;
  storyId: string;
  /** The Provenance the row above already printed, so the same word is not said twice. */
  saidAlready?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-start gap-3">
        <RatingMark score={rating.score} className="pt-0.5" />
        {rating.prose ? (
          <p className="min-w-0 max-w-prose text-pretty font-serif text-[1.0625rem] leading-snug italic">
            {rating.prose}
          </p>
        ) : null}
      </div>
      {/* **Unmaking it, from wherever it is drawn** (ADR-0018): a score is struck by its own
          id, so the same control serves a judgement under its Pass and one under no Pass.
          Quiet, beside the Provenance — it is a correction, not the point of the row. */}
      <p className="flex flex-wrap items-baseline gap-x-3 text-label text-muted-foreground">
        {rating.provenance.name === saidAlready ? null : <span>{rating.provenance.name}</span>}
        <Link href={panelled(storyId, STRIKE_RATING, { rating: rating.id })} className={QUIET_LINK}>
          Strike this score
        </Link>
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

  // The Pass the owner is in the middle of, which is what decides whether this page offers
  // *start* or *close*. It is `../passes`' answer and not a comparison written here.
  const open = theOpenPass(story.passes);

  const panel = PANELS.find((one) => one === said(asked, "panel"));
  // **Which Pass a panel is about**, read against the stack rather than trusted: a
  // hand-edited `?pass=` naming nothing opens no panel, exactly as `?panel=banana` does.
  // Four panels are about one pass rather than about the Story — the judgement, where it got
  // to, and now the strike (ADR-0018) — so it is one derivation and not one per drawer.
  const onePass = story.passes.find((pass) => pass.id === said(asked, "pass"));
  // And which judgement, read the same way over both places a Rating is drawn: under the pass
  // it came out of, and in the card for the scores that point at no pass at all. One lookup,
  // because a score is struck by its own id and the tile it was drawn in is not the act.
  const oneJudgement = [
    ...story.passes.map((pass) => pass.rating),
    ...story.standaloneRatings,
  ].find((rating) => rating !== null && rating.id === said(asked, "rating"));
  const closesTo = `/stories/${id}`;

  // Read only where the panel that offers them is open, as the Series screen reads its
  // placeable Volumes: the lines that name no Story are not on this page otherwise, and a
  // page reading rows it will not show is what the filter rule in `AGENTS.md` is about.
  const linesToChooseFrom = panel === PUBLISHES ? await listSeriesPublishingNothing() : [];
  // The media this Story's Type offers. Here the Type is already known — it is the record on
  // screen — so the one-Type question is enough and the door's whole-table shape is not needed.
  //
  // **It is no longer read only where the *Start it* panel is open**, and the reason is the two
  // lines under it: the page itself now asks this vocabulary a question, so it is an ordinary
  // read rather than a panel's. That is the filter rule kept rather than bent — what it forbids
  // is reading rows a screen will not use, and these decide what the screen *is*.
  const mediaToOffer = await theMediaToOffer(story.type.id);
  // **Whether an object can carry this at all.** No medium a videogame offers goes through one,
  // so there is no object to stand under it and no shelf to offer it from — which is the same
  // sentence the one door reads to take its object half off the screen, and it survives the
  // eighth Type because it names no Type.
  const carriesAnObject = aTypeCarriesAnObject(mediaToOffer);
  // **And a record already written is shown whatever the Type says.** *Offered is not allowed*
  // holds in this direction too: the core takes a Volume carrying any Story it is given, so an
  // object that does carry this one is a fact — and a screen that folded it away because the
  // Type says it is unusual would be hiding a record the owner can no longer correct.
  const standsOnObjects = carriesAnObject || carriedBy.length > 0;

  // The newest Pass, which is where *Rate it* in the hero goes: a score belongs to a Pass, and
  // the one in hand (or the last one closed) is the one the owner means.
  const newest = story.passes[0];
  const finishedTimes = story.passes.filter((pass) => pass.outcome === "finished").length;
  // The people on the cover, once each, in the order roles are credited in.
  const creators = [...new Set(story.credits.map((held) => held.person.name))];
  const held = carriedBy.filter((volume) => volume.inTheHouse);

  return (
    <main className="px-5 pt-4 pb-12 sm:px-8 sm:pt-6 lg:pb-16">
      {/* The way back, and the one act that corrects what the record *says*. The shell
          already marks *Stories*; this is the thumb's way back to the wall it came from. */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/stories"
          className="-ml-1 inline-flex h-11 items-center gap-0.5 rounded-lg pr-2 text-[0.9375rem] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Back className="size-5" />
          Stories
        </Link>
        <Link href={panelled(id, RENAME)} className={QUIET_ACT}>
          <Nib className="size-4 shrink-0" />
          Correct the title
        </Link>
      </div>

      {/* THE HERO (ADR-0026, second tranche): the cover, large and clean, on a quiet panel at
          a desk and beside the rating on a phone; then what it is, its name in the display
          serif, who made it, and the one act the page is opened for. The cover carries no
          href, because this is the page it would lead to. */}
      <div className="mt-3 flex flex-wrap items-start gap-x-12 gap-y-6">
        <div className="flex w-full flex-col gap-3 lg:w-auto lg:max-w-[340px] lg:flex-[1_1_280px]">
          <div className="flex items-end gap-5 lg:grid lg:h-[460px] lg:place-items-center lg:rounded-3xl lg:bg-muted">
            <div className="w-[132px] shrink-0 lg:w-[236px]">
              <Cover
                size="hero"
                title={story.title}
                tint={tint(story.series?.id ?? story.id)}
                label={storyDetail(story)}
                image={story.cover}
              />
            </div>
            <div className="min-w-0 pb-1 lg:hidden">
              <LastRating
                score={story.latestScore}
                finished={finishedTimes}
                rate={newest ? panelled(id, RATE, { pass: newest.id }) : undefined}
              />
            </div>
          </div>
          {/* Whose picture it is, and the act that changes it — beside the picture, as a
              sentence, because it is a correction to the record rather than tonight's act. */}
          <p className="text-pretty text-label text-muted-foreground">
            {story.ownImage
              ? "Your own image of it."
              : story.cover
                ? "The jacket of the first Volume carrying it."
                : "No cover yet, so it is drawn."}{" "}
            <Link href={panelled(id, IMAGE)} className={IN_PROSE}>
              {story.ownImage ? "Change it" : "Add a cover"}
            </Link>
          </p>
        </div>

        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-6">
          <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              {/* What it is and where the owner stands with it, in one quiet line — the state
                  derived from the Passes, and the fraction in gilt because it is progress. */}
              <p className="text-sm text-muted-foreground first-letter:uppercase">
                {story.type.name} ·{" "}
                <span
                  className={story.state === "abandoned" ? "line-through decoration-1" : undefined}
                  title="Derived from this Story's Passes, and stored nowhere"
                >
                  {stateWord(story.state)}
                </span>
                {story.howFarItGot ? (
                  <>
                    {" · "}
                    <span className="tabular-nums text-gilt">{howFarItGot(story.howFarItGot)}</span>
                  </>
                ) : null}
              </p>
              <h1 className="text-balance font-heading text-name font-semibold lg:text-name-lg">
                {story.title}
              </h1>
              {creators.length > 0 ? (
                <p className="font-heading text-xl font-medium lg:text-[1.375rem]">
                  {creators.join(", ")}
                </p>
              ) : null}
            </div>
            <div className="hidden lg:block">
              <LastRating
                score={story.latestScore}
                finished={finishedTimes}
                rate={newest ? panelled(id, RATE, { pass: newest.id }) : undefined}
                large
              />
            </div>
          </header>

          {/* **One cloth act and the rest outlined.** Which act is the cloth one follows from
              the Passes rather than from a choice: a Story with something open is one the
              owner is holding, and the only thing to say about it is how it ended. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {open ? (
                <>
                  <Link href={panelled(id, FINISHED)} className={LOUD_ACT}>
                    I finished it
                  </Link>
                  <Link href={panelled(id, GAVE_UP)} className={OUTLINED_ACT}>
                    I gave up on it
                  </Link>
                  {story.instalments === null ? null : (
                    <Link href={panelled(id, REACHED, { pass: open.id })} className={OUTLINED_ACT}>
                      Where I am in it
                    </Link>
                  )}
                </>
              ) : (
                <Link href={panelled(id, START)} className={LOUD_ACT}>
                  Start it
                </Link>
              )}
              {/* **The lesser half of the same sentence**: *not tonight, but soon*. A press
                  that asks for nothing is a plain form and not a panel. There is no *unwant*
                  beyond taking back a slip: a Want falls quiet once a Pass begins after it. */}
              {want ? null : (
                <form action={wantIt}>
                  <input type="hidden" name="storyId" value={id} />
                  <button type="submit" className={OUTLINED_ACT}>
                    I want to take it on
                  </button>
                </form>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {open ? <span>{passNow(open)}</span> : null}
              {!open && story.passes.length > 0 ? <span>Again. Earlier Passes stay.</span> : null}
              {want ? (
                <>
                  <span>{want.quiet ? "Wanted, and taken on since." : "On the Pile."}</span>
                  <form action={unwant}>
                    <input type="hidden" name="storyId" value={id} />
                    <input type="hidden" name="wantId" value={want.id} />
                    <button
                      type="submit"
                      className="rounded-sm font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Undo
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>

          {/* The facts, as a definition list between two rules — what the house holds of it,
              the line it stands in and how many parts it has, each where there is one. */}
          {held.length > 0 || story.series || story.instalments !== null ? (
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-5 gap-y-2.5 border-y border-border py-4 text-[0.9375rem] leading-snug sm:grid-cols-[7.5rem_minmax(0,1fr)]">
              {held.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">Your copies</dt>
                  <dd>{yourCopies(held)}</dd>
                </>
              ) : null}
              {story.series ? (
                <>
                  <dt className="text-muted-foreground">Series</dt>
                  <dd>
                    <Link href={`/series/${story.series.id}`} className={IN_PROSE}>
                      {[story.series.name, story.series.editionLine].filter(Boolean).join(" ")}
                    </Link>
                  </dd>
                </>
              ) : null}
              {story.instalments === null ? null : (
                <>
                  <dt className="text-muted-foreground">Parts</dt>
                  <dd>
                    {theCountItDeclares(story.instalments, story.instalmentsSaidBy)}
                    {story.howFarItGot ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · you are at {howFarItGot(story.howFarItGot)}
                      </span>
                    ) : null}
                  </dd>
                </>
              )}
            </dl>
          ) : null}

          {refused ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {refused}
            </p>
          ) : null}
          {credited ? (
            <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
              {credited} is credited on this Story.
            </p>
          ) : null}
          {uncredited ? (
            <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
              {uncredited} is no longer credited here. Their other Credits stay.
            </p>
          ) : null}

          {/* **What happened to it, and what it is** — sections under serif headings and
              hairline rows rather than a stack of boxed cards. The Passes take the first
              column because what happened to a Story is what this page is for; the objects,
              the lines and the people stand beside them. One column on a phone, same order. */}
          <div className="grid items-start gap-x-10 gap-y-10 xl:grid-cols-2">
            <div className="grid gap-10">
              <Passes story={story} />

              {story.standaloneRatings.length > 0 ? (
                <Section
                  title="Ratings with no Pass"
                  intro="Scores that belong to no Pass, most often from an imported sheet."
                >
                  <ul>
                    {story.standaloneRatings.map((rating) => (
                      <li key={rating.id} className={ROW}>
                        <Judgement rating={rating} storyId={story.id} />
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </div>

            <div className="grid gap-10">
              <Credits storyId={story.id} credits={story.credits} roles={roles} />

              {/* **Absent rather than empty where nothing could carry this** (ADR-0021): a
                  videogame is asked about no object, unless one does turn out to carry it —
                  then that object is a record and is shown whatever the Type says. */}
              {standsOnObjects ? (
                <Carriers storyId={story.id} carriedBy={carriedBy} offerable={offerable} />
              ) : null}

              <PublishedBy storyId={story.id} ledgers={publishedBy} />

              <Instalments story={story} />
            </div>
          </div>
        </div>
      </div>

      {/* **The act that unmakes the record, last and quiet** (ADR-0015). Everything above is
          what happened to this narrative; this says none of it did. It is offered whatever
          stands on the Story: the four refusals are the verb's, and its own sentence comes
          back in the drawer naming what the owner has lived with. */}
      <div className="mt-12 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="max-w-prose text-pretty text-sm text-muted-foreground">
            Never real, such as the same title twice? Strike it.
          </p>
          <Link href={panelled(id, STRIKE)} className={QUIET_ACT}>
            Strike from the library
          </Link>
        </div>
      </div>

      {/* **Opening a Pass, and saying nothing about how it ends.** That absence is the
          record: a Pass with no outcome is what makes this Story read *under way*, here and
          on the dashboard, until the owner comes back and closes it. */}
      {panel === START ? (
        <Drawer
          title="Start it"
          description="It stays under way until you close it."
          closesTo={closesTo}
        >
          <form action={startPass} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />

            <div className="grid gap-1.5">
              <Label htmlFor="pass-medium" className="text-label font-medium text-muted-foreground">
                How you went through it
              </Label>
              {/* **Read off the vocabulary, and narrowed to what this Story's Type offers**
                  (#63): paper and digital for what is printed, the consoles for what is
                  played. It is the other side of the door's picker and needs none of its
                  machinery — the Type is a fact about the record on screen rather than a
                  choice being made in this form, so the list is settled before the panel is
                  drawn and there is nothing here for a browser to do.

                  Offered is not allowed. A Pass by a medium this Type does not offer is
                  recorded exactly as it always was; what refuses one nobody declared is
                  Postgres, in the verb's own prose, and never this list. */}
              <select
                id="pass-medium"
                name="medium"
                required
                defaultValue={mediaToOffer.some((one) => one.id === "paper") ? "paper" : ""}
                className={PICKER}
              >
                {/* Where paper is not on offer nothing stands pressed, because no console is a
                    better guess than another and a panel opening on *PlayStation 5* is how a
                    game played on a Switch gets recorded wrong. The picker is required, so the
                    press waits for an answer. */}
                <option value="" disabled>
                  Which one?
                </option>
                {mediaToOffer.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
            </div>

            {/* The same rule the card below the page is held to, and for the sharper reason:
                every medium this Type offers goes through nothing, so the only answer this
                picker could take is the one it is already defaulted to. A control whose every
                use is a no-op is a question the owner has to read and dismiss. */}
            {standsOnObjects ? (
              <div className="grid gap-1.5">
                <Label
                  htmlFor="pass-volume"
                  className="text-label font-medium text-muted-foreground"
                >
                  Through which object
                </Label>
                <select id="pass-volume" name="volumeId" defaultValue="" className={PICKER}>
                  <option value="">No object — digital, borrowed, or not recorded</option>
                  {carriedBy.map((volume) => (
                    <option key={volume.id} value={volume.id}>
                      {volume.title} — {volume.binding.name}
                    </option>
                  ))}
                </select>
                <p className="text-label text-muted-foreground">
                  Only objects carrying this Story. None is the usual answer, and always the answer
                  for digital.
                </p>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label
                htmlFor="pass-started"
                className="text-label font-medium text-muted-foreground"
              >
                Started on
              </Label>
              <input id="pass-started" name="startedOn" type="date" className={PICKER} />
              <p className="text-label text-muted-foreground">
                Leave it empty if the day does not matter.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Start it
            </Button>
          </form>
        </Drawer>
      ) : null}

      {/* **Closing it, and the two ways it ends.** Abandoning is a fact worth recording
          rather than a failure to finish — it is evidence about taste, and a recommender
          should weigh it — so it is offered beside finishing and not hidden behind it. */}
      {panel === FINISHED && open ? (
        <ClosePass
          storyId={story.id}
          pass={open}
          closesTo={closesTo}
          act={finishIt}
          title="I finished it"
          label="Finished"
        />
      ) : null}
      {panel === GAVE_UP && open ? (
        <ClosePass
          storyId={story.id}
          pass={open}
          closesTo={closesTo}
          act={giveUp}
          title="I gave up on it"
          label="Gave up"
        />
      ) : null}

      {/* **The judgement, attached to the Pass it came out of.** That attachment is
          the whole of why a second pass does not overwrite anything: two Passes carry two
          Ratings, and both are on the page. */}
      {panel === RATE && onePass ? (
        <Drawer
          title={onePass.rating ? "Say it again" : "What I thought of it"}
          description={
            onePass.rating
              ? "This replaces the Rating on this Pass. A second opinion belongs to a second Pass."
              : "Of the Story, not of the object. The words matter more than the number."
          }
          closesTo={closesTo}
        >
          <form action={rate} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />
            <input type="hidden" name="passId" value={onePass.id} />

            <p className="text-pretty text-sm text-muted-foreground">
              {howItWent(onePass)} · {whenItHappened(onePass)}
            </p>

            <div className="grid gap-1.5">
              <Label
                htmlFor="rating-score"
                className="text-label font-medium text-muted-foreground"
              >
                Out of 10
              </Label>
              {/* The scale as a picker rather than a number field: it moves in half points,
                  and the keyboard a phone offers for a number gives a comma where this wants
                  a dot (`src/core/money.ts` is the other half of that story). */}
              <select
                id="rating-score"
                name="score"
                required
                defaultValue={onePass.rating?.score ?? ""}
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
              <Label
                htmlFor="rating-prose"
                className="text-label font-medium text-muted-foreground"
              >
                What I thought
              </Label>
              {/* Set in the serif in the box it is typed into as much as where it is read
                  back: what the owner writes is theirs on both sides of the press. */}
              <textarea
                id="rating-prose"
                name="prose"
                rows={6}
                defaultValue={onePass.rating?.prose ?? ""}
                placeholder="The art carries it. I would not have finished it for the story alone."
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 font-serif text-base italic leading-relaxed outline-none placeholder:font-sans placeholder:not-italic placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-prose dark:bg-input/30"
              />
              <p className="text-label text-muted-foreground">
                This is what a recommendation is made from.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              {onePass.rating ? "Say it again" : "Record it"}
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
          description="The name of the work, not of any printing of it."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={rename} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />

            <div className="grid gap-1.5">
              <Label htmlFor="story-title" className="text-label font-medium text-muted-foreground">
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
              <p className="text-label text-muted-foreground">Nothing else changes.</p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Correct it
            </Button>
          </form>
        </Drawer>
      ) : null}

      {/* **The one image a narrative can ever wear** (#65). It is a panel and not a field on
          the page for the drawer's own rule: this is a form the owner *opened*, and the act is
          refusable by something the screen cannot foresee — an address on a source's own
          domain is somebody else's bytes under the owner's name, and Postgres says so.

          **There is no lookup beside it, and that is the whole shape of the screen.** The
          Volume's cover panel offers one because an object has an ISBN to ask about; a
          narrative has none, and a videogame has no object either — so a button here would be
          a control that could only ever be refused. What the prose does instead is say why
          there is nothing to ask, which is the same courtesy `lookUpCoverFor` pays a Volume
          with no ISBN. */}
      {panel === IMAGE ? (
        <Drawer
          title={story.ownImage ? "Change the cover" : "Add a cover"}
          description="A photograph, screenshot or scan you host yourself."
          refused={refused}
          closesTo={closesTo}
        >
          <div className="grid gap-5">
            <form action={faceWithOwnImage} className="grid gap-4">
              <input type="hidden" name="storyId" value={story.id} />

              <div className="grid gap-1.5">
                <Label
                  htmlFor="story-image"
                  className="text-label font-medium text-muted-foreground"
                >
                  Address of the image
                </Label>
                <input
                  id="story-image"
                  name="imageUrl"
                  type="url"
                  required
                  defaultValue={story.ownImage ?? ""}
                  placeholder="https://…/expedition-33.jpg"
                  autoComplete="off"
                  inputMode="url"
                  className={PICKER}
                />
                <p className="max-w-prose text-pretty text-xs text-muted-foreground">
                  It wins over any cover lent by the objects carrying it. Addresses on Google&apos;s
                  or Open Library&apos;s domain are refused: that would be their image under your
                  name.
                </p>
              </div>

              <Button type="submit" className="h-11 w-full sm:h-10">
                {story.ownImage ? "Use this one" : "Add it"}
              </Button>
            </form>

            {story.ownImage ? (
              <form action={takeOwnImageOff}>
                <input type="hidden" name="storyId" value={story.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="-ml-2.5 h-8 text-xs text-muted-foreground"
                >
                  Take the cover off
                </Button>
              </form>
            ) : null}
          </div>
        </Drawer>
      ) : null}

      {panel === SERIALIZE ? (
        <Drawer
          title={story.instalments === null ? "Say how many parts it has" : "Correct the count"}
          // **What pressing this costs is said in the drawer and not on the card** (#34): a
          // count that follows the line stops following the moment the owner corrects it, and
          // that is a consequence of the act rather than a fact about the work.
          description={
            story.instalmentsSaidBy === "line"
              ? "This count follows the line that publishes it. Correcting it here makes it yours, and it stops following the line."
              : "How many numbered parts the work has, such as Slam Dunk's twenty. Leave it empty if nobody numbers it."
          }
          refused={refused}
          closesTo={closesTo}
        >
          <form action={serialize} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />

            <div className="grid gap-1.5">
              <Label
                htmlFor="story-instalments"
                className="text-label font-medium text-muted-foreground"
              >
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
              <p className="text-label text-muted-foreground">
                Empty takes the numbering off. Refused if a Pass already got further.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              {story.instalments === null ? "Say it" : "Correct it"}
            </Button>
          </form>
        </Drawer>
      ) : null}

      {/* **Where a pass got to, on the pass and never on the Story.** How far you are is a
          fact about one Pass, which is what makes a second pass start again at nothing
          without this one forgetting where it reached. */}
      {panel === REACHED && onePass && story.instalments !== null ? (
        <Drawer
          title="Where I got to"
          description="The last Instalment this Pass finished."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={sayWhereIGotTo} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />
            <input type="hidden" name="passId" value={onePass.id} />

            <p className="text-pretty text-sm text-muted-foreground">
              {howItWent(onePass)} · {whenItHappened(onePass)}
            </p>

            <div className="grid gap-1.5">
              <Label htmlFor="pass-at" className="text-label font-medium text-muted-foreground">
                Last Instalment finished, out of {story.instalments}
              </Label>
              <input
                id="pass-at"
                name="atInstalment"
                type="number"
                min={1}
                max={story.instalments}
                step={1}
                inputMode="numeric"
                defaultValue={onePass.atInstalment ?? ""}
                placeholder="7"
                className={PICKER}
              />
              <p className="text-label text-muted-foreground">
                Empty stops counting. A Pass at the last Instalment stays open until you close it.
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
          description="Volumes of that line will carry this Story."
          refused={refused}
          closesTo={closesTo}
        >
          {linesToChooseFrom.length === 0 ? (
            <p className="max-w-prose text-pretty text-sm text-muted-foreground">
              No Series is free to choose. Every line already publishes a Story or has no Volume
              carrying one yet.
            </p>
          ) : (
            <form action={sayWhichSeriesPublishesIt} className="grid gap-5">
              <input type="hidden" name="storyId" value={story.id} />

              <div className="grid gap-1.5">
                <Label
                  htmlFor="publishes-series"
                  className="text-label font-medium text-muted-foreground"
                >
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
                  Every Volume of that line carries <em>{story.title}</em> afterwards. The Stories
                  they carried merge into it, with their Ratings, Passes, Credits, Paths and Wants.
                </p>
                <details className="max-w-prose">
                  <summary className="cursor-pointer text-sm font-medium text-cloth">
                    How this works
                  </summary>
                  <p className="mt-2 text-pretty">
                    Nothing you own moves: the Volumes, the acquisitions and the count published
                    stay as they are. Nothing happens at all if the merge would lose something: two
                    scores that cannot both be this Story&apos;s one, a Story a Volume outside the
                    line carries too, or a Pass counted in a Story&apos;s own parts.
                  </p>
                </details>
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
          title="Strike from the library"
          description="For a record that was a mistake, such as the same Story twice. Not for one you are done with."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={strikeIt} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />

            <p className="text-pretty text-sm text-muted-foreground">
              The library stops knowing <em>{story.title}</em>. Its Credits go too; the people stay,
              with their other Credits.
            </p>

            {/* The four, said in full and before the press. They are the verb's own rule and
                this is a copy of it in prose rather than in code — the page draws the press
                whatever stands on the Story, and the sentence the verb answers with names
                which one it was. */}
            <p className="text-pretty text-sm text-muted-foreground">
              Refused if an object in the house carries it, a Pass went through it, you scored it,
              or a Path names it as a stop.
            </p>

            <div>
              <Button type="submit" variant="destructive" className="h-11 w-full sm:h-10">
                Strike it
              </Button>
              <p className="mt-2 text-pretty text-xs text-muted-foreground">
                This cannot be undone.
              </p>
            </div>
          </form>
        </Drawer>
      ) : null}

      {/* **THE TWO DOORS THAT MAKE A MIS-TAP SURVIVABLE** (ADR-0018), and the pair the page
          went three releases without. Pressing *Start it* on the wrong tile in a shop
          put a Story under way for ever: the only exits were *Finished* and *Gave up*,
          which are false statements about a book nobody opened, and striking the Story is
          refused the moment a Pass exists. A record of an event that did not happen is
          ADR-0014's own case, and this is where it is unmade.

          Fields: none, like the Story's own strike, and for its reason — the whole of the act
          is the press, and the panel is what makes it two deliberate taps over the row the
          owner is looking at. */}
      {panel === STRIKE_PASS && onePass ? (
        <Drawer
          title="Strike this Pass"
          description="For a Pass that never happened. If you gave up, say so instead."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={strikeThisPass} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />
            <input type="hidden" name="passId" value={onePass.id} />

            {/* Which pass, in the words the row says it in: the stack can hold several, and a
                destructive press has to name the one it is about. */}
            <p className="text-pretty text-sm text-muted-foreground">
              {howItWent(onePass)} · {whenItHappened(onePass)}
            </p>

            <p className="text-pretty text-sm text-muted-foreground">
              This Pass goes. If it was the only one, <em>{story.title}</em> goes back to{" "}
              {stateWord("to-read")}.
            </p>

            {/* The one refusal, said before the press. It is the verb's rule and this is a copy
                of it in prose: the page draws the press whatever hangs off the pass, and the
                sentence the verb answers with is the one that names it. */}
            <p className="text-pretty text-sm text-muted-foreground">
              Refused if this Pass carries a score. Strike the score first.
            </p>

            <div>
              <Button type="submit" variant="destructive" className="h-11 w-full sm:h-10">
                Strike this Pass
              </Button>
              <p className="mt-2 text-pretty text-xs text-muted-foreground">
                This cannot be undone.
              </p>
            </div>
          </form>
        </Drawer>
      ) : null}

      {/* **THE THIRD DOOR, AND THE ONE THE IMPORT NEEDED** (ADR-0024). *Finished* cannot be
          taken back by finishing it differently — a Pass is never overwritten — and the
          drawer above is refused the moment the pass carries a score, so a run typed in from
          the shelf as read could only be corrected by first unwriting what the owner thought
          of it. This unsays the one field that was false and leaves the pass, where it got to
          and the judgement standing.

          Fields: none, like the two beside it. The whole of the act is the press. */}
      {panel === STRIKE_OUTCOME && onePass ? (
        <Drawer
          title="It never ended"
          description="For a Pass closed before it was over. The Pass and your score stay."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={strikeThisOutcome} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />
            <input type="hidden" name="passId" value={onePass.id} />

            {/* Which pass, in the words the row says it in — the same sentence the strike
                above prints, and for its reason: the stack can hold several. */}
            <p className="text-pretty text-sm text-muted-foreground">
              {howItWent(onePass)} · {whenItHappened(onePass)}
            </p>

            <p className="text-pretty text-sm text-muted-foreground">
              The ending and its day go; everything else stays. <em>{story.title}</em> reads{" "}
              {stateWord("reading")} again.
            </p>

            <p className="text-pretty text-sm text-muted-foreground">
              Refused if this Pass never ended. To say it went differently, start a second Pass.
            </p>

            <div>
              <Button type="submit" variant="destructive" className="h-11 w-full sm:h-10">
                It never ended
              </Button>
              <p className="mt-2 text-pretty text-xs text-muted-foreground">
                This cannot be undone. You can finish it again once it reaches its last Instalment.
              </p>
            </div>
          </form>
        </Drawer>
      ) : null}

      {/* The other half, and the reason the refusal above is satisfiable at all: a rated pass
          stands until the judgement goes, and a refusal the owner has no way to answer is the
          dead end this whole pair was opened to end. It is also the answer on its own to a
          score typed into the wrong row — saying it again replaces the number and still
          asserts that the owner judged this book. */}
      {panel === STRIKE_RATING && oneJudgement ? (
        <Drawer
          title="Strike this score"
          description="For a score you did not mean to give. To change it, say it again instead."
          refused={refused}
          closesTo={closesTo}
        >
          <form action={strikeThisRating} className="grid gap-4">
            <input type="hidden" name="storyId" value={story.id} />
            <input type="hidden" name="ratingId" value={oneJudgement.id} />

            <p className="text-pretty text-sm text-muted-foreground">
              The library stops knowing you judged <em>{story.title}</em> at{" "}
              <span className="tabular-nums">{scoreSaid(oneJudgement.score)}</span>
              {oneJudgement.prose ? ", and your words go with it" : ""}.
            </p>

            {/* Nothing refuses it, and the panel says so rather than leaving the owner to
                find out: no record in this schema points at a Rating, so there is nothing to
                clear first and nothing that changes quietly by its going. */}
            <p className="text-pretty text-sm text-muted-foreground">Nothing refuses this.</p>

            <div>
              <Button type="submit" variant="destructive" className="h-11 w-full sm:h-10">
                Strike this score
              </Button>
              <p className="mt-2 text-pretty text-xs text-muted-foreground">
                This cannot be undone.
              </p>
            </div>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}

/**
 * The stack: one Pass each, newest first, with the Rating it carried.
 *
 * **Nothing here is ever overwritten**, which is the argument the whole page is built to
 * make. Going through it again adds a Pass, and the opinion from last time stays beside the new
 * one — the `Voto` cell held one number and this holds every judgement the owner ever gave.
 */
function Passes({ story }: { story: FoundStory }) {
  return (
    <Section title="Passes" intro="Each time through, newest first.">
      {story.passes.length === 0 ? (
        <p className="text-pretty text-sm text-muted-foreground">
          No Pass yet. Start one from the top of the page.
        </p>
      ) : (
        <ol>
          {story.passes.map((record) => (
            <li key={record.id} className={`${ROW} grid gap-2`}>
              <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="font-heading text-[1.0625rem] font-semibold tabular-nums">
                  {whenItHappened(record)}
                </span>
                <span className="text-label text-muted-foreground">{howItWent(record)}</span>
              </p>
              <p className="flex flex-wrap items-baseline gap-x-3 text-label text-muted-foreground">
                <span>{record.provenance.name}</span>
                {/* Where *this* pass got, which is not where the owner is now: a run given up
                    at nine in 2019 says so under itself. */}
                {record.atInstalment === null || story.instalments === null ? null : (
                  <span className="tabular-nums text-gilt">
                    {howFarItGot({
                      atInstalment: record.atInstalment,
                      instalments: story.instalments,
                    })}
                  </span>
                )}
              </p>

              {/* The judgement is opened from the Pass it will belong to, because that
                  attachment is what a second pass's opinion is made of. */}
              {record.rating ? (
                <Judgement
                  rating={record.rating}
                  storyId={story.id}
                  saidAlready={record.provenance.name}
                />
              ) : (
                <Unrated
                  rate={
                    <Link href={panelled(story.id, RATE, { pass: record.id })} className={IN_PROSE}>
                      Rate it
                    </Link>
                  }
                />
              )}

              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                {record.rating ? (
                  <Link href={panelled(story.id, RATE, { pass: record.id })} className={IN_PROSE}>
                    Say it again
                  </Link>
                ) : null}
                {story.instalments === null ? null : (
                  <Link
                    href={panelled(story.id, REACHED, { pass: record.id })}
                    className={IN_PROSE}
                  >
                    {record.atInstalment === null ? "Say where I got to" : "Move it on"}
                  </Link>
                )}
                {/* **Unmaking the pass itself** (ADR-0018), last among the acts because it is
                    about the row rather than about the pass. */}
                <Link
                  href={panelled(story.id, STRIKE_PASS, { pass: record.id })}
                  className={QUIET_LINK}
                >
                  Strike this Pass
                </Link>
                {/* **And unsaying only the ending** (ADR-0024), drawn only where there is an
                    ending to unsay. */}
                {stillOpen(record) ? (
                  <span className="text-sm text-muted-foreground">Still open</span>
                ) : (
                  <Link
                    href={panelled(story.id, STRIKE_OUTCOME, { pass: record.id })}
                    className={QUIET_LINK}
                  >
                    It never ended
                  </Link>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/**
 * Who wrote it and who drew it, laid out as an indicia: the name, and the role against it.
 *
 * A name and a role, and nothing else to fill in: a person the library has not met is named
 * by crediting them. The field suggests the people who already exist as it is typed into — a
 * second spelling of a name is a second person forever (ADR-0012) — and it stays a plain
 * `POST`, so a name typed in full is credited whether the suggestions arrived or not.
 */
function Credits({
  storyId,
  credits,
  roles,
}: {
  storyId: string;
  credits: StoryCredit[];
  roles: CreditRole[];
}) {
  return (
    <Section title="Credits" intro="Who wrote it and who drew it.">
      {credits.length === 0 ? (
        <p className="text-pretty text-sm text-muted-foreground">
          Nobody is credited on this Story yet.
        </p>
      ) : (
        <dl>
          {credits.map((held) => (
            <div
              key={held.id}
              className="flex items-baseline justify-between gap-3 border-t border-border py-3"
            >
              <dd className="min-w-0 flex-1">
                <Link
                  href={`/credits/${held.person.id}`}
                  className="truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {held.person.name}
                </Link>
              </dd>
              <dt className="shrink-0 text-sm text-muted-foreground">{held.role.name}</dt>
              <Uncredit storyId={storyId} held={held} />
            </div>
          ))}
        </dl>
      )}

      <form action={credit} className="mt-2 grid gap-3 border-t border-border pt-4">
        <input type="hidden" name="storyId" value={storyId} />
        <PersonPicker />
        <div className="grid gap-1.5">
          <Label htmlFor="credit-role" className="text-label font-medium text-muted-foreground">
            Role
          </Label>
          <RoleSelect id="credit-role" roles={roles} />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full sm:h-10 sm:w-auto sm:justify-self-start"
        >
          Add a credit
        </Button>
      </form>
    </Section>
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
    <Section title="Series publishing it" intro="The lines that print this Story.">
      {ledgers.length === 0 ? (
        <p className="text-pretty text-sm text-muted-foreground">
          No Series publishes this Story. That is the usual answer.
        </p>
      ) : (
        <ul>
          {ledgers.map((ledger) => (
            <li key={ledger.id} className="border-t border-border">
              <Link
                href={`/series/${ledger.id}`}
                className="grid gap-1 py-3 outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-pretty font-heading text-lg font-semibold leading-snug">
                  <SeriesName ledger={ledger} />
                </span>
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Progress ledger={ledger} />
                  {/* The missing read, and only where there is a project it is missing from
                      (`series/positions.ts` decides that once). */}
                  {ledger.missing === null ? null : ledger.missing.length === 0 ? (
                    <span className="text-label font-medium text-gilt">Complete</span>
                  ) : (
                    <span className="text-label tabular-nums text-muted-foreground">
                      Missing {ledger.missing.length} · next is {ledger.nextMissing}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* One clause, and the panel says the rest, beside the picker where the line is chosen. */}
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border pt-3 text-label text-muted-foreground">
        <Link href={panelled(storyId, PUBLISHES)} className={`text-sm ${IN_PROSE}`}>
          Say which Series publishes it
        </Link>
        <span>Its Volumes come to carry this Story. Nothing you own moves.</span>
      </p>
    </Section>
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
/**
 * The nib on *Correct the title*: **the one act in this hero that is about the record rather
 * than about tonight**, and the glyph is what keeps it from reading as a third press in the
 * same breath as *Start it*.
 *
 * Stroked, at the magnifier's weight (`../../finder.tsx`), because that is what a glyph drawn
 * on paper is in this application; the door's plus is filled because it is knocked out of an
 * ink block (`../../door.tsx`). Two techniques, one rule, and still no icon library — this is
 * the third glyph the whole application has.
 */
function Nib({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* The body, laid along the diagonal a hand holds a pen at. */}
      <path d="M15.2 4.3 19.7 8.8 9.1 19.4l-5.4 1 1-5.4z" />
      {/* Where the nib meets the paper, said as its own stroke so the point survives 16px. */}
      <path d="M4.7 15 9 19.3" />
    </svg>
  );
}

function Instalments({ story }: { story: FoundStory }) {
  return (
    <Section title="Instalments" intro="The numbered parts of the work, however they are printed.">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border pt-3">
        {story.instalments === null ? (
          <span className="text-sm text-muted-foreground">Not numbered. Most Stories are not.</span>
        ) : (
          <>
            {/* Where the count comes from the line, the number wears its provenance in words
                (#34); the owner's own count is a plain number. */}
            <span
              className={
                story.instalmentsSaidBy === "line"
                  ? "text-sm text-muted-foreground"
                  : "text-sm font-medium tabular-nums"
              }
            >
              {theCountItDeclares(story.instalments, story.instalmentsSaidBy)}
            </span>
            {story.howFarItGot ? (
              <span className="text-sm text-muted-foreground">
                You are at {howFarItGot(story.howFarItGot)}.
              </span>
            ) : null}
          </>
        )}
        <Link href={panelled(story.id, SERIALIZE)} className={`text-sm ${IN_PROSE}`}>
          {story.instalments === null ? "Say how many parts it has" : "Correct the count"}
        </Link>
      </p>
    </Section>
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
    <Section title="Volumes carrying it" intro="The objects this Story is printed in.">
      {carriedBy.length === 0 ? (
        <p className="text-pretty text-sm text-muted-foreground">
          No Volume carries this Story. That is fine: read digitally, borrowed, or only remembered.
        </p>
      ) : (
        <div className="border-t border-border pt-3">
          <ol className="flex flex-wrap gap-1" aria-label="The objects carrying this Story">
            {carriedBy.map((volume) => (
              <li key={volume.id}>
                <Spine
                  href={`/collection/${volume.id}`}
                  title={volume.title}
                  // No position to print for an object nobody placed in a line, and an
                  // absence is drawn as one rather than as a glyph standing in for a number.
                  foot={volume.seriesNumber ?? "—"}
                  tint={tint(volume.seriesId ?? storyId)}
                  held={volume.inTheHouse}
                  detail={[
                    volume.title,
                    volume.binding.name,
                    volume.covers ? whatItCovers(volume.covers) : null,
                    volume.inTheHouse ? "on the shelf" : "not on the shelf",
                  ]
                    .filter(Boolean)
                    .join(" — ")}
                />
              </li>
            ))}
          </ol>
          <p className="mt-3 text-pretty text-label text-muted-foreground">
            {carriedBy.length} {carriedBy.length === 1 ? "Volume" : "Volumes"}, in the
            publisher&apos;s order. A hollow spine is one not in the house.
          </p>
        </div>
      )}

      {/* The same fact the object's own page writes, recorded from this end because a Story
          spanning twenty objects would otherwise be twenty visits. */}
      <form action={carryFromStory} className="mt-4 grid gap-3 border-t border-border pt-4">
        <input type="hidden" name="storyId" value={storyId} />
        <div className="grid gap-1.5">
          <Label htmlFor="carry-volume" className="text-label font-medium text-muted-foreground">
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
        <Button
          type="submit"
          variant="outline"
          disabled={offerable.length === 0}
          className="h-11 w-full sm:h-10 sm:w-auto sm:justify-self-start"
        >
          Record it
        </Button>
        <p className="text-label text-muted-foreground">Only Volumes in the house are offered.</p>
      </form>
    </Section>
  );
}

/**
 * The end of a Pass, in whichever of the two ways it ended.
 *
 * One component and two panels: the day and the sentence are the same, and only the verb and
 * the word differ. Written once because *finished* and *gave up* are the same act with
 * different evidence in it — and rendered as two addresses because each carries its own plain
 * form, which is what makes both work with nothing running in the browser.
 */
function ClosePass({
  storyId,
  pass,
  closesTo,
  act,
  title,
  label,
}: {
  storyId: string;
  pass: StoryPass;
  closesTo: string;
  act: (form: FormData) => Promise<void>;
  title: string;
  label: string;
}) {
  return (
    <Drawer
      title={title}
      description="Going through it again later starts a new Pass."
      closesTo={closesTo}
    >
      <form action={act} className="grid gap-4">
        <input type="hidden" name="storyId" value={storyId} />
        <input type="hidden" name="passId" value={pass.id} />

        <p className="text-pretty text-sm text-muted-foreground">
          {howItWent(pass)} · {whenItHappened(pass)}
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor="pass-ended" className="text-label font-medium text-muted-foreground">
            Ended on
          </Label>
          <input id="pass-ended" name="endedOn" type="date" className={PICKER} />
          <p className="text-label text-muted-foreground">
            Leave it empty if you do not know the day.
          </p>
        </div>

        <Button type="submit" className="h-11 w-full sm:h-10">
          {label}
        </Button>
      </form>
    </Drawer>
  );
}
