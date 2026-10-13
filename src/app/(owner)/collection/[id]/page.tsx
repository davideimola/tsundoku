import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { ScanAnIsbn } from "@/components/scan";
import { type HeldStory, TheStoriesItHolds } from "@/components/stories-it-holds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type Acquisition,
  findVolume,
  listAcquisitions,
  type RecordedVolume,
} from "@/core/queries/collection";
import { type EditionNote, findEditionNote } from "@/core/queries/edition-note";
import { type CarriedStory, listStoriesInVolume } from "@/core/queries/story-to-volume";
import { listTypes, theTypeToOffer } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
import { cn } from "@/lib/utils";
// The words a covered range is said in, spent from the Story's own derivation rather than
// written again here: the object says the same thing whichever end the owner is standing at,
// and the Pile's picker borrows the Wishes' three words for the same reason.
import { howTheRangeIsKept, whatThisObjectHolds } from "../../stories/passes";
import {
  acquire,
  carryStories,
  correct,
  correctWhatItIs,
  coverInstalments,
  forgetCover,
  lookUpCover,
  mintStory,
  recordIsbn,
  release,
  removeOwnImage,
  stopCarrying,
  strikeStory,
  suggestStories,
  useOwnImage,
  writeNote,
} from "./actions";
import { THE_ISBN_FIELD, WHAT_THE_CATALOGUE_SAID } from "./panels";
import { Span } from "./span";
import {
  type Act,
  facedWith,
  type Panel,
  THE_ACQUISITION_A_PANEL_IS_ABOUT,
  theAcquisitionBeingCorrected,
  theActsOnTheObject,
  theCorrectionAct,
  theEditionNoteAct,
  timesSaid,
  whatTheCatalogueAnswered,
  whatTheCatalogueOffers,
  whatTheHouseSays,
  whatTheLookupSaid,
  whatWritingAnIsbnDoes,
} from "./standing";

// ONE VOLUME: the object as the library catalogues it, whether it is in the house, what it
// holds, and what the owner thinks of it.
//
// **The screen is laid out along ADR-0007, and that is the whole of its structure** (#30).
// *What it is* — publisher, edition line, Binding, language, the line it stands in, the ISBN
// — is one section. *In the house* is another, and it is a history rather than a state: an
// acquisition that ends is not deleted, so an object sold and bought again reads here as one
// object acquired twice, at two prices, which is the thing the model makes true and no screen
// had ever said out loud. Being catalogued is not being owned, and the page must not blur the
// two; two headings side by side is the least ambiguous way to say so.
//
// **Every act on it is a panel now, and that is what "in the new shell" turned out to mean.**
// This screen was built before the drawer existed and carried its forms down the page: the
// ISBN box, the acquisition, a `<details>` for the release and another for the cover, four
// expanded forms between the tile and the Edition note. Read on a phone, the object's own
// facts ended two screenfuls above the judgement about it, and *what it is* was hard to see
// for all the boxes offering to change it. So the acts moved into the hero as links to
// `?panel=…` (`@/components/drawer`, #32's pattern and #29's on the Story beside this one),
// and what is left on the page is the record: the facts, the history, the narratives and the
// prose. **Which acts an object offers is `./standing.ts`'s answer** rather than a shape of
// markup — three states, two forms of one act — and those acts name every panel there is, so
// the page opens none they did not name: a hand-typed `?panel=release` over an object the
// house does not hold opens nothing. Each act's label is also its panel's title, which is why
// no sentence on this screen is written twice. And **a refused write comes back with its panel
// open, carrying the verb's prose into it** — the panel covers the page a banner would
// otherwise be printed behind.
//
// **The ISBN is a field here, and this is the only place a human can put one.** 0 of 96
// Volumes carry one, the sheets had no column for it, and until the Inbox starts delivering
// them from an assistant this panel is the whole of the answer — after which it is where a
// wrong one is fixed. Correcting it takes the cover with it, because a looked-up cover is an
// answer to the ISBN that stood on the record when it was asked for (ADR-0012, #32), and the
// panel says so where the correction is made.
//
// **The camera is in that panel too, and the catalogue of record is asked in the same press.**
// The gesture a barcode buys is *hold the object, point the phone* — so the moment the number
// reaches the library is the moment there is something to check the record against, and a
// lookup asked from a second press is a lookup nobody performs. The write is the ISBN and
// nothing else: what SBN answered comes back in the address and stands in the panel as a
// **proposal**, field by field, beside the two facts this library kept. The second form is
// what writes them, an empty box keeps what the record says, and the fields the catalogue's
// answer does not carry are not named in the amendment and are therefore left standing. It is
// the one panel on this screen that reopens on a *success*, and `./actions.ts` says why: the
// press has two answers, and the second one is a form to read rather than a report to print
// behind a closed drawer.
//
// **The Stories are a list with a score column**, so *L'uomo che ride* prints three titles and
// three different numbers under one object's title, and the thing the spreadsheet destroyed —
// one `Voto` cell for three opinions — is visible in one glance. The scores are the Stories'
// and are shown here only because this is where the mismatch is legible; nothing on this page
// attaches a number to the object.
//
// **And what the object holds is said here, in one gesture** (#47, ADR-0019). Three screens
// worth of errand used to live under that list: a native `<select>` over every Story in the
// library, one choice and one submit, so an omnibus of three was three round trips; a panel
// beside it for a narrative the library had never heard of; and a third panel with one title
// per line, for the case where the default had minted a narrative out of a jacket. They are
// one field now — `@/components/stories-it-holds`, mounted here and, when #48 lands, at
// cataloguing time as well — where typing searches the library, the answers arrive banded by the line each Story
// stands in, a whole band is taken in one press, and enter mints what the library does not
// know. Two panels went with them, which is why `./standing.ts` names four acts and not six.
//
// **The row is where the default is corrected, and it offers two acts of two sizes.** The
// cross says this object does not hold that narrative; the bin says the library stops knowing
// it, which is what an auto-minted *Batman: Il lungo Halloween* needs and what a work running
// across twenty tankōbon must never be offered. The bin is drawn only where striking would be
// allowed, off the same expression the verb refuses with (`whyItStands`), so a press the owner
// can see is a press that works.
//
// **The Edition note sits beside them, and says in its own words that it is not one of those
// numbers.** Two judgements, in two places, in two registers — a column of digits, and prose
// set in the serif, which in this application is the owner's own voice and nothing else. It is
// nowhere called a Rating, because it is not one: it is an opinion of the *object*. It is
// **read back** on the page and written in a panel, the way a Rating's prose is read back on
// the Story and written in one — what the owner wrote is the record, and the box is the act.
//
// A thin adapter over the core (ADR-0002): five queries, twelve verbs behind the acts, and no
// SQL. Every panel is still a link and every act outside the contents is still a plain form
// post; **the contents are a client component and carry writes of their own** (ADR-0020, which
// supersedes ADR-0010 and is what let the one field exist at all). Its adapter is five Server
// Functions in `./actions.ts` — the same shape as every other write on this page, minus the
// form.
export const dynamic = "force-dynamic";

type Asked = Record<string, string | string[] | undefined>;

function asked(params: Asked, name: string): string | undefined {
  const value = params[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * This screen's address with a panel open on it.
 *
 * A Volume is one record and this page narrows nothing, so there are no filters to carry
 * through — what the address holds is the panel, the row it is about where it is about one,
 * and nothing else. What it deliberately drops is the answer to the last write: a refusal, or
 * what a lookup just said, is about the press that produced it, and carrying it through the
 * opening of a drawer would print it again over an act nobody just performed.
 *
 * `about` is the acquisition a correction stands over, and it is the only panel that takes
 * one: the other five are acts on the object, of which there is one each, and this is an act
 * on a record, of which an object acquired twice has two.
 */
function panelled(volumeId: string, panel: Panel, about?: string): string {
  const asking = new URLSearchParams({ panel });
  if (about) asking.set(THE_ACQUISITION_A_PANEL_IS_ABOUT, about);

  return `/collection/${volumeId}?${asking}`;
}

// The same look at the size a number wants: two boxes standing in a sentence rather than a
// field filling a column, which is what an Instalment range is — *1 to 35*, read left to
// right, beside the Story it is about.
// The work drawn as its own parts. It is a rule on the page until a script attaches the
// gesture to it, and then it grows into something a thumb can hit — which is the same
// progressive line the rail's grips are on: nothing suggests a gesture that is not there.
const PARTS = "flex h-1.5 items-stretch gap-px data-[gesture=on]:h-5";

const NUMBER =
  "h-9 rounded-lg border border-input bg-transparent px-2 text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function VolumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Asked>;
}) {
  await requireOwner();

  const { id } = await params;
  const volume = await findVolume(id);
  if (!volume) notFound();

  const [carried, note, history, types, typeToOffer] = await Promise.all([
    listStoriesInVolume(volume.id),
    findEditionNote(volume.id),
    listAcquisitions(volume.id),
    // A Type is a data row and never an enum in code (ADR-0006), so the field that records a
    // narrative reads the vocabulary rather than carrying a copy of it.
    listTypes(),
    // And the one of them the box arrives holding: guessed from the Binding where the Binding
    // decides, and otherwise the last one the owner used (ADR-0019).
    theTypeToOffer(volume.binding.id),
  ]);

  const said = await searchParams;
  const refused = asked(said, "refused");
  const cover = asked(said, "cover");

  // **What this object can have done to it**, which is the core's three states turned into
  // two forms of one act plus two repairs (`./standing.ts`) — and the Edition note's, which is
  // an act like the rest and is only opened from somewhere else: beside the prose it replaces.
  const acts = theActsOnTheObject(volume);
  const noting = theEditionNoteAct(note);

  // **The act being performed, read against the ones this object has** rather than trusted:
  // `?panel=banana` opens nothing, and neither does a panel naming an act this object does not
  // have — a hand-typed `?panel=release` over something the house does not hold. It is the act
  // itself and not just its name, because a panel's title is the label of the press that
  // opened it and nothing on this page recomputes that sentence.
  const asking = asked(said, "panel");
  const acting = [...acts, noting, theCorrectionAct()].find((act) => act.panel === asking);
  const closesTo = `/collection/${volume.id}`;
  // **And which row a correction is about**, read against the history this page is holding.
  // The name alone is not enough for this one panel: it is an act on a record rather than on
  // the object, so `?panel=correction` naming an acquisition of somebody else's object has to
  // open nothing rather than a form that would write to it.
  const correcting = theAcquisitionBeingCorrected(
    asking,
    asked(said, THE_ACQUISITION_A_PANEL_IS_ABOUT),
    history
  );

  return (
    <main className="px-5 pb-16 pt-6 sm:px-8 sm:pt-10">
      {/* **The hero, and it opens on the object** (ADR-0026, second tranche). The jacket stands
          large and clean on a quiet panel — nothing printed over it, the cover is the heart of
          the screen — and beside it is what a tile no longer says: the Binding and the Type in
          one line, the name in the display serif, where it stands in its line, and the acts.

          **No breadcrumb.** The shell marks *Collection* while the owner is standing here, and
          a trail one step long is a second answer to a question the chrome already answers.
          **The cover carries no href**, because this is the page it would lead to. */}
      <header className="flex flex-wrap items-start gap-x-12 gap-y-6">
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:max-w-[21rem] sm:flex-[1_1_17.5rem]">
          <div className="flex items-center justify-center rounded-3xl bg-muted px-6 py-8 sm:h-[28.75rem] sm:py-0">
            <Cover
              size="hero"
              title={volume.title}
              tint={tint(volume.series?.id ?? volume.id)}
              label={objectSaid(volume)}
              image={volume.cover}
              className="w-[8.25rem] sm:w-[14.75rem]"
            />
          </div>

          {/* Where the jacket comes from — a fact about the object, said under the picture it
              is about rather than behind the press that changes it. The source's own page for
              the book is the link ADR-0013 owes Google. */}
          <p className="text-pretty text-label text-muted-foreground">
            {facedWith(volume)}
            {volume.lookedUp.at ? ` Last asked about on ${volume.lookedUp.at}.` : null}{" "}
            {volume.lookedUp.infoUrl ? (
              <a
                href={volume.lookedUp.infoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-cloth underline-offset-4 hover:underline"
              >
                The source&apos;s own page for it
              </a>
            ) : null}
          </p>
        </div>

        <div className="flex min-w-0 flex-[999_1_26rem] flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            {/* **What it is, in one line**: the Binding and the Types of what it holds, which
                is everything a tile used to print over a jacket and no longer does. */}
            <p className="text-sm text-muted-foreground">
              {[volume.binding.name, ...typesHeld(carried)].join(" · ")}
              {" · "}
              {volume.inTheHouse ? "in the house" : "not in the house"}
            </p>
            <h1 className="text-balance font-heading text-name font-semibold lg:text-name-lg">
              {volume.title}
            </h1>
            <p className="font-heading text-xl font-medium">
              {volume.series ? (
                <>
                  <Link
                    href={`/series/${volume.series.id}`}
                    className="rounded-sm underline-offset-4 outline-none hover:text-cloth hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {[volume.series.name, volume.series.editionLine].filter(Boolean).join(", ")}
                  </Link>{" "}
                  <span className="tabular-nums">{volume.seriesNumber}</span>
                </>
              ) : (
                [volume.publisher, volume.editionLine].filter(Boolean).join(", ")
              )}
            </p>
          </div>

          {/* **At most one loud act, the rest outlined.** The first is the one the owner opened
              this page to perform — whether the house holds the thing — and `./standing.ts` is
              what puts it first. It is cloth when it brings the object in; *It left the house*
              stays outlined, because a release is never the act a page should shout. */}
          <div className="flex flex-wrap items-center gap-2.5">
            {acts.map((act, place) => (
              <OpensDrawer
                key={act.panel}
                href={panelled(volume.id, act.panel)}
                emphasis={place === 0 && act.panel !== "release" ? "loud" : "quiet"}
              >
                {act.label}
              </OpensDrawer>
            ))}
          </div>

          {/* **What it is**, as facts between two rules (ADR-0007's first half). The ISBN is
              the one mono figure on the screen; an absence is said rather than left blank. */}
          <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-6 gap-y-3 border-y border-border py-5 text-[0.9375rem] leading-snug">
            <Fact term="Publisher" detail={volume.publisher} />
            <Fact term="Edition line" detail={volume.editionLine ?? "The standard printing"} />
            <Fact term="Binding" detail={volume.binding.name} />
            <Fact term="Language" detail={volume.language} />
            <Fact term="ISBN" detail={volume.isbn ?? "None recorded"} mono={Boolean(volume.isbn)} />
          </dl>
        </div>
      </header>

      {/* On the page only where nothing is standing over it: a refused write comes back with
          its panel open, and that panel is where the sentence is printed (`@/components/drawer`). */}
      {refused && !acting ? (
        <p
          role="alert"
          className="mt-6 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {refused}
        </p>
      ) : null}
      {cover ? (
        <p role="status" className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm">
          {whatTheLookupSaid(cover, asked(said, "because"))}
        </p>
      ) : null}

      {/* **Sections between rules rather than a stack of cards.** Each opens with a serif
          heading and one line, and its rows are hairlines — the screen reads as a page of a
          catalogue rather than as a dashboard of boxes. */}
      <div className="mt-12 grid items-start gap-x-10 gap-y-12 lg:grid-cols-2">
        {/* **The section has an address, because something else leads here** (#51): the
            Collection's list of objects carrying no Story links to `#stories-it-holds`. */}
        <section id="stories-it-holds" className="scroll-mt-16">
          <h2 className="font-heading text-section font-semibold">Stories it holds</h2>
          <p className="mt-1.5 text-pretty text-sm text-muted-foreground">
            Each Story inside is read and judged on its own.
          </p>
          {/* **The component the whole of #47 is about** (`@/components/stories-it-holds`).
              The Instalment range keeps its own place under the row it qualifies: nothing asks
              for one while linking, and only an omnibus wants it. */}
          <div className="mt-4 border-t border-border pt-4">
            <TheStoriesItHolds
              held={carried.map(
                (story): HeldStory => ({
                  id: story.id,
                  title: story.title,
                  type: story.type.name,
                  score: story.latestScore,
                  whyItStands: story.whyItStands,
                  href: `/stories/${story.id}`,
                  beneath:
                    story.instalments === null ? null : (
                      // Whether there is a line to fall back to is the *object's* fact and
                      // never the link's, so it is handed down rather than read off the Story.
                      <CoveredRange
                        volumeId={volume.id}
                        story={story}
                        inALine={volume.seriesNumber !== null}
                      />
                    ),
                })
              )}
              types={types}
              typeToOffer={typeToOffer}
              refused={refused}
              holds={{
                find: suggestStories.bind(null, volume.id),
                carry: carryStories.bind(null, volume.id),
                mint: mintStory.bind(null, volume.id),
                stopCarrying: stopCarrying.bind(null, volume.id),
                strike: strikeStory.bind(null, volume.id),
              }}
            />

            <p className="mt-5 max-w-prose text-pretty text-xs text-muted-foreground">
              A Story spanning twenty Volumes is named on each of them.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-heading text-section font-semibold">In the house</h2>
          {/* The sentence comes off `findVolume` and the rows off `listAcquisitions`, and the
              two agree by construction: both order the acquisitions the same way, so *the
              latest* is the same row in each. Being catalogued is not being owned (ADR-0007),
              which is why this is its own section. */}
          <p className="mt-1.5 max-w-prose text-pretty text-sm text-muted-foreground">
            {whatTheHouseSays(volume)}
          </p>

          <History acquisitions={history} volumeId={volume.id} />
        </section>

        <TheEditionNote act={noting} volume={volume} note={note} />
      </div>

      {/* **The acts, each in a panel opened from the hero.** Every one is a plain form posting
          to a Server Function, and every way out of a panel is a link — so all of this works
          with nothing running in the browser (ADR-0010). A write comes back to this page with
          the panel gone, which is what closing it means. */}
      {acting?.panel === "acquire" ? (
        <Drawer
          title={acting.label}
          refused={refused}
          description={
            volume.releasedOn
              ? "Bought again: a second acquisition of the same object. The first stays on the record."
              : "It joins the Collection and appears on the wall."
          }
          closesTo={closesTo}
        >
          <form action={acquire} className="grid gap-4">
            <input type="hidden" name="volumeId" value={volume.id} />
            <Field name="pricePaid" label="Price paid" placeholder="6,50" inputMode="decimal" />
            <Field name="acquiredOn" label="Came home" type="date" />
            <Button type="submit" className="h-11 w-full sm:h-10">
              It is in the house
            </Button>
            <p className="max-w-prose text-xs text-muted-foreground">
              Both are optional: leave them empty for a gift or a lost receipt. A comma works as a
              decimal point.
            </p>
          </form>
        </Drawer>
      ) : null}

      {/* **The one panel about a row, and the one form on this screen where an empty box takes
          a fact off the record.** Everywhere else on this page a cleared box keeps what is
          there, because the box arrived holding a proposal; here it arrives holding the record
          and the owner opened the drawer to take a wrong fact out of it. A price nobody paid
          has to end as no price — not as the old number, and not as a nought, which would be a
          claim about money. */}
      {acting?.panel === "correction" && correcting ? (
        <Drawer
          title={acting.label}
          refused={refused}
          description="The price and the day it came home. The acquisition itself stays."
          closesTo={closesTo}
        >
          <form action={correct} className="grid gap-4">
            <input type="hidden" name="volumeId" value={volume.id} />
            <input type="hidden" name="acquisitionId" value={correcting.id} />
            {/* The boxes arrive holding what the record says, so the owner corrects what is
                there rather than retyping it — and so that emptying one is visibly an act. */}
            <Field
              form="correct"
              name="pricePaid"
              label="Price paid"
              placeholder="6,50"
              inputMode="decimal"
              defaultValue={correcting.pricePaid ?? ""}
            />
            <Field
              form="correct"
              name="acquiredOn"
              label="Came home"
              type="date"
              defaultValue={correcting.acquiredOn ?? ""}
            />
            <Button type="submit" className="h-11 w-full sm:h-10">
              Correct it
            </Button>
            <p className="max-w-prose text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">Emptying a box clears it:</strong> no
              price means it stops counting towards what the library has cost, and no day means it
              was always here. A comma works as a decimal point.
            </p>
          </form>
        </Drawer>
      ) : null}

      {/* Nothing undoes it, so it costs a deliberate second press — and it erases nothing,
          which is the sentence the panel exists to be able to say at length. */}
      {acting?.panel === "release" ? (
        <Drawer
          title={acting.label}
          refused={refused}
          description="Sold, given away or lost. It leaves the Collection; the library still knows it."
          closesTo={closesTo}
        >
          <form action={release} className="grid gap-4">
            <input type="hidden" name="volumeId" value={volume.id} />
            <Button type="submit" variant="outline" className="h-11 w-full sm:h-10">
              Release it
            </Button>
            <p className="max-w-prose text-xs text-muted-foreground">
              Nothing is erased: this page, the Edition note and the Passes through it all stay. If
              it comes back, that is a second acquisition of the same object.
            </p>
          </form>
        </Drawer>
      ) : null}

      {/* **The only place a human can put an ISBN on a Volume**, and after the Inbox starts
          delivering them, the place a wrong one is fixed. It is also where the catalogue of
          record is asked what the object is, which is why it is a component of its own. */}
      {acting?.panel === "isbn" ? (
        <TheIsbn
          act={acting}
          volume={volume}
          refused={refused}
          closesTo={closesTo}
          said={{
            answered: asked(said, WHAT_THE_CATALOGUE_SAID.said),
            because: asked(said, WHAT_THE_CATALOGUE_SAID.because),
            title: asked(said, WHAT_THE_CATALOGUE_SAID.title),
            publisher: asked(said, WHAT_THE_CATALOGUE_SAID.publishedBy),
            typed: asked(said, THE_ISBN_FIELD.name),
          }}
        />
      ) : null}

      {acting?.panel === "cover" ? (
        <TheCover act={acting} volume={volume} refused={refused} closesTo={closesTo} />
      ) : null}

      {acting?.panel === "note" ? (
        <Drawer
          title={acting.label}
          refused={refused}
          description="What you think of this printing: paper, translation, value for money. Not a score."
          closesTo={closesTo}
        >
          <form action={writeNote} className="grid gap-4">
            <input type="hidden" name="volumeId" value={volume.id} />
            <Label htmlFor="edition-note" className="sr-only">
              Edition note
            </Label>
            {/* Set in the serif, in the box it is typed in as much as anywhere it is read
                back: what the owner thinks of an object is theirs, and the box that says so
                while they are writing is the box that will say so afterwards. */}
            <textarea
              id="edition-note"
              name="note"
              rows={8}
              defaultValue={note?.note ?? ""}
              placeholder="Thin paper, good translation, and cheap enough to try the saga on."
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2.5 font-serif text-base leading-relaxed outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-prose dark:bg-input/30"
            />
            <Button type="submit" className="h-11 w-full sm:h-10">
              {note ? "Rewrite it" : "Write it"}
            </Button>
            <p className="max-w-prose text-xs text-muted-foreground">
              {note
                ? "This replaces the note. Empty the box to take it back."
                : "One note per object. Empty the box later to take it back."}
            </p>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}

/**
 * Which Instalments of one Story are inside this object — **drawn, read back, and swept**.
 *
 * **The default is the whole reason Instalments cost nothing**: where a line prints one part
 * per Volume the range follows the volumes, so this reads back *follows the line* and the
 * owner types nothing. The omnibus is what the rest of it is for — one object collecting
 * thirty-five parts of a work — and emptying the boxes hands the answer back to the line.
 *
 * Three things stand here and each is a different register of one fact. **The work is drawn
 * as its own parts**, filled where this object reaches: one tick lit out of twelve and twelve
 * lit out of twelve are two different pictures before either is read, which is the whole
 * complaint this section was built to answer — a special edition holding Instalment 1 and an
 * omnibus holding 1 to 12 used to look identical until the boxes were read. A written range
 * is solid and one followed from the line is outlined, so **where the fact came from is in
 * the drawing** rather than only in a word. **The sentence under it says the same thing in
 * English**, because the record belongs on the page and not inside the controls offering to
 * change it (#30, #31) — and it names which of the two said so, since *1 to 12 because I said
 * so* and *1 to 12 because that is where this object stands* are two different things to know
 * about a shelf. **And the boxes are the act**, unchanged and still the specification.
 *
 * The span is a control on top of them where a script is running (`./span.tsx`): sweep across
 * the parts to say which are in here, press one to say it holds only that. It fills those two
 * fields and presses this form, so it is a shorter way to the write rather than a second one.
 *
 * A correction made while reading the list above it rather than a form the owner opened, so
 * it is inline and not a drawer — the same judgement the Story picker under this list is made
 * on.
 */
/** The parts of a work, counted from one — the numbers the ticks stand for. */
function theParts(instalments: number | null): number[] {
  return Array.from({ length: instalments ?? 0 }, (_, before) => before + 1);
}

function CoveredRange({
  volumeId,
  story,
  inALine,
}: {
  volumeId: string;
  story: CarriedStory;
  inALine: boolean;
}) {
  const covers = story.covers;
  const posting = `covers-${story.id}`;

  return (
    <div className="mt-2">
      <Span form={posting} label={whatThisObjectHolds(story)} className={PARTS}>
        {/* Drawn from one to the last, so the tick a pointer is over is the Instalment it
            stands for and the component attaching the gesture reads a number rather than
            working one out. Under `aria-hidden` because the sentence below says it in words:
            a screen reader that met these would meet thirty-five empty boxes first. */}
        {theParts(story.instalments).map((part) => (
          <span
            key={`${story.id}-${part}`}
            data-part={part}
            title={`Instalment ${part}`}
            className={`flex-1 rounded-xs ${
              covers && part >= covers.from && part <= covers.to
                ? covers.written
                  ? "bg-foreground"
                  : "border border-foreground"
                : "bg-muted"
            } data-[asked=in]:bg-foreground`}
            aria-hidden
          />
        ))}
      </Span>

      <form
        id={posting}
        action={coverInstalments}
        className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5"
      >
        <input type="hidden" name="volumeId" value={volumeId} />
        <input type="hidden" name="storyId" value={story.id} />

        <span className="text-label font-medium text-muted-foreground">Instalments</span>
        <label className="sr-only" htmlFor={`covers-from-${story.id}`}>
          First Instalment of {story.title} in this object
        </label>
        <input
          id={`covers-from-${story.id}`}
          name="coversFrom"
          type="number"
          min={1}
          max={story.instalments ?? undefined}
          step={1}
          inputMode="numeric"
          defaultValue={covers?.written ? covers.from : ""}
          placeholder={covers ? String(covers.from) : "1"}
          className={`${NUMBER} w-16`}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <label className="sr-only" htmlFor={`covers-to-${story.id}`}>
          Last Instalment of {story.title} in this object
        </label>
        <input
          id={`covers-to-${story.id}`}
          name="coversTo"
          type="number"
          min={1}
          max={story.instalments ?? undefined}
          step={1}
          inputMode="numeric"
          defaultValue={covers?.written ? covers.to : ""}
          placeholder={covers ? String(covers.to) : String(story.instalments)}
          className={`${NUMBER} w-16`}
        />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="h-11 px-4 text-xs sm:h-8 sm:px-3"
        >
          Record it
        </Button>
        <span className="basis-full text-xs text-muted-foreground">
          {howTheRangeIsKept(story, inALine)}
        </span>
      </form>
    </div>
  );
}

/**
 * THE EDITION NOTE, read back — the owner's judgement of the **object**, and nowhere a Rating.
 *
 * **It is prose on the page and a box in a panel** (#30), which is the shape the Story's page
 * already gives a Rating: what the owner wrote is the record, and writing it is an act. Before
 * this the note existed only as an editable textarea, so the one thing the section is for —
 * reading what you decided about this printing last time — was something the owner had to read
 * out of a form field.
 *
 * The serif is the whole of the distinction. On this surface it means one thing and one thing
 * only: these are the owner's words and not the application's.
 */
function TheEditionNote({
  act,
  volume,
  note,
}: {
  act: Act;
  volume: RecordedVolume;
  note: EditionNote | null;
}) {
  return (
    <section>
      <h2 className="font-heading text-section font-semibold">Edition note</h2>
      <p className="mt-1.5 text-pretty text-sm text-muted-foreground">
        What you think of this printing. Not a score, and never read by a recommender.
      </p>

      <div className="mt-4 grid gap-3 border-t border-border pt-4">
        {note ? (
          <>
            <p className="max-w-prose text-pretty font-serif text-lg italic leading-relaxed">
              {note.note}
            </p>
            <p className="text-label text-muted-foreground tabular-nums">
              Written {note.writtenAt}
            </p>
          </>
        ) : (
          <p className="max-w-prose text-pretty text-sm text-muted-foreground">
            Nothing written about this printing yet.
          </p>
        )}

        <Link
          href={panelled(volume.id, act.panel)}
          className="inline-flex min-h-11 items-center self-start rounded-sm text-sm font-medium text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {act.label}
        </Link>
      </div>
    </section>
  );
}

/**
 * THE ISBN, on the object's own page: the number, the camera that reads it off the back, and
 * what the catalogue of record says is published under it.
 *
 * **One press does two things, and that is the design rather than a convenience.** The owner
 * is holding the object — that is what a barcode means — so the moment the number reaches the
 * library is the moment there is something to check the record against. The write is the
 * ISBN and nothing else; what SBN answered comes back in the address (`./panels.ts`) and
 * stands here as a **proposal**, field by field, beside the two facts this library kept. The
 * second form is the one that writes them, and until it is pressed the catalogue has changed
 * nothing.
 *
 * **The camera is an enhancement over a field that already works** (`@/components/scan`,
 * ADR-0010). Typed, pasted, or filled in by the phone's own text scanner, this form posts and
 * looks the object up with nothing running in the browser; the scanner is a faster way into
 * the same field, rendered only where there is a script to honour it, and it submits the same
 * form the button does. What a barcode buys is the typing, never a different act.
 *
 * **Why the record is offered as boxes rather than as a yes.** A librarian's field is not
 * always an improvement on the spine: legal deposit spells *One Piece 100* as `One piece 100`,
 * and which of the two this library wants is the owner's call, made while looking at both.
 * So each field arrives filled in with the catalogue's answer and clearing it is how the owner
 * keeps their own — the same sentence the ISBN box above is held to, and the reason no
 * checkbox was needed to say *keep mine*. What the catalogue never named is not a box at all
 * (`whatTheCatalogueOffers`), because an empty one there would read as the catalogue saying
 * this object has no publisher.
 */
function TheIsbn({
  act,
  volume,
  refused,
  closesTo,
  said,
}: {
  act: Act;
  volume: RecordedVolume;
  refused?: string;
  closesTo: string;
  said: {
    /** Which of the three answers the catalogue gave, or nothing where it was not asked. */
    answered: string | undefined;
    because: string | undefined;
    title: string | undefined;
    publisher: string | undefined;
    /** What was in the field, carried back so a misread digit is one keystroke from right. */
    typed: string | undefined;
  };
}) {
  // Read against the three answers rather than trusted: `?from=banana` says nothing at all,
  // and so a hand-typed address cannot stand a proposal here that nobody looked up.
  const answered = whatTheCatalogueAnswered(said.answered, said.because);
  const offered = answered ? whatTheCatalogueOffers(volume, said) : [];
  const differs = offered.some((field) => field.differs);

  return (
    <Drawer
      title={act.label}
      refused={refused}
      description="Ten or thirteen digits. Saving it also asks SBN, Italy's national catalogue, what it is."
      closesTo={closesTo}
    >
      <div className="grid gap-5">
        <form action={recordIsbn} className="grid gap-4">
          <input type="hidden" name="volumeId" value={volume.id} />
          <div className="grid gap-1.5">
            <Label
              htmlFor={THE_ISBN_FIELD.id}
              className="text-label font-medium text-muted-foreground"
            >
              ISBN
            </Label>
            <Input
              id={THE_ISBN_FIELD.id}
              name={THE_ISBN_FIELD.name}
              // What was typed, over what stands on the record: a refusal comes back with the
              // digits the owner gave still in the box.
              defaultValue={said.typed ?? volume.isbn ?? ""}
              placeholder="9788828765431"
              inputMode="numeric"
              autoComplete="off"
              required
              className="h-11 font-mono sm:h-10"
            />
          </div>
          <Button type="submit" className="h-11 w-full sm:h-10">
            {volume.isbn ? "Correct it" : "Record it"}
          </Button>

          {/* The camera writes into the field above and submits this form. Under the button
              rather than over the field, because the field is the thing that always works and
              this is the shortcut. */}
          <ScanAnIsbn into={THE_ISBN_FIELD.id} />

          {/* Said where the correction is made rather than discovered afterwards: a
              looked-up cover is an answer to the ISBN that stood here when it was asked
              for, so writing a different one takes it off (ADR-0012, #32). Which of the
              three sentences that is, is `./standing.ts`'s. */}
          <p className="max-w-prose text-xs text-muted-foreground">
            {whatWritingAnIsbnDoes(volume)}
          </p>
        </form>

        {answered ? (
          <div className="grid gap-4 border-t border-border pt-5">
            <p role="status" className="max-w-prose text-pretty text-sm text-muted-foreground">
              {answered}
            </p>

            {offered.length > 0 ? (
              <form action={correctWhatItIs} className="grid gap-4">
                <input type="hidden" name="volumeId" value={volume.id} />

                {offered.map((field) => (
                  <div key={field.field} className="grid gap-1.5">
                    <Label
                      htmlFor={`from-sbn-${field.field}`}
                      className="text-label font-medium text-muted-foreground"
                    >
                      {field.label}
                    </Label>
                    <Input
                      id={`from-sbn-${field.field}`}
                      name={field.field}
                      defaultValue={field.says}
                      autoComplete="off"
                      className="h-11 sm:h-10"
                    />
                    {/* What stands on our own record, under the box that would replace it —
                        and whether the two differ at all, which is the whole of what the
                        owner is reading this panel to find out. */}
                    <p className="text-pretty text-xs text-muted-foreground">{field.against}</p>
                  </div>
                ))}

                <Button
                  type="submit"
                  variant={differs ? "default" : "outline"}
                  className="h-11 w-full sm:h-10"
                >
                  {differs ? "Correct the record" : "Write it anyway"}
                </Button>

                <p className="max-w-prose text-xs text-muted-foreground">
                  {differs
                    ? "Only these two fields. The Binding, the language, the edition line and the line it stands in are not in the catalogue's answer and are left exactly as they are."
                    : "Nothing here differs from the record: the catalogue and this library already say the same thing about this object, word for word."}{" "}
                  Clear a box to keep what the record says.
                </p>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

/**
 * THE COVER, on the object's own page: where the image on the tile comes from, and the two
 * ways the owner changes it.
 *
 * **The distinction the panel is laid out along is whose bytes they are** (ADR-0013). A
 * looked-up cover is a *reference* — the source's own address, pointed at and never copied
 * here, revocable by them at any moment — and it is 128 pixels wide, which is the only size
 * that exists. An image of the owner's own is hosted, is theirs, and overrides the other one:
 * it is the only thing that will ever face a Bonelli monthly, and the only image this
 * application is allowed to keep.
 *
 * The lookup is offered only where there is an ISBN to look one up by, and where there is
 * not the panel says so instead of standing a button there that can only ever be refused —
 * which is why the act is offered in the hero either way. That state is permanent for a whole
 * shelf of this library, and an owner in it still needs the way to their own photograph.
 */
function TheCover({
  act,
  volume,
  refused,
  closesTo,
}: {
  act: Act;
  volume: RecordedVolume;
  refused?: string;
  closesTo: string;
}) {
  const own = volume.cover?.from === "own";

  return (
    <Drawer title={act.label} description={facedWith(volume)} refused={refused} closesTo={closesTo}>
      <div className="grid gap-5">
        {volume.isbn ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <form action={lookUpCover}>
                <input type="hidden" name="volumeId" value={volume.id} />
                <Button type="submit" className="h-11 sm:h-10 sm:px-6">
                  {volume.lookedUp.source ? "Ask again" : "Look up a cover"}
                </Button>
              </form>

              {/* **The way out of a wrong cover, and it is the fast one.** Asking again
                  depends on the source having a better answer; this depends on nothing at
                  all, and a blank tile is better than another book's jacket. Offered only
                  where there is something to forget. */}
              {volume.lookedUp.source ? (
                <form action={forgetCover}>
                  <input type="hidden" name="volumeId" value={volume.id} />
                  <Button type="submit" variant="ghost" className="h-11 sm:h-10 sm:px-4">
                    Take it off
                  </Button>
                </form>
              ) : null}
            </div>

            <p className="max-w-prose text-xs text-muted-foreground">
              Google Books first, then Open Library. The cover is linked, not copied, so it is small
              and its owner can withdraw it. Asking again always reaches the source.
            </p>
          </div>
        ) : (
          <p className="max-w-prose text-pretty text-sm text-muted-foreground">
            Covers are looked up by ISBN, and this Volume has none. Record its ISBN first, or use an
            image of your own below.
          </p>
        )}

        <form action={useOwnImage} className="grid gap-3 border-t border-border pt-5">
          <input type="hidden" name="volumeId" value={volume.id} />
          <div className="grid gap-1.5">
            <Label htmlFor="volume-image" className="text-label font-medium text-muted-foreground">
              An image of your own
            </Label>
            <Input
              id="volume-image"
              name="imageUrl"
              type="url"
              defaultValue={own ? volume.cover?.url : ""}
              placeholder="https://…/one-piece-100.jpg"
              autoComplete="off"
              required
              className="h-11 sm:h-10"
            />
          </div>
          <Button type="submit" variant="outline" className="h-11 w-full sm:h-10">
            {own ? "Use this image" : "Use my own image"}
          </Button>
          <p className="max-w-prose text-xs text-muted-foreground">
            A photograph or scan you host yourself. It replaces the looked-up cover. An address on a
            cover source&apos;s own domain is refused.
          </p>
        </form>

        {own ? (
          <form action={removeOwnImage}>
            <input type="hidden" name="volumeId" value={volume.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="-ml-2.5 h-8 text-xs text-muted-foreground"
            >
              Remove my image
            </Button>
          </form>
        ) : null}
      </div>
    </Drawer>
  );
}

/**
 * What the tile at the head of the page is, said in one line — the Collection wall's own
 * `detailOf`, for the object this page is about.
 *
 * It is what a pointer and a screen reader get off a drawing that carries a title, a colour
 * and one number, and it says the two things the colour and the number stand for: which
 * Series, and where in it.
 */
function objectSaid(volume: RecordedVolume): string {
  const standing = volume.series
    ? `${[volume.series.name, volume.series.editionLine].filter(Boolean).join(", ")} ${volume.seriesNumber}`
    : "In no Series";

  const object = [volume.publisher, volume.editionLine].filter(Boolean).join(", ");

  return [volume.title, standing, object, volume.binding.name].join(" — ");
}

/**
 * **The Types of what the object holds**, each once and in the order they are held: an
 * object has no Type of its own (ADR-0006), so the hero's line says what is inside it — a
 * manga, or *Comic* for an omnibus of three tales.
 */
function typesHeld(carried: readonly CarriedStory[]): string[] {
  return [...new Set(carried.map((story) => story.type.name))];
}

/**
 * Every acquisition of the object, newest first — **which is how one object acquired twice
 * reads as one object** (ADR-0007, #30).
 *
 * An acquisition that ends is a record of having had the thing rather than a deleted row, so
 * a Volume sold and bought again has two of them here, at two prices, under one title. That
 * is the sentence the heading prints when there is more than one; with a single acquisition
 * there is nothing to count and it is not printed, because *acquired once* is noise.
 *
 * A price nobody wrote down is an em dash with the reason said, never a zero: a gift and a
 * book owned since before any of this was written down are acquisitions with no purchase in
 * them, and `€ 0.00` would be a claim about money rather than an absence of one.
 */
function History({
  acquisitions,
  volumeId,
}: {
  acquisitions: readonly Acquisition[];
  volumeId: string;
}) {
  if (acquisitions.length === 0) return null;

  return (
    <div className="mt-5">
      {acquisitions.length > 1 ? (
        <p className="text-sm text-muted-foreground">
          One object, acquired {timesSaid(acquisitions.length)}.
        </p>
      ) : null}

      <ul className="mt-2 border-t border-border">
        {acquisitions.map((acquisition) => (
          <li
            key={acquisition.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-3 text-sm"
          >
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="tabular-nums">{acquisition.acquiredOn ?? "—"}</span>
              <span className="text-muted-foreground">
                {acquisition.releasedOn ? (
                  <>
                    to <span className="tabular-nums">{acquisition.releasedOn}</span>
                  </>
                ) : (
                  "and still here"
                )}
              </span>
            </span>
            <span className="flex items-baseline gap-3">
              <span className="tabular-nums">
                {acquisition.pricePaid ? (
                  `€ ${acquisition.pricePaid}`
                ) : (
                  <span className="text-muted-foreground">— no price recorded</span>
                )}
              </span>

              {/* **Opened from the row rather than from the hero**, because which acquisition
                  a press means is only answerable from the row it was pressed on: an object
                  acquired twice has two of these and the hero has one of everything. */}
              <Link
                href={panelled(volumeId, "correction", acquisition.id)}
                className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-cloth underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
              >
                Correct it
              </Link>
            </span>
          </li>
        ))}
      </ul>
      {acquisitions.some((acquisition) => acquisition.acquiredOn === null) ? (
        <p className="mt-2 max-w-prose text-xs text-muted-foreground">
          A dash for a day means the object was here before anyone was writing this down.
        </p>
      ) : null}
    </div>
  );
}

function Fact({
  term,
  detail,
  mono,
  wide,
}: {
  term: string;
  detail: string;
  mono?: boolean;
  /** Across both columns, for a fact too long to stand in half of one — an ISBN. */
  wide?: boolean;
}) {
  // Two cells of the facts' grid rather than a box of its own: the terms stand in one column
  // and the facts in the next, so the eye runs down either.
  return (
    <div className={cn("contents", wide && "col-span-2")}>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn("m-0 min-w-0 break-words", mono && "font-mono text-sm")}>{detail}</dd>
    </div>
  );
}

function Field({
  name,
  label,
  form = "acquire",
  ...props
}: {
  name: string;
  label: string;
  /**
   * Which form the field belongs to, which is the whole of what the id is for.
   *
   * Two panels ask for a price and a day now — acquiring and correcting — and only one of
   * them is ever on screen, so nothing collides in the DOM. It is a parameter anyway because
   * an id spelled `acquire-pricePaid` inside the correction panel is a label pointing at a
   * form that is not the one around it, which is the kind of wrong nothing ever catches.
   */
  form?: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${form}-${name}`} className="text-label font-medium text-muted-foreground">
        {label}
      </Label>
      <Input id={`${form}-${name}`} name={name} className="h-11 sm:h-10" {...props} />
    </div>
  );
}
