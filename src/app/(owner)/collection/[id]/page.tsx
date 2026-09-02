import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/cover";
import { Drawer, OpensDrawer } from "@/components/drawer";
import { ScanAnIsbn } from "@/components/scan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type Acquisition,
  findVolume,
  listAcquisitions,
  type RecordedVolume,
} from "@/core/queries/collection";
import { type EditionNote, findEditionNote } from "@/core/queries/edition-note";
import { listStories } from "@/core/queries/story";
import { type CarriedStory, listStoriesInVolume } from "@/core/queries/story-to-volume";
import { listTypes } from "@/core/queries/type";
import { requireOwner } from "@/lib/auth/owner";
import { tint } from "@/lib/tint";
// The words a covered range is said in, spent from the Story's own derivation rather than
// written again here: the object says the same thing whichever end the owner is standing at,
// and the Reading list's picker borrows the Wishes' three words for the same reason.
import { howTheRangeIsKept } from "../../stories/readings";
import {
  acquire,
  carry,
  correctWhatItIs,
  coverInstalments,
  forgetCover,
  lookUpCover,
  recordIsbn,
  recordStory,
  release,
  removeOwnImage,
  split,
  stopCarrying,
  useOwnImage,
  writeNote,
} from "./actions";
import { THE_ISBN_FIELD, WHAT_THE_CATALOGUE_SAID } from "./panels";
import {
  type Act,
  facedWith,
  type Panel,
  THE_STORY_ACT,
  theActsOnTheObject,
  theEditionNoteAct,
  theSplitAct,
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
// **And a narrative the library has never held can be recorded from in here** (#33). The picker
// under that list names a Story that exists; the panel beside it creates one and records it
// inside this object in one act, because the owner reading a contents page off the back of a
// volume is stating both facts at once. It replaced the sentence *record the Story first if it
// is not in the list*, which described a trip to another screen and back — and that trip is
// where the second narrative of a volume stopped being recorded at all.
//
// **And where the default was wrong about an object, it is corrected from beside the list that
// says so** (#38). One Volume, one Story is right for nearly everything on these shelves and
// wrong for *Batman: L'uomo che ride*, which holds three tales the owner scores apart. The
// press under the list opens a box with one title per line — a contents page, typed as one —
// and the narrative the object stood for is replaced by the three in a single act. It is the
// only act on this screen the page decides whether to *offer*: an object with nothing in it
// has nothing to split, and one already holding several has been split. Everything else the
// gesture refuses is the verb's own prose, read in the panel beside the titles that were typed,
// because a Reading or a Rating is a sentence the owner needs rather than a control they never
// see.
//
// **The Edition note sits beside them, and says in its own words that it is not one of those
// numbers.** Two judgements, in two places, in two registers — a column of digits, and prose
// set in the serif, which in this application is the owner's own voice and nothing else. It is
// nowhere called a Rating, because it is not one: it is an opinion of the *object*. It is
// **read back** on the page and written in a panel, the way a Rating's prose is read back on
// the Story and written in one — what the owner wrote is the record, and the box is the act.
//
// A thin adapter over the core (ADR-0002): four queries, ten verbs behind the forms, and no
// SQL. Nothing runs in the browser — every write is a plain form post and every drawer is a
// link, so the page works one-handed on a shop's signal with no JavaScript executing.
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
 * through — what the address holds is the panel and nothing else. What it deliberately drops
 * is the answer to the last write: a refusal, or what a lookup just said, is about the press
 * that produced it, and carrying it through the opening of a drawer would print it again over
 * an act nobody just performed.
 */
function panelled(volumeId: string, panel: Panel): string {
  return `/collection/${volumeId}?panel=${panel}`;
}

// shadcn's own input look, borrowed by hand for the native pickers this screen is made of —
// its select is a scripted component and every control here has to work with nothing running.
const PICKER =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:h-10 md:text-sm dark:bg-input/30";

// The same look at the size a number wants: two boxes standing in a sentence rather than a
// field filling a column, which is what an Instalment range is — *1 to 35*, read left to
// right, beside the Story it is about.
const NUMBER =
  "h-9 rounded-lg border border-input bg-transparent px-2 text-center font-mono text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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

  const [carried, note, stories, history, types] = await Promise.all([
    listStoriesInVolume(volume.id),
    findEditionNote(volume.id),
    listStories(),
    listAcquisitions(volume.id),
    // A Type is a data row and never an enum in code (ADR-0006), so the panel that records a
    // narrative reads the vocabulary rather than carrying a copy of it.
    listTypes(),
  ]);

  const said = await searchParams;
  const refused = asked(said, "refused");
  const cover = asked(said, "cover");
  // Every Story is offerable: a Story the object already carries is filtered out here, so
  // the picker only ever proposes something that would change the record.
  const held = new Set(carried.map((story) => story.id));
  const offerable = stories.filter((story) => !held.has(story.id));

  // **What this object can have done to it**, which is the core's three states turned into
  // two forms of one act plus two repairs (`./standing.ts`) — and the Edition note's, which is
  // an act like the rest and is only opened from somewhere else: beside the prose it replaces.
  const acts = theActsOnTheObject(volume);
  const noting = theEditionNoteAct(note);
  // **The one act this screen decides whether to offer** (`./standing.ts`): an object standing
  // for exactly one narrative is the state a split is *from*. `null` where there is nothing to
  // split or nothing single to replace, and the lookup below then opens no panel for it.
  const splitting = theSplitAct(carried);

  // **The act being performed, read against the ones this object has** rather than trusted:
  // `?panel=banana` opens nothing, and neither does a panel naming an act this object does not
  // have — a hand-typed `?panel=release` over something the house does not hold. It is the act
  // itself and not just its name, because a panel's title is the label of the press that
  // opened it and nothing on this page recomputes that sentence.
  const asking = asked(said, "panel");
  const acting = [...acts, noting, THE_STORY_ACT, ...(splitting ? [splitting] : [])].find(
    (act) => act.panel === asking
  );
  const closesTo = `/collection/${volume.id}`;

  return (
    <main className="px-5 py-8 sm:px-8 sm:py-12">
      <header>
        {/* **No breadcrumb.** `tsundoku / collection` was the way back to the wall on a screen
            that had no navigation; the shell has one now, at both widths, and it marks
            *Collection* while the owner is standing here. A trail of one step is a second
            answer to a question the chrome is already answering.

            The tile the wall laid this object out as opens the page instead, in the same
            colour — so arriving here from the Collection is arriving at the thing that was
            tapped. **It carries no href**, because this is the page it would lead to: a link
            to where the owner already is would be a focusable no-op that lifts under the
            pointer as though it went somewhere (`@/components/cover`). */}
        <div className="flex items-start gap-4 sm:gap-6">
          <div className="w-20 shrink-0 sm:w-28">
            <Cover
              title={volume.title}
              tint={tint(volume.series?.id)}
              detail={objectSaid(volume)}
              foot={volume.seriesNumber ?? volume.binding.name}
              image={volume.cover}
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-pretty font-heading text-2xl leading-tight sm:text-3xl">
              {volume.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{[volume.publisher, volume.editionLine].filter(Boolean).join(" · ")}</span>
              <Badge variant="outline" className="shrink-0">
                {volume.binding.name}
              </Badge>
            </p>
            {volume.series ? (
              <p className="mt-2 text-sm text-muted-foreground">
                <Link
                  href={`/series/${volume.series.id}`}
                  className="underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {[volume.series.name, volume.series.editionLine].filter(Boolean).join(", ")}
                </Link>{" "}
                <span className="font-mono tabular-nums">{volume.seriesNumber}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* **The acts, in their own row under the tile rather than beside it.** The Story's
            page puts its two in the column next to the cover, which works for two; three
            beside a tile on a phone is a column two words wide. The first is drawn loud
            because it is the one the owner opened this page to perform — whether the house
            holds the thing — and `./standing.ts` is what puts it first. */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {acts.map((act, place) => (
            <OpensDrawer
              key={act.panel}
              href={panelled(volume.id, act.panel)}
              emphasis={place === 0 ? "loud" : "quiet"}
            >
              {act.label}
            </OpensDrawer>
          ))}
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

      {/* **The two halves of ADR-0007, side by side.** What the object is, and whether the
          house holds it. They are two facts about one thing, so they are two headings and
          never one paragraph mixing a publisher with a price. */}
      <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-8">
        <section>
          <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
            What it is
          </h2>
          <p className="mt-2 max-w-prose text-pretty text-sm text-muted-foreground">
            The object as the library catalogues it. All of it is true whether or not the thing is
            in your house.
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
            <Fact term="Publisher" detail={volume.publisher} />
            <Fact term="Edition line" detail={volume.editionLine ?? "— the standard printing"} />
            <Fact term="Binding" detail={volume.binding.name} />
            <Fact term="Language" detail={volume.language} mono />
            {/* **A fact and no longer a box.** It reads in the mono face where there is one
                and as an absence where there is not — an em dash rather than an empty cell,
                because a blank reads as a screen that failed to load something. Putting one
                in is the act in the hero. */}
            <Fact
              term="ISBN"
              detail={volume.isbn ?? "— none recorded"}
              mono={Boolean(volume.isbn)}
              wide
            />
          </dl>

          {/* Where the tile's image comes from — a fact about the object, said on the page
              rather than behind the press that changes it. The source's own page for the book
              is the link ADR-0013 owes Google, and it belongs with the facts for the same
              reason: it is true of this object whether or not anybody is repairing it. */}
          <p className="mt-4 max-w-prose text-pretty text-sm text-muted-foreground">
            {facedWith(volume)}
            {volume.lookedUp.at ? ` Last asked about on ${volume.lookedUp.at}.` : null}{" "}
            {volume.lookedUp.infoUrl ? (
              <a
                href={volume.lookedUp.infoUrl}
                // A link off this application entirely, so it says so and takes nothing with it.
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                The source&apos;s own page for it
              </a>
            ) : null}
          </p>
        </section>

        <section>
          <h2 className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
            In the house
          </h2>
          {/* The sentence comes off `findVolume` and the rows off `listAcquisitions`, and the
              two agree by construction: both order the acquisitions the same way, so *the
              latest* is the same row in each, and whether the house holds the object stays the
              core's answer rather than one this screen re-derives from the history. */}
          <p className="mt-2 max-w-prose text-pretty text-sm">{whatTheHouseSays(volume)}</p>

          <History acquisitions={history} />
        </section>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stories it holds</CardTitle>
            <CardDescription className="text-pretty">
              One object can hold several narratives, and each one is read and judged on its own.
              The number beside a Story is that Story&apos;s — this object has none, and cannot have
              one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {carried.length === 0 ? (
              <p className="max-w-prose text-pretty text-sm text-muted-foreground">
                Nothing recorded yet. Say what is inside this object below, and it appears on each
                Story too — it is one fact, read from both ends.
              </p>
            ) : (
              <ul className="-my-1">
                {carried.map((story) => (
                  <li key={story.id} className="border-t border-border py-3 first:border-t-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <Link
                        href={`/stories/${story.id}`}
                        className="min-w-0 flex-1 basis-full outline-none focus-visible:ring-2 focus-visible:ring-ring sm:basis-auto"
                      >
                        <span className="font-heading underline decoration-border underline-offset-4 hover:decoration-foreground">
                          {story.title}
                        </span>{" "}
                        <span className="whitespace-nowrap font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
                          {story.type.name}
                        </span>
                      </Link>

                      <span className="flex items-baseline gap-3">
                        {/* Tabular, so three judgements of three narratives in one object line
                          up under each other and read as the three different numbers they
                          are. An em dash where the owner has judged nothing yet. */}
                        <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {story.latestScore === null ? "—" : story.latestScore.toFixed(1)}
                        </span>
                        <form action={stopCarrying}>
                          <input type="hidden" name="volumeId" value={volume.id} />
                          <input type="hidden" name="storyId" value={story.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            className="-mr-2.5 h-8 text-xs text-muted-foreground"
                          >
                            Not in here
                          </Button>
                        </form>
                      </span>
                    </div>

                    {/* **What of the work is in this object**, and only where the work is
                        numbered at all — which is the minority of Stories and none of the
                        three in *L'uomo che ride*. Left to itself the range follows the
                        object's position in its line, so the boxes stand empty for every
                        tankōbon and are typed for the omnibus they exist for. */}
                    {story.instalments === null ? null : (
                      <CoveredRange volumeId={volume.id} story={story} />
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* **The gesture the default is wrong about, offered from beside the list that is
                wrong** (#38). One Volume, one Story is right for nearly every object here and
                wrong for *L'uomo che ride*, which holds three tales scored apart — and the
                only way to say so used to end at a strike, which is refused on a narrative an
                object in the house carries. It is a link and not a press, because what it does
                is open a form. */}
            {splitting ? (
              <p className="mt-5 max-w-prose text-pretty text-sm text-muted-foreground">
                Three tales in one book, judged apart?{" "}
                <Link
                  href={panelled(volume.id, splitting.panel)}
                  className="underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {splitting.label}.
                </Link>
              </p>
            ) : null}

            {/* **A picker under the list it changes, and deliberately not a panel.** A drawer
                is for a form the owner *opened*; this one is a correction made while reading
                the list above it, in one press, and the Story's own page carries the same
                fact from the other end in exactly the same shape (#29). An id is never typed,
                so the Story is chosen: a native select opens the platform picker on a phone
                and submits without JavaScript. */}
            <form
              action={carry}
              className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-[1fr_auto] sm:items-end"
            >
              <input type="hidden" name="volumeId" value={volume.id} />
              <div className="grid gap-1.5">
                <Label htmlFor="carry-story" className="text-xs text-muted-foreground">
                  A Story inside this object
                </Label>
                <select
                  id="carry-story"
                  name="storyId"
                  required
                  disabled={offerable.length === 0}
                  defaultValue=""
                  className={PICKER}
                >
                  <option value="" disabled>
                    {offerable.length === 0 ? "Every Story is already in here" : "Choose a Story"}
                  </option>
                  {offerable.map((story) => (
                    <option key={story.id} value={story.id}>
                      {story.title} — {story.type.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="submit"
                disabled={offerable.length === 0}
                className="h-11 w-full sm:h-10 sm:w-auto sm:px-6"
              >
                Record it
              </Button>
              {/* **The sentence that used to be a detour, and is now a door** (#33). It read
                  *record the Story first if it is not in the list*, and the trip it described —
                  the Story wall, a form, then finding this object again — is where the second
                  narrative of a volume stopped being recorded at all. The panel it opens
                  creates the Story *and* records it in here, in one act, because that is one
                  fact with two halves (`@/core/verbs/story`). */}
              <p className="max-w-prose text-xs text-muted-foreground sm:col-span-2">
                A Story spanning twenty objects is recorded twenty times, once on each. Being read
                and being owned are separate facts, and so are the two records.{" "}
                <Link
                  href={panelled(volume.id, THE_STORY_ACT.panel)}
                  className="underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Not in the list? Record it from here.
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>

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
              ? "A second acquisition of this same object, not a second object — the one above stays where it is, as a record of having had it before."
              : "The Collection starts claiming it, and it appears on the wall. Cataloguing it never said this; saying it is a separate act (ADR-0007)."
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
              Leave both empty where the receipt is gone — the fact does not depend on the day, and
              a gift has no price in it. A comma is a decimal point: the numeric keyboard on an
              Italian phone offers no dot.
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
          description="Sold, given away or lost. The Collection stops claiming it and it leaves the wall; the library keeps knowing this object."
          closesTo={closesTo}
        >
          <form action={release} className="grid gap-4">
            <input type="hidden" name="volumeId" value={volume.id} />
            <Button type="submit" variant="destructive" className="h-11 w-full sm:h-10">
              Release it
            </Button>
            <p className="max-w-prose text-xs text-muted-foreground">
              Nothing is erased: this page stays, the acquisition becomes a record of having had it,
              and so do the Edition note and the Readings made through it. Buying it again is a
              second acquisition of the same object, not a second object.
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

      {/* **Two facts said in one breath**, which is what the object in the owner's hand is:
          this narrative exists, and this thing holds it. One verb and one transaction behind it
          (`@/core/verbs/story`), so a refusal leaves neither half standing — and it is the
          owner's act alone, because creating a Story from outside is what the Inbox exists to
          hold (ADR-0005). */}
      {acting?.panel === "story" ? (
        <Drawer
          title={acting.label}
          refused={refused}
          description="It is created and recorded inside this object in one act. The granularity is yours: the arc this volume collects, or one story that runs across twenty of them."
          closesTo={closesTo}
        >
          <form action={recordStory} className="grid gap-4">
            <input type="hidden" name="volumeId" value={volume.id} />

            <div className="grid gap-1.5">
              <Label htmlFor="story-title" className="text-xs text-muted-foreground">
                Title
              </Label>
              <Input
                id="story-title"
                name="title"
                placeholder="Hulk Rosso"
                autoComplete="off"
                required
                className="h-11 sm:h-10"
              />
            </div>

            {/* Native, like every other picker on this screen: shadcn's select is a scripted
                component, and a form that only works once a bundle has parsed is not a form
                this application has (ADR-0010). */}
            <div className="grid gap-1.5">
              <Label htmlFor="story-type" className="text-xs text-muted-foreground">
                Type
              </Label>
              <select id="story-type" name="type" required defaultValue="" className={PICKER}>
                <option value="" disabled>
                  Choose a Type
                </option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Record it in here
            </Button>
            <p className="max-w-prose text-xs text-muted-foreground">
              A volume holding an arc and a back-up story from somewhere else is two narratives: say
              the second one from here too, and each carries its own score. Nothing about this says
              you have read either — that is a Reading, on the Story&apos;s own page.
            </p>
          </form>
        </Drawer>
      ) : null}

      {/* **A contents page, typed as one** (#38). The box is the signature of this panel and
          the reason it is not a row of five fields: what the owner is reading off the back of
          the object is a list of lines, a form that grows needs a script (ADR-0010), and five
          boxes would be four of them empty on the ordinary case. The narrative the object
          stands for is on the first line already, because in this library the object's own
          title is usually one of the tales inside it. */}
      {acting?.panel === "split" && splitting && carried[0] ? (
        <Drawer
          title={acting.label}
          refused={refused}
          description="One object, several narratives, each read and judged on its own. It changes what you judge and never what you own."
          closesTo={closesTo}
        >
          <form action={split} className="grid gap-4">
            <input type="hidden" name="volumeId" value={volume.id} />

            <div className="grid gap-1.5">
              <Label htmlFor="split-titles" className="text-xs text-muted-foreground">
                One title per line
              </Label>
              <textarea
                id="split-titles"
                name="titles"
                rows={5}
                required
                defaultValue={carried[0].title}
                placeholder={"Gotham Noir\nL'uomo che ride\nUomo di legno"}
                className={`${PICKER} h-auto py-2.5 leading-7`}
              />
              <p className="text-xs text-muted-foreground">
                Each becomes a {carried[0].type.name} of its own, like the narrative it replaces. A
                line left empty is a title you did not need.
              </p>
            </div>

            <Button type="submit" className="h-11 w-full sm:h-10">
              Split it
            </Button>

            {/* Said before the press rather than discovered after it. The object does not
                move: the acquisition, the Series position and the ISBN are all facts about the
                thing, and a split is about the narratives. What does go is said too — a
                Reading or a Rating refuses the whole gesture in the verb's own words, and the
                Credits on the replaced narrative go with it while the people stay
                (ADR-0012). */}
            <p className="max-w-prose text-xs text-muted-foreground">
              <span className="font-heading text-foreground">{carried[0].title}</span> stops being a
              narrative of its own. The Credits on it go with it — the people they name stay — and
              so does any Path that names it as a stop. Nothing about the object changes: it is in
              the house, in its line and at its position exactly as it is now. If you have read it
              or judged it, this is refused and nothing is split.
            </p>
          </form>
        </Drawer>
      ) : null}

      {acting?.panel === "note" ? (
        <Drawer
          title={acting.label}
          refused={refused}
          description="What you think of this as an object — print quality, translation, value for money, whether the Must Have was the right way to try the saga. It decides what to buy, and it is not a score."
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
                ? "One note per object, so this replaces what is written there — an opinion of an object is a verdict, not an event. Empty the box to take it back."
                : "One note per object. Rewriting it later replaces this one, and emptying the box takes it back."}
            </p>
          </form>
        </Drawer>
      ) : null}
    </main>
  );
}

/**
 * Which Instalments of one Story are inside this object.
 *
 * **The default is the whole reason Instalments cost nothing**: where a line prints one part
 * per Volume the range follows the volumes, so this reads back *follows the line* and the
 * owner types nothing. The omnibus is what the boxes are for — one object collecting
 * thirty-five parts of a work — and emptying them hands the answer back to the line.
 *
 * A correction made while reading the list above it rather than a form the owner opened, so
 * it is inline and not a drawer — the same judgement the Story picker under this list is made
 * on.
 */
function CoveredRange({ volumeId, story }: { volumeId: string; story: CarriedStory }) {
  const covers = story.covers;

  return (
    <form
      action={coverInstalments}
      className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5"
    >
      <input type="hidden" name="volumeId" value={volumeId} />
      <input type="hidden" name="storyId" value={story.id} />

      <span className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
        Instalments
      </span>
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
      <Button type="submit" variant="ghost" size="sm" className="h-8 text-xs">
        Record it
      </Button>
      <span className="basis-full text-xs text-muted-foreground">{howTheRangeIsKept(story)}</span>
    </form>
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
    <Card>
      <CardHeader>
        <CardTitle>Edition note</CardTitle>
        <CardDescription className="text-pretty">
          What you think of this as an object — print quality, translation, value for money, whether
          the Must Have was the right way to try the saga.{" "}
          <strong className="font-medium text-foreground">It is not a score</strong>, it stands
          beside no Rating, and nothing recommending you a Story will ever read it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {note ? (
          <>
            <p className="max-w-prose text-pretty font-serif text-prose">{note.note}</p>
            <p className="font-mono text-eyebrow uppercase tracking-eyebrow text-muted-foreground">
              Written {note.writtenAt}
            </p>
          </>
        ) : (
          <p className="max-w-prose text-pretty text-sm text-muted-foreground">
            Nothing written about this printing yet. It is the judgement that decides what to buy
            next time, and the only one this application will not read back to you as a number.
          </p>
        )}

        <div>
          <OpensDrawer href={panelled(volume.id, act.panel)}>{act.label}</OpensDrawer>
        </div>
      </CardContent>
    </Card>
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
      description="Ten or thirteen characters. Writing it asks SBN, Italy's legal-deposit catalogue, what is published under it — and what it says is yours to accept or leave."
      closesTo={closesTo}
    >
      <div className="grid gap-5">
        <form action={recordIsbn} className="grid gap-4">
          <input type="hidden" name="volumeId" value={volume.id} />
          <div className="grid gap-1.5">
            <Label htmlFor={THE_ISBN_FIELD.id} className="text-xs text-muted-foreground">
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
                      className="text-xs text-muted-foreground"
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
                  Clear a box to keep what the record says — both cleared changes no field, and is
                  refused.
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
              Google Books first, then Open Library. The image is <em>pointed at</em> where it lives
              and never copied here, so it is 128 pixels wide — which is all there is — and whoever
              owns it can withdraw it. <strong>Asking again always reaches the source</strong>,
              whatever is recorded here: a jacket fetched against an ISBN that has since been
              corrected still loads perfectly, and is still the wrong book.
            </p>
          </div>
        ) : (
          <p className="max-w-prose text-pretty text-sm text-muted-foreground">
            Every source is keyed by ISBN, and this object has none — so there is nothing to ask.
            Record its ISBN first, or give it an image of your own below. A Bonelli monthly never
            gets one: those carry a periodical EAN and no ISBN at all.
          </p>
        )}

        <form action={useOwnImage} className="grid gap-3 border-t border-border pt-5">
          <input type="hidden" name="volumeId" value={volume.id} />
          <div className="grid gap-1.5">
            <Label htmlFor="volume-image" className="text-xs text-muted-foreground">
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
            {own ? "Use this one" : "Use my own"}
          </Button>
          <p className="max-w-prose text-xs text-muted-foreground">
            A photograph or a scan you host yourself. It overrides whatever the lookup found, at
            whatever size you took it — and it is the only image this library keeps, because it is
            yours and no third party can withdraw it. An address on a source&apos;s own domain is
            refused: that would be their bytes under your name.
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
              Take my image off
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
function History({ acquisitions }: { acquisitions: readonly Acquisition[] }) {
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
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3 text-sm"
          >
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono tabular-nums">{acquisition.acquiredOn ?? "—"}</span>
              <span className="text-muted-foreground">
                {acquisition.releasedOn ? (
                  <>
                    to <span className="font-mono tabular-nums">{acquisition.releasedOn}</span>
                  </>
                ) : (
                  "and still here"
                )}
              </span>
            </span>
            <span className="font-mono tabular-nums">
              {acquisition.pricePaid ? (
                `€ ${acquisition.pricePaid}`
              ) : (
                <span className="font-sans text-muted-foreground">— no price recorded</span>
              )}
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
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={mono ? "font-mono" : undefined}>{detail}</dd>
    </div>
  );
}

function Field({
  name,
  label,
  ...props
}: {
  name: string;
  label: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`acquire-${name}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`acquire-${name}`} name={name} className="h-11 sm:h-10" {...props} />
    </div>
  );
}
